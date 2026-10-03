import type { ProductVariants, ScrapedProduct } from '../types';
import { ayWebsSourceDomain } from '../../shared/aywebsStores';
import type {
  AyWebsAvailability,
  AyWebsAvailabilityState,
  AyWebsVariant,
  AyWebsVariantOption,
} from '../../shared/aywebsTypes';
import type { AyWebsSourceProduct } from './adapters/contract';

/**
 * AYWEBs — normalisation produit (§11) et moteur de variantes (§13).
 *
 * Deux règles non négociables :
 *  • les attributs de variante sont ARBITRAIRES. Rien ici ne suppose
 *    « couleur + taille » : les groupes viennent de ce que le marchand publie
 *    (taille, couleur, capacité, format, modèle, longueur, matière…) ;
 *  • le silence du marchand n'est JAMAIS traduit en disponibilité (§14).
 *    `UNKNOWN` reste `UNKNOWN`, avec sa raison.
 */

/** Attributs canoniques reconnus — tout autre attribut marchand est conservé tel quel. */
export const AYWEBS_KNOWN_ATTRIBUTES = [
  'color', 'size', 'capacity', 'storage', 'format', 'model', 'style', 'material', 'length', 'volume', 'flavour', 'bundle',
] as const;

export function normalizeAttributeName(raw: unknown): string {
  const value = String(raw ?? '').trim().toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]/g, '')
    .slice(0, 40);
  if (!value) return '';
  // Harmonisation des libellés marchands les plus fréquents, sans perdre d'attribut.
  const aliases: Record<string, string> = {
    colour: 'color', couleur: 'color', coloris: 'color', couleur_du_produit: 'color',
    taille: 'size', pointure: 'size', size_eur: 'size', dimensions: 'size',
    capacite: 'capacity', capacity_go: 'capacity', ram: 'storage', memoire: 'storage',
    modele: 'model', variante: 'model', matiere: 'material', parfum: 'flavour', saveur: 'flavour',
  };
  return aliases[value] || value;
}

/** `null` quand le marchand ne dit rien : jamais `true` par optimisme. */
export function ayWebsAvailabilityFromMerchant(
  availability: ScrapedProduct['availability'] | string | null | undefined,
): { state: AyWebsAvailabilityState; reason: string } {
  switch (String(availability ?? '').toLowerCase()) {
    case 'in_stock': return { state: 'AVAILABLE', reason: 'merchant_in_stock' };
    case 'limited': return { state: 'LOW_STOCK', reason: 'merchant_limited_stock' };
    case 'out_of_stock': return { state: 'OUT_OF_STOCK', reason: 'merchant_out_of_stock' };
    case 'preorder': return { state: 'UNKNOWN', reason: 'merchant_preorder_not_stock' };
    case 'unknown':
    case '':
    default: return { state: 'UNKNOWN', reason: 'merchant_stock_unspecified' };
  }
}

export function ayWebsAvailabilityFromBoolean(stock: boolean | null | undefined, fallbackReason = 'merchant_stock_unspecified'): {
  state: AyWebsAvailabilityState; reason: string;
} {
  if (stock === true) return { state: 'AVAILABLE', reason: 'merchant_in_stock' };
  if (stock === false) return { state: 'OUT_OF_STOCK', reason: 'merchant_out_of_stock' };
  return { state: 'UNKNOWN', reason: fallbackReason };
}

/**
 * Construit les groupes d'attributs à partir du contrat marchand existant
 * (`ProductVariants`) SANS le modifier : sizes/colors/styles/options/details
 * restent la source, la normalisation est une projection.
 */
