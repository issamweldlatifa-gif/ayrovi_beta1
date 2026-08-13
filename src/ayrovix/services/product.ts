import { isIP } from 'node:net';
import type { QatafoDatabase } from '../../db/database';
import type { SmartLinkScraper } from '../../scraper/scraper';
import type { ScrapedProduct } from '../../types';
import type { AyrovixCandidate, AyrovixProduct } from '../types';
import { estimateWithDb } from './currency';
import { catalogSearch, scoreCandidate, freeExternalSearch, serpSearch } from './search';

/**
 * AYROVIX · Product extraction layer V2 — Free Tier compatible.
 * Mode URL/QR : scraper first, fallback 100% gratuit (DuckDuckGo + catalogue) if Puppeteer fails on Render Free.
 */

export class ExtractionFailedError extends Error { readonly code = 'EXTRACTION_FAILED'; }
export class InvalidUrlError extends Error { readonly code = 'INVALID_URL'; }

function isUnsafeHostname(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\\[|\\]$/g, '').replace(/\\.$/, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan')
  ) return true;
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    const [a, b] = hostname.split('.').map(Number);
    if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return true;
  }
  if (ipVersion === 6) {
    const normalized = hostname.replace(/^0+/g, '') || '0';
    if (normalized === '::1' || normalized.startsWith('fe80') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  }
  return false;
}

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
  return {
    title: scraped.title,
    brand: scraped.brand || null,
    model: null,
    description: scraped.description || '',
    image: scraped.mainImage,
    images: scraped.images || [],
    source: scraped.storeName,
    sourceUrl: scraped.url,
    price: scraped.sourcePrice,
    currency: scraped.sourceCurrency,
    priceTnd: tnd?.priceTnd ?? (Number.isFinite(scraped.totalPriceTND) && scraped.totalPriceTND > 0 ? scraped.totalPriceTND : null),
    exchangeRate: tnd?.exchangeRate ?? null,
    colors: scraped.variants?.colors || [],
    sizes: scraped.variants?.sizes || [],
    availability: scraped.availability || 'unknown',
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
    if (scraped && scraped.title && Number.isFinite(scraped.sourcePrice) && scraped.sourcePrice > 0) {
      const alternates = catalogSearch(db, null, scraped.title, 4)
        .map((c) => ({ ...c, match: scoreCandidate(null, scraped.title, c) }))
        .sort((a, b) => b.match - a.match);
      const freeAlternates = await freeExternalSearch(scraped.title, 4).catch(()=>[]);
      const all = [...alternates, ...freeAlternates.map(c => ({ ...c, match: scoreCandidate(null, scraped.title, c) }))]
        .sort((a, b) => b.match - a.match).slice(0,6);
      return { product: toAyrovixProduct(db, scraped), alternates: all };
    }
  } catch (e) {
    console.warn(`[AYROVIX scraper] Fallback for ${url} — ${e}`);
  }

  console.log(`[AYROVIX] Using free fallback for URL: ${url}`);
  const fallbackProduct = toFallbackProductFromUrl(url);
  let query = '';
  try {
    const parsed = new URL(url);
    query = decodeURIComponent(parsed.pathname.replace(/[\/\-_]/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!query || query.length < 3) query = parsed.hostname.replace('www.', '').replace(/\./g, ' ');
  } catch { query = url; }

  const catalog = catalogSearch(db, null, query, 4);
  const [serp, free] = await Promise.all([
    serpSearch(query).catch(()=>[]),
    freeExternalSearch(query, 6).catch(()=>[]),
  ]);
  const all = [...catalog, ...serp, ...free].map(c => ({ ...c, match: scoreCandidate(null, query, c) }))
    .sort((a,b)=>b.match-a.match).slice(0,8);

  return { product: fallbackProduct, alternates: all };
}
