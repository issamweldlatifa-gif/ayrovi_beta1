import { PUBLICATION_TEMPLATES, type PublicationContent, type PublicationMedia } from '../../../../shared/publicationContent';
import { normalizePublicationFeedSettings } from '../../../../shared/publicationFeed';
import { apiGetData, apiSend, type RequestOptions } from './client';
import { ApiError } from './errors';
import { parseLinkedProduct, type LinkedProduct } from './linkedProduct';
import type { Publication } from './social';

export interface FeedPost extends Publication {
  content?: PublicationContent; publisherAvatar?: string; publisherOfficial?: boolean; following?: boolean; saved?: boolean; views?: number; shares?: number;
  disliked?: boolean; generated: boolean; category: string; channelName: string; liked: boolean; likes: number; comments: number; products: LinkedProduct[];
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
    let media: PublicationMedia[] = [];
    try { const raw = typeof row.media_json === 'string' ? JSON.parse(row.media_json) : []; if (Array.isArray(raw)) media = raw.filter(m => m && ['image','video'].includes(m.type) && typeof m.url === 'string'); } catch { /* legacy cover remains available */ }
    const content: PublicationContent = { showTitle: row.show_title !== 0 && row.show_title !== false, template: PUBLICATION_TEMPLATES.includes(row.template_id as any) ? row.template_id as PublicationContent['template'] : 'auto', actionLabel: text(row.action_label), actionTarget: row.action_target === 'products' ? 'products' : 'detail', type: (row.post_type || 'image') as PublicationContent['type'], media,
      description: text(row.description), descriptionPosition: row.description_position === 'above' ? 'above' : 'below', sponsored: row.sponsored === 1 || row.sponsored === true, sponsorName: text(row.sponsor_name), audience: text(row.audience), topic: text(row.topic) };

    return { content, publisherAvatar: text(row.channel_avatar), publisherOfficial: row.channel_official === 1, following: row.following === 1, saved: row.saved === 1,
      views: count(row.views), shares: count(row.shares), id: text(row.id), title: text(row.title), subtitle: text(row.subtitle), channelId: text(row.channel_id),
      imageUrl: text(row.image_url), publishAt: text(row.publish_at), category: text(row.category), channelName: text(row.channel_name),
      disliked: row.disliked === true || row.disliked === 1, generated: row.media_origin === 'generated', liked: row.liked === true || row.liked === 1, likes: count(row.likes), comments: count(row.comments), product,
      products: Array.isArray(row.products) ? row.products.map(parseLinkedProduct).filter((p): p is LinkedProduct => !!p) : product ? [product] : [] };
  });
  return { items, nextCursor: data.nextCursor as string | null };
}
export async function fetchFeedPage(filters: { category: string; q: string; post: string; type?: string; audience?: string; topic?: string; saved?: boolean; following?: boolean; hasProducts?: boolean; cursor: string | null }, options?: RequestOptions): Promise<FeedPage> {
  const query = new URLSearchParams({ category: filters.category, q: filters.q, post: filters.post, limit: '12' });
  for (const key of ['type','audience','topic'] as const) if (filters[key]) query.set(key, filters[key]!);
  for (const key of ['saved','following','hasProducts'] as const) if (filters[key]) query.set(key, '1');
  if (filters.cursor) query.set('cursor', filters.cursor);
  return parseFeedPage(await apiGetData<unknown>(`/api/public/social/publication-feed?${query}`, options));
}

export async function fetchFeedSettings(options?: RequestOptions) {
  const value = await apiGetData<unknown>('/api/public/social/publication-feed-settings', options);
  const settings = normalizePublicationFeedSettings(value);
  if (!settings) throw new ApiError('malformed', 'Invalid Publication feed settings');
  return settings;
}

export async function writePublicationPreference(id: string, body: { saved?: boolean; feedback?: string }) {
  return apiSend('PUT', `/api/public/social/publications/${encodeURIComponent(id)}/preferences`, { body });
}
export async function followPublisher(id: string, following: boolean) {
  return apiSend('PUT', `/api/public/social/publishers/${encodeURIComponent(id)}/follow`, { body: { following } });
}
