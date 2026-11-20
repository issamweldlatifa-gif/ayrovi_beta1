import { isPublicationCampaign, type PublicationCampaignLayout } from '../../../../shared/publicationCampaign';
import { normalizeMediaLink } from '../../../../shared/mediaLinks';
import { referenceLayout, type ReferenceLayout, type ReferenceMedia } from '@/features/publications/referencePublicationLayout';
import { apiGetData, apiSend, type RequestOptions } from './client';
import { ApiError } from './errors';
import { parseLinkedProduct, type LinkedProduct } from './linkedProduct';

export interface ReferencePublication {
  id: string; title: string; detailTitle?: string; updatedAt?: string; coverImage?: string; subtitle: string; description: string;
  channelId: string; channelName: string; channelAvatar: string;
  saved: boolean; sponsored: boolean; sponsorName: string; actionLabel: string;
  media: ReferenceMedia | null; layout: ReferenceLayout | PublicationCampaignLayout; products: LinkedProduct[];
}

export interface ReferencePublicationPage { items: ReferencePublication[]; nextCursor: string | null }
const text = (x: unknown) => typeof x === 'string' ? x.trim() : '';
const yes = (x: unknown) => x === true || x === 1;
const record = (x: unknown): Record<string, unknown> | null => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null;
const number = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : undefined;
const safeMedia = (x: unknown, kind: 'image' | 'video') => {
  const value = normalizeMediaLink(text(x), kind);
  return value.ok ? value.url : '';
};

function parseMedia(raw: unknown, cover: string): ReferenceMedia | null {
  const item = record(raw);
  if (!item || (item.type !== 'video' && item.type !== 'image')) return null;
  const url = safeMedia(item.url, item.type);
  if (!url) return null;
  return {
    type: item.type, url, poster: safeMedia(item.poster, 'image') || cover, alt: text(item.alt),
    width: number(item.width, 1, 50000), height: number(item.height, 1, 50000),
    frame: item.frame === 'square' ? 'square' : item.type === 'image' && item.frame === 'panoramic' ? 'panoramic' : undefined,
    fit: item.fit === 'cover' || item.fit === 'contain' ? item.fit : undefined,
    focalX: number(item.focalX, 0, 100), focalY: number(item.focalY, 0, 100),
  };
}

export function parseReferencePublicationPage(value: unknown): ReferencePublicationPage {
  const page = record(value);
  if (!page || !Array.isArray(page.items) || !(page.nextCursor === null || (typeof page.nextCursor === 'string' && /^[A-Za-z0-9_-]{1,600}$/.test(page.nextCursor)))) {
    throw new ApiError('malformed', 'Invalid Publication feed page');
  }
  const items = page.items.flatMap((raw): ReferencePublication[] => {
    const row = record(raw);
    const id = text(row?.id);
    // Do not reintroduce automatic old visual specimens or the retired block API.
    if (!row || !id || id.startsWith('publication_showcase_')) return [];
    const cover = safeMedia(row.image_url, 'image');
    let mediaRows: unknown = row.media_json;
    if (typeof mediaRows === 'string') {
      try { mediaRows = JSON.parse(mediaRows); } catch { mediaRows = []; }
    }
    const media = (Array.isArray(mediaRows) ? mediaRows.slice(0, 10) : []).map(m => parseMedia(m, cover)).find(Boolean)
      ?? (cover ? { type: 'image' as const, url: cover, poster: '', alt: '' } : null);
    const template = text(row.template_id);
    const layout = isPublicationCampaign(template) ? template : media ? referenceLayout(media, template) : null;
    if (!layout) return [];
    const links = Array.isArray(row.products) ? row.products : [row.product];
    const products = new Map<string, LinkedProduct>();
    for (const link of links) {
      const product = parseLinkedProduct(link);
      if (product && !products.has(product.id)) products.set(product.id, product);
    }
    return [{ id, title: row.show_title === false || row.show_title === 0 ? '' : text(row.title),
      detailTitle: text(row.title), updatedAt: text(row.updated_at), coverImage: cover, subtitle: text(row.subtitle), description: text(row.description),
      channelId: text(row.channel_id), channelName: text(row.channel_name), channelAvatar: safeMedia(row.channel_avatar, 'image'),
      saved: yes(row.saved), sponsored: yes(row.sponsored), sponsorName: text(row.sponsor_name), actionLabel: text(row.action_label),
      media, layout, products: [...products.values()] }];
  });
  return { items, nextCursor: page.nextCursor };
}

/** The current authored feed, not the retired, intentionally empty block endpoints. */
export async function fetchReferencePublications(cursor: string | null, options?: RequestOptions) {
  const query = new URLSearchParams({ limit: '12', presentation: 'reference' });
  if (cursor) query.set('cursor', cursor);
  return parseReferencePublicationPage(await apiGetData<unknown>(`/api/public/social/publication-feed?${query}`, options));
}

export function publicationLookKey(owner: string, id: string) {
  return ['publication-look', owner, id] as const;
}

export async function fetchPublicationLook(id: string, options?: RequestOptions) {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return null;
  const query = new URLSearchParams({ post: id, limit: '1' });
  const page = parseReferencePublicationPage(await apiGetData<unknown>(`/api/public/social/publication-feed?${query}`, options));
  return page.items.find(item => item.id === id && (isPublicationCampaign(item.layout) || item.media !== null)) ?? null;
}

export async function savePublicationLook(id: string, saved: boolean) {
  const { data } = await apiSend<{ saved: boolean }>('PUT', `/api/public/social/publications/${encodeURIComponent(id)}/preferences`, { body: { saved } });
  if (data.saved !== saved) throw new ApiError('malformed', 'Unconfirmed Publication preference');
  return data.saved;
}
