/** Product truth transported from discovery to detail to the signed cart snapshot.
 * A search hit is this product plus search-only metadata, not a second product model.
 * Unknown source fields remain null; category is NEVER evidence of a variant.
 */
/** Monetary arithmetic uses Tunisia's three-decimal dinar (millimes).
 * Both signed unit quotes and client line previews apply this rule.
 */
export function roundTnd(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000 + Number.EPSILON) / 1000 : 0;
}

export type StockState = 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
export type VerificationState = 'VERIFIED' | 'PENDING_MANUAL';

export interface VariantOption {
  id: string;
  label: string;
  /** null = merchant did not report stock (a choice, NOT a stock claim). */
  available: boolean | null;
}
export interface VariantGroup {
  id: string;
  name: string;
  type: string;
  required: boolean;
  options: VariantOption[];
}
export interface UnitPriceBreakdown {
  originalPrice: number;
  currency: string;
  exchangeRate: number;
  convertedPriceTND: number;
  freightTND: number;
  cifTND: number;
  dutyTND: number;
  tvaTND: number;
  rpdTND: number;
  customsFeeTND: number;
  shippingFeeTND: number;
  serviceFeeTND: number;
  expressFeeTND: number;
  discountTND: number;
  localDeliveryTND: number;
  weightKg: number;
  requiresWeightValidation: boolean;
  categoryId: string;
  categoryLabel: string;
  categoryStatus: 'ALLOWED' | 'WARNING' | 'RESTRICTED';
  restricted: boolean;
  estimateUncertain: boolean;
  totalTND: number;
  pricingVersion: number;
}
export interface VariantOffer {
  id: string | null;
  /** Group id -> option id. An offer exists only if the source explicitly listed it. */
  selection: Record<string, string>;
  sourcePrice: number | null;
  sourceCurrency: string | null;
  ayroviPriceTnd: number | null;
  unitBreakdown: UnitPriceBreakdown | null;
  promotion: ProductPromotion | null;
  available: boolean | null;
}
export interface ProductPromotion {
  percent: number;
  label: string;
  priceTnd: number;
  originalPriceTnd: number;
}
export interface CommerceProduct {
  id: string;
  identity: {
    source: 'serpapi' | 'merchant' | 'catalog' | 'web' | 'vision';
    sourceProductId: string | null;
    sourceUrl: string | null;
    merchant: string | null;
  };
  basic: { title: string; description: string | null; brand: string | null; category: string | null };
  media: {
    originalImages: string[];
    primaryImage: string | null;
    /** Kept separate. If processing fails, use originalImages, never another product. */
    processedImage: string | null;
    colorImages: Record<string, string[]>;
  };
  pricing: {
    sourcePrice: number | null;
    sourceCurrency: string | null;
    referencePrice: number | null;
    discountPercent: number | null;
    ayroviPriceTnd: number | null;
    ayroviReferenceTnd: number | null;
    pricingVersion: number | null;
    unitBreakdown: UnitPriceBreakdown | null;
    promotion: ProductPromotion | null;
  };
  rating: { value: number | null; reviewCount: number | null };
  variants: { groups: VariantGroup[]; offers: VariantOffer[] };
  availability: StockState;
  /** Only explicit, sourced category attributes, never inferred options. */
  attributes: Record<string, string>;
  sourceMetadata: Record<string, string | number | boolean | null>;
  verificationStatus: VerificationState;
  /** Opaque server HMAC binding the complete product to its price and variant rules. */
  quoteToken: string | null;
}

export type SelectedVariants = Record<string, string>;
export interface SelectedProductPrice {
  sourcePrice: number;
  sourceCurrency: string;
  unitPriceTnd: number;
  offerId: string | null;
}
export type SelectionCheck =
  | { ok: true; price: SelectedProductPrice }
  | { ok: false; reason: 'PRODUCT_UNAVAILABLE' | 'PRICE_UNAVAILABLE' | 'VARIANT_REQUIRED' | 'INVALID_VARIANT' | 'VARIANT_UNAVAILABLE' | 'VARIANT_PRICE_UNAVAILABLE' | 'QUANTITY_INVALID' };

