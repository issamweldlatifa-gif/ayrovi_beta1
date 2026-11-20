import { normalizeMediaLink } from './mediaLinks';

export type UpcomingStore = { id: string; image: string; opensAt: string };
export type AywebsUpcoming = { enabled: boolean; stores: UpcomingStore[] };
export type PublicUpcomingStore = UpcomingStore & { name: string; logo: string };
export const UPCOMING_LIMIT = 12;
export const UPCOMING_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeAywebsUpcoming(input: unknown): AywebsUpcoming | null {
  if (!input || typeof input !== 'object') return null;
  const data = input as Record<string, unknown>;
  if (typeof data.enabled !== 'boolean' || !Array.isArray(data.stores) || data.stores.length > UPCOMING_LIMIT) return null;
  const stores: UpcomingStore[] = [];
  for (const row of data.stores) {
    if (!row || typeof row.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(row.id) || stores.some(store => store.id === row.id)) return null;
    if (typeof row.opensAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:\d{2})$/.test(row.opensAt)) return null;
    const time = new Date(row.opensAt);
    if (!Number.isFinite(time.getTime()) || typeof row.image !== 'string' || row.image.length > 500) return null;
    const media = normalizeMediaLink(row.image, 'image');
    if (!media.ok) return null;
    if (media.url.startsWith('/')) {
      let path: string;
      try { path = decodeURIComponent(media.url.split(/[?#]/)[0]!); } catch { return null; }
      if (!/^\/(media|uploads|stores)\//.test(path) || /(?:^|\/)\.\.?(?:\/|$)|\\/.test(path)) return null;
    }
    stores.push({ id: row.id, image: media.url, opensAt: time.toISOString() });
  }
  return { enabled: data.enabled, stores };
}

/** A single absolute deadline per card; it never resets after a restart. */
export function upcomingCountdown(opensAt: string, now: number) {
  const time = Date.parse(opensAt);
  const seconds = Number.isFinite(time) ? Math.max(0, Math.ceil((time - now) / 1000)) : 0;
  return { days: Math.floor(seconds / 86400), hours: Math.floor(seconds / 3600) % 24,
    minutes: Math.floor(seconds / 60) % 60, seconds: seconds % 60 };
}
