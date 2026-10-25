import { describe, expect, it } from 'vitest';
import type { LensCandidate } from '../src/api/lens';
import { availabilityKey, isOpenableSourceUrl, openableCandidates, pricePresentation, priceView, uniqueCandidates } from '../src/features/lens/lensView';

const base: LensCandidate = {
  id: '1', kind: 'external', title: 't', promo: null, description: null, brand: null, model: null,
  colors: [], sizes: [], source: 's', sourceUrl: 'https://a.example/1', image: '', images: [], colorImages: null,
  price: null, currency: null, priceTnd: null, originalPrice: null, originalPriceTnd: null,
  priceOrigin: null, availability: 'unknown', availabilityCheckedAt: null, availabilityExpiresAt: null,
  sourceRead: null, sourceCondition: null, optionLabel: null, rating: null, ratingCount: null,
  ratingKind: null, match: null, offerCount: 0, offers: [],
  priceToken: null, priceVerificationStatus: 'PENDING_MANUAL', variantOptions: [],
};

describe('Lens — vue', () => {
  it('priceTnd prime', () => {
    expect(priceView({ ...base, priceTnd: 120, price: 40, currency: 'EUR' })).toEqual({ kind: 'tnd', amount: 120 });
  });
  it('la promo du serveur fournit le prix courant, la référence et le pourcentage', () => {
    const view = pricePresentation({
      ...base,
      priceTnd: 100,
      promo: { percent: 4, label: 'Promo', priceTnd: 96, originalPriceTnd: 100 },
    });
    expect(view.current).toEqual({ kind: 'tnd', amount: 96 });
    expect(view.referenceTnd).toBe(100);
    expect(view.discountPercent).toBe(4);
    expect(view.promoLabel).toBe('Promo');
  });
  it('le devis frais remplace la promo de la grille sans calcul local', () => {
    const view = pricePresentation(base, {
      lineTotalTnd: 92,
      originalLineTotalTnd: 100,
      promo: { percent: 8, label: 'Flash', discountTnd: 8 },
      pricingVersion: 2,
    });
    expect(view.current).toEqual({ kind: 'tnd', amount: 92 });
    expect(view.referenceTnd).toBe(100);
    expect(view.discountPercent).toBe(8);
  });
  it('un devis frais sans promo efface entièrement une ancienne promo Lens', () => {
    const view = pricePresentation({
      ...base,
      priceTnd: 96,
      promo: { percent: 4, label: 'Ancienne promo', priceTnd: 96, originalPriceTnd: 100 },
    }, {
      lineTotalTnd: 100,
      originalLineTotalTnd: null,
      promo: null,
      pricingVersion: 3,
    });
    expect(view.current).toEqual({ kind: 'tnd', amount: 100 });
    expect(view.referenceTnd).toBeNull();
    expect(view.discountPercent).toBeNull();
    expect(view.promoLabel).toBeNull();
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

  describe('openableCandidates — toute carte affichée doit ouvrir AYWEBS', () => {
    it('conserve les fiches https (catalogue comme externe) dans l’ordre', () => {
      const list = openableCandidates([
        { ...base, id: 'a', kind: 'external', sourceUrl: 'https://www.amazon.fr/dp/B01' },
        { ...base, id: 'b', kind: 'catalog', sourceUrl: 'https://www.shein.com/robe-p-1.html' },
      ]);
      expect(list.map((c) => c.id)).toEqual(['a', 'b']);
    });

    it('écarte les liens http, schémas étranges, vides et non-URL (aucune carte morte)', () => {
      const list = openableCandidates([
        { ...base, id: 'ok', sourceUrl: 'https://a.example/1' },
        { ...base, id: 'http', sourceUrl: 'http://a.example/1' },
        { ...base, id: 'js', sourceUrl: 'javascript:alert(1)' },
        { ...base, id: 'empty', sourceUrl: '' },
        { ...base, id: 'text', sourceUrl: 'pas une url' },
      ]);
      expect(list.map((c) => c.id)).toEqual(['ok']);
    });

    it('une liste entièrement non ouvrable devient vide (l’écran montre l’état vide, pas de fausse carte)', () => {
      expect(openableCandidates([{ ...base, sourceUrl: '' }])).toEqual([]);
    });
  });
});
