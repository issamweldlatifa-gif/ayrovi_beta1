import type { QatafoDatabase } from '../db/database';
import { calculatePrice, orderLocalDelivery, type PriceBreakdown, type PricingRules } from '../services/pricing';
import type { AyWebsFeeKind } from '../../shared/aywebsTypes';
import type { AyWebsCartItem } from './cart';
import { AyWebsDomainError } from './errors';

/**
 * AYWEBs — Checkout calculation engine (§19).
 *
 * Exigence du Master Order : le calcul est MODULAIRE et aucune formule
 * financière ne vit dans un composant d'interface. Ce module est donc la seule
 * source des montants affichés au checkout.
 *
 * Deux règles de cohérence non négociables :
 *  1. `payable = somme des lignes de frais` — vérifiée par une assertion, pas
 *     par une convention ;
 *  2. la livraison locale n'est comptée QU'UNE fois par commande, alors que le
 *     moteur tarifaire central la calcule par ligne. Les lignes produit sont
 *     donc recalculées `includeLocalDelivery:false` et une ligne dédiée porte
 *     la livraison locale. Aucun double comptage, aucun montant caché.
 *
 * La source de vérité tarifaire reste `services/pricing.ts` (moteur central
 * AYROVI) : AYWEBs ne réinvente ni taux de change, ni douane, ni commission.
 */

export interface AyWebsFeeLine {
  kind: AyWebsFeeKind;
  /** Identifiant machine stable (tests, audit, Admin). */
  code: string;
  labelFr: string;
  labelAr: string;
  amountTnd: number;
  currency: 'TND';
  /** Doute assumé : un devis incertain le dit au lieu de se présenter comme exact. */
  uncertain: boolean;
  detail: Record<string, unknown>;
}

export interface AyWebsCheckoutLine {
  itemId: string;
  itemNumber: string;
  storeId: string;
  storeName: string;
  title: string;
  variantLabel: string;
  quantity: number;
  sourceUnitPrice: number;
  sourceCurrency: string;
  /** Montant produit AYROVI de la ligne (hors livraison locale). */
  productAmountTnd: number;
  serviceFeeTnd: number;
  importFeeTnd: number;
  shippingEstimateTnd: number;
  lineTotalTnd: number;
  availability: string;
  checkoutReady: boolean;
  restricted: boolean;
  uncertain: boolean;
  weightKg: number;
  categoryId: string;
  categoryLabel: string;
}

export interface AyWebsCheckoutPreview {
  currency: 'TND';
  lines: AyWebsCheckoutLine[];
  fees: AyWebsFeeLine[];
  totals: {
    productSubtotalTnd: number;
    serviceFeeTnd: number;
    importFeeTnd: number;
    shippingEstimateTnd: number;
    otherFeeTnd: number;
    payableTnd: number;
    units: number;
    weightKg: number;
  };
  pricingVersion: number;
  /** Bloque le checkout : jamais de commande sur une ligne non prête. */
  blockers: Array<{ itemId: string; code: string; message: string; action: string }>;
  warnings: Array<{ code: string; message: string }>;
  computedAt: string;
}

export interface AyWebsCheckoutOptions {
  express?: boolean;
  discountTnd?: number;
  /** Livraison locale incluse (défaut) — désactivable pour un retrait en bureau. */
  includeLocalDelivery?: boolean;
}

const round2 = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;

/** Recalcule une ligne depuis la SOURCE (prix marchand + devise), jamais depuis un montant client. */
function priceLine(
  rules: PricingRules,
  item: AyWebsCartItem,
  options: AyWebsCheckoutOptions,
): { breakdown: PriceBreakdown | null; restricted: boolean } {
  const breakdown = calculatePrice(rules, item.unitPrice, item.currency, {
    title: item.title,
    quantity: item.quantity,
    express: Boolean(options.express),
    includeLocalDelivery: false,
  });
  return { breakdown, restricted: Boolean(breakdown?.restricted) || breakdown === null };
}

/**
 * Devis d'achat complet. Toute ligne non prête (prix changé, variante
 * indisponible, épuisé, action client requise) est un bloqueur explicite.
 */
