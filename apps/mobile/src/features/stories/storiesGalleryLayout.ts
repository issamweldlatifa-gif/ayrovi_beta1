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
  const newest = [...images].sort((a, b) => time(b.publishAt) - time(a.publishAt)).slice(0, 8);
  return { featured, newest, archive: images };
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
