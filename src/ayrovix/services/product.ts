import { isIP } from 'node:net';
import type { QatafoDatabase } from '../../db/database';
import type { SmartLinkScraper } from '../../scraper/scraper';
import type { ScrapedProduct } from '../../types';
import type { AyrovixCandidate, AyrovixProduct } from '../types';
import { estimateWithDb } from './currency';
import { catalogSearch, scoreCandidate } from './search';

/**
 * AYROVIX · Product extraction layer.
 * Mode URL/QR : on s'appuie sur le scraper existant (extraction fiable).
 * Si l'extraction échoue → EXTRACTION_FAILED et le client propose le fallback capture d'écran :
 * jamais de données devinées.
 */

export class ExtractionFailedError extends Error { readonly code = 'EXTRACTION_FAILED'; }
export class InvalidUrlError extends Error { readonly code = 'INVALID_URL'; }

function isUnsafeHostname(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
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

/** Valide et normalise une URL saisie ou lue depuis un QR. Renvoie null si inexploitable. */
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

export interface UrlExtractionResult {
  product: AyrovixProduct;
  alternates: AyrovixCandidate[];
}

/** URL → fiche produit fiable + suggestions du catalogue pour comparaison. */
export async function extractProductFromUrl(db: QatafoDatabase, scraper: SmartLinkScraper, rawUrl: string): Promise<UrlExtractionResult> {
  const url = sanitizeProductUrl(scraper.cleanPastedUrl(rawUrl));
  if (!url) throw new InvalidUrlError('Ce lien ne peut pas être analysé.');
  let scraped: ScrapedProduct;
  try {
    scraped = await scraper.scrapeProduct(url);
  } catch {
    throw new ExtractionFailedError('Impossible de récupérer toutes les informations automatiquement.');
  }
  if (!scraped || !scraped.title || !Number.isFinite(scraped.sourcePrice) || scraped.sourcePrice <= 0) {
    throw new ExtractionFailedError('Impossible de récupérer toutes les informations automatiquement.');
  }
  const alternates = catalogSearch(db, null, scraped.title, 4)
    .map((candidate) => ({ ...candidate, match: scoreCandidate(null, scraped.title, candidate) }))
    .sort((a, b) => b.match - a.match);
  return { product: toAyrovixProduct(db, scraped), alternates };
}