export function computeAyWebsCheckoutPreview(
  db: QatafoDatabase,
  items: AyWebsCartItem[],
  options: AyWebsCheckoutOptions = {},
): AyWebsCheckoutPreview {
  const rules = db.getPricingRules();
  const includeLocalDelivery = options.includeLocalDelivery !== false;
  const computedAt = new Date().toISOString();
  const lines: AyWebsCheckoutLine[] = [];
  const blockers: AyWebsCheckoutPreview['blockers'] = [];
  const warnings: AyWebsCheckoutPreview['warnings'] = [];

  for (const item of items) {
    const { breakdown, restricted } = priceLine(rules, item, options);

    if (!item.checkoutReady) {
      blockers.push(lineBlocker(item));
    }
    if (restricted) {
      blockers.push({
        itemId: item.id,
        code: 'PRODUCT_RESTRICTED',
        message: 'Ce produit nécessite une vérification manuelle avant commande.',
        action: 'WAIT_FOR_REVIEW',
      });
    }
    if (item.availability === 'UNKNOWN') {
      // §14 : l'incertitude est affichée, jamais convertie en disponibilité.
      warnings.push({
        code: 'STOCK_UNKNOWN',
        message: `Stock non publié par le marchand pour « ${item.title} ». Il sera vérifié avant l’achat.`,
      });
    }
    if (item.availability === 'LOW_STOCK') {
      warnings.push({ code: 'LOW_STOCK', message: `Stock faible chez le marchand pour « ${item.title} ».` });
    }
    if (breakdown?.estimateUncertain) {
      warnings.push({ code: 'CATEGORY_UNCERTAIN', message: `Catégorie douanière estimée pour « ${item.title} » : le devis peut être ajusté.` });
    }
    if (breakdown?.requiresWeightValidation) {
      warnings.push({ code: 'WEIGHT_VALIDATION', message: `Poids volumineux pour « ${item.title} » : le fret sera confirmé à la réception.` });
    }

    const productAmountTnd = breakdown ? round2((breakdown.convertedPriceTND || 0) + (breakdown.localDeliveryTND || 0)) : 0;
    const serviceFeeTnd = breakdown ? round2(breakdown.serviceFeeTND) : 0;
    const importFeeTnd = breakdown ? round2(breakdown.customsFeeTND) : 0;
    const shippingEstimateTnd = breakdown ? round2(breakdown.freightTND) : 0;

    lines.push({
      itemId: item.id,
      itemNumber: item.itemNumber,
      storeId: item.storeId,
      storeName: item.storeName,
      title: item.title,
      variantLabel: item.variantLabel,
      quantity: item.quantity,
      sourceUnitPrice: item.unitPrice,
      sourceCurrency: item.currency,
      productAmountTnd,
      serviceFeeTnd,
      importFeeTnd,
      shippingEstimateTnd,
      lineTotalTnd: round2(productAmountTnd + serviceFeeTnd + importFeeTnd + shippingEstimateTnd),
      availability: item.availability,
      checkoutReady: item.checkoutReady && !restricted && Boolean(breakdown),
      restricted,
      uncertain: Boolean(breakdown?.estimateUncertain) || item.availability === 'UNKNOWN',
      weightKg: breakdown ? Number(breakdown.weightKg) || 0 : 0,
      categoryId: breakdown?.categoryId || '',
      categoryLabel: breakdown?.categoryLabel || '',
    });
  }

  const productSubtotalTnd = round2(lines.reduce((sum, line) => sum + line.productAmountTnd, 0));
  const serviceFeeTnd = round2(lines.reduce((sum, line) => sum + line.serviceFeeTnd, 0));
  const importFeeTnd = round2(lines.reduce((sum, line) => sum + line.importFeeTnd, 0));
  const shippingEstimateTnd = round2(lines.reduce((sum, line) => sum + line.shippingEstimateTnd, 0));
  const localDeliveryTnd = includeLocalDelivery && lines.length ? round2(orderLocalDelivery(rules)) : 0;
  const expressFeeTnd = options.express && lines.length ? round2(rules.expressFeeTND) : 0;
  const discountTnd = Math.max(0, round2(Number(options.discountTnd) || 0));
  const otherFeeTnd = round2(localDeliveryTnd + expressFeeTnd - discountTnd);

  const fees: AyWebsFeeLine[] = [
    {
      kind: 'PRODUCT_SUBTOTAL', code: 'PRODUCT_SUBTOTAL',
      labelFr: 'Produits (convertis en dinars)', labelAr: 'المنتجات (محوّلة إلى دينار)',
      amountTnd: productSubtotalTnd, currency: 'TND',
      uncertain: lines.some((line) => line.uncertain),
      detail: { lines: lines.length, units: lines.reduce((sum, line) => sum + line.quantity, 0) },
    },
    {
      kind: 'AYROVI_SERVICE', code: 'AYROVI_SERVICE_FEE',
      labelFr: 'Service AYROVI', labelAr: 'خدمة AYROVI',
      amountTnd: serviceFeeTnd, currency: 'TND', uncertain: false,
      detail: { commissionPercent: rules.commissionPercent, minimumCommissionTnd: rules.minimumCommissionTND },
    },
    {
      kind: 'IMPORT_DUTY', code: 'IMPORT_DUTIES',
      labelFr: 'Douane et taxes d’importation', labelAr: 'الديوانة ومعاليم التوريد',
      amountTnd: importFeeTnd, currency: 'TND',
      uncertain: lines.some((line) => line.uncertain),
      detail: { categories: [...new Set(lines.map((line) => line.categoryLabel).filter(Boolean))] },
    },
    {
      kind: 'SHIPPING_ESTIMATE', code: 'SHIPPING_ESTIMATE',
      labelFr: 'Transport international (estimé)', labelAr: 'الشحن الدولي (تقديري)',
      amountTnd: shippingEstimateTnd, currency: 'TND', uncertain: true,
      detail: {
        freightPerKgTnd: rules.freightPerKgTND,
        weightKg: round2(lines.reduce((sum, line) => sum + line.weightKg, 0)),
        note: 'Le fret définitif est confirmé après pesée en entrepôt AYROVI.',
      },
    },
  ];

  if (localDeliveryTnd > 0) {
    fees.push({
      kind: 'OTHER', code: 'LOCAL_DELIVERY',
      labelFr: 'Livraison locale en Tunisie', labelAr: 'التوصيل المحلي داخل تونس',
      amountTnd: localDeliveryTnd, currency: 'TND', uncertain: false,
      detail: { countedOnce: true },
    });
  }
  if (expressFeeTnd > 0) {
    fees.push({
      kind: 'OTHER', code: 'EXPRESS_SUPPLEMENT',
      labelFr: 'Supplément Express', labelAr: 'معلوم إضافي للخدمة السريعة',
      amountTnd: expressFeeTnd, currency: 'TND', uncertain: false, detail: {},
    });
  }
  if (discountTnd > 0) {
    fees.push({
      kind: 'OTHER', code: 'DISCOUNT',
      labelFr: 'Remise', labelAr: 'تخفيض',
      amountTnd: -discountTnd, currency: 'TND', uncertain: false, detail: {},
    });
  }

  const payableTnd = round2(Math.max(0, fees.reduce((sum, fee) => sum + fee.amountTnd, 0)));

  // Assertion de cohérence : le montant payable EST la somme des lignes.
  const feeSum = round2(productSubtotalTnd + serviceFeeTnd + importFeeTnd + shippingEstimateTnd + otherFeeTnd);
  if (Math.abs(feeSum - payableTnd) > 0.01) {
    throw new AyWebsDomainError('INTERNAL_ERROR', {
      technicalMessage: `incohérence de devis : somme des totaux ${feeSum} ≠ payable ${payableTnd}`,
    });
  }

  return {
    currency: 'TND',
    lines,
    fees,
    totals: {
      productSubtotalTnd,
      serviceFeeTnd,
      importFeeTnd,
      shippingEstimateTnd,
      otherFeeTnd,
      payableTnd,
      units: lines.reduce((sum, line) => sum + line.quantity, 0),
      weightKg: round2(lines.reduce((sum, line) => sum + line.weightKg, 0)),
    },
    pricingVersion: rules.version,
    blockers,
    warnings: dedupeWarnings(warnings),
    computedAt,
  };
}

