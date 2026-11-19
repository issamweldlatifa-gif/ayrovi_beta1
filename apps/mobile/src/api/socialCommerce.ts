import { useInfiniteQuery } from '@tanstack/react-query';
import { isSocialFilter, isSocialId, type SocialEditionHeader, type SocialEditorialCard, type SocialFeedFilter, type SocialFeedPage, type SocialProduct } from '../../../../shared/socialCommerce';
import { apiGetData, type RequestOptions } from './client';
import { ApiError } from './errors';
import { parseReels, type Reel } from './social';
import { parseStories, type StoryItem } from './sections';

export type DiscoveryItem = SocialEditorialCard
  | { kind: 'reel'; id: string; reel: Reel; products: SocialProduct[] }
  | { kind: 'story'; id: string; story: StoryItem };
export interface DiscoveryPage { edition: SocialEditionHeader | null; items: DiscoveryItem[]; nextCursor: string | null }
const checkProduct = (p: SocialProduct | null | undefined): p is SocialProduct => Boolean(p && isSocialId(p.id) && typeof p.name === 'string' && typeof p.brand === 'string' && typeof p.image === 'string' && Number.isFinite(p.price) && p.price > 0 && p.available === true && p.currency === 'TND' && ['AVAILABLE', 'LIMITED'].includes(p.stockStatus));

export async function fetchSocialCommerce(filter: SocialFeedFilter, cursor: string | null, options: RequestOptions): Promise<DiscoveryPage> {
  if (!isSocialFilter(filter)) throw new ApiError('malformed', 'Invalid Social filter');
  const query = new URLSearchParams({ filter });
  if (cursor) query.set('cursor', cursor);
  const page = await apiGetData<SocialFeedPage>(`/api/public/social/commerce-feed?${query}`, options);
  if (!page || !Array.isArray(page.items) || page.items.length > 8 || !(page.nextCursor === null || typeof page.nextCursor === 'string')) throw new ApiError('malformed', 'Invalid Social page');
  const items: DiscoveryItem[] = [];
  for (const item of page.items) {
    if (!item || !isSocialId(item.id)) continue;
    if (item.kind === 'reel') {
      const reel = parseReels([item.content])[0];
      if (reel?.id === item.id && reel.videoUrl) items.push({ kind: 'reel', id: item.id, reel, products: Array.isArray(item.products) ? item.products.slice(0, 6).filter(checkProduct) : [] });
    } else if (item.kind === 'story') {
      const story = parseStories([item.content])[0];
      if (story?.id === item.id && story.mediaUrl) items.push({ kind: 'story', id: item.id, story });
    } else if (item.kind === 'article' && isSocialId(item.newsId) && typeof item.title === 'string') items.push(item);
    else if (item.kind === 'pick' && typeof item.title === 'string' && checkProduct(item.product)) items.push(item);
    else if (item.kind === 'look' && typeof item.title === 'string' && Array.isArray(item.pins) && item.pins.length > 0 && item.pins.length <= 6 && item.pins.every(pin => pin && Number.isFinite(pin.x) && Number.isFinite(pin.y) && checkProduct(pin.product))) items.push(item);
  }
  const edition = page.edition;
  return { items, nextCursor: page.nextCursor, edition: edition && typeof edition.title === 'string' && typeof edition.cover === 'string' && Number.isSafeInteger(edition.number) ? edition : null };
}

export const socialCommerceKey = (filter: SocialFeedFilter) => ['social', 'commerce-feed', filter] as const;
export function useSocialCommerce(filter: SocialFeedFilter) {
  return useInfiniteQuery({ queryKey: socialCommerceKey(filter), initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => fetchSocialCommerce(filter, pageParam, { signal }),
    getNextPageParam: page => page.nextCursor ?? undefined, staleTime: 60_000 });
}
