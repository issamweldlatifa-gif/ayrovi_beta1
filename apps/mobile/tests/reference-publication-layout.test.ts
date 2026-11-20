import { describe, expect, it } from 'vitest';
import { parseReferencePublicationPage } from '../src/api/referencePublications';
import { PUBLICATION_REFERENCE as R, referenceMeasurements } from '../src/features/publications/referencePublicationLayout';

const post = (id: string, type: 'image' | 'video', width: number, height: number) => ({
  id, title: id, channel_id: 'pub_zayrovi', media_json: JSON.stringify([{ type, width, height, url: type === 'video' ? '/media/video.mp4' : '/media/photo.jpg' }]),
});

describe('reference publication layout', () => {
  it('normalizes both cover heights and the product strip at the reference width', () => {
    const cover = referenceMeasurements(360, 'image-cover');
    const panorama = referenceMeasurements(360, 'image-panoramic');
    expect(cover.width).toBe(336);
    expect(referenceMeasurements(360, 'video-square').mediaHeight).toBe(336);
    expect(cover.mediaHeight).toBeCloseTo(323.745, 2);
    expect(panorama.mediaHeight).toBeCloseTo(162.383, 2);
    expect(panorama.tileWidth).toBeCloseTo(102.667, 2);
    expect(panorama.tileHeight).toBeCloseTo(148.41, 2);
    expect(panorama.width - 3 * (panorama.tileWidth + R.railGap)).toBeCloseTo(R.peek, 5);
    for (const type of ['video-inset', 'video-panoramic'] as const) expect(referenceMeasurements(360, type)).toEqual(panorama);
  });
  it.each([320, 390, 430, 1024])('keeps the frame within a %i dp viewport', viewport => {
    const layout = referenceMeasurements(viewport, 'image-panoramic');
    expect(layout.width).toBeLessThanOrEqual(viewport - 2 * R.inset);
    expect(layout.width).toBeLessThanOrEqual(600);
    expect(layout.tileWidth).toBeGreaterThan(0);
  });
  it('resolves four layouts from authored media; did not reuse dummy/retired content', () => {
    const actual = parseReferencePublicationPage({ nextCursor: 'safeCursor', items: [
      post('a', 'image', 800, 800), post('b', 'image', 1200, 580), post('c', 'video', 580, 1200), post('d', 'video', 1200, 600),
      post('publication_showcase_old', 'image', 800, 800), { id: 'unreadable', media_json: '[{' },
    ] });
    expect(actual.nextCursor).toBe('safeCursor');
    expect(actual.items.map(({ layout }) => layout)).toEqual(['image-cover', 'image-panoramic', 'video-inset', 'video-panoramic']);
  });
  it('honors explicit authored frames over source dimensions', () => {
    const { items } = parseReferencePublicationPage({ nextCursor: null, items: [
      { id: 'square', media_json: [{ type: 'video', url: '/media/video.mp4', fit: 'contain', frame: 'square' }] },
      { id: 'photo', media_json: [{ type: 'image', url: '/media/image.jpg', width: 1200, height: 600, frame: 'square' }] },
      { id: 'wide', media_json: [{ type: 'image', url: '/media/image.jpg', width: 600, height: 1200, frame: 'panoramic' }] },
    ] });
    expect(items.map(item => item.layout)).toEqual(['video-square', 'image-cover', 'image-panoramic']);
  });
  it('keeps truthful sponsorship, author order and only valid linked products', () => {
    const p = (id: string, price: number) => ({ id, name: id, price });
    const { items } = parseReferencePublicationPage({ nextCursor: null, items: [{
      ...post('editorial', 'image', 800, 800), show_title: 0, sponsored: 1, sponsor_name: 'Partenaire',
      products: [p('b', 90), p('a', 25), p('b', 90), p('invalid', 0)],
    }] });
    expect(items[0]).toMatchObject({ title: '', sponsored: true, sponsorName: 'Partenaire' });
    expect(items[0]?.products.map(({ id }) => id)).toEqual(['b', 'a']);
  });
});