function lineBlocker(item: AyWebsCartItem): AyWebsCheckoutPreview['blockers'][number] {
  switch (item.status) {
    case 'PRICE_CHANGED':
      return {
        itemId: item.id, code: 'PRICE_CHANGED', action: 'ACCEPT_NEW_PRICE',
        message: `Le prix de « ${item.title} » a changé depuis l’ajout. Acceptez le nouveau prix ou retirez l’article.`,
      };
    case 'VARIANT_UNAVAILABLE':
      return {
        itemId: item.id, code: 'VARIANT_UNAVAILABLE', action: 'CHOOSE_ANOTHER_VARIANT',
        message: `La version choisie de « ${item.title} » n’est plus disponible. Aucun remplacement automatique.`,
      };
    case 'OUT_OF_STOCK':
      return {
        itemId: item.id, code: 'OUT_OF_STOCK', action: 'CHOOSE_ANOTHER_VARIANT',
        message: `« ${item.title} » est épuisé chez le marchand.`,
      };
    case 'CUSTOMER_ACTION_REQUIRED':
      return {
        itemId: item.id, code: 'CUSTOMER_ACTION_REQUIRED', action: 'CUSTOMER_BROWSER_ACTION',
        message: `Une action est requise dans la boutique pour « ${item.title} ».`,
      };
    default:
      return { itemId: item.id, code: 'CART_ITEM_BLOCKED', action: 'CONTACT_SUPPORT', message: `« ${item.title} » ne peut pas être commandé en l’état.` };
  }
}

