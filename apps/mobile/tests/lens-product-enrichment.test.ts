import { describe, expect, it } from 'vitest';

import type { LensCandidate } from '@/api/lens';
import { mergeLensProduct, sameMerchantProduct } from '@/features/lens/productEnrichment';

function candidate(over: Partial<LensCandidate> = {}): LensCandidate {
  return {
    id: 'lens-1',
    kind: 'external',
    title: 'Veste',
    promo: null,
    description: null,
    brand: null,
    model: null,
    colors: [],
    sizes: [],
    source: 'shop',
    sourceUrl: 'https://www.shop.example/products/42?ref=lens',
    image: 'https://img.example/one.jpg',
    images: [],
    colorImages: null,
    price: 20,
    currency: 'EUR',
    priceTnd: 70,
    originalPrice: null,
    originalPriceTnd: null,
    priceOrigin: 'search',
    availability: 'unknown',
    availabilityCheckedAt: null,
    availabilityExpiresAt: null,
    sourceRead: null,
    sourceCondition: null,
    optionLabel: null,
    rating: null,
    ratingCount: null,
    ratingKind: null,
    match: 80,
    offerCount: 0,
    offers: [],
    priceToken: null,
    priceVerificationStatus: 'PENDING_MANUAL',
    variantOptions: [],
    ...over,
  };
}

describe('enrichissement progressif d’une fiche Lens', () => {
  it('exige exactement le même hôte et chemin, sans dépendre du tracking', () => {
    expect(sameMerchantProduct(
      'https://www.shop.example/products/42?ref=lens',
      'https://shop.example/products/42?utm_source=x',
    )).toBe(true);
    expect(sameMerchantProduct(
      'https://shop.example/products/42',
      'https://shop.example/products/43',
    )).toBe(false);
  });

  it('fusionne médias et faits réels sans remplacer un prix par une réponse non signée', () => {
    const current = candidate();
    const full = candidate({
      description: 'Description marchande complète.',
      image: 'https://img.example/two.jpg',
      images: ['https://img.example/three.jpg'],
      sizes: ['M', 'L'],
      title: 'Titre marchand différent',
      optionLabel: 'Taille',
      details: [{ key: 'material', label: 'Matière', value: '100 % coton', section: 'material' }],
      variantOptions: [{
        id: 'm', label: 'M', size: 'M', color: null, available: true, availability: 'available',
        price: 25, currency: 'EUR', priceTnd: 88, priceToken: 'variant-without-general-proof',
      }],
      price: 25,
      currency: 'EUR',
      priceTnd: 88,
      priceToken: null,
      priceVerificationStatus: 'PENDING_MANUAL',
    });
    const merged = mergeLensProduct(current, full);
    expect(merged.description).toBe('Description marchande complète.');
    expect(merged.images).toEqual(expect.arrayContaining([
      'https://img.example/one.jpg',
      'https://img.example/two.jpg',
      'https://img.example/three.jpg',
    ]));
    expect(merged.details).toEqual([expect.objectContaining({ key: 'material', value: '100 % coton' })]);
    expect(merged.sizes).toEqual(['M', 'L']);
    expect(merged.optionLabel).toBe('Taille');
    expect(merged.title).toBe('Veste');
    expect(merged.price).toBe(20);
    expect(merged.variantOptions[0]).toMatchObject({ price: null, priceToken: null });
    expect(merged.priceVerificationStatus).toBe('PENDING_MANUAL');
  });

  it('adopte une nouvelle offre uniquement avec sa preuve signée', () => {
    const merged = mergeLensProduct(candidate(), candidate({
      title: 'Veste marchande',
      price: 25,
      currency: 'EUR',
      priceTnd: 88,
      priceToken: 'signed-full-product',
      priceVerificationStatus: 'VERIFIED',
    }));
    expect(merged.title).toBe('Veste marchande');
    expect(merged.price).toBe(25);
    expect(merged.priceToken).toBe('signed-full-product');
    expect(merged.priceVerificationStatus).toBe('VERIFIED');
  });

  it('conserve aussi une preuve signée PENDING_MANUAL sans la promouvoir en VERIFIED', () => {
    const merged = mergeLensProduct(candidate(), candidate({
      title: 'Veste à confirmer',
      price: 23,
      currency: 'EUR',
      priceTnd: 81,
      priceToken: 'signed-pending-product',
      priceVerificationStatus: 'PENDING_MANUAL',
      sizes: ['M', 'L'],
      variantOptions: [{
        id: 'm', label: 'M', size: 'M', color: null, available: true, availability: 'available',
        price: null, currency: null, priceTnd: null, priceToken: null,
      }],
    }));
    expect(merged.title).toBe('Veste à confirmer');
    expect(merged.priceToken).toBe('signed-pending-product');
    expect(merged.priceVerificationStatus).toBe('PENDING_MANUAL');
    expect(merged.variantOptions[0].availability).toBe('available');
  });

  it('ignore intégralement une réponse qui vise un autre produit', () => {
    const current = candidate();
    const other = candidate({ sourceUrl: 'https://shop.example/products/99', description: 'Mauvais produit' });
    expect(mergeLensProduct(current, other)).toBe(current);
  });
});
