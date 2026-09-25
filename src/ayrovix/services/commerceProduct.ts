import { listingIdentityUrl } from '../../../shared/listingIdentity';
import { createHash } from 'node:crypto';
import type { QatafoDatabase } from '../../db/database';
import { calculatePrice, millimes, type PriceBreakdown } from '../../services/pricing';
import { resolvePromoForQuote } from '../../services/promotions';
import { parsePublicHttpUrl } from '../../services/safeUrl';
import { signCommerceProduct } from '../commerceQuote';
import type { ScrapedProduct } from '../../types';
import type { AyrovixCandidate, AyrovixProduct } from '../types';
import type { CommerceProduct, StockState, VariantGroup, VariantOffer, VariantOption } from '../../../shared/commerceProduct';
import { isSafeProductMediaUrl } from '../../../shared/commerceProduct';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, length = 500): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const cleaned = String(value).replace(/&(?:amp|nbsp|quot|#39|lt|gt);/gi, entity => ({
    '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>',
  })[entity.toLowerCase()] ?? entity).replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, length) : null;
};
const number = (raw: unknown): number | null => {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== 'string' || !/\d/.test(raw)) return null;
  const input = raw.replace(/[^\d.,\s\u00a0]/g, '').replace(/[\s\u00a0]/g, '');
  const comma = input.lastIndexOf(','), dot = input.lastIndexOf('.');
  const decimal = comma > dot ? ',' : '.';
  const separator = decimal === ',' ? /\./g : /,/g;
  const result = Number(input.replace(separator, '').replace(decimal, '.'));
  return Number.isFinite(result) && result > 0 ? result : null;
};
const money = (value: unknown): number | null => {
  const r = record(value);
  return number(r.extracted_value ?? r.extractedValue ?? r.amount ?? r.value ?? value);
};
const count = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const cleaned = String(value).replace(/[\s\u00a0,.]/g, '');
  const n = Number(cleaned);
  return /^\d+$/.test(cleaned) && Number.isSafeInteger(n) ? n : null;
};
function currency(value: unknown, displayedPrice?: unknown): string | null {
  const raw = text(value, 10)?.toUpperCase() || '';
  const explicit: Record<string, string> = { '$': 'USD', 'US$': 'USD', '€': 'EUR', '£': 'GBP', 'DT': 'TND', 'د.ت': 'TND' };
  if (explicit[raw]) return explicit[raw];
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  if (typeof displayedPrice === 'string') {
    if (displayedPrice.includes('€')) return 'EUR';
    if (displayedPrice.includes('£')) return 'GBP';
    if (displayedPrice.includes('$')) return 'USD';
    if (/\b(?:TND|DT)\b/i.test(displayedPrice)) return 'TND';
    const iso = displayedPrice.match(/\b[A-Z]{3}\b/);
    if (iso) return iso[0];
  }
  return null;
}
const url = (value: unknown): string | null => {
  try { parsePublicHttpUrl(value); return String(value).trim(); }
  catch { return null; }
};
const imagesOf = (values: unknown[]): string[] => [...new Set(values.flatMap(value => Array.isArray(value) ? value : [value])
  .filter(isSafeProductMediaUrl))].slice(0, 48);
const availability = (value: unknown): StockState => {
  if (value === 'in_stock' || value === 'limited' || value === 'out_of_stock') return value;
  if (typeof value !== 'string') return 'unknown';
  if (/out.?of.?stock|sold.?out|rupture|épuisé|unavailable|not.?available|indisponible/i.test(value)) return 'out_of_stock';
  if (/in.?stock|available|disponible/i.test(value)) return 'in_stock';
  return 'unknown';
};
function groupId(name: string): string { return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50); }
function groupType(name: string): string {
  const key = groupId(name);
  if (/pointure|taille|size/.test(key)) return 'size';
  if (/couleur|color|colour/.test(key)) return 'color';
  if (/shade|teinte|nuance/.test(key)) return 'shade';
  if (/storage|stockage|capacite|capacity/.test(key)) return 'storage';
  if (/memory|memoire|ram/.test(key)) return 'ram';
  if (/cpu|processor|processeur|chipset/.test(key)) return 'processor';
  if (/material|matiere|materiau/.test(key)) return 'material';
  if (/dimension|width|height|largeur|hauteur/.test(key)) return 'dimensions';
  return key || 'option';
}
function stock(value: unknown): boolean | null {
  const r = record(value);
  const flags = [r.available, r.inStock, r.isInStock].filter(flag => typeof flag === 'boolean');
  if (flags.includes(false)) return false;
  if (flags.includes(true)) return true;
  const status = text(r.availability ?? r.stock_status ?? r.stockStatus, 80);
  if (status && /out.?of.?stock|sold.?out|unavailable|not.?available|indisponible/i.test(status)) return false;
  if (status && /in.?stock|available|disponible/i.test(status)) return true;
  return null;
}

