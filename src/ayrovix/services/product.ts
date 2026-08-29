import type { QatafoDatabase } from '../../db/database';
import type { SmartLinkScraper } from '../../scraper/scraper';
import type { ScrapedProduct } from '../../types';
import type { AyrovixCandidate, AyrovixProduct } from '../types';
import { estimateWithDb } from './currency';
import { catalogSearch, scoreCandidate, externalProductSearch } from './search';
import { isUnsafeHostname, UnsafeUrlError } from '../../services/safeUrl';
import { filterDisplayableCandidates } from './candidatePolicy';

/**
 * AYROVIX product-link layer.
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
  const variantOptions = (scraped.variants?.details || []).filter((detail) => detail.available).map((detail) => {
    const variantTnd = estimateWithDb(db, detail.price || null, scraped.sourceCurrency);
    return {
      id: detail.id || null,
      label: detail.label,
      size: detail.size || null,
      color: detail.color || null,
      available: true,
      price: detail.price || null,
      currency: detail.price ? scraped.sourceCurrency : null,
      priceTnd: variantTnd?.priceTnd ?? null,
    };
  });
  return {
    title: scraped.title,
    brand: scraped.brand || null,
    model: null,
    description: scraped.description || '',
    image: scraped.mainImage,
    images: scraped.images || [],
    source: scraped.storeName,
    sourceUrl: scraped.url,
    price: scraped.sourcePrice > 0 ? scraped.sourcePrice : null,
    currency: scraped.sourcePrice > 0 ? scraped.sourceCurrency : null,
    priceTnd: tnd?.priceTnd ?? (Number.isFinite(scraped.totalPriceTND) && scraped.totalPriceTND > 0 ? scraped.totalPriceTND : null),
    exchangeRate: tnd?.exchangeRate ?? null,
    colors: scraped.variants?.colors || [],
    sizes: scraped.variants?.sizes || [],
    variantOptions,
    availability: scraped.availability || 'unknown',
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

function toFallbackProductFromUrl(rawUrl: string): AyrovixProduct {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace('www.', '');
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || host;
    const decoded = decodeURIComponent(lastPart).replace(/[-_]+/g, ' ').slice(0, 120);
    const title = decoded.length > 5 ? decoded : `Produit ${host}`;
    return {
      title: title.charAt(0).toUpperCase() + title.slice(1),
      brand: null,
      model: null,
      description: `Lien partagé depuis ${host} — AYROVI cherchera des alternatives similaires.`,
      image: '',
      images: [],
      source: host,
      sourceUrl: rawUrl,
      price: null,
      currency: null,
      priceTnd: null,
      exchangeRate: null,
      colors: [],
      sizes: [],
      availability: 'unknown',
      priceVerified: false,
      priceVerificationStatus: 'PENDING_MANUAL',
      verificationFailureCode: 'MERCHANT_EXTRACTION_FAILED',
    };
  } catch {
    return {
      title: `Produit ${rawUrl.slice(0, 50)}`,
      brand: null,
      model: null,
      description: 'Lien partagé — AYROVI cherchera des alternatives.',
      image: '',
      images: [],
      source: 'Web',
      sourceUrl: rawUrl,
      price: null,
      currency: null,
      priceTnd: null,
      exchangeRate: null,
      colors: [],
      sizes: [],
      availability: 'unknown',
      priceVerified: false,
      priceVerificationStatus: 'PENDING_MANUAL',
      verificationFailureCode: 'MERCHANT_EXTRACTION_FAILED',
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

  try {
    const scraped = await scraper.scrapeProduct(url);
    if (scraped?.title) {
      const catalog = catalogSearch(db, null, scraped.title, 4);
      const external = scraped.sourcePrice > 0 ? [] : await externalProductSearch(scraped.title, 6).catch(() => []);
      const alternates = filterDisplayableCandidates(
        [...catalog, ...external].map((candidate) => ({ ...candidate, match: scoreCandidate(null, scraped.title, candidate) })),
        8,
      );
      // A rendered/direct merchant price avoids a paid text search. If the
      // price is still absent, return the real page diagnostics plus alternates.
      return { product: toAyrovixProduct(db, scraped), alternates };
    }
  } catch (e) {
    if (e instanceof UnsafeUrlError || (e as any)?.code === 'UNSAFE_URL') {
      throw new InvalidUrlError((e as Error).message);
    }
    console.warn(`[AYROVIX scraper] Fallback for ${url} — ${e}`);
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
  const all = filterDisplayableCandidates(
    [...catalog, ...external].map((candidate) => ({ ...candidate, match: scoreCandidate(null, query, candidate) })),
    8,
  );

  return { product: fallbackProduct, alternates: all };
}
