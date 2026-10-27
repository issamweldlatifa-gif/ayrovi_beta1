/**
 * Lens — classement marchand et filtres de résultats (28/10/2026).
 *
 * Deux demandes du client dans la même phrase :
 *   • « روابط بطاقات هذي تكون لمتاجر الأكثر موثوقية » — les cartes d'abord les
 *     enseignes fiables ;
 *   • « كان من المفروض أنّ فمّا نظام فلاتر موجود » — un vrai système de filtres.
 *
 * Ce fichier teste les fonctions PURES (`lensRanking.ts`) : aucun rendu, donc
 * un échec désigne la règle, jamais la mise en page.
 */
import { describe, expect, it } from 'vitest';

import { parseCandidate } from '@/api/lens';
import {
  DEFAULT_FILTERS, applyLensFilters, filtersAreActive, matchesFilters,
  merchantKey, merchantTier, presentMerchants, rankCandidates,
  type LensFilters,
} from '@/features/lens/lensRanking';

const card = (overrides: Record<string, unknown>) => parseCandidate({
  id: String(overrides.id ?? overrides.sourceUrl ?? 'x'),
  kind: 'external',
  title: String(overrides.title ?? 'Produit'),
  source: String(overrides.source ?? 'Boutique'),
  sourceUrl: String(overrides.sourceUrl ?? 'https://example.com/p/1'),
  ...overrides,
});

describe('merchantKey / merchantTier — la confiance vient du DOMAINE', () => {
  it('reconnaît l’enseigne sous un sous-domaine et un domaine national', () => {
    expect(merchantKey('https://www.zalando.fr/baskets-1.html')).toBe('zalando');
    expect(merchantKey('https://www.amazon.co.uk/dp/B0ABC')).toBe('amazon');
    expect(merchantKey('https://fr.shein.com/p/1')).toBe('shein');
  });

  it('suit une redirection de suivi jusqu’au vrai marchand', () => {
    const wrapped = 'https://www.google.com/url?q=https%3A%2F%2Fwww.amazon.fr%2Fdp%2FB0ABC&sa=D';
    expect(merchantKey(wrapped)).toBe('amazon');
    expect(merchantTier(wrapped)).toBe(0);
  });

  it('trois rangs : enseigne connue, place de marché, inconnue', () => {
    expect(merchantTier('https://www.zara.com/fr/p/1')).toBe(0);
    expect(merchantTier('https://www.ebay.fr/itm/1')).toBe(1);
    expect(merchantTier('https://boutique-inconnue.tn/p/1')).toBe(2);
    expect(merchantTier('pas une url')).toBe(2);
  });
});

describe('rankCandidates — le catalogue d’abord, puis la confiance', () => {
  const unknown = card({ id: 'u', sourceUrl: 'https://inconnu-shop.tn/p/1', match: 99, price: 10, currency: 'EUR', priceTnd: 34 });
  const amazon = card({ id: 'a', sourceUrl: 'https://www.amazon.fr/dp/B0A', match: 40, price: 20, currency: 'EUR', priceTnd: 66 });
  const ebay = card({ id: 'e', sourceUrl: 'https://www.ebay.fr/itm/9', match: 80, price: 15, currency: 'EUR', priceTnd: 50 });
  const catalog = parseCandidate({
    id: 'cat', kind: 'catalog', title: 'Notre stock', source: 'Collection ZAYROVI',
    sourceUrl: 'https://ayrovi.tn/p/1', match: 1,
  });

  it('une boutique inconnue ne passe jamais devant une enseigne fiable, même mieux classée', () => {
    const ranked = rankCandidates([unknown, ebay, amazon]);
    expect(ranked.map((entry) => entry.id)).toEqual(['a', 'e', 'u']);
  });

  it('le catalogue ZAYROVI garde la tête (vente interne, décision du 23/10)', () => {
    const ranked = rankCandidates([amazon, catalog]);
    expect(ranked[0].id).toBe('cat');
  });

  it('tri par prix : à confiance égale, le moins cher d’abord', () => {
    const cheap = card({ id: 'c1', sourceUrl: 'https://www.amazon.fr/dp/B1', price: 5, currency: 'EUR', priceTnd: 17 });
    const dear = card({ id: 'c2', sourceUrl: 'https://www.amazon.fr/dp/B2', price: 50, currency: 'EUR', priceTnd: 166 });
    expect(rankCandidates([dear, cheap], 'price').map((entry) => entry.id)).toEqual(['c1', 'c2']);
    // Le tri prix ne fait PAS remonter une boutique inconnue pour autant.
    const unknownCheap = card({ id: 'c3', sourceUrl: 'https://x-shop.tn/p/1', price: 1, currency: 'EUR', priceTnd: 3 });
    expect(rankCandidates([dear, unknownCheap], 'price').map((entry) => entry.id)).toEqual(['c2', 'c3']);
  });

  it('l’ordre est stable : deux appels donnent la même grille', () => {
    const first = rankCandidates([unknown, amazon, ebay]).map((entry) => entry.id);
    const second = rankCandidates([ebay, unknown, amazon]).map((entry) => entry.id);
    expect(first).toEqual(second);
  });
});