function dedupeWarnings(warnings: AyWebsCheckoutPreview['warnings']): AyWebsCheckoutPreview['warnings'] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    if (seen.has(warning.message)) return false;
    seen.add(warning.message);
    return true;
  });
}

/** Sérialisation HTTP stable du devis (contrat consommé par l'écran de checkout). */
export function ayWebsCheckoutPreviewPayload(preview: AyWebsCheckoutPreview) {
  return {
    currency: preview.currency,
    pricing_version: preview.pricingVersion,
    computed_at: preview.computedAt,
    lines: preview.lines.map((line) => ({
      item_id: line.itemId,
      item_number: line.itemNumber,
      store_id: line.storeId,
      store_name: line.storeName,
      title: line.title,
      variant_label: line.variantLabel,
      quantity: line.quantity,
      source_unit_price: line.sourceUnitPrice,
      source_currency: line.sourceCurrency,
      product_amount_tnd: line.productAmountTnd,
      service_fee_tnd: line.serviceFeeTnd,
      import_fee_tnd: line.importFeeTnd,
      shipping_estimate_tnd: line.shippingEstimateTnd,
      line_total_tnd: line.lineTotalTnd,
      availability: line.availability,
      checkout_ready: line.checkoutReady,
      uncertain: line.uncertain,
      category_label: line.categoryLabel,
      weight_kg: line.weightKg,
    })),
    fees: preview.fees.map((fee) => ({
      kind: fee.kind,
      code: fee.code,
      label: fee.labelFr,
      label_ar: fee.labelAr,
      amount_tnd: fee.amountTnd,
      currency: fee.currency,
      uncertain: fee.uncertain,
      detail: fee.detail,
    })),
    totals: {
      product_subtotal_tnd: preview.totals.productSubtotalTnd,
      service_fee_tnd: preview.totals.serviceFeeTnd,
      import_fee_tnd: preview.totals.importFeeTnd,
      shipping_estimate_tnd: preview.totals.shippingEstimateTnd,
      other_fee_tnd: preview.totals.otherFeeTnd,
      payable_tnd: preview.totals.payableTnd,
      units: preview.totals.units,
      weight_kg: preview.totals.weightKg,
    },
    blockers: preview.blockers,
    warnings: preview.warnings,
    checkout_ready: preview.blockers.length === 0 && preview.lines.length > 0,
  };
}