/** Explicit SerpAPI/merchant options ONLY. No title/category-based size, shade or storage fabrication. */
export function normalizeVariantEvidence(input: { options?: unknown; variants?: unknown; sizes?: unknown; colors?: unknown; defaultCurrency?: string | null }): CommerceProduct['variants'] {
  const groups = new Map<string, VariantGroup>();
  const addGroup = (name: string, required?: boolean) => {
    const id = groupId(name);
    if (!id) return null;
    if (!groups.has(id)) groups.set(id, { id, name, type: groupType(name), required: required === true, options: [] });
    return groups.get(id)!;
  };
  const addOption = (group: VariantGroup | null, raw: unknown) => {
    if (!group) return;
    const item = record(raw);
    const label = text(item.label ?? item.value ?? item.name ?? raw, 100);
    if (!label) return;
    const id = text(item.id, 120) || label;
    const existing = group.options.find(option => option.id === id);
    const available = stock(raw);
    if (existing) { if (available === false) existing.available = false; return; }
    group.options.push({ id, label, available });
  };
  const opts = input.options;
  if (Array.isArray(opts)) {
    for (const raw of opts.slice(0, 30)) {
      const option = record(raw);
      const name = text(option.name ?? option.label ?? option.type, 100);
      if (!name) continue;
      const group = addGroup(name, option.required === true);
      const values = option.options ?? option.values ?? option.items;
      if (Array.isArray(values)) values.slice(0, 80).forEach(value => addOption(group, value));
    }
  } else {
    for (const [name, value] of Object.entries(record(opts)).slice(0, 30)) {
      const option = record(value);
      const group = addGroup(name, option.required === true);
      const values = Array.isArray(value) ? value : option.options ?? option.values;
      if (Array.isArray(values)) values.slice(0, 80).forEach(item => addOption(group, item));
    }
  }
  if (Array.isArray(input.sizes)) input.sizes.slice(0, 80).forEach(value => addOption(addGroup('Size'), value));
  if (Array.isArray(input.colors)) input.colors.slice(0, 80).forEach(value => addOption(addGroup('Color'), value));
  const offers: VariantOffer[] = [];
  if (Array.isArray(input.variants)) {
    for (const raw of input.variants.slice(0, 300)) {
      const variant = record(raw);
      const attrs = record(variant.attributes ?? variant.selectedOptions ?? variant.selection);
      const mapped: Record<string, string> = {};
      // An offer's selected value can be a merchant option ID while group
      // options carry a different human-readable label. Bind by explicit ID or
      // a unique label, never by the offer index or guessed array position.
      const choose = (name: string, rawValue: unknown) => {
        const evidence = record(rawValue);
        const rawId = text(evidence.id, 120);
        const label = text(evidence.label ?? evidence.value ?? evidence.name ?? rawValue, 100);
        if (!label && !rawId) return;
        const normalizedName = groupType(name);
        const group = groups.get(groupId(name)) || [...groups.values()].find(item => item.type === normalizedName) || addGroup(name);
        if (!group) return;
        const direct = group.options.find(option => rawId && option.id === rawId)
          || group.options.find(option => option.id === label);
        const matches = group.options.filter(option => option.label === label);
        const selected = direct || (matches.length === 1 ? matches[0] : null);
        if (selected) { mapped[group.id] = selected.id; return; }
        // An ID-only value that does not match a source option is not a label.
        if (!label) return;
        addOption(group, rawValue);
        const added = group.options.find(option => option.id === (rawId || label));
        if (added) mapped[group.id] = added.id;
      };
      for (const [name, value] of Object.entries(attrs)) choose(name, value);
      for (const [name, key] of [['Size', 'size'], ['Color', 'color'], ['Storage', 'storage'], ['RAM', 'ram'], ['Processor', 'processor'], ['Shade', 'shade'], ['Material', 'material'], ['Dimensions', 'dimensions']] as const) {
        if (variant[key] != null) choose(name, variant[key]);
      }
      if (!Object.keys(mapped).length) continue;
      const rawPrice = variant.price ?? variant.sourcePrice;
      const sourcePrice = money(rawPrice);
      const sourceCurrency = sourcePrice
        ? currency(variant.currency ?? record(rawPrice).currency, rawPrice) ?? currency(input.defaultCurrency) : null;
      const offerId = text(variant.id, 120) || `selection_${createHash('sha256').update(JSON.stringify(Object.entries(mapped).sort(([a], [b]) => a.localeCompare(b)))).digest('hex').slice(0, 20)}`;
      offers.push({ id: offerId, selection: mapped, available: stock(raw), sourcePrice, sourceCurrency, ayroviPriceTnd: null, unitBreakdown: null, promotion: null });
    }
  }
  const result = [...groups.values()].filter(group => group.options.length > 0).map(group => ({
    ...group,
    required: group.required || group.options.length > 1 || offers.some(offer => offer.selection[group.id]),
    // A sold-out combination does not prove the whole color/size is sold out.
    // Only the merchant's explicit option-level availability disables a group value.
    options: group.options,
  }));
  // Exact combinations remain validated against the source offers at order time.
  return { groups: result, offers: offers.filter(offer => Object.keys(offer.selection).every(key => result.some(group => group.id === key))) };
}

