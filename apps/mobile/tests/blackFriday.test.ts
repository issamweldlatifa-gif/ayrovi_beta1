import { describe, expect, it } from 'vitest';
import { parseBlackFriday } from '../src/api/blackFriday';
import { blackFridayGeometry } from '../src/features/home/blackFridayGeometry';
import { blackFridayBannerInk, blackFridayTimeRemaining, DEFAULT_BLACK_FRIDAY, normalizeBlackFriday } from '../../../shared/blackFriday';

const offer = (id: string, price: number, compareAtPrice: number) => ({
  id, name: id, image: '/media/product.jpg', price, compareAtPrice,
});
describe('Black Friday layout contract', () => {
  it('preserves the reference proportions and ends with a taller CTA card', () => {
    const g = blackFridayGeometry(360);
    expect(g).toEqual({ width: 360, bannerHeight: 192, overlap: 20, tile: 200, terminalHeight: 253,
      inset: 12, gap: 8, afterRail: 19, ctaHeight: 48, bottom: 20 });
    expect(g.width - g.inset - g.tile - g.gap).toBe(140);
    expect(blackFridayGeometry(1024).width).toBe(600);
  });
  it('uses only available, discounted cards in source order and never copies a false headline percentage', () => {
    const payload = { ...DEFAULT_BLACK_FRIDAY, products: [offer('b', 80, 100), offer('a', 70, 100),
      offer('b', 20, 100), offer('full-price', 50, 50), { ...offer('out', 15, 100), available: false }], maxDiscount: 75 };
    expect(parseBlackFriday(payload)).toMatchObject({ maxDiscount: 30, products: [{ id: 'b', discountPercent: 20 }, { id: 'a', discountPercent: 30 }] });
    expect(parseBlackFriday({ ...payload, products: [] })).toBeNull();
  });
});


it('upgrades previous campaign JSON without losing authored fields and validates color and dates', () => {
  const old = { enabled: true, title: 'Black Friday\nDémo', ctaFr: 'Offres', ctaAr: 'عروض', cover: '/media/old.jpg', productIds: ['p1'] };
  expect(normalizeBlackFriday(old)).toMatchObject({ ...old, backgroundColor: '#121E2A', surfaceColor: '#FFFFFF', badge: 'Black Friday Week' });
  expect(normalizeBlackFriday({ ...old, featureCover: '/media/%2e%2e/private.jpg' })).toBeNull();
  expect(normalizeBlackFriday({ ...old, endsAt: '2026-02-31T00:00:00.000Z' })).toBeNull();
  expect(blackFridayBannerInk('#000000')).toBe('#FFFFFF');
  expect(blackFridayBannerInk('#FBF5E8')).toBe('#000000');
  expect(blackFridayTimeRemaining('2026-11-20T01:02:00.000Z', Date.parse('2026-11-19T00:00:00.000Z'))).toEqual({ days: 1, hours: 1, minutes: 2 });
  expect(blackFridayTimeRemaining('', 0)).toBeNull();
});
