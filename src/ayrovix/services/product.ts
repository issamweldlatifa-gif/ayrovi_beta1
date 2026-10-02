import { isSelectableVariant, reportedVariantStock } from '../../../shared/variantPolicy';
import { recordVariantContract } from './variantAvailability';
import type { QatafoDatabase } from '../../db/database';
import { enrichProduct } from './productEnrichment';
import { createHash } from 'node:crypto';
import type { SmartLinkScraper } from '../../scraper/scraper';
import type { ScrapedProduct } from '../../types';
import type { AyrovixCandidate, AyrovixProduct } from '../types';
import { estimateWithDb } from './currency';
import { catalogSearch, scoreCandidate, externalProductSearch } from './search';
import { isUnsafeHostname, UnsafeUrlError } from '../../services/safeUrl';
import { filterDisplayableCandidates, registerTrustedMerchantHost } from './candidatePolicy';

/**
 * AYROVI product-link layer.
 * URL/QR links use SSRF-safe metadata extraction first, then AI Core web
 * search when merchant metadata is incomplete.
 */
export class ExtractionFailedError extends Error { readonly code = 'EXTRACTION_FAILED'; }
export class InvalidUrlError extends Error { readonly code = 'INVALID_URL'; }

export function sanitizeProductUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 4096) return null;
  let parsed: URL;
  const candidate = raw.trim();
  try {
    parsed = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (isUnsafeHostname(parsed.hostname)) return null;
  return parsed.toString();
}

function toAyrovixProduct(db: QatafoDatabase, scraped: ScrapedProduct): AyrovixProduct {
  const tnd = estimateWithDb(db, scraped.sourcePrice, scraped.sourceCurrency);
  const variantOptions = (scraped.variants?.details || []).filter(isSelectableVariant).map((detail) => {
    const variantTnd = estimateWithDb(db, detail.price || null, scraped.sourceCurrency);
    return {
      id: detail.id || null,
      label: detail.label,
      size: detail.size || null,
      color: detail.color || null,
      // `available` = eligible for a choice (historical contract, unchanged).
      available: true,
      // `availability` = stock actually reported by source; silence stays unknown.
      availability: (() => {
        const reported = reportedVariantStock(detail);
        return reported === true ? 'available' as const : reported === false ? 'unavailable' as const : 'unknown' as const;
      })(),
      price: detail.price || null,
      currency: detail.price ? scraped.sourceCurrency : null,
      priceTnd: variantTnd?.priceTnd ?? null,
    };
  });
  const gallery = [...new Set([scraped.mainImage, ...(scraped.images || [])].filter(Boolean))];
  return {
    title: scraped.title,
    brand: scraped.brand || null,
    model: null,
    description: scraped.description || '',
    image: scraped.mainImage || gallery[0] || '',
    images: gallery,
    colorImages: scraped.colorImages && Object.keys(scraped.colorImages).length ? scraped.colorImages : null,
    source: scraped.storeName,
    sourceUrl: scraped.url,
    price: scraped.sourcePrice > 0 ? scraped.sourcePrice : null,
    currency: scraped.sourcePrice > 0 ? scraped.sourceCurrency : null,
    priceTnd: tnd?.priceTnd ?? (Number.isFinite(scraped.totalPriceTND) && scraped.totalPriceTND > 0 ? scraped.totalPriceTND : null),
    // Prix barré du marchand, passé par le MÊME calculateur (jamais déduit).
    originalPrice: scraped.sourceOriginalPrice && scraped.sourceOriginalPrice > scraped.sourcePrice ? scraped.sourceOriginalPrice : null,
    originalPriceTnd: scraped.sourceOriginalPrice && scraped.sourceOriginalPrice > scraped.sourcePrice
      ? estimateWithDb(db, scraped.sourceOriginalPrice, scraped.sourceCurrency)?.priceTnd ?? null
      : null,
    exchangeRate: tnd?.exchangeRate ?? null,
    promo: tnd?.promo ?? null,
    colors: scraped.variants?.colors || [],
    sizes: scraped.variants?.sizes || [],
    variantOptions,
    availability: scraped.availability || 'unknown',
    availabilityCheckedAt: scraped.scrapedAt || new Date().toISOString(),
    availabilityExpiresAt: null,
    priceVerified: Boolean(scraped.priceVerified),
    priceVerificationStatus: scraped.priceVerified ? 'VERIFIED' : 'PENDING_MANUAL',
    verificationProvider: scraped.verificationProvider || 'none',
    verificationMethod: scraped.verificationMethod || 'none',
    verificationFailureCode: scraped.verificationFailureCode || null,
    rating: Number.isFinite(Number((scraped as any).rating)) && Number((scraped as any).rating) > 0 && Number((scraped as any).rating) <= 5 ? Number((scraped as any).rating) : null,
    ratingCount: Number.isFinite(Number((scraped as any).ratingCount)) ? Number((scraped as any).ratingCount) : null,
    ratingKind: Number.isFinite(Number((scraped as any).rating)) ? 'merchant' : 'listing-quality',
  };
}