export interface ProductInput {
  source: CommerceProduct['identity']['source'];
  sourceProductId?: unknown;
  sourceUrl?: unknown;
  merchant?: unknown;
  title?: unknown;
  description?: unknown;
  brand?: unknown;
  category?: unknown;
  imageUrls?: unknown[];
  colorImages?: Record<string, string[]> | null;
  sourcePrice?: unknown;
  sourceCurrency?: unknown;
  referencePrice?: unknown;
  discount?: unknown;
  rating?: unknown;
  reviews?: unknown;
  availability?: unknown;
  options?: unknown;
  variants?: unknown;
  sizes?: unknown;
  colors?: unknown;
  attributes?: Record<string, unknown> | null;
  sourceMetadata?: Record<string, unknown>;
  verificationStatus?: CommerceProduct['verificationStatus'];
}

export function normalizeProduct(input: ProductInput): CommerceProduct {
  const sourceUrl = url(input.sourceUrl);
  const sourceProductId = text(input.sourceProductId, 180);
  const merchant = text(input.merchant, 160);
  const rawCurrency = record(input.sourcePrice).currency ?? input.sourceCurrency;
  const sourcePrice = money(input.sourcePrice);
  const sourceCurrency = sourcePrice ? currency(rawCurrency, input.sourcePrice) : null;
  const ref = money(input.referencePrice);
  const referencePrice = ref && sourceCurrency && (!record(input.referencePrice).currency || currency(record(input.referencePrice).currency) === sourceCurrency) && ref > (sourcePrice ?? 0) ? ref : null;
  const rawDiscount = number(input.discount);
  const discountPercent = rawDiscount != null && rawDiscount < 100 ? rawDiscount : null;
  const gallery = imagesOf(input.imageUrls || []);
  const variantData = normalizeVariantEvidence({ options: input.options, variants: input.variants, sizes: input.sizes, colors: input.colors, defaultCurrency: sourceCurrency });
  const value = number(input.rating);
  const rating = value && value <= 5 ? value : null;
  const normalizedMetadata: CommerceProduct['sourceMetadata'] = {};
  for (const [key, val] of Object.entries(input.sourceMetadata || {}).slice(0, 20)) {
    if (!/^[a-zA-Z][\w-]{0,50}$/.test(key)) continue;
    if (typeof val === 'number' && Number.isFinite(val)) normalizedMetadata[key] = val;
    else if (typeof val === 'boolean') normalizedMetadata[key] = val;
    else normalizedMetadata[key] = text(val, 250);
  }
  const identifier = `${input.source}|${sourceProductId ? `${merchant || ''}|${sourceProductId}` : sourceUrl ? listingIdentityUrl(sourceUrl) : ''}`;
  return {
    id: `${input.source}_${createHash('sha256').update(identifier).digest('hex').slice(0, 24)}`,
    identity: { source: input.source, sourceProductId, sourceUrl, merchant },
    basic: { title: text(input.title, 500) || '', description: text(input.description, 5000), brand: text(input.brand, 160), category: text(input.category, 160) },
    media: { originalImages: gallery, primaryImage: gallery[0] ?? null, processedImage: null,
      colorImages: Object.fromEntries(Object.entries(input.colorImages || {}).map(([key, values]) => [key, imagesOf(values)])) },
    pricing: { sourcePrice, sourceCurrency, referencePrice, discountPercent, ayroviPriceTnd: null, ayroviReferenceTnd: null, pricingVersion: null, unitBreakdown: null, promotion: null },
    rating: { value: rating, reviewCount: count(input.reviews) },
    variants: variantData,
    availability: availability(input.availability),
    attributes: Object.fromEntries(Object.entries(input.attributes || {}).filter(([, value]) => typeof value === 'string' || typeof value === 'number').map(([key, value]) => [key, String(value)])),
    sourceMetadata: normalizedMetadata,
    verificationStatus: input.verificationStatus || 'PENDING_MANUAL',
    quoteToken: null,
  };
}

