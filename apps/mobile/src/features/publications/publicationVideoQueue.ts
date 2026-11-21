import { isPublicationCampaign } from '../../../../../shared/publicationCampaign';
import type { ReferencePublication } from '@/api/referencePublications';

export const RELATED_VIDEO_LIMIT = 12;
export const UP_NEXT_MS = 5_000;

/** Only recommend videos sharing a currently available linked product. */
export function relatedPublicationVideos(current: ReferencePublication, candidates: readonly ReferencePublication[]) {
  const productIds = new Set(current.products.filter(item => item.available).map(item => item.id));
  const seen = new Set([current.id]);
  const sources = new Set([current.media?.url]);
  const ranked = candidates.flatMap(post => {
    if (seen.has(post.id) || post.media?.type !== 'video' || sources.has(post.media.url) || isPublicationCampaign(post.layout)) return [];
    const overlap = post.products.filter(item => item.available && productIds.has(item.id)).length;
    if (!overlap) return [];
    seen.add(post.id);
    sources.add(post.media.url);
    return [{ post, overlap }];
  });
  return ranked.sort((a, b) => b.overlap - a.overlap).slice(0, RELATED_VIDEO_LIMIT).map(item => item.post);
}

export function videoClock(seconds: number) {
  const value = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
