import { describe, expect, it } from 'vitest';
import type { StoryItem } from '../src/api/sections';
import { storiesGalleryContent, storiesGalleryMeasures, storyArchiveRows } from '../src/features/stories/storiesGalleryLayout';

const card = (id: number, fields: Partial<StoryItem> = {}) => ({
  id: `story-${id}`, mediaType: 'IMAGE', mediaUrl: `/media/stories/${id}.jpg`, publishAt: `2026-11-${String(id).padStart(2, '0')}`,
  ...fields,
} as StoryItem);

describe('dedicated Stories gallery', () => {
  it('measures the full portrait, peeking rail, and correctly spanning archive columns', () => {
    const m = storiesGalleryMeasures(360);
    expect(m.featured).toBe(336);
    expect(m.featured * 1.5).toBe(504);
    expect(m.rail).toBeCloseTo(278.4, 0);
    expect(m.small * 3 + 16).toBeCloseTo(m.featured);
    expect(m.large + m.small + 8).toBeCloseTo(m.featured);
    expect(storiesGalleryMeasures(1024).page).toBe(600);
  });
  it('focuses the Home selection without losing the real CMS order, and sorts the newest rail independently', () => {
    const one = card(1), two = card(2), three = card(3);
    const list = [one, three, two, one, card(4, { mediaType: 'VIDEO' }), card(5, { mediaUrl: '' })];
    expect(storiesGalleryContent(list, 2, two.id)).toEqual({ featured: [two, one], newest: [three, two, one], archive: [one, three, two] });
  });
  it('builds the mixed mosaic without duplicating or dropping real stories including partial rows', () => {
    const stories = Array.from({ length: 14 }, (_, i) => card(i + 1));
    const rows = storyArchiveRows(stories);
    expect(rows.map(row => row.layout)).toEqual(['tiles', 'hero-right', 'tiles', 'hero-left', 'tiles']);
    expect(rows.flatMap(row => row.cards)).toEqual(stories);
    expect(storyArchiveRows(stories.slice(0, 7)).map(row => row.layout)).toEqual(['tiles', 'hero-right', 'wide']);
  });
});
