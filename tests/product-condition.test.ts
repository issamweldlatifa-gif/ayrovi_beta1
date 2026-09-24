// NEUF UNIQUEMENT (demande client 24/09/2026) : les annonces d'occasion (une
// photo, pas de fiche, isolation cassée) sont écartées ; les fiches marchands
// standards passent — on ne perd jamais un produit neuf faute de mention « new ».
import { describe, expect, it } from 'vitest';
import { detectProductCondition, filterOutUsedCandidates, isUsedListing } from '../src/ayrovix/services/productCondition';
import type { AyrovixCandidate } from '../src/ayrovix/types';

function candidate(overrides: Partial<AyrovixCandidate>): AyrovixCandidate {
  return {
    id: 'c1', kind: 'external', title: 'Sweat col rond manches longues', brand: null, model: null,
    colors: [], sizes: [], source: 'Example', sourceUrl: 'https://shop.example.org/p/1',
    image: '', price: 29.99, currency: 'EUR', priceTnd: null, match: 80,
    ...overrides,
  } as AyrovixCandidate;
}

describe('détection d’état (neuf vs occasion)', () => {
  it('signale les places dont le modèle EST l’occasion', () => {
    expect(isUsedListing({ title: 'Blouson en cuir', sourceUrl: 'https://www.leboncoin.fr/ad/vetements/2839' })).toBe(true);
    expect(isUsedListing({ title: 'Baskets', sourceUrl: 'https://www.vinted.fr/items/42' })).toBe(true);
    expect(isUsedListing({ title: 'iPhone 13', description: 'Reconditionné, batterie 92%', sourceUrl: 'https://shop.example.org/iphone' })).toBe(true);
  });

  it('signale les mots-clés d’occasion FR / EN / AR dans le titre ou la description', () => {
    expect(isUsedListing({ title: 'Canapé d’occasion à récupérer' })).toBe(true);
    expect(isUsedListing({ title: 'Dress', description: 'Pre-owned, signs of wear' })).toBe(true);
    expect(isUsedListing({ title: 'جاكيت مستعمل بحالة جيدة' })).toBe(true);
    expect(isUsedListing({ title: 'Montre seconde main' })).toBe(true);
  });

  it('garde les fiches marchands standards (neuf par défaut du e-commerce)', () => {
    expect(isUsedListing({ title: 'Sweat col rond manches longues', sourceUrl: 'https://shop.example.org/p/1' })).toBe(false);
    expect(isUsedListing({ title: 'Pantalon TERRY light grey' })).toBe(false);
    expect(detectProductCondition({ title: 'Robe de soirée' })).toBe('unknown');
  });

  it('« neuf » explicite lève le doute même sur une place d’occasion', () => {
    expect(isUsedListing({ title: 'Blouson neuf avec étiquettes', sourceUrl: 'https://www.leboncoin.fr/ad/9' })).toBe(false);
    expect(isUsedListing({ title: 'Sneakers NIKE', description: 'Brand new in box', sourceUrl: 'https://www.vinted.fr/items/7' })).toBe(false);
  });
});

describe('filtre des candidats (Lens)', () => {
  it('écarte l’occasion et conserve le reste, sans toucher à l’ordre', () => {
    const kept = filterOutUsedCandidates([
      candidate({ id: 'a', title: 'Ensemble chemise + pantalon' }),
      candidate({ id: 'b', title: 'Sweat usagé bon état' }),
      candidate({ id: 'c', sourceUrl: 'https://www.leboncoin.fr/ad/1' }),
      candidate({ id: 'd', title: 'Jogging gris chiné' }),
    ]);
    expect(kept.map((item) => item.id)).toEqual(['a', 'd']);
  });
});
