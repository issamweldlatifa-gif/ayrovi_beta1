import { describe, expect, it } from 'vitest';
import { mergeProductEnrichment } from '../client/src/ayrovix/services/productEnrichment';
import type { AyrovixProduct } from '../client/src/ayrovix/types';

const product = (over: Partial<AyrovixProduct> = {}): AyrovixProduct => ({
  title: 'Phone X Pro 256 GB', brand: 'Brand', model: null, description: 'Short',
  image: 'https://shop.example/item/main.jpg', images: ['https://shop.example/item/main.jpg'],
  source: 'Shop', sourceUrl: 'https://shop.example/item?campaign=one',
  price: 800, currency: 'EUR', priceTnd: 2700, exchangeRate: 3.3,
  colors: [], sizes: [], variantOptions: [], availability: 'unknown',
  priceVerificationStatus: 'VERIFIED', ...over,
});

describe('client product enrichment merge', () => {
  it('merges same-page source facts and lets the VERIFIED merchant-page price replace the grid extract', () => {
    const current = product();
    const full = product({
      description: 'A much longer merchant description with verified details.',
      images: [...current.images, 'https://shop.example/item/side.jpg'],
      sizes: ['128 GB', '256 GB'],
      optionLabel: 'Stockage',
      variantOptions: [{ id: 'v256', label: '256 GB', size: '256 GB', color: null, available: true, availability: 'available', price: null, currency: null, priceTnd: null }],
      price: 780, currency: 'EUR', priceTnd: 2640, availability: 'out_of_stock',
    });
    const merged = mergeProductEnrichment(current, full, 'https://shop.example/item?campaign=one')!;
    expect(merged.images).toContain('https://shop.example/item/side.jpg');
    expect(merged.optionLabel).toBe('Stockage');
    expect(merged.variantOptions).toEqual(full.variantOptions);
    // Prix lu sur la page marchande (VERIFIED) : il prime sur l'extrait SerpApi.
    expect(merged.price).toBe(780);
    expect(merged.priceTnd).toBe(2640);
    expect(merged.priceVerificationStatus).toBe('VERIFIED');
    expect(merged.availability).toBe('out_of_stock');
  });

  it('never borrows a price that the merchant page did not verify', () => {
    const current = product();
    const full = product({
      description: 'A much longer merchant description.',
      price: 1, currency: 'TND', priceTnd: 1, priceVerificationStatus: 'PENDING_MANUAL',
    });
    const merged = mergeProductEnrichment(current, full, 'https://shop.example/item?campaign=one')!;
    expect(merged.description).toBe('A much longer merchant description.');
    expect(merged.price).toBe(800);
    expect(merged.currency).toBe('EUR');
    expect(merged.priceTnd).toBe(2700);
  });

  it('rejects a different merchant and a different product path', () => {
    const current = product();
    const otherMerchant = product({ sourceUrl: 'https://other.example/item', images: ['https://other.example/item/image.jpg'] });
    const otherPath = product({ sourceUrl: 'https://shop.example/another-item', images: ['https://shop.example/another-item/image.jpg'] });
    expect(mergeProductEnrichment(current, otherMerchant, current.sourceUrl)).toBe(current);
    expect(mergeProductEnrichment(current, otherPath, current.sourceUrl)).toBe(current);
  });

  it('does not merge variant details when title or price verification context differs', () => {
    const current = product();
    const full = product({
      title: 'Phone X Pro 256 GB special edition',
      variantOptions: [{ id: 'foreign', label: '1 TB', size: '1 TB', color: null, available: true, availability: 'available', price: null, currency: null, priceTnd: null }],
    });
    const merged = mergeProductEnrichment(current, full, current.sourceUrl)!;
    expect(merged.variantOptions).toEqual([]);
    expect(merged.sizes).toEqual([]);
  });
});
