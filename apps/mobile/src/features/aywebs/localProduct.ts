/**
 * ورقة الاختيار من **القراءة المحلية** (20/10/2026) — بلا أي نداء للخادم عند الفتح.
 *
 * (تعليق فقط : إعادة تشغيل بناء APK بعد فشل تنزيل NDK على الـrunner، ليس خطأ في الكود.)
 *
 * المصدر: capture.amazon (الخيارات والمقاسات مع ASIN ودليل التوفّر) وعنوان الصفحة.
 *  • الخادم يبقى الحكم الأخير: يتحقق من الاختيار عند التأكيد، ويعطي السعر والفاتورة.
 *  • التوفّر هنا لازم يكون مُثبتاً من القراءة: «غير معروف» ⇒ لا تأكيد (المبدأ: UNKNOWN لا يذهب للسلة).
 *  • لا سعر هنا: السعر يظهر بعد الفحص عند الخادم، ولا نحسبو شي محلياً.
 */
import type {
  AyWebsAddBlockCode, AyWebsAvailability, AyWebsResolvedProduct, AyWebsVariantGroup, AyWebsVariantOption,
} from '@/api/aywebs';

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const ASIN = /^[A-Z0-9]{10}$/;

export interface LocalVariant {
  asin: string;
  attributes: Record<string, string>;
  availability: 'AVAILABLE' | 'OUT_OF_STOCK' | 'UNKNOWN';
}

/** Variantes publiées dans la capture Amazon, avec leur ASIN, leurs attributs et leur disponibilité prouvée. */
export function localVariantsFromCapture(capture: Json): LocalVariant[] {
  const amazon = isRecord(capture.amazon) ? capture.amazon : null;
  if (!amazon) return [];
  const evidenceByAsin = new Map<string, string>();
  if (Array.isArray(amazon.options)) {
    for (const option of amazon.options) {
      if (!isRecord(option)) continue;
      const asin = text(option.asin).toUpperCase();
      if (!ASIN.test(asin)) continue;
      evidenceByAsin.set(asin, text(option.availabilityEvidence).toLowerCase());
    }
  }
  const out: LocalVariant[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(amazon.variants)) return out;
  for (const variant of amazon.variants) {
    if (!isRecord(variant)) continue;
    const asin = text(variant.asin).toUpperCase();
    if (!ASIN.test(asin) || seen.has(asin)) continue;
    seen.add(asin);
    const attributes: Record<string, string> = {};
    if (Array.isArray(variant.dimensions)) {
      for (const dimension of variant.dimensions) {
        if (!isRecord(dimension)) continue;
        const name = text(dimension.name).toLowerCase();
        const value = text(dimension.value);
        if (name && value) attributes[name] = value;
      }
    }
    const evidence = evidenceByAsin.get(asin) ?? '';
    const availability = evidence === 'available' ? 'AVAILABLE' : evidence === 'unavailable' ? 'OUT_OF_STOCK' : 'UNKNOWN';
    out.push({ asin, attributes, availability });
  }
  return out;
}

/** Groupes d'attributs (taille, couleur…) dans l'ordre de la page. */
export function groupsFromVariants(variants: LocalVariant[]): AyWebsVariantGroup[] {
  const groups = new Map<string, string[]>();
  for (const variant of variants) {
    for (const [name, value] of Object.entries(variant.attributes)) {
      const values = groups.get(name) ?? [];
      if (!values.includes(value)) values.push(value);
      groups.set(name, values);
    }
  }
  return [...groups.entries()].map(([attribute, values]) => ({ attribute, values }));
}

/** Options pour la feuille : l'ASIN est le `sourceVariantId` (même convention que le serveur). */
export function optionsFromVariants(variants: LocalVariant[]): AyWebsVariantOption[] {
  return variants.map((variant) => ({
    sourceVariantId: variant.asin,
    attributes: variant.attributes,
    label: Object.values(variant.attributes).join(' / '),
    price: null,
    currency: '',
    quotedPrice: null,
    quotedCurrency: '',
    priceSource: 'UNKNOWN',
    availability: variant.availability,
    availabilityReason: '',
    image: '',
    totalTnd: null,
  }));
}

/** Titre, image et boutique depuis la capture — sans prix (le prix vient du serveur à l'ajout). */
export function productFromCapture(capture: Json, url: string, storeId: string, storeName: string): AyWebsResolvedProduct {
  const amazon = isRecord(capture.amazon) ? capture.amazon : null;
  const pageAsin = amazon ? text(amazon.pageAsin).toUpperCase() : '';
  const images = Array.isArray(capture.images)
    ? capture.images.map((item) => (isRecord(item) ? text(item.url) : text(item))).filter((item) => item.startsWith('http'))
    : [];
  let domain = '';
  try { domain = new URL(url).host; } catch { domain = ''; }
  const unknown: AyWebsAvailability = { state: 'UNKNOWN', reason: '', checkedAt: '', source: 'capture', quantityHint: null };
  return {
    productId: pageAsin,
    storeId,
    storeName,
    sourceUrl: url,
    sourceDomain: domain,
    title: text(capture.title),
    brand: text(capture.brand),
    images,
    price: null,
    currency: '',
    priceVerified: false,
    currencyVerified: false,
    availability: unknown,
    purchaseMode: '',
    integrationType: '',
    ayroviPricing: null,
    variantGroups: [],
    variantDetails: [],
    fromCache: false,
    cacheAgeMs: null,
  };
}

/**
 * Prêt à confirmer ? Règles locales (plus strictes que « rien de connu ») :
 *  • des attributs publiés ⇒ il faut un choix complet ;
 *  • le choix doit correspondre à une variante avec une disponibilité PROUVÉE ;
 *  • sans variante : disponibilité prouvée par le texte de la page, sinon refus.
 */
export function localAddReadiness(input: {
  groups: AyWebsVariantGroup[];
  variants: LocalVariant[];
  selection: Record<string, string>;
  pageInStockText: boolean;
}): { ready: boolean; code: AyWebsAddBlockCode; missingAttributes: string[] } {
  const missingAttributes = input.groups
    .filter((group) => !input.selection[group.attribute.toLowerCase()])
    .map((group) => group.attribute);
  if (input.groups.length && missingAttributes.length) {
    return { ready: false, code: 'VARIANT_REQUIRED', missingAttributes };
  }
  if (!input.groups.length) {
    return input.pageInStockText
      ? { ready: true, code: '', missingAttributes: [] }
      : { ready: false, code: 'STOCK_UNKNOWN', missingAttributes: [] };
  }
  const chosen = Object.entries(input.selection).map(([k, v]) => `${k}=${v.toLowerCase()}`).sort().join('|');
  const match = input.variants.find((variant) => Object.entries(variant.attributes)
    .map(([k, v]) => `${k}=${v.toLowerCase()}`).sort().join('|') === chosen);
  if (!match) return { ready: false, code: 'VARIANT_UNKNOWN', missingAttributes: [] };
  if (match.availability === 'OUT_OF_STOCK') return { ready: false, code: 'VARIANT_UNAVAILABLE', missingAttributes: [] };
  if (match.availability !== 'AVAILABLE') return { ready: false, code: 'STOCK_UNKNOWN', missingAttributes: [] };
  return { ready: true, code: '', missingAttributes: [] };
}
