import type { FeedPost } from '@/api/publicationFeed';
export interface FeedView { category: string; q: string; offset: number }
const views = new Map<string, FeedView>();
/** In-memory route restoration only; never persist private feed data to disk. */
export function readFeedView(owner: string): FeedView { return views.get(owner) ?? { category: '', q: '', offset: 0 }; }
export function saveFeedView(owner: string, view: FeedView) {
  if (views.size > 20) views.clear();
  views.set(owner, { ...view });
}
export function uniqueFeedPosts(pages: { items: FeedPost[] }[]): FeedPost[] {
  const seen = new Set<string>();
  return pages.flatMap(page => page.items).filter(item => !seen.has(item.id) && !!seen.add(item.id));
}
export const CATEGORY_LABELS = {
  '': ['For You', 'من أجلك'], fashion: ['Fashion', 'موضة'], beauty: ['Beauty', 'جمال'],
  home: ['Home & Decor', 'منزل وديكور'], lifestyle: ['Lifestyle', 'أسلوب حياة'], trends: ['Trends', 'رائج'], technology: ['Technology', 'تكنولوجيا'],
} as const;
