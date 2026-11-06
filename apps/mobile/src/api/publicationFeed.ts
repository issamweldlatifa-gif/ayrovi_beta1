import { normalizePublicationFeedSettings } from '../../../../shared/publicationFeed';
import { apiGetData, type RequestOptions } from './client';
import { ApiError } from './errors';
import { parseLinkedProduct, type LinkedProduct } from './linkedProduct';
import type { Publication } from './social';

export interface FeedPost extends Publication {
  generated: boolean; category: string; channelName: string; liked: boolean; likes: number; comments: number; products: LinkedProduct[];
}
export interface FeedPage { items: FeedPost[]; nextCursor: string | null }
export function parseFeedPage(value: unknown): FeedPage {
  const data = value as Record<string, unknown> | null;
  if (!data || !Array.isArray(data.items) || !(data.nextCursor === null || typeof data.nextCursor === 'string')) throw new ApiError('malformed', 'Invalid Publication feed');
  const text = (v: unknown) => typeof v === 'string' ? v : '';
  const count = (v: unknown) => Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0;
  const items = data.items.map((value): FeedPost => {
    const row = value as Record<string, unknown> | null;
    if (!row || !text(row.id)) throw new ApiError('malformed', 'Invalid Publication');
    const product = parseLinkedProduct(row.product);
    return { id: text(row.id), title: text(row.title), subtitle: text(row.subtitle), channelId: text(row.channel_id),
      imageUrl: text(row.image_url), publishAt: text(row.publish_at), category: text(row.category), channelName: text(row.channel_name),
      generated: row.media_origin === 'generated', liked: row.liked === true || row.liked === 1, likes: count(row.likes), comments: count(row.comments), product,
      products: Array.isArray(row.products) ? row.products.map(parseLinkedProduct).filter((p): p is LinkedProduct => !!p) : product ? [product] : [] };
  });
  return { items, nextCursor: data.nextCursor as string | null };
}
export async function fetchFeedPage(filters: { category: string; q: string; post: string; cursor: string | null }, options?: RequestOptions): Promise<FeedPage> {
  const query = new URLSearchParams({ category: filters.category, q: filters.q, post: filters.post, limit: '12' });
  if (filters.cursor) query.set('cursor', filters.cursor);
  return parseFeedPage(await apiGetData<unknown>(`/api/public/social/publication-feed?${query}`, options));
}

export async function fetchFeedSettings(options?: RequestOptions) {
  const value = await apiGetData<unknown>('/api/public/social/publication-feed-settings', options);
  const settings = normalizePublicationFeedSettings(value);
  if (!settings) throw new ApiError('malformed', 'Invalid Publication feed settings');
  return settings;
}
