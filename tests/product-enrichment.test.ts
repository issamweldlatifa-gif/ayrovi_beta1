import { describe, expect, it } from 'vitest';
import type { AyrovixProduct, AyrovixVariantOption } from '../client/src/ayrovix/types';
import { mergeProductEnrichment } from '../client/src/ayrovix/services/productEnrichment';
import { resolveProductSelection } from '../client/src/ayrovix/services/productSelection';
import { createAyrovixPriceToken, verifyAyrovixPriceToken } from '../src/ayrovix/priceQuote';

const identity = {
  title: 'Chaussures de running', referenceUrl: 'https://merchant.example/running',
  status: 'PENDING_MANUAL' as const,
};
const sign = (price: number, currency: string) => createAyrovixPriceToken({ ...identity, price, currency });
const candidate: AyrovixProduct = {
  title: identity.title, sourceUrl: identity.referenceUrl, source: 'Source',
  brand: null, model: null, description: 'Résumé marchand', image: '/first.jpg', images: ['/first.jpg'],
  price: 20, currency: 'EUR', priceTnd: 130, exchangeRate: null, priceToken: sign(20, 'EUR'),
  priceVerificationStatus: identity.status, colors: [], sizes: [], availability: 'unknown',
};
const usdVariant: AyrovixVariantOption = {
  id: 'sku-42', label: '42 · bleu', size: '42', color: 'Bleu', available: true,
  price: 32, currency: 'USD', priceTnd: 150, priceToken: sign(32, 'USD'),
};
const full: AyrovixProduct = {
  ...candidate, description: 'Description plus complète publiée par le marchand',
  images: ['/first.jpg', '/second.jpg'], sizes: ['42'], colors: ['Bleu'],
  colorImages: { bleu: ['/second.jpg'] }, variantOptions: [usdVariant], availability: 'in_stock',
};

describe('Lens candidate enrichment and signed variant identity', () => {
  it('merges source images and a whole variant quote without changing the signed general offer', () => {
    const original = JSON.stringify(candidate);
    const enriched = mergeProductEnrichment(candidate, full, identity.referenceUrl)!;
    expect(JSON.stringify(candidate)).toBe(original);
    expect(enriched).not.toBe(candidate);
    expect(enriched).toMatchObject({
      images: ['/first.jpg', '/second.jpg'], description: full.description,
      price: candidate.price, currency: candidate.currency, priceToken: candidate.priceToken,
      sizes: ['42'], colors: ['Bleu'], variantOptions: [usdVariant],
    });
    const { offer } = resolveProductSelection(enriched, '42', 'Bleu');
    expect(offer).toMatchObject({ price: 32, currency: 'USD', priceToken: usdVariant.priceToken });
    expect(verifyAyrovixPriceToken(offer.priceToken, { ...identity, price: offer.price!, currency: offer.currency! })).toBe(true);
  });

  it.each([
    ['different title', { title: 'Another product' }],
    ['different URL', { sourceUrl: 'https://merchant.example/other' }],
    ['different verification status', { priceVerificationStatus: 'VERIFIED' as const }],
  ])('never adopts variant quotes signed for a %s', (_, change) => {
    const merged = mergeProductEnrichment(candidate, { ...full, ...change }, identity.referenceUrl)!;
    expect(merged.variantOptions).toBeUndefined();
    expect(merged.priceToken).toBe(candidate.priceToken);
    expect(resolveProductSelection(merged, '42', 'Bleu')).toMatchObject({
      kind: 'manual', generalEstimate: true,
      offer: { price: candidate.price, currency: candidate.currency, priceToken: candidate.priceToken },
    });
  });

  it('ignores a stale response after navigating to another product', () => {
    expect(mergeProductEnrichment(candidate, full, 'https://merchant.example/previous')).toBe(candidate);
    expect(mergeProductEnrichment(null, full, identity.referenceUrl)).toBeNull();
  });
});