/** A SerpAPI visual_matches row is data, not an instruction to synthesize product specs. */
export function normalizeSerpApiMatch(raw: unknown): CommerceProduct {
  const row = record(raw);
  const price = row.price ?? row.extracted_price;
  const rawRating = row.rating ?? row.product_rating;
  return normalizeProduct({
    source: 'serpapi',
    sourceProductId: row.product_id ?? row.productId ?? row.source_product_id,
    sourceUrl: row.link,
    merchant: row.source ?? row.merchant ?? row.store,
    title: row.title,
    brand: row.brand,
    description: row.description ?? row.snippet,
    category: row.category ?? row.product_type,
    imageUrls: [row.thumbnail, row.original_image, row.image, row.images, row.thumbnails],
    sourcePrice: price,
    sourceCurrency: record(price).currency ?? row.currency,
    referencePrice: row.original_price ?? row.reference_price ?? row.old_price,
    discount: row.discount_percent ?? row.discount_percentage,
    rating: rawRating,
    reviews: row.reviews ?? row.reviews_count,
    availability: row.availability ?? row.stock_status,
    options: row.options ?? row.variant_groups,
    variants: row.variants,
    sourceMetadata: { shipping: row.shipping, condition: row.condition, position: row.position },
  });
}

export function normalizeMerchantProduct(scraped: ScrapedProduct): CommerceProduct {
  return normalizeProduct({
    source: 'merchant', sourceProductId: scraped.externalId, sourceUrl: scraped.url, merchant: scraped.storeName,
    title: scraped.title, description: scraped.description, brand: scraped.brand,
    imageUrls: [scraped.mainImage, scraped.images], colorImages: scraped.colorImages,
    sourcePrice: scraped.sourcePrice, sourceCurrency: scraped.sourceCurrency,
    referencePrice: scraped.referencePrice, rating: scraped.rating, reviews: scraped.reviewsCount,
    availability: scraped.availability, sizes: scraped.variants?.sizes, colors: scraped.variants?.colors,
    options: scraped.variants?.groups,
    variants: scraped.variants?.details?.map(detail => ({ id: detail.id, size: detail.size, color: detail.color,
      attributes: detail.attributes, price: detail.price, currency: scraped.sourceCurrency,
      available: detail.stockStatus ?? (detail.available === false ? false : null) })),
    verificationStatus: scraped.priceVerified ? 'VERIFIED' : 'PENDING_MANUAL',
    sourceMetadata: { verificationProvider: scraped.verificationProvider, verificationMethod: scraped.verificationMethod },
  });
}

/** Existing catalog rows are another documented source, not a second pricing
 * engine. The same normalization is used by Lens search and public CMS cards.
 */
export function normalizeCatalogRow(row: {
  id: string; name: string; description?: string | null; brand_name?: string | null;
  image?: string | null; additional_images?: string | null; category?: string | null;
  source_url?: string | null; source_platform?: string | null; original_price?: number | null;
  currency?: string | null; stock_status?: string | null;
}): CommerceProduct {
  let additional: unknown = [];
  try { additional = JSON.parse(row.additional_images || '[]'); } catch { /* unavailable */ }
  return normalizeProduct({ source: 'catalog', sourceProductId: row.id, sourceUrl: row.source_url,
    merchant: row.source_platform, title: row.name, description: row.description,
    brand: row.brand_name, category: row.category, imageUrls: [row.image, additional],
    sourcePrice: row.original_price, sourceCurrency: row.currency, availability: row.stock_status,
    verificationStatus: 'VERIFIED' });
}

