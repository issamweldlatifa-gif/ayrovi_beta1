import type { StoryItem } from '@/api/sections';

/** 720px reference: 24px gutter, 659×989 featured, 546×820 carousel, 16px columns. */
export const STORY_GALLERY = { inset: 12, followInset: 36, gap: 8, rowGap: 12, maxWidth: 600, aspect: 2 / 3, railFraction: 546 / 706 } as const;

export function storiesGalleryMeasures(viewport: number) {
  const page = Math.min(viewport, STORY_GALLERY.maxWidth);
  const featured = Math.max(0, page - 2 * STORY_GALLERY.inset);
  const small = Math.max(0, (featured - 2 * STORY_GALLERY.gap) / 3);
  return { page, featured, rail: page * STORY_GALLERY.railFraction, small, large: small * 2 + STORY_GALLERY.gap };
}

const time = (date: string) => Date.parse(date) || 0;
export function storiesGalleryContent(rows: StoryItem[], featuredCount: number, focus?: string) {
  const ids = new Set<string>();
  const images = rows.filter(row => {
    if (!row.id || row.mediaType !== 'IMAGE' || !row.mediaUrl || ids.has(row.id)) return false;
    ids.add(row.id);
    return true;
  });
  const selected = images.find(row => row.id === focus);
  const featured = (selected ? [selected, ...images.filter(row => row !== selected)] : images).slice(0, Math.min(featuredCount, 12));
  /**
   * 19/11 — la même story apparaissait jusqu'à TROIS fois : en vedette, dans
   * « NOUVEAU ! » (le rail était trié sur la liste complète) et de nouveau dans
   * l'archive. Les trois blocs racontent maintenant trois choses différentes :
   * la sélection, les récentes NON sélectionnées, puis les archives.
   */
  const featuredIds = new Set(featured.map(row => row.id));
  const rest = images.filter(row => !featuredIds.has(row.id));
  const newest = [...rest].sort((a, b) => time(b.publishAt) - time(a.publishAt)).slice(0, 8);
  return { featured, newest, archive: rest };
}

export function storyArchiveRows(items: StoryItem[]) {
  const rows = [];
  for (let i = 0; i < items.length; i += 3) {
    const cards = items.slice(i, i + 3);
    const layout = cards.length === 1 ? 'wide' : cards.length !== 3 || (i / 3) % 2 === 0 ? 'tiles'
      : (i / 3) % 4 === 1 ? 'hero-right' : 'hero-left';
    rows.push({ cards, layout });
  }
  return rows;
}
