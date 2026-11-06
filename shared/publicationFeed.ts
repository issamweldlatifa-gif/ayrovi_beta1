/** Stable editorial taxonomy. Empty category is legacy/unclassified, never guessed. */
export const PUBLICATION_CATEGORIES = ['fashion', 'beauty', 'home', 'lifestyle', 'trends', 'technology'] as const;
export type PublicationCategory = typeof PUBLICATION_CATEGORIES[number];

export interface FeedCategorySetting { key: string; labelFr: string; labelAr: string; enabled: boolean }
export interface PublicationFeedSettings {
  enabled: boolean; titleFr: string; titleAr: string;
  layout: 'mixed' | 'portrait' | 'compact'; categories: FeedCategorySetting[];
}
export const DEFAULT_PUBLICATION_FEED_SETTINGS: PublicationFeedSettings = {
  enabled: true, titleFr: 'Publications', titleAr: 'المنشورات', layout: 'mixed',
  categories: [
    ['', 'For You', 'من أجلك'], ['fashion', 'Fashion', 'موضة'], ['beauty', 'Beauty', 'جمال'],
    ['home', 'Home & Decor', 'منزل وديكور'], ['lifestyle', 'Lifestyle', 'أسلوب حياة'],
    ['trends', 'Trends', 'رائج'], ['technology', 'Technology', 'تكنولوجيا'],
  ].map(([key, labelFr, labelAr]) => ({ key, labelFr, labelAr, enabled: true })),
};
/** Same strict contract on server and native; changes are additive, never taxonomy guesses. */
export function normalizePublicationFeedSettings(value: unknown, current = DEFAULT_PUBLICATION_FEED_SETTINGS): PublicationFeedSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Partial<PublicationFeedSettings>;
  const next = { ...current, ...body };
  if (typeof next.enabled !== 'boolean' || !['mixed', 'portrait', 'compact'].includes(next.layout)) return null;
  for (const title of [next.titleFr, next.titleAr]) if (typeof title !== 'string' || !title.trim() || title.length > 80) return null;
  if (!Array.isArray(next.categories) || next.categories.length !== PUBLICATION_CATEGORIES.length + 1) return null;
  const seen = new Set<string>();
  for (const category of next.categories) {
    if (!category || typeof category !== 'object' || typeof category.key !== 'string' || seen.has(category.key)
      || !['', ...PUBLICATION_CATEGORIES].includes(category.key) || typeof category.enabled !== 'boolean'
      || (!category.key && !category.enabled)) return null;
    for (const label of [category.labelFr, category.labelAr]) if (typeof label !== 'string' || !label.trim() || label.length > 40) return null;
    seen.add(category.key);
  }
  return { enabled: next.enabled, titleFr: next.titleFr.trim(), titleAr: next.titleAr.trim(), layout: next.layout,
    categories: next.categories.map(c => ({ key: c.key, labelFr: c.labelFr.trim(), labelAr: c.labelAr.trim(), enabled: c.enabled })) };
}