/** Exactly one selection policy in browser and server; no free-text variant can masquerade as a source option. */
export function validateProductForCart(product: CommerceProduct | null, selection: SelectedVariants, quantity: number): SelectionCheck {
  if (!product || !product.id || !product.basic.title || !product.identity.sourceUrl || product.availability === 'out_of_stock') {
    return { ok: false, reason: 'PRODUCT_UNAVAILABLE' };
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return { ok: false, reason: 'QUANTITY_INVALID' };
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return { ok: false, reason: 'INVALID_VARIANT' };
  if (Object.keys(selection).some(key => !product.variants.groups.some(group => group.id === key))) return { ok: false, reason: 'INVALID_VARIANT' };
  for (const group of product.variants.groups) {
    const wanted = selection[group.id];
    if (!wanted) {
      if (group.required) return { ok: false, reason: 'VARIANT_REQUIRED' };
      continue;
    }
    const option = group.options.find(item => item.id === wanted);
    if (!option) return { ok: false, reason: 'INVALID_VARIANT' };
    if (option.available === false) return { ok: false, reason: 'VARIANT_UNAVAILABLE' };
  }
  const keys = Object.keys(selection).filter(key => selection[key]);
  const matches = keys.length ? product.variants.offers.filter(offer =>
    keys.every(key => offer.selection[key] === selection[key])
    && Object.keys(offer.selection).every(key => !product.variants.groups.some(group => group.id === key && group.required) || selection[key] === offer.selection[key]),
  ) : [];
  // If the source enumerated combinations, an unavailable or ambiguous combination
  // cannot silently fall back to the general price.
  if (keys.length && product.variants.offers.length && matches.length !== 1) return { ok: false, reason: 'INVALID_VARIANT' };
  const offer = matches[0] ?? null;
  if (offer?.available === false) return { ok: false, reason: 'VARIANT_UNAVAILABLE' };
  if (offer && offer.sourcePrice == null) return { ok: false, reason: 'VARIANT_PRICE_UNAVAILABLE' };
  const pricedVariant = offer && offer.sourcePrice != null;
  const sourcePrice = pricedVariant ? offer.sourcePrice : product.pricing.sourcePrice;
  const currency = pricedVariant ? offer.sourceCurrency : product.pricing.sourceCurrency;
  const unit = pricedVariant ? offer.ayroviPriceTnd : product.pricing.ayroviPriceTnd;
  if (pricedVariant && (!currency || !unit)) return { ok: false, reason: 'VARIANT_PRICE_UNAVAILABLE' };
  if (typeof sourcePrice !== 'number' || !Number.isFinite(sourcePrice) || sourcePrice <= 0 ||
    typeof unit !== 'number' || !Number.isFinite(unit) || unit <= 0 ||
    typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return { ok: false, reason: 'PRICE_UNAVAILABLE' };
  return { ok: true, price: { sourcePrice, sourceCurrency: currency, unitPriceTnd: unit, offerId: offer?.id ?? null } };
}

export function selectedVariantLabels(product: CommerceProduct, selection: SelectedVariants): Record<string, string> {
  return Object.fromEntries(product.variants.groups.flatMap(group => {
    const option = group.options.find(item => item.id === selection[group.id]);
    return option ? [[group.name, option.label]] : [];
  }));
}

export function isSafeProductMediaUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 4096) return false;
  if (raw.startsWith('/uploads/') || raw.startsWith('/media/')) return !raw.includes('\\') && !raw.includes('..');
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      && host !== 'localhost' && !host.includes(':') && !/\.(?:local|internal|localhost|lan|test|invalid)$/.test(host)
      && !/^(?:127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$)/.test(host);
  } catch { return false; }
}