/** Enriches only the opened page and only with same-merchant, title-matched data. */
async function enrichSparseProduct(product: AyrovixProduct, url: string): Promise<void> {
  if (product.images.length >= 4 && product.sizes.length > 0) return;
  const extra = await enrichProduct(product.title, { cacheScope: url });
  if (!product.optionLabel && extra.optionLabel) product.optionLabel = extra.optionLabel;
  if (extra.images.length) {
    product.images = [...new Set([...product.images, ...extra.images])];
    if (!product.image) product.image = product.images[0] || '';
  }
  if (!product.sizes.length && extra.sizes.length) {
    product.sizes = extra.sizes.map((size) => size.value);
    product.variantOptions = [
      ...(product.variantOptions || []),
      ...extra.sizes.map((size) => ({
        id: null,
        label: size.label || size.value,
        size: size.value,
        color: null,
        available: size.availability !== 'unavailable',
        availability: size.availability,
        price: null,
        // This source has no per-variant prices; never copy the product price.
        currency: null,
        priceTnd: null,
      })),
    ];
  }
  if (!product.description && extra.description) product.description = extra.description;
}

function recordProductAvailability(product: AyrovixProduct, checkedAt?: string | null): void {
  const rawState = product.availability;
  const productAvailability = rawState === 'in_stock' || rawState === 'limited' ? 'available'
    : rawState === 'out_of_stock' ? 'unavailable' : 'unknown';
  const grouped = new Map<string, { value: string; color: string | null; states: Set<'available' | 'unavailable' | 'unknown'> }>();
  for (const option of product.variantOptions || []) {
    if (!isSelectableVariant(option)) continue;
    const value = String(option.size || option.label || '').trim();
    if (!value) continue;
    const color = String(option.color || '').trim() || null;
    const key = `${value.normalize('NFKC').toLowerCase()}|${(color || '').normalize('NFKC').toLowerCase()}`;
    const availability = option.availability === 'available' || option.availability === 'unavailable' ? option.availability : 'unknown';
    const current = grouped.get(key) || { value, color, states: new Set<'available' | 'unavailable' | 'unknown'>() };
    current.states.add(availability);
    grouped.set(key, current);
  }
  const checkedMs = Date.parse(checkedAt || product.availabilityCheckedAt || '');
  const configuredTtl = Number(process.env.AYROVI_VARIANT_TTL_MS);
  const ttl = Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : 6 * 60 * 60 * 1000;
  product.availabilityExpiresAt = Number.isFinite(checkedMs) && checkedMs > 0 ? new Date(checkedMs + ttl).toISOString() : null;
  recordVariantContract(product.sourceUrl, {
    attribute: product.optionLabel || 'option',
    productAvailability,
    source: product.source || null,
    variants: [...grouped.values()].map((entry) => {
      const availability = entry.states.size === 1 ? [...entry.states][0] : 'unknown';
      return {
        value: entry.value,
        color: entry.color,
        availability,
        reason: availability === 'available' ? 'Disponibilité positive publiée par la source.'
          : availability === 'unavailable' ? 'Indisponibilité publiée par la source.'
            : 'Aucune disponibilité par variante publiée par la source.',
      };
    }),
  }, Number.isFinite(checkedMs) && checkedMs > 0 ? checkedMs : 1);
}

function toFallbackProductFromUrl(rawUrl: string): AyrovixProduct {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace('www.', '');
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || host;
    const decoded = decodeURIComponent(lastPart).replace(/[-_]+/g, ' ').slice(0, 120);
    const title = decoded.length > 5 ? decoded : `Produit ${host}`;
    return {
      title: title.charAt(0).toUpperCase() + title.slice(1), brand: null, model: null,
      description: `Lien partagé depuis ${host} — AYROVI cherchera des alternatives similaires.`,
      image: '', images: [], source: host, sourceUrl: rawUrl, price: null, currency: null,
      priceTnd: null, exchangeRate: null, colors: [], sizes: [], availability: 'unknown',
      priceVerified: false, priceVerificationStatus: 'PENDING_MANUAL', verificationFailureCode: 'MERCHANT_EXTRACTION_FAILED',
    };
  } catch {
    return {
      title: `Produit ${rawUrl.slice(0, 50)}`, brand: null, model: null,
      description: 'Lien partagé — AYROVI cherchera des alternatives.', image: '', images: [],
      source: 'Web', sourceUrl: rawUrl, price: null, currency: null, priceTnd: null,
      exchangeRate: null, colors: [], sizes: [], availability: 'unknown', priceVerified: false,
      priceVerificationStatus: 'PENDING_MANUAL', verificationFailureCode: 'MERCHANT_EXTRACTION_FAILED',
    };
  }
}

