import { describe, expect, it } from 'vitest';

import type { LensCandidate } from '../src/api/lens';
import {
  EXACT_MATCH_THRESHOLD,
  applyLensControls,
  comparableTnd,
  countActiveFilters,
  defaultControls,
  defaultFilters,
  deriveFacets,
  filterCandidates,
  isExactMatch,
  sortCandidates,
  trustedRating,
  verifiedDiscountPercent,
  type LensControls,
  type LensFilterState,
} from '../src/features/lens/lensFilter';

function makeCandidate(partial: Partial<LensCandidate> & { id: string }): LensCandidate {
  return {
    kind: 'external',
    title: `Produit ${partial.id}`,
    promo: null,
    description: null,
    brand: null,
    model: null,
    colors: [],
    sizes: [],
    source: 'Boutique',
    sourceUrl: `https://shop.example/${partial.id}`,
    image: '',
    images: [],
    colorImages: null,
    price: null,
    currency: null,
    priceTnd: null,
    originalPrice: null,
    originalPriceTnd: null,
    priceOrigin: null,
    availability: 'unknown',
    availabilityCheckedAt: null,
    availabilityExpiresAt: null,
    sourceRead: null,
    sourceCondition: null,
    optionLabel: null,
    rating: null,
    ratingCount: null,
    ratingKind: null,
    match: null,
    offerCount: 0,
    offers: [],
    priceToken: null,
    priceVerificationStatus: 'PENDING_MANUAL',
    variantOptions: [],
    ...partial,
  } as LensCandidate;
}

const baseFilters = defaultFilters();

describe('comparableTnd — aucune conversion inventée sur le téléphone', () => {
  it('retient le prix TND serveur seulement', () => {
    expect(comparableTnd(makeCandidate({ id: 'a', priceTnd: 120 }))).toBe(120);
  });

  it('ne fabrique pas de prix TND depuis une devise étrangère', () => {
    const foreign = makeCandidate({ id: 'b', price: 39, currency: 'EUR', priceTnd: null });
    expect(comparableTnd(foreign)).toBeNull();
  });

  it('ignore un prix TND invalide (zéro, négatif, NaN)', () => {
    expect(comparableTnd(makeCandidate({ id: 'c', priceTnd: 0 }))).toBeNull();
    expect(comparableTnd(makeCandidate({ id: 'd', priceTnd: -5 }))).toBeNull();
    expect(comparableTnd(makeCandidate({ id: 'e', priceTnd: Number.NaN }))).toBeNull();
  });
});

describe('verifiedDiscountPercent — remises vérifiées uniquement', () => {
  it('utilise la remise explicite du serveur', () => {
    const c = makeCandidate({ id: 'a', promo: { percent: 20, label: 'PROMO', priceTnd: 80, originalPriceTnd: 100 } });
    expect(verifiedDiscountPercent(c)).toBe(20);
  });

  it('dérive la remise de deux prix TND publiés', () => {
    const c = makeCandidate({ id: 'b', priceTnd: 75, originalPriceTnd: 100 });
    expect(verifiedDiscountPercent(c)).toBe(25);
  });

  it('ne crée pas de remise sans référence valide', () => {
    expect(verifiedDiscountPercent(makeCandidate({ id: 'c', priceTnd: 75 }))).toBeNull();
    // Un prix « promo » supérieur à l'original n'est pas une remise.
    expect(verifiedDiscountPercent(makeCandidate({ id: 'd', priceTnd: 120, originalPriceTnd: 100 }))).toBeNull();
  });
});

describe('trustedRating — note marchand seulement', () => {
  it('accepte une note marchand', () => {
    expect(trustedRating(makeCandidate({ id: 'a', rating: 4.6, ratingKind: 'merchant' }))).toBe(4.6);
  });

  it('rejette les notes de similarité ou de qualité de fiche', () => {
    expect(trustedRating(makeCandidate({ id: 'b', rating: 4.9, ratingKind: 'match' }))).toBeNull();
    expect(trustedRating(makeCandidate({ id: 'c', rating: 4.9, ratingKind: 'listing-quality' }))).toBeNull();
  });
});

