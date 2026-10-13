import { describe, expect, it } from 'vitest';
import { parseCandidate, parseUrlProduct, type LensLiveStock } from '../src/api/lens';
import { mergeLiveStock, mergeProductEnrichment } from '../src/features/lens/productHydration';

const current = parseCandidate({
  id: 'c1',
  sourceUrl: 'https://shop.example/p/1?from=lens',
  title: 'Robe',
  description: 'Court',
  image: 'https://cdn.example/one.jpg',
  images: [],
  price: 20,
  currency: 'EUR',
  priceTnd: 75,
  priceToken: 'search-token',
  priceVerificationStatus: 'PENDING_MANUAL',
  availability: 'unknown',
});

describe('Lens — enrichissement de la grande fiche', () => {
  it('fusionne la vraie fiche du même marchand : galerie, description, options et prix vérifié', () => {
    const full = parseUrlProduct({
      sourceUrl: 'https://www.shop.example/p/1',
      title: 'Robe complète',
      description: 'Description complète de la page marchand',
      image: 'https://cdn.example/two.jpg',
      images: ['https://cdn.example/three.jpg'],
      sizes: ['M', 'L'],
      colors: ['Rouge'],
      price: 21,
      currency: 'EUR',
      priceTnd: 80,
      originalPrice: 25,
      originalPriceTnd: 95,
      priceToken: 'fresh-token',
      priceVerificationStatus: 'VERIFIED',
      availability: 'in_stock',
      variantOptions: [{ label: 'M', size: 'M', available: true, availability: 'available', price: 21, currency: 'EUR', priceTnd: 80, priceToken: 'm-token' }],
    });
    const merged = mergeProductEnrichment(current, full, current.sourceUrl);
    expect(merged.description).toContain('complète');
    expect(merged.images).toEqual(expect.arrayContaining([
      'https://cdn.example/one.jpg',
      'https://cdn.example/two.jpg',
      'https://cdn.example/three.jpg',
    ]));
    expect(merged.sizes).toEqual(['M', 'L']);
    expect(merged.priceToken).toBe('fresh-token');
    expect(merged.priceVerificationStatus).toBe('VERIFIED');
    expect(merged.originalPriceTnd).toBe(95);
    expect(merged.variantOptions).toHaveLength(1);
  });

  it('refuse de fusionner une redirection vers un autre produit', () => {
    const other = parseUrlProduct({ sourceUrl: 'https://shop.example/p/2', title: 'Autre', images: ['x'] });
    expect(mergeProductEnrichment(current, other, current.sourceUrl)).toBe(current);
  });

  it('la lecture live met à jour ensemble prix, média, stock et variantes', () => {
    const live: LensLiveStock = {
      url: 'https://shop.example/p/1',
      availability: 'limited',
      price: 22,
      currency: 'EUR',
      originalPrice: 30,
      priceTnd: 84,
      originalPriceTnd: 110,
      sizes: ['L'],
      colors: ['Bleu'],
      images: ['https://cdn.example/live.jpg'],
      variants: [{ value: 'L', color: 'Bleu', availability: 'available' }],
      checkedAt: '2026-10-14T20:00:00.000Z',
      reason: 'source',
      priceToken: 'live-token',
    };
    const merged = mergeLiveStock(current, live);
    expect(merged.availability).toBe('limited');
    expect(merged.image).toBe('https://cdn.example/live.jpg');
    expect(merged.price).toBe(22);
    expect(merged.priceToken).toBe('live-token');
    expect(merged.priceVerificationStatus).toBe('VERIFIED');
    expect(merged.sizes).toContain('L');
    expect(merged.variantOptions[0]).toMatchObject({ size: 'L', color: 'Bleu', priceToken: 'live-token' });
    expect(merged.availabilityExpiresAt).toBe('2026-10-15T02:00:00.000Z');
  });
});
