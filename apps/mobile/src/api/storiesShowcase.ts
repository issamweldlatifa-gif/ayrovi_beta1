/** Existing official CMS contract. No bundled fallback copy and no invented content. */
import { apiGetData, type RequestOptions } from './client';
import { ApiError } from './errors';

export interface StoriesShowcaseSettings {
  title: string; subtitle: string; titleAr: string; subtitleAr: string;
  ctaLabel: string; ctaLabelAr: string; cardCount: number; enabled: boolean;
}
export function parseStoriesShowcase(value: unknown): StoriesShowcaseSettings | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('malformed', 'Stories showcase: invalid settings.');
  const row = value as Record<string, unknown>;
  if (typeof row.enabled !== 'boolean' || !Number.isInteger(row.cardCount) || Number(row.cardCount) < 1 || Number(row.cardCount) > 1000) {
    throw new ApiError('malformed', 'Stories showcase: invalid settings.');
  }
  const text = (key: string) => typeof row[key] === 'string' ? row[key] as string : '';
  return { title: text('title'), subtitle: text('subtitle'), titleAr: text('titleAr'), subtitleAr: text('subtitleAr'),
    ctaLabel: text('ctaLabel'), ctaLabelAr: text('ctaLabelAr'), enabled: row.enabled, cardCount: Number(row.cardCount) };
}
export async function fetchStoriesShowcase(options?: RequestOptions): Promise<StoriesShowcaseSettings | null> {
  return parseStoriesShowcase(await apiGetData<unknown>('/api/public/stories-showcase', options));
}