describe('tri — valeurs manquantes jamais traitées comme zéro', () => {
  const candidates = [
    makeCandidate({ id: 'no-price', sourceUrl: 'https://s/1' }),
    makeCandidate({ id: 'high', priceTnd: 300, sourceUrl: 'https://s/2' }),
    makeCandidate({ id: 'foreign', price: 20, currency: 'EUR', sourceUrl: 'https://s/3' }),
    makeCandidate({ id: 'low', priceTnd: 50, sourceUrl: 'https://s/4' }),
    makeCandidate({ id: 'mid', priceTnd: 150, sourceUrl: 'https://s/5' }),
  ];

  it('prix croissant : TND triés, sans-prix et devises étrangères en fin', () => {
    const ids = sortCandidates(candidates, 'price_asc').map((c) => c.id);
    expect(ids.slice(0, 3)).toEqual(['low', 'mid', 'high']);
    expect(ids.slice(3).sort()).toEqual(['foreign', 'no-price']);
  });

  it('prix décroissant : ordre inverse, non comparables toujours en fin', () => {
    const ids = sortCandidates(candidates, 'price_desc').map((c) => c.id);
    expect(ids.slice(0, 3)).toEqual(['high', 'mid', 'low']);
    expect(ids.slice(3).sort()).toEqual(['foreign', 'no-price']);
  });

  it('similarité visuelle : score match décroissant, score absent en fin', () => {
    const set = [
      makeCandidate({ id: 'x', match: 40 }),
      makeCandidate({ id: 'y', match: 92 }),
      makeCandidate({ id: 'z' }),
    ];
    expect(sortCandidates(set, 'match').map((c) => c.id)).toEqual(['y', 'x', 'z']);
  });

  it('remise : la plus forte d abord, sans remise en fin', () => {
    const set = [
      makeCandidate({ id: 'none' }),
      makeCandidate({ id: 'ten', priceTnd: 90, originalPriceTnd: 100 }),
      makeCandidate({ id: 'thirty', priceTnd: 70, originalPriceTnd: 100 }),
    ];
    expect(sortCandidates(set, 'discount').map((c) => c.id)).toEqual(['thirty', 'ten', 'none']);
  });

  it('note : seules les notes marchand participent', () => {
    const set = [
      makeCandidate({ id: 'sim', rating: 5, ratingKind: 'match' }),
      makeCandidate({ id: 'good', rating: 4.5, ratingKind: 'merchant', ratingCount: 12 }),
      makeCandidate({ id: 'best', rating: 4.9, ratingKind: 'merchant', ratingCount: 3 }),
    ];
    expect(sortCandidates(set, 'rating').map((c) => c.id)).toEqual(['best', 'good', 'sim']);
  });

  it('pertinence : l ordre serveur est conservé (stable)', () => {
    const ids = sortCandidates(candidates, 'relevance').map((c) => c.id);
    expect(ids).toEqual(['no-price', 'high', 'foreign', 'low', 'mid']);
  });

  it('égalité : le tri reste déterministe et conserve l index d origine', () => {
    const set = [makeCandidate({ id: 'a', priceTnd: 10 }), makeCandidate({ id: 'b', priceTnd: 10 })];
    expect(sortCandidates(set, 'price_asc').map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('filtres — les contrôles changent réellement les résultats', () => {
  const candidates = [
    makeCandidate({ id: 'shein-red', source: 'SHEIN', brand: 'Aura', colors: ['Rouge', 'Noir'], sizes: ['S', 'M'], availability: 'in_stock', priceTnd: 80, productLinkStatus: 'VERIFIED', match: 88 }),
    makeCandidate({ id: 'amz-blue', source: 'Amazon', brand: 'North', colors: ['Bleu'], sizes: ['L'], availability: 'in_stock', priceTnd: 120, match: 60 }),
    makeCandidate({ id: 'temu-red', source: 'Temu', brand: 'Aura', colors: ['rouge'], sizes: ['M', 'XL'], availability: 'out_of_stock', priceTnd: 40, match: 55 }),
    makeCandidate({ id: 'no-data', source: 'Boutique', availability: 'unknown' }),
  ];

  it('filtre marchand', () => {
    const filters: LensFilterState = { ...baseFilters, merchants: ['shein'] };
    expect(filterCandidates(candidates, filters).map((c) => c.id)).toEqual(['shein-red']);
  });

  it('filtre marque (insensible à la casse)', () => {
    const filters: LensFilterState = { ...baseFilters, brands: ['aura'] };
    expect(filterCandidates(candidates, filters).map((c) => c.id)).toEqual(['shein-red', 'temu-red']);
  });

  it('filtre couleur sans se tromper de casse', () => {
    const filters: LensFilterState = { ...baseFilters, colors: ['Rouge'] };
    expect(filterCandidates(candidates, filters).map((c) => c.id)).toEqual(['shein-red', 'temu-red']);
  });

  it('filtre taille', () => {
    const filters: LensFilterState = { ...baseFilters, sizes: ['l'] };
    expect(filterCandidates(candidates, filters).map((c) => c.id)).toEqual(['amz-blue']);
  });

  it('filtre disponibilité', () => {
    const filters: LensFilterState = { ...baseFilters, availability: ['in_stock'] };
    expect(filterCandidates(candidates, filters).map((c) => c.id)).toEqual(['shein-red', 'amz-blue']);
  });

  it('fourchette de prix TND : écarte les fiches sans prix comparable', () => {
    const filters: LensFilterState = { ...baseFilters, priceTnd: { min: 50, max: 100 } };
    expect(filterCandidates(candidates, filters).map((c) => c.id)).toEqual(['shein-red']);
  });

  it('fourchette ouverte (pas de plafond)', () => {
    const filters: LensFilterState = { ...baseFilters, priceTnd: { min: 100, max: null } };
    expect(filterCandidates(candidates, filters).map((c) => c.id)).toEqual(['amz-blue']);
  });

  it('remises vérifiées uniquement', () => {
    const withPromo = makeCandidate({ id: 'promo', priceTnd: 80, originalPriceTnd: 100 });
    const filters: LensFilterState = { ...baseFilters, discountOnly: true };
    expect(filterCandidates([...candidates, withPromo], filters).map((c) => c.id)).toEqual(['promo']);
  });

  it('fiches vérifiées (prêtes à l achat) uniquement', () => {
    const filters: LensFilterState = { ...baseFilters, verifiedOnly: true };
    expect(filterCandidates(candidates, filters).map((c) => c.id)).toEqual(['shein-red']);
  });

  it('modèle exact uniquement', () => {
    expect(isExactMatch(makeCandidate({ id: 'x', match: EXACT_MATCH_THRESHOLD }))).toBe(true);
    const filters: LensFilterState = { ...baseFilters, exactOnly: true };
    expect(filterCandidates(candidates, filters).map((c) => c.id)).toEqual(['shein-red']);
  });

  it('résultat vide quand rien ne correspond', () => {
    const filters: LensFilterState = { ...baseFilters, brands: ['marque-inexistante'] };
    expect(filterCandidates(candidates, filters)).toEqual([]);
  });

  it('cumule plusieurs filtres (ET logique)', () => {
    const filters: LensFilterState = { ...baseFilters, merchants: ['Temu'], colors: ['Rouge'], availability: ['out_of_stock'] };
    expect(filterCandidates(candidates, filters).map((c) => c.id)).toEqual(['temu-red']);
  });
});

describe('facettes — uniquement de la donnée présente', () => {
  it('dérive les valeurs disponibles avec leurs effectifs', () => {
    const candidates = [
      makeCandidate({ id: '1', source: 'SHEIN', brand: 'Aura', colors: ['Rouge'], sizes: ['M'], availability: 'in_stock' }),
      makeCandidate({ id: '2', source: 'Amazon', brand: 'Aura', colors: ['Bleu'], sizes: ['M', 'L'], availability: 'in_stock' }),
      makeCandidate({ id: '3', source: 'SHEIN', availability: 'unknown' }),
    ];
    const facets = deriveFacets(candidates);
    expect(facets.merchants).toEqual([
      { value: 'SHEIN', count: 2 },
      { value: 'Amazon', count: 1 },
    ]);
    expect(facets.brands).toEqual([{ value: 'Aura', count: 2 }]);
    expect(facets.colors.map((f) => f.value).sort()).toEqual(['Bleu', 'Rouge']);
    expect(facets.sizes.find((f) => f.value === 'M')?.count).toBe(2);
    expect(facets.availability.find((f) => f.value === 'in_stock')?.count).toBe(2);
  });

  it('calcule les compteurs de prix, remise, note et vérification', () => {
    const candidates = [
      makeCandidate({ id: 'a', priceTnd: 90, originalPriceTnd: 100, rating: 4, ratingKind: 'merchant', productLinkStatus: 'VERIFIED', match: 90 }),
      makeCandidate({ id: 'b', priceTnd: 50 }),
      makeCandidate({ id: 'c' }),
    ];
    const facets = deriveFacets(candidates);
    expect(facets.hasPriceTnd).toBe(2);
    expect(facets.hasVerifiedDiscount).toBe(1);
    expect(facets.hasMerchantRating).toBe(1);
    expect(facets.verifiedCount).toBe(1);
    expect(facets.exactMatchCount).toBe(1);
  });
});

describe('applyLensControls — point d entrée de l écran', () => {
  const candidates = [
    makeCandidate({ id: 'a', source: 'SHEIN', priceTnd: 120, match: 70 }),
    makeCandidate({ id: 'b', source: 'Amazon', priceTnd: 40, match: 95, availability: 'in_stock' }),
    makeCandidate({ id: 'c' }),
  ];

  it('état par défaut : tout est visible, ordre serveur, isDefault vrai', () => {
    const result = applyLensControls(candidates, defaultControls());
    expect(result.visible.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(result.total).toBe(3);
    expect(result.filteredCount).toBe(3);
    expect(result.activeFilterCount).toBe(0);
    expect(result.isDefault).toBe(true);
  });

  it('recalcule le nombre après filtrage et garde le tri demandé', () => {
    const controls: LensControls = {
      sort: 'price_asc',
      filters: { ...baseFilters, availability: ['in_stock'] },
    };
    const result = applyLensControls(candidates, controls);
    expect(result.visible.map((c) => c.id)).toEqual(['b']);
    expect(result.filteredCount).toBe(1);
    expect(result.isDefault).toBe(false);
  });

  it('compte chaque famille de filtres une seule fois', () => {
    const filters: LensFilterState = {
      ...baseFilters,
      merchants: ['SHEIN', 'Amazon'],
      colors: ['Rouge'],
      priceTnd: { min: 10, max: null },
      discountOnly: true,
    };
    expect(countActiveFilters(filters)).toBe(4);
  });
});
