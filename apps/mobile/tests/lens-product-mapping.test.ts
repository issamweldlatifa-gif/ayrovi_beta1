/**
 * Lens → بطاقة المتجر (تطبيق React Native) — الاختبارات تحمي القواعد:
 *  • السعر من الخادم وحده: `priceTnd` غايب ⇒ 0 (البطاقة تقول «بلا تسعير»، موش 0.00)؛
 *  • التوفّر: in_stock/limited/out_of_stock يتحوّلو؛ أي شي آخر ⇒ UNKNOWN (ما نقولوش متوفر بالخطأ)؛
 *  • الصورة الرئيسية ما تتكرّرش في المعرض.
 */
import { describe, expect, it } from 'vitest';

import type { LensCandidate } from '../src/api/lens';
import { candidateToProduct } from '../src/features/lens/candidateToProduct';

const base = {
  id: 'c1',
  title: 'Sac cuir',
  description: 'Sac',
  brand: 'Maison',
  image: 'https://cdn.example.com/a.jpg',
  images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  source: 'Boutique',
  sourceUrl: 'https://shop.example.com/p/1',
  price: 120,
  currency: 'EUR',
  originalPrice: null,
  originalPriceTnd: null,
  priceTnd: 410.5,
  availability: 'in_stock',
  verification: 'VERIFIED',
  priceOrigin: 'page',
  offerCount: 1,
  colors: [],
  sizes: [],
} as unknown as LensCandidate;

describe('candidateToProduct', () => {
  it('prend le prix serveur tel quel (finalPrice = priceTnd)', () => {
    expect(candidateToProduct(base).finalPrice).toBe(410.5);
  });

  it('sans prix serveur ⇒ 0 (la carte affiche « pas de tarif »)', () => {
    expect(candidateToProduct({ ...base, priceTnd: null } as LensCandidate).finalPrice).toBe(0);
  });

  it.each([
    ['in_stock', 'AVAILABLE'],
    ['limited', 'LIMITED'],
    ['out_of_stock', 'OUT_OF_STOCK'],
    ['unknown', 'UNKNOWN'],
  ])('disponibilité %s ⇒ %s', (availability, stockStatus) => {
    expect(candidateToProduct({ ...base, availability } as LensCandidate).stockStatus).toBe(stockStatus);
  });

  it('disponibilité inconnue du client ⇒ UNKNOWN, jamais « en stock »', () => {
    expect(candidateToProduct({ ...base, availability: 'weird' } as unknown as LensCandidate).stockStatus).toBe('UNKNOWN');
  });

  it('la galerie garde la photo principale une seule fois', () => {
    const product = candidateToProduct(base);
    expect(product.image).toBe(base.image);
    expect(product.additionalImages).toEqual(['https://cdn.example.com/b.jpg']);
  });
});
