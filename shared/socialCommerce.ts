import { normalizeMediaLink } from './mediaLinks';

export const SOCIAL_FEED_FILTERS = ['all', 'reels', 'stories', 'magazine'] as const;
export type SocialFeedFilter = (typeof SOCIAL_FEED_FILTERS)[number];
export type EditionEntry =
  | { kind: 'article'; id: string; newsId: string }
  | { kind: 'pick'; id: string; title: string; description: string; productId: string }
  | { kind: 'look'; id: string; title: string; description: string; image: string; pins: Array<{ productId: string; x: number; y: number }> };
export interface SocialEdition {
  number: number;
  title: string;
  subtitle: string;
  cover: string;
  startsAt: string;
  endsAt: string;
  entries: EditionEntry[];
}
export type SocialEditionHeader = Omit<SocialEdition, 'entries'>;
export interface SocialProduct {
  id: string; name: string; brand: string; image: string; price: number;
  currency: 'TND'; available: true; isNew?: boolean; stockStatus: 'AVAILABLE' | 'LIMITED';
}
export type SocialEditorialCard =
  | { kind: 'article'; id: string; newsId: string; title: string; description: string; image: string; author: string }
  | { kind: 'pick'; id: string; title: string; description: string; product: SocialProduct }
  | { kind: 'look'; id: string; title: string; description: string; image: string; pins: Array<{ x: number; y: number; product: SocialProduct }> };
/** The reel/story payloads use the existing read APIs' field names and codecs. */
export type SocialFeedItem = SocialEditorialCard
  | { kind: 'reel'; id: string; content: unknown; products: SocialProduct[] }
  | { kind: 'story'; id: string; content: unknown };
export interface SocialFeedPage {
  edition: SocialEditionHeader | null;
  items: SocialFeedItem[];
  nextCursor: string | null;
}
export const isSocialFilter = (value: unknown): value is SocialFeedFilter => SOCIAL_FEED_FILTERS.some((filter) => filter === value);
export const isSocialId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
const record = (val: unknown): Record<string, unknown> => val && typeof val === 'object' && !Array.isArray(val) ? val as Record<string, unknown> : {};
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length <= max ? v.trim() : '';
const date = (value: unknown) => typeof value === 'string' && value.length <= 35 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
function image(value: unknown) {
  if (typeof value !== 'string') return '';
  const result = normalizeMediaLink(value, 'image');
  if (!result.ok || !result.url) return '';
  const url = new URL(result.url, 'https://zayrovi.com');
  if (url.username || url.password || (result.url.startsWith('/') && (url.origin !== 'https://zayrovi.com' || !/^\/(media|uploads)\//.test(url.pathname)))) return '';
  return result.url;
}
export function parseSocialEdition(input: unknown): SocialEdition | null {
  const raw = record(input);
  const { number } = raw;
  const title = text(raw.title, 120), subtitle = text(raw.subtitle, 220), cover = image(raw.cover);
  const startsAt = date(raw.startsAt), endsAt = date(raw.endsAt);
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1 || !title || !cover || !startsAt || !endsAt || endsAt <= startsAt || !Array.isArray(raw.entries) || raw.entries.length > 32) return null;
  const ids = new Set<string>();
  const entries: EditionEntry[] = [];
  for (const row of raw.entries) {
    const e = record(row);
    if (!isSocialId(e.id) || ids.has(e.id)) return null;
    ids.add(e.id);
    if (e.kind === 'article' && isSocialId(e.newsId)) entries.push({ kind: 'article', id: e.id, newsId: e.newsId });
    else {
      const title = text(e.title, 120), description = text(e.description, 300);
      if (!title) return null;
      if (e.kind === 'pick' && isSocialId(e.productId)) entries.push({ kind: 'pick', id: e.id, title, description, productId: e.productId });
      else if (e.kind === 'look' && Array.isArray(e.pins) && e.pins.length > 0 && e.pins.length <= 6) {
        const photo = image(e.image);
        if (!photo) return null;
        const pins: Array<{ productId: string; x: number; y: number }> = [];
        const products = new Set<string>();
        for (const candidate of e.pins) {
          const { productId, x, y } = record(candidate);
          if (!isSocialId(productId) || products.has(productId) || typeof x !== 'number' || !Number.isFinite(x) || x < 7 || x > 93 || typeof y !== 'number' || !Number.isFinite(y) || y < 7 || y > 93) return null;
          products.add(productId);
          pins.push({ productId, x, y });
        }
        entries.push({ kind: 'look', id: e.id, title, description, image: photo, pins });
      } else return null;
    }
  }
  return { number, title, subtitle, cover, startsAt, endsAt, entries };
}
