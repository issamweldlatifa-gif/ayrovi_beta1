import { normalizeMediaLink } from './mediaLinks';

export const BLACK_FRIDAY_MAX_PRODUCTS = 9;
export const BLACK_FRIDAY_TITLE = 'Black Friday\nWeek';
export type BlackFridaySettings = {
  enabled: boolean;
  title: string;
  ctaFr: string;
  ctaAr: string;
  cover: string;
  productIds: string[];
};
export const DEFAULT_BLACK_FRIDAY: BlackFridaySettings = {
  enabled: false, title: BLACK_FRIDAY_TITLE, ctaFr: 'Toutes les bonnes affaires', ctaAr: 'كلّ العروض', cover: '', productIds: [],
};

export function normalizeBlackFriday(input: unknown): BlackFridaySettings | null {
  if (!input || typeof input !== 'object') return null;
  const { enabled, title, ctaFr, ctaAr, cover, productIds } = input as Record<string, unknown>;
  if (typeof enabled !== 'boolean' || typeof title !== 'string' || !title.trim() || title.length > 80 ||
      title.trim().split(/\r?\n/).length > 2 || typeof ctaFr !== 'string' || !ctaFr.trim() || ctaFr.length > 60 ||
      typeof ctaAr !== 'string' || !ctaAr.trim() || ctaAr.length > 60 || typeof cover !== 'string' ||
      !Array.isArray(productIds) || productIds.length > BLACK_FRIDAY_MAX_PRODUCTS || (enabled && !productIds.length) ||
      productIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(id)) || new Set(productIds).size !== productIds.length) return null;
  const media = normalizeMediaLink(cover, 'image');
  if (!media.ok) return null;
  if (media.url.startsWith('/')) {
    let path: string;
    try { path = decodeURIComponent(media.url.split(/[?#]/, 1)[0]!); } catch { return null; }
    if (!/^\/(media|uploads)\//.test(path) || /(?:^|\/)\.\.?(?:\/|$)|\\/.test(path)) return null;
  }
  return { enabled, title: title.trim(), ctaFr: ctaFr.trim(), ctaAr: ctaAr.trim(), cover: media.url, productIds };
}

/** Conservative whole percentage computed from the same published TND prices as the fiche. */
export function blackFridayDiscount(price: number, compare: number) {
  const p = Math.round(price * 1000), c = Math.round(compare * 1000);
  return Number.isSafeInteger(p) && Number.isSafeInteger(c) && p > 0 && c > p ? Math.floor((c - p) * 100 / c) : 0;
}
