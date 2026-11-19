import { expect, it } from 'vitest';
import type { DiscoveryPage } from '../src/api/socialCommerce';
import { editorialSnapshot, readEditorialSnapshot } from '../src/api/socialCommerceCache';

const now = Date.parse('2026-11-19T12:00:00.000Z');
const product = { id: 'p1', name: 'Coat', brand: 'Atelier', image: '', price: 55, currency: 'TND', available: true, stockStatus: 'AVAILABLE' } as const;
const story = { title: 'Story', product, mediaType: 'IMAGE', mediaUrl: '/media/story.webp', description: '', cta: 'Acheter', targetUrl: '/product/p1', productId: 'p1', arrivalId: '', promotionId: '', publishAt: '', priority: 0, status: 'PUBLISHED' };
const page: DiscoveryPage = {
  edition: { number: 1, title: 'Cette semaine', subtitle: '', cover: '/media/cover.webp', startsAt: '2026-11-18', endsAt: '2026-11-20' },
  nextCursor: 'server-only',
  items: [
    { kind: 'reel', id: 'r1', products: [product], reel: { id: 'r1', title: 'Reel', channelId: 'p', description: '', posterUrl: '/media/poster.webp', videoUrl: '/media/reel.mp4', publishAt: '', durationSeconds: 10, views: 1, likes: 1, product, products: [product], myReaction: 'like' } },
    { kind: 'story', id: 's1', story: { ...story, id: 's1', expiresAt: '2026-11-19T13:00:00.000Z' } },
    { kind: 'story', id: 's2', story: { ...story, id: 's2', expiresAt: '2026-11-19T12:00:00.000Z' } },
    { kind: 'look', id: 'l1', title: 'Look', description: '', image: '/media/look.webp', pins: [{ x: 25, y: 25, product }] },
    { kind: 'pick', id: 'c1', title: 'Pick', description: '', product },
  ],
};

it('does not persist purchasable products, targets, reactions or cursors', () => {
  const cached = editorialSnapshot(page, now);
  expect(cached.items.map(item => item.id)).toEqual(['r1', 's1', 'l1']);
  expect(cached.nextCursor).toBeNull();
  expect(cached.edition?.cover).toBe('/media/cover.webp');
  const payload = JSON.stringify(cached);
  expect(payload).not.toMatch(/Coat|stockStatus|price|myReaction|server-only|\/product\/p1/);
  expect(page.items).toHaveLength(5);
});

it('expires the local snapshot and removes Stories that expired since saving', () => {
  const saved = JSON.stringify({ savedAt: now, page });
  expect(readEditorialSnapshot(saved, now + 2 * 3600_000)?.items.map(item => item.id)).toEqual(['r1', 'l1']);
  expect(readEditorialSnapshot(saved, now + 13 * 3600_000)?.edition).toBeNull();
  expect(readEditorialSnapshot(saved, now + 24 * 3600_000)).toBeNull();
  expect(readEditorialSnapshot('{')).toBeNull();
});