export function ayWebsVariantGroupsFromScraped(variants: ProductVariants | undefined | null): Array<{ attribute: string; values: string[] }> {
  const groups: Array<{ attribute: string; values: string[] }> = [];
  const push = (attribute: string, values: unknown[] | undefined) => {
    const name = normalizeAttributeName(attribute);
    if (!name || !Array.isArray(values) || !values.length) return;
    const unique = [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
    if (!unique.length) return;
    const existing = groups.find((group) => group.attribute === name);
    if (existing) {
      existing.values = [...new Set([...existing.values, ...unique])];
    } else {
      groups.push({ attribute: name, values: unique });
    }
  };

  push('size', variants?.sizes);
  push('color', variants?.colors);
  push('style', variants?.styles);
  push('model', variants?.options);

  // Les détails marchand sont la source la plus précise : attributs libres.
  for (const detail of variants?.details || []) {
    if (detail?.size) push('size', [detail.size]);
    if (detail?.color) push('color', [detail.color]);
    if (detail?.label && !detail.size && !detail.color && !Object.keys(detail?.attributes || {}).length) push('model', [detail.label]);
    // Options publiées hors taille/couleur (Format, Type…) : un groupe par nom réel.
    for (const [key, value] of Object.entries(detail?.attributes || {})) {
      const attribute = normalizeAttributeName(key);
      if (attribute && value) push(attribute, [value]);
    }
  }

  return groups;
}

/** Options plates (une par valeur d'attribut) pour l'affichage des sélecteurs. */
export function ayWebsVariantOptions(groups: Array<{ attribute: string; values: string[] }>, images: Record<string, string[]> = {}): AyWebsVariantOption[] {
  const options: AyWebsVariantOption[] = [];
  for (const group of groups) {
    for (const value of group.values) {
      const image = group.attribute === 'color'
        ? (images[String(value).trim().toLowerCase()]?.[0] || null)
        : null;
      options.push({ attribute: group.attribute, value, image });
    }
  }
  return options;
}

/**
 * Combinaisons de variantes réellement publiées par le marchand. Quand le
 * marchand ne publie que des listes (tailles d'un côté, couleurs de l'autre),
 * le produit cartésien est marqué `available: null` / `UNKNOWN` : on ne prétend
 * jamais qu'une combinaison est en stock sans preuve.
 */
export function ayWebsVariantsFromScraped(product: ScrapedProduct): AyWebsSourceProduct['variants'] {
  const groups = ayWebsVariantGroupsFromScraped(product.variants);
  const details = product.variants?.details || [];

  if (details.length) {
    return details.map((detail, index) => {
      const attributes: Record<string, string> = {};
      const size = String(detail.size ?? '').trim();
      const color = String(detail.color ?? '').trim();
      const label = String(detail.label ?? '').trim();
      if (color) attributes.color = color;
      if (size) attributes.size = size;
      // Attributs libres publiés (Format, Type…) : conservés tels quels, donc
      // opposables à la sélection du client au lieu d'être ignorés.
      for (const [key, value] of Object.entries(detail.attributes || {})) {
        const attribute = normalizeAttributeName(key);
        const text = String(value ?? '').trim();
        if (attribute && text) attributes[attribute] = text;
      }
      if (!color && !size && label && !Object.keys(attributes).length) attributes.model = label;
      const availability = ayWebsAvailabilityFromBoolean(detail.stock ?? (detail.available ? true : null),
        detail.available ? 'merchant_choice_eligible_stock_unspecified' : 'merchant_stock_unspecified');
      const image = color ? (product.colorImages?.[color.toLowerCase()]?.[0] || null) : null;
      return {
        sourceVariantId: detail.id ? String(detail.id) : null,
        attributes,
        label: label || Object.values(attributes).join(' · '),
        price: Number.isFinite(Number(detail.price)) && Number(detail.price) > 0 ? Number(detail.price) : null,
        currency: Number.isFinite(Number(detail.price)) && Number(detail.price) > 0 ? product.sourceCurrency : null,
        available: detail.stock ?? null,
        availability: availability.state,
        availabilityReason: availability.reason,
        image,
        sortOrder: index,
      };
    }).filter((variant) => Object.keys(variant.attributes).length > 0);
  }

  // Pas de détails : combinaison des groupes, sans revendication de stock.
  const combinations = groups.reduce<Array<Record<string, string>>>((accumulator, group) => {
    if (!accumulator.length) return group.values.map((value) => ({ [group.attribute]: value }));
    return accumulator.flatMap((combination) => group.values.map((value) => ({ ...combination, [group.attribute]: value })));
  }, []);

  const productAvailability = ayWebsAvailabilityFromMerchant(product.availability);
  return combinations.slice(0, 200).map((attributes, index) => ({
    sourceVariantId: null,
    attributes,
    label: groups.map((group) => attributes[group.attribute]).filter(Boolean).join(' · '),
    price: null,
    currency: null,
    // La disponibilité PRODUIT ne prouve pas la disponibilité de chaque combinaison.
    available: null,
    availability: groups.length > 1 ? ('UNKNOWN' as AyWebsAvailabilityState) : productAvailability.state,
    availabilityReason: groups.length > 1 ? 'merchant_option_lists_without_combination_stock' : productAvailability.reason,
    image: attributes.color ? (product.colorImages?.[attributes.color.toLowerCase()]?.[0] || null) : null,
    sortOrder: index,
  }));
}

/** Projection `ScrapedProduct` → `AyWebsSourceProduct` (contrat §11). */
export function ayWebsSourceProductFromScraped(product: ScrapedProduct, storeName: string): AyWebsSourceProduct {
  const availability = ayWebsAvailabilityFromMerchant(product.availability);
  const variants = ayWebsVariantsFromScraped(product);
  const groups = ayWebsVariantGroupsFromScraped(product.variants);
  return {
    sourceUrl: product.url,
    sourceDomain: ayWebsSourceDomain(product.url),
    sourceProductId: product.externalId || null,
    title: product.title,
    description: product.description || null,
    brand: product.brand || null,
    images: [...(product.images || [])].filter(Boolean),
    price: Number(product.sourcePrice) || 0,
    currency: String(product.sourceCurrency || '').toUpperCase(),
    variantGroups: groups,
    variants,
    availability: availability.state,
    availabilityReason: availability.reason,
    // État neuf/occasion : recopié TEL QUEL depuis la source, ou `null`.
    // Jamais déduit d'un titre ou d'une photo (§14 : le silence ne devient pas une affirmation).
    condition: product.condition ?? null,
    merchant: { name: storeName || product.storeName || null, url: ayWebsSourceDomain(product.url) ? `https://${ayWebsSourceDomain(product.url)}` : null },
    scrapedProduct: product,
    capturedAt: product.scrapedAt || new Date().toISOString(),
  };
}

export function ayWebsAvailabilityRecord(
  state: AyWebsAvailabilityState,
  reason: string,
  source: string,
  checkedAt: string,
  quantityHint: number | null = null,
): AyWebsAvailability {
  return { state, reason, source, checkedAt, quantityHint };
}

/**
 * Une variante est-elle exigée avant l'ajout au panier ?
 * Décision de données, jamais d'écran : s'il existe des groupes d'attributs et
 * qu'aucune sélection n'est fournie, la sélection est obligatoire.
 */
export function ayWebsVariantSelectionRequired(groups: Array<{ attribute: string; values: string[] }>): boolean {
  return groups.some((group) => group.values.length > 1) || groups.some((group) => group.values.length === 1 && group.attribute !== 'model');
}

/** Clé stable d'une sélection de variante (déduplication de panier, §16). */
export function ayWebsVariantKey(attributes: Record<string, string> | null | undefined): string {
  if (!attributes) return '';
  return Object.keys(attributes)
    .sort()
    .map((key) => `${key}:${String(attributes[key] ?? '').trim().toLowerCase()}`)
    .join('|');
}

/**
 * Sépare la sélection DEMANDÉE par le client en deux ensembles disjoints :
 *
 *  • `matching` — les attributs que le marchand publie réellement (groupes ou
 *    variantes). Eux SEULS participent à la clé d'identité de la variante.
 *  • `metadata` — tout le reste (ex. `condition: "new"` envoyé par la coque).
 *    Conservé pour la trace et l'affichage, JAMAIS utilisé pour décider qu'une
 *    combinaison « n'existe pas ».
 *
 * Pourquoi (régression du 2026-10-03, prouvée) : la coque Android et la feuille
 * web ajoutaient `condition: "new"` à `variant_attributes`. La clé de variante
 * étant une correspondance EXACTE (`ayWebsVariantKey`), aucune variante du
 * marchand ne pouvait plus correspondre → `VARIANT_UNKNOWN`/`VARIANT_UNAVAILABLE`
 * → l'article n'était jamais enregistré, alors que l'écran affichait un échec
 * silencieux (le bouton revenait à « Add to Cart »).
 *
 * Ce que ce filtre ne fait PAS : il n'invente aucune valeur. Un attribut publié
 * par le marchand avec une valeur inconnue échoue toujours. Un attribut publié
 * mais absent de la sélection reste absent (l'appelant décide s'il l'exige).
 */
export function ayWebsSplitVariantSelection(
  product: {
    variantGroups?: Array<{ attribute: string; values: string[] }> | null;
    variants?: AyWebsSourceProduct['variants'] | null;
  },
  attributes: Record<string, string> | null | undefined,
): { matching: Record<string, string> | null; metadata: Record<string, string> | null } {
  if (!attributes || !Object.keys(attributes).length) return { matching: null, metadata: null };
  const published = new Set<string>();
  for (const group of product.variantGroups || []) published.add(String(group.attribute || '').trim().toLowerCase());
  for (const variant of product.variants || []) {
    for (const key of Object.keys(variant.attributes || {})) published.add(String(key || '').trim().toLowerCase());
  }
  const matching: Record<string, string> = {};
  const metadata: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(attributes)) {
    const key = String(rawKey || '').trim().toLowerCase();
    const value = String(rawValue ?? '').trim();
    if (!key || !value) continue;
    if (published.has(key)) matching[key] = value;
    else metadata[key] = value;
  }
  return {
    matching: Object.keys(matching).length ? matching : null,
    metadata: Object.keys(metadata).length ? metadata : null,
  };
}

export function ayWebsVariantFromSelection(
  variants: AyWebsSourceProduct['variants'],
  attributes: Record<string, string> | null,
): AyWebsVariant | null {
  if (!attributes || !Object.keys(attributes).length) return null;
  const key = ayWebsVariantKey(attributes);
  const match = variants.find((variant) => ayWebsVariantKey(variant.attributes) === key);
  if (!match) return null;
  return {
    variantId: match.sourceVariantId || `aywvar_${key.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}`,
    attributes: match.attributes,
    available: match.available,
    availability: match.availability,
    price: match.price,
    currency: match.currency,
    sourceVariantId: match.sourceVariantId,
  };
}
