import { isSelectableVariant } from '../../../shared/variantPolicy';
import type { QatafoDatabase } from '../../db/database';
import { createHash } from 'node:crypto';
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
  const variantOptions = (scraped.variants?.details || []).filter(isSelectableVariant).map((detail) => {
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
    exchangeRate: tnd?.exchangeRate ?? null,
    promo: tnd?.promo ?? null,
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

  // PROFIL PRODUIT PERSISTANT (24/09/2026 — «كل الصور وكل المعلومات لكل منتج») :
  // une fiche crawlée (description complète, TOUTES les photos, images par
  // couleur, tailles, disponibilité) est stockée par URL et resservie telle
  // quelle pendant 6 h — le premier scan paie le crawl, TOUS les suivants sont
  // instantanés et complets, même depuis la grille Lens (enrichissement).
  const urlHash = createHash('sha256').update(url).digest('hex');
  const profileTtlMs = 6 * 3_600_000;
  try {
    const cached = db.get<{ payload: string; fetched_at: string }>(
      'SELECT payload,fetched_at FROM product_profiles WHERE url_hash=?', urlHash,
    );
    if (cached && Date.now() - Date.parse(cached.fetched_at) < profileTtlMs) {
      const product = JSON.parse(cached.payload) as AyrovixProduct;
      if (product?.title) {
        const catalog = catalogSearch(db, null, product.title, 4);
        const alternates = filterDisplayableCandidates(
          catalog.map((candidate) => ({ ...candidate, match: scoreCandidate(null, product.title, candidate) })),
          8,
        );
        return { product, alternates };
      }
    }
  } catch { /* profil illisible → recrawl normal */ }

  try {
    const scraped = await scraper.scrapeProduct(url);
    if (scraped?.title) {
      const product = toAyrovixProduct(db, scraped);
      try {
        db.run(`INSERT INTO product_profiles (id,url_hash,url,payload,images_count,has_description,fetched_at)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(url_hash) DO UPDATE SET payload=excluded.payload,
            images_count=excluded.images_count, has_description=excluded.has_description,
            fetched_at=excluded.fetched_at`,
          `profile_${urlHash.slice(0, 24)}`, urlHash, url,
          JSON.stringify(product), product.images.length,
          (product.description || '').trim().length >= 40 ? 1 : 0, new Date().toISOString(),
        );
      } catch { /* persistance best-effort — le produit reste servi */ }
      const catalog = catalogSearch(db, null, scraped.title, 4);
      const external = scraped.sourcePrice > 0 ? [] : await externalProductSearch(scraped.title, 6).catch(() => []);
      const alternates = filterDisplayableCandidates(
        [...catalog, ...external].map((candidate) => ({ ...candidate, match: scoreCandidate(null, scraped.title, candidate) })),
        8,
      );
      // A rendered/direct merchant price avoids a paid text search. If the
      // price is still absent, return the real page diagnostics plus alternates.
      return { product, alternates };
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