describe('matchesFilters / applyLensFilters', () => {
  const verified = card({
    id: 'v', sourceUrl: 'https://www.zalando.fr/p/1', priceVerificationStatus: 'VERIFIED',
    priceToken: 'tok', availability: 'in_stock', price: 20, currency: 'EUR', priceTnd: 66,
  });
  const pending = card({
    id: 'p', sourceUrl: 'https://inconnu.tn/p/2', priceVerificationStatus: 'PENDING_MANUAL',
    availability: 'out_of_stock',
  });

  const filters = (overrides: Partial<LensFilters> = {}): LensFilters => ({ ...DEFAULT_FILTERS, ...overrides });

  it('« prix vérifié » ne garde que les fiches dont la page a été lue', () => {
    expect(matchesFilters(verified, filters({ priced: true }))).toBe(true);
    expect(matchesFilters(pending, filters({ priced: true }))).toBe(false);
  });

  it('« en stock » accepte `in_stock` et `limited`, refuse `out_of_stock`', () => {
    expect(matchesFilters(verified, filters({ inStock: true }))).toBe(true);
    expect(matchesFilters(pending, filters({ inStock: true }))).toBe(false);
    const limited = card({ id: 'l', availability: 'limited', sourceUrl: 'https://www.zara.com/p/1' });
    expect(matchesFilters(limited, filters({ inStock: true }))).toBe(true);
  });

  it('« boutiques de confiance » n’accepte que le rang 0', () => {
    expect(matchesFilters(verified, filters({ trustedOnly: true }))).toBe(true);
    expect(matchesFilters(pending, filters({ trustedOnly: true }))).toBe(false);
    const ebay = card({ id: 'e', sourceUrl: 'https://www.ebay.fr/itm/1' });
    expect(matchesFilters(ebay, filters({ trustedOnly: true }))).toBe(false);
  });

  it('une enseigne cochée restreint la grille à elle seule', () => {
    expect(matchesFilters(verified, filters({ merchants: ['zalando'] }))).toBe(true);
    expect(matchesFilters(pending, filters({ merchants: ['zalando'] }))).toBe(false);
  });

  it('les filtres se cumulent et le tri s’applique au résultat filtré', () => {
    const result = applyLensFilters([pending, verified], filters({ trustedOnly: true, sort: 'price' }));
    expect(result.map((entry) => entry.id)).toEqual(['v']);
  });

  it('les filtres par défaut ne retirent rien', () => {
    expect(filtersAreActive(DEFAULT_FILTERS)).toBe(false);
    expect(applyLensFilters([pending, verified], DEFAULT_FILTERS)).toHaveLength(2);
  });
});

describe('presentMerchants — les puces de filtre', () => {
  it('liste les enseignes présentes, rang 0 d’abord, avec leur compte', () => {
    const list = presentMerchants([
      card({ id: '1', sourceUrl: 'https://www.amazon.fr/dp/1', source: 'Amazon' }),
      card({ id: '2', sourceUrl: 'https://www.amazon.fr/dp/2', source: 'Amazon' }),
      card({ id: '3', sourceUrl: 'https://inconnu.tn/p/1', source: 'Inconnu' }),
      card({ id: '4', sourceUrl: 'https://www.ebay.fr/itm/1', source: 'eBay' }),
    ]);
    expect(list.map((entry) => entry.key)).toEqual(['amazon', 'ebay', 'inconnu']);
    expect(list[0]).toMatchObject({ label: 'Amazon', count: 2, tier: 0 });
  });

  it('ignore le catalogue interne : il n’est pas un marchand tiers', () => {
    const catalog = parseCandidate({
      id: 'cat', kind: 'catalog', title: 'T', source: 'ZAYROVI', sourceUrl: 'https://ayrovi.tn/p/1',
    });
    expect(presentMerchants([catalog])).toEqual([]);
  });
});
