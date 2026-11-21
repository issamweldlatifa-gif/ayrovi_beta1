import { normalizeMediaLink } from './mediaLinks';

export const BLACK_FRIDAY_MAX_PRODUCTS = 9;
export const BLACK_FRIDAY_TITLE = 'Black Friday\nWeek';
export type BlackFridaySettings = {
  enabled: boolean;
  title: string;
  ctaFr: string;
  ctaAr: string;
  cover: string;
  backgroundColor: string;
  surfaceColor: string;
  landingTitle: string;
  featureTitleFr: string;
  featureTitleAr: string;
  featureCtaFr: string;
  featureCtaAr: string;
  featureCover: string;
  badge: string;
  endsAt: string;
  productIds: string[];
};
export const DEFAULT_BLACK_FRIDAY: BlackFridaySettings = {
  enabled: false, title: BLACK_FRIDAY_TITLE, ctaFr: 'Toutes les bonnes affaires', ctaAr: 'كلّ العروض', cover: '', productIds: [],
  backgroundColor: '#121E2A', surfaceColor: '#FFFFFF', landingTitle: 'Black Friday Week', featureTitleFr: 'Les bonnes affaires', featureTitleAr: 'أفضل العروض',
  featureCtaFr: 'Voir les produits', featureCtaAr: 'شوف المنتجات', featureCover: '', badge: 'Black Friday Week', endsAt: '',
};

export function normalizeBlackFriday(input: unknown): BlackFridaySettings | null {
  if (!input || typeof input !== 'object') return null;
  const { enabled, title, ctaFr, ctaAr, cover, productIds, backgroundColor, surfaceColor, landingTitle, featureTitleFr, featureTitleAr, featureCtaFr, featureCtaAr, featureCover, badge, endsAt } = { ...DEFAULT_BLACK_FRIDAY, cover: undefined, productIds: undefined, title: undefined, ctaFr: undefined, ctaAr: undefined, enabled: undefined, ...input } as Record<string, unknown>;
  if (typeof enabled !== 'boolean' || typeof title !== 'string' || !title.trim() || title.length > 80 ||
      title.trim().split(/\r?\n/).length > 2 || typeof ctaFr !== 'string' || !ctaFr.trim() || ctaFr.length > 60 ||
      typeof ctaAr !== 'string' || !ctaAr.trim() || ctaAr.length > 60 || typeof cover !== 'string' ||
      !Array.isArray(productIds) || productIds.length > BLACK_FRIDAY_MAX_PRODUCTS || (enabled && !productIds.length) ||
      productIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(id)) || new Set(productIds).size !== productIds.length) return null;
  const terminal = blackFridayCover(cover);
  const feature = blackFridayCover(featureCover);
  if (terminal === null || feature === null || !validBlackFridayColor(backgroundColor) || !validBlackFridayColor(surfaceColor) || !singleLine(landingTitle, 80) ||
      !singleLine(featureTitleFr, 80) || !singleLine(featureTitleAr, 80) || !singleLine(featureCtaFr, 60) ||
      !singleLine(featureCtaAr, 60) || !singleLine(badge, 32) || typeof endsAt !== 'string' ||
      (endsAt !== '' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(endsAt) || !Number.isFinite(Date.parse(endsAt)) || new Date(endsAt).toISOString() !== endsAt))) return null;
  return { enabled, title: title.trim(), ctaFr: ctaFr.trim(), ctaAr: ctaAr.trim(), cover: terminal, productIds,
    backgroundColor: backgroundColor.toUpperCase(), surfaceColor: surfaceColor.toUpperCase(), landingTitle: landingTitle.trim(), featureTitleFr: featureTitleFr.trim(), featureTitleAr: featureTitleAr.trim(),
    featureCtaFr: featureCtaFr.trim(), featureCtaAr: featureCtaAr.trim(), featureCover: feature, badge: badge.trim(), endsAt };
}

const singleLine = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= max && !/[\r\n]/.test(value);
export const validBlackFridayColor = (value: unknown): value is string => typeof value === 'string' && /^#[a-fA-F0-9]{6}$/.test(value);
export function blackFridayBannerInk(backgroundColor: string) {
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(backgroundColor.slice(offset, offset + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.179 ? '#000000' : '#FFFFFF';
}

function blackFridayCover(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const media = normalizeMediaLink(value, 'image');
  if (!media.ok) return null;
  if (media.url.startsWith('/')) {
    let path: string;
    try { path = decodeURIComponent(media.url.split(/[?#]/, 1)[0]!); } catch { return null; }
    if (!/^\/(media|uploads)\//.test(path) || /(?:^|\/)\.\.?(?:\/|$)|\\/.test(path)) return null;
  }
  return media.url;
}

/** Conservative whole percentage computed from the same published TND prices as the fiche. */
export function blackFridayDiscount(price: number, compare: number) {
  const p = Math.round(price * 1000), c = Math.round(compare * 1000);
  return Number.isSafeInteger(p) && Number.isSafeInteger(c) && p > 0 && c > p ? Math.floor((c - p) * 100 / c) : 0;
}

export function blackFridayTimeRemaining(endsAt: string, now = Date.now()) {
  const ms = Date.parse(endsAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.ceil(ms / 60_000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}
