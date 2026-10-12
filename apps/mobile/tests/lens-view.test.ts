import { describe, expect, it } from 'vitest';
import type { LensCandidate } from '../src/api/lens';
import { availabilityKey, isOpenableSourceUrl, priceView, uniqueCandidates } from '../src/features/lens/lensView';

const base: LensCandidate = {
  id: '1', kind: 'external', title: 't', promo: null, description: null, brand: null, model: null,
  colors: [], sizes: [], source: 's', sourceUrl: 'https://a.example/1', image: '', images: [], colorImages: null,
  price: null, currency: null, priceTnd: null, availability: 'unknown',
};

describe('Lens — vue', () => {
  it('priceTnd prime', () => {
    expect(priceView({ ...base, priceTnd: 120, price: 40, currency: 'EUR' })).toEqual({ kind: 'tnd', amount: 120 });
  });
  it('sans priceTnd: prix original seulement avec devise', () => {
    expect(priceView({ ...base, price: 40, currency: 'EUR' })).toEqual({ kind: 'original', amount: 40, currency: 'EUR' });
    expect(priceView({ ...base, price: 40, currency: null })).toEqual({ kind: 'none' });
  });
  it('prix zéro ou absent → sans tarif (jamais 0)', () => {
    expect(priceView({ ...base, priceTnd: 0 })).toEqual({ kind: 'none' });
    expect(priceView(base)).toEqual({ kind: 'none' });
  });
  it('disponibilité inconnue reste « non confirmé »', () => {
    expect(availabilityKey('unknown')).toBe('product.avail.unknown');
    expect(availabilityKey('in_stock')).toBe('product.avail.in_stock');
  });
  it('doublons par lien source retirés, ordre conservé', () => {
    const list = uniqueCandidates([base, { ...base, id: '2' }, { ...base, id: '3', sourceUrl: 'https://a.example/3' }]);
    expect(list.map((c) => c.id)).toEqual(['1', '3']);
  });
  it('seuls http(s) sont ouvrables', () => {
    expect(isOpenableSourceUrl('https://x.example')).toBe(true);
    expect(isOpenableSourceUrl('javascript:alert(1)')).toBe(false);
    expect(isOpenableSourceUrl('pas une url')).toBe(false);
  });
});