/** The ONLY pricing transformation for canonical results and detail. Local delivery belongs to the order, not the unit. */
export function calculateUnitQuote(db: QatafoDatabase, price: number | null, currencyCode: string | null, title: string):
  { unit: number; reference: number | null; version: number; breakdown: PriceBreakdown; promotion: CommerceProduct['pricing']['promotion'] } | null {
  if (price == null || !currencyCode) return null;
  const rules = db.getPricingRules();
  const base = calculatePrice(rules, price, currencyCode, { title, includeLocalDelivery: false });
  if (!base || base.restricted) return null;
  const promo = resolvePromoForQuote(db, { categoryId: base.categoryId });
  if (promo?.percent) {
    const discount = millimes(base.convertedPriceTND * promo.percent / 100);
    const discounted = discount > 0 ? calculatePrice(rules, price, currencyCode, { title, includeLocalDelivery: false, discountTND: discount }) : null;
    if (discounted && !discounted.restricted) return {
      unit: discounted.totalTND, reference: base.totalTND, version: rules.version, breakdown: discounted,
      promotion: { percent: promo.percent, label: promo.label, priceTnd: discounted.totalTND, originalPriceTnd: base.totalTND },
    };
  }
  return { unit: base.totalTND, reference: null, version: rules.version, breakdown: base, promotion: null };
}

export function priceCommerceProduct(db: QatafoDatabase, product: CommerceProduct): CommerceProduct {
  const base = calculateUnitQuote(db, product.pricing.sourcePrice, product.pricing.sourceCurrency, product.basic.title);
  const offers = product.variants.offers.map(offer => {
    if (offer.sourcePrice == null) return { ...offer, ayroviPriceTnd: null, unitBreakdown: null, promotion: null };
    const priced = calculateUnitQuote(db, offer.sourcePrice, offer.sourceCurrency, product.basic.title);
    return { ...offer, ayroviPriceTnd: priced?.unit ?? null, unitBreakdown: priced?.breakdown ?? null, promotion: priced?.promotion ?? null };
  });
  const priced: CommerceProduct = {
    ...product,
    pricing: { ...product.pricing, ayroviPriceTnd: base?.unit ?? null, ayroviReferenceTnd: base?.reference ?? null,
      pricingVersion: base?.version ?? null, unitBreakdown: base?.breakdown ?? null, promotion: base?.promotion ?? null },
    variants: { ...product.variants, offers }, quoteToken: null,
  };
  return { ...priced, quoteToken: signCommerceProduct(priced) };
}

/** Old wire fields are a projection of canonical data while non-Lens clients migrate. */
export function projectCandidate(product: CommerceProduct, match: number, kind: AyrovixCandidate['kind'] = 'external'): AyrovixCandidate {
  const size = product.variants.groups.find(group => group.type === 'size');
  const color = product.variants.groups.find(group => group.type === 'color');
  return {
    id: product.identity.source === 'serpapi' ? product.id.replace(/^serpapi_/, 'lens_') : product.id,
    kind, title: product.basic.title, description: product.basic.description, brand: product.basic.brand, model: null,
    sizes: size?.options.map(item => item.label) || [], colors: color?.options.map(item => item.label) || [],
    source: product.identity.merchant || 'Source indisponible', sourceUrl: product.identity.sourceUrl || '',
    image: product.media.primaryImage || '', images: product.media.originalImages,
    price: product.pricing.sourcePrice, currency: product.pricing.sourceCurrency, priceTnd: product.pricing.ayroviPriceTnd,
    rating: product.rating.value, ratingCount: product.rating.reviewCount, ratingKind: product.rating.value !== null ? 'merchant' : 'match',
    match, availability: product.availability, promo: product.pricing.promotion,
    priceVerificationStatus: product.verificationStatus, canonical: product,
  };
}

export function projectProduct(product: CommerceProduct): AyrovixProduct {
  const size = product.variants.groups.find(group => group.type === 'size');
  const color = product.variants.groups.find(group => group.type === 'color');
  return {
    title: product.basic.title, brand: product.basic.brand, model: null, description: product.basic.description || '',
    image: product.media.primaryImage || '', images: product.media.originalImages, colorImages: product.media.colorImages,
    source: product.identity.merchant || '', sourceUrl: product.identity.sourceUrl || '',
    price: product.pricing.sourcePrice, currency: product.pricing.sourceCurrency, priceTnd: product.pricing.ayroviPriceTnd,
    exchangeRate: null, promo: product.pricing.promotion, sizes: size?.options.map(option => option.label) || [],
    colors: color?.options.map(option => option.label) || [], availability: product.availability,
    priceVerified: product.verificationStatus === 'VERIFIED', priceVerificationStatus: product.verificationStatus,
    rating: product.rating.value, ratingCount: product.rating.reviewCount,
    ratingKind: product.rating.value !== null ? 'merchant' : 'match', canonical: product,
  };
}
