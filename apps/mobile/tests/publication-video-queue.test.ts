import { expect, it } from 'vitest';
import { parseReferencePublicationPage } from '../src/api/referencePublications';
import { relatedPublicationVideos, videoClock } from '../src/features/publications/publicationVideoQueue';

const clip = (id: string, ids: string[], url = `/media/${id}.mp4`) => parseReferencePublicationPage({ nextCursor: null, items: [{
  id, media_json: [{ type: 'video', url }], products: ids.map(id => ({ id, name: id, price: 1, available: id !== 'unavailable' })),
}] }).items[0]!;

it('keeps only actual product matches, excludes copies, and ranks by overlap within a bounded queue', () => {
  const current = clip('origin', ['a', 'b', 'unavailable']);
  const candidates = [current, clip('same-source', ['a'], current.media!.url), clip('unknown', ['x']), clip('only-unavailable', ['unavailable']),
    clip('one-match', ['a']), clip('two-matches', ['a', 'b']), clip('duplicate', ['a'], '/media/one-match.mp4'),
    ...Array.from({ length: 25 }, (_, n) => clip(`more-${n}`, ['a']))];
  const matches = relatedPublicationVideos(current, candidates);
  expect(matches.map(item => item.id)).toEqual(['two-matches', 'one-match', ...Array.from({ length: 10 }, (_, n) => `more-${n}`)]);
});

it('formats real playback durations and handles invalid or negative readings', () => {
  expect(videoClock(63.6)).toBe('1:04');
  expect(videoClock(0)).toBe('0:00');
  expect(videoClock(-3)).toBe('0:00');
  expect(videoClock(NaN)).toBe('0:00');
});