export interface UrlExtractionResult {
  product: AyrovixProduct;
  alternates: AyrovixCandidate[];
}

export async function extractProductFromUrl(db: QatafoDatabase, scraper: SmartLinkScraper, rawUrl: string): Promise<UrlExtractionResult> {
  const url = sanitizeProductUrl(scraper.cleanPastedUrl(rawUrl));
  if (!url) throw new InvalidUrlError('Ce lien ne peut pas être analysé.');

  // Complete product profiles are retained by URL for six hours.
  const urlHash = createHash('sha256').update(url).digest('hex');
  const profileTtlMs = 6 * 3_600_000;
  try {
    const cached = db.get<{ payload: string; fetched_at: string }>(
      'SELECT payload,fetched_at FROM product_profiles WHERE url_hash=?', urlHash,
    );
    if (cached && Date.now() - Date.parse(cached.fetched_at) < profileTtlMs) {
      const product = JSON.parse(cached.payload) as AyrovixProduct;
      if (product?.title) {
        await enrichSparseProduct(product, url);
        recordProductAvailability(product, product.availabilityCheckedAt);
        try {
          db.run('UPDATE product_profiles SET payload=?,images_count=?,has_description=? WHERE url_hash=?', JSON.stringify(product), product.images.length, (product.description || '').trim().length >= 40 ? 1 : 0, urlHash);
        } catch { /* a stale profile remains usable for this response */ }
        const catalog = catalogSearch(db, null, product.title, 4);
        const alternates = filterDisplayableCandidates(
          catalog.map((candidate) => ({ ...candidate, match: scoreCandidate(null, product.title, candidate) })), 8,
        );
        return { product, alternates };
      }
    }
  } catch { /* unreadable profile → normal recrawl */ }

  try {
    const scraped = await scraper.scrapeProduct(url);
    if (scraped?.title) {
      const product = toAyrovixProduct(db, scraped);
      await enrichSparseProduct(product, url);
      recordProductAvailability(product, product.availabilityCheckedAt);
      try {
        db.run(`INSERT INTO product_profiles (id,url_hash,url,payload,images_count,has_description,fetched_at)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(url_hash) DO UPDATE SET payload=excluded.payload,
            images_count=excluded.images_count, has_description=excluded.has_description,
            fetched_at=excluded.fetched_at`,
          `profile_${urlHash.slice(0, 24)}`, urlHash, url, JSON.stringify(product), product.images.length,
          (product.description || '').trim().length >= 40 ? 1 : 0, new Date().toISOString(),
        );
      } catch { /* best-effort profile persistence */ }
      if (product.images.length >= 2 && (product.description || '').trim().length >= 40) registerTrustedMerchantHost(url);
      const catalog = catalogSearch(db, null, scraped.title, 4);
      const external = scraped.sourcePrice > 0 ? [] : await externalProductSearch(scraped.title, 6).catch(() => []);
      const alternates = filterDisplayableCandidates(
        [...catalog, ...external].map((candidate) => ({ ...candidate, match: scoreCandidate(null, scraped.title, candidate) })), 8,
      );
      return { product, alternates };
    }
  } catch (error) {
    if (error instanceof UnsafeUrlError || (error as any)?.code === 'UNSAFE_URL') {
      throw new InvalidUrlError((error as Error).message);
    }
    console.warn(`[AYROVIX scraper] Fallback for ${url} — ${error}`);
  }

  console.log(`[AYROVIX] Using catalog + provider search fallback for URL: ${url}`);
  const fallbackProduct = toFallbackProductFromUrl(url);
  let query = '';
  try {
    const parsed = new URL(url);
    query = decodeURIComponent(parsed.pathname.replace(/[\/\-_]/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!query || query.length < 3) query = parsed.hostname.replace('www.', '').replace(/\./g, ' ');
  } catch { query = url; }

  const catalog = catalogSearch(db, null, query, 4);
  const external = await externalProductSearch(query, 6).catch(() => []);
  const alternates = filterDisplayableCandidates(
    [...catalog, ...external].map((candidate) => ({ ...candidate, match: scoreCandidate(null, query, candidate) })),
    8,
  );
  return { product: fallbackProduct, alternates };
}
