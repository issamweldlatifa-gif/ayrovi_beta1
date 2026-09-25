import type { QatafoDatabase } from '../../db/database';
import { createHash } from 'node:crypto';
import type { SmartLinkScraper } from '../../scraper/scraper';
import type { ScrapedProduct } from '../../types';
import type { AyrovixCandidate, AyrovixProduct } from '../types';
import { normalizeMerchantProduct, normalizeProduct, priceCommerceProduct, projectProduct } from './commerceProduct';
import { catalogSearch, scoreCandidate, externalProductSearch } from './search';
import { isUnsafeHostname, UnsafeUrlError } from '../../services/safeUrl';
import { filterDisplayableCandidates, registerTrustedMerchantHost } from './candidatePolicy';

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
  const canonical = priceCommerceProduct(db, normalizeMerchantProduct(scraped));
  const product = projectProduct(canonical);
  product.variantOptions = canonical.variants.offers.map(offer => {
    const sizeGroup = canonical.variants.groups.find(group => group.type === 'size');
    const colorGroup = canonical.variants.groups.find(group => group.type === 'color');
    const size = sizeGroup?.options.find(option => option.id === offer.selection[sizeGroup.id])?.label || null;
    const color = colorGroup?.options.find(option => option.id === offer.selection[colorGroup.id])?.label || null;
    return { id: offer.id, label: [size, color].filter(Boolean).join(' · ') || Object.values(offer.selection).join(' · '),
      size, color, available: offer.available !== false,
      price: offer.sourcePrice, currency: offer.sourceCurrency, priceTnd: offer.ayroviPriceTnd };
  });
  product.verificationProvider = scraped.verificationProvider || 'none';
  product.verificationMethod = scraped.verificationMethod || 'none';
  product.verificationFailureCode = scraped.verificationFailureCode || null;
  return product;
}

function toFallbackProductFromUrl(rawUrl: string): AyrovixProduct {
  // A URL slug is not a merchant-supplied title or description. No false listing.
  const product = normalizeProduct({ source: 'web', sourceUrl: rawUrl, title: 'Produit indisponible' });
  return { ...projectProduct(product), verificationFailureCode: 'MERCHANT_EXTRACTION_FAILED' };
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
      if (product?.canonical?.id) {
        // Cache retains source fields; quotes/FX/promotions always use today's server rules.
        const refreshed = projectProduct(priceCommerceProduct(db, product.canonical));
        const catalog = catalogSearch(db, null, product.title, 4);
        const alternates = filterDisplayableCandidates(
          catalog.map((candidate) => ({ ...candidate, match: scoreCandidate(null, product.title, candidate) })),
          8,
        );
        return { product: refreshed, alternates };
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
      // NIVEAUX DE CONFIANCE : un profil PROUVÉ (description + ≥2 photos)
            // fait de ce marchand un marchand de confiance pour les prochains Lens.
      if (product.images.length >= 2 && (product.description || '').trim().length >= 40) {
        registerTrustedMerchantHost(url);
      }
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
