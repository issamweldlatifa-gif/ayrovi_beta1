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
  it('focuses the Home selection, then separates recent and archive without repeating a story', () => {
    const one = card(1), two = card(2), three = card(3);
    const list = [one, three, two, one, card(4, { mediaType: 'VIDEO' }), card(5, { mediaUrl: '' })];
    const content = storiesGalleryContent(list, 2, two.id);
    expect(content.featured).toEqual([two, one]);
    // « NOUVEAU ! » = les récentes NON déjà montrées en vedette.
    expect(content.newest).toEqual([three]);
    expect(content.archive).toEqual([three]);
    // Défaut corrigé la même story n'est plus en vedette ET dans « nouveau ».
    const featuredIds = new Set(content.featured.map(story => story.id));
    expect(content.newest.every(story => !featuredIds.has(story.id))).toBe(true);
    expect(content.archive.every(story => !featuredIds.has(story.id))).toBe(true);
    // Le rail « récentes » reste un APERÇU de l'archive, pas une troisième liste
    // parallèle : tout ce qu'il montre existe en dessous.
    expect(content.newest.every(story => content.archive.some(row => row.id === story.id))).toBe(true);
  });

  it('ne laisse pas de bloc « nouveau » vide quand il n’y a rien de neuf', () => {
    const one = card(1), two = card(2);
    const content = storiesGalleryContent([one, two], 2);
    expect(content.featured).toEqual([one, two]);
    expect(content.newest).toEqual([]);
    expect(content.archive).toEqual([]);
  });
  it('builds the mixed mosaic without duplicating or dropping real stories including partial rows', () => {
    const stories = Array.from({ length: 14 }, (_, i) => card(i + 1));
    const rows = storyArchiveRows(stories);
    expect(rows.map(row => row.layout)).toEqual(['tiles', 'hero-right', 'tiles', 'hero-left', 'tiles']);
    expect(rows.flatMap(row => row.cards)).toEqual(stories);
    expect(storyArchiveRows(stories.slice(0, 7)).map(row => row.layout)).toEqual(['tiles', 'hero-right', 'wide']);
  });
});
