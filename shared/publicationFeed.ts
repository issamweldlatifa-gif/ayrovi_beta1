/** Stable editorial taxonomy. Empty category is legacy/unclassified, never guessed. */
export const PUBLICATION_CATEGORIES = ['fashion', 'beauty', 'home', 'lifestyle', 'trends', 'technology'] as const;
export type PublicationCategory = typeof PUBLICATION_CATEGORIES[number];
