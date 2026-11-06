import { describe, expect, test } from 'vitest';
import { parseFeedPage } from '../src/api/publicationFeed';
import { readFeedView, saveFeedView, uniqueFeedPosts } from '../src/features/publications/publicationFeedLogic';
const page = { items: [{ id: 'p1', title: 'Title', media_origin: 'generated', liked: 1, likes: 3, comments: 2, products: [] }], nextCursor: null };
describe('Publication feed data and restoration', () => {
  test('parses real user state and generated media without inventing products', () => {
    const parsed = parseFeedPage(page);
    expect(parsed.items[0]).toMatchObject({ generated: true, liked: true, likes: 3, products: [] });
    expect(parsed.nextCursor).toBeNull();
  });
  test('rejects malformed feed pages', () => {
    for (const value of [null, {}, { items: [{}], nextCursor: null }, { items: [], nextCursor: 2 }]) expect(() => parseFeedPage(value)).toThrow();
  });
  test('deduplicates overlapping pages and restores filters/offset separately per account', () => {
    const parsed = parseFeedPage(page);
    expect(uniqueFeedPosts([parsed, parsed])).toHaveLength(1);
    saveFeedView('owner', { category: 'beauty', q: 'rituel', offset: 210 });
    expect(readFeedView('owner')).toEqual({ category: 'beauty', q: 'rituel', offset: 210 });
    expect(readFeedView('other')).toEqual({ category: '', q: '', offset: 0 });
  });
});
