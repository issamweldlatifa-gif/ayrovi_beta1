import { sanitizeProductUrl } from '../ayrovix/services/product';
import type { SmartLinkScraper } from '../scraper/scraper';

export function validateOcerexUrl(raw: unknown, scraper?: Pick<SmartLinkScraper, 'cleanPastedUrl'>): string | null {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 4096) return null;
  const cleaned = scraper ? scraper.cleanPastedUrl(raw) : raw.trim();
  return sanitizeProductUrl(cleaned);
}

export function platformFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.')[0]?.slice(0, 40) || '';
  } catch {
    return '';
  }
}

export function storeSlug(platform: string, url: string): string {
  const host = platformFromUrl(url);
  const raw = (platform || host || 'web').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
  return /^[a-z0-9]/.test(raw) ? raw : 'web';
}
