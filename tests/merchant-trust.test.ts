// NIVEAUX DE CONFIANCE MARCHAND (24/09/2026, demande client) :
//  • trusted  = catalogue interne OU marchand prouvé (profil complet crawlé) → priorité ;
//  • verified = marchand inconnu qui se prouve sur la fiche (≥2 images + description + dispo) ;
//  • unknown  = le reste → APRÈS les niveaux supérieurs, même avec un match supérieur.
// Le registre est volontairement en mémoire par process : la preuve se
// ré-accumule depuis les profiles crawlés — aucune liste figée sans historique.
import { describe, expect, it } from 'vitest';
import { filterDisplayableCandidates, isTrustedMerchantHost, merchantTrust, registerTrustedMerchantHost, shopperScore, harvestForScrape, type MerchantTrust } from '../src/ayrovix/services/candidatePolicy';
import type { AyrovixCandidate } from '../src/ayrovix/types';

function candidate(overrides: Partial<AyrovixCandidate>): AyrovixCandidate {
  return {
    id: 'c1',
    kind: 'external',
    title: 'Robe été fleurie coton',
    brand: null,
    model: null,
    colors: [],
    sizes: [],
    source: 'web',
    sourceUrl: 'https://boutique-inconnue.tn/produits/robe-ete',
    image: '',
    images: [],
    price: 89.9,
    currency: 'TND',
    priceTnd: 89.9,
    match: 80,
    ...overrides,
  };
}

describe('merchantTrust — la preuve avant la priorité', () => {
  it('catalogue interne = trusted', () => {
    expect(merchantTrust(candidate({ kind: 'catalog', sourceUrl: 'https://ayrovi.tn/p/1' }))).toBe<MerchantTrust>('trusted');
  });

  it('marchand prouvé via registerTrustedMerchantHost = trusted', () => {
    expect(isTrustedMerchantHost('https://boutique-prouvee.tn/x')).toBe(false);
    registerTrustedMerchantHost('https://www.boutique-prouvee.tn/produits/robe');
    expect(isTrustedMerchantHost('https://boutique-prouvee.tn/autre')).toBe(true);
    expect(merchantTrust(candidate({ sourceUrl: 'https://boutique-prouvee.tn/robe-ete' }))).toBe<MerchantTrust>('trusted');
  });

  it('marchand inconnu prouvé sur la fiche (2 images + description + dispo) = verified', () => {
    const proved = candidate({
      image: 'https://cdn.tn/a.jpg',
      images: ['https://cdn.tn/a.jpg', 'https://cdn.tn/b.jpg'],
      description: 'Robe en coton léger, coupe fluide, imprimé fleuri, fabriquée en Tunisie.',
      availability: 'in_stock',
    });
    expect(merchantTrust(proved)).toBe<MerchantTrust>('verified');
  });

  it('sans disponibilité explicite, la preuve est incomplète = unknown', () => {
    const almost = candidate({
      image: 'https://cdn.tn/a.jpg',
      images: ['https://cdn.tn/a.jpg', 'https://cdn.tn/b.jpg'],
      description: 'Robe en coton léger, coupe fluide, imprimé fleuri, fabriquée en Tunisie.',
    });
    expect(merchantTrust(almost)).toBe<MerchantTrust>('unknown');
  });

  it('affichage : un unknown à 95% de match passe APRÈS un trusted à 80%', () => {
    const trusted = candidate({
      id: 'trusted', kind: 'catalog', sourceUrl: 'https://ayrovi.tn/p/2', match: 80,
    });
    const unknown = candidate({
      id: 'unknown', match: 95,
      description: 'Description honnête mais preuve incomplète sans disponibilité.',
    });
    const ranked = filterDisplayableCandidates([unknown, trusted]);
    expect(ranked[0].id).toBe('trusted');
    expect(ranked[1].id).toBe('unknown');
  });
});

describe('cartes client : stock + options avant le clic', () => {
  it('une rupture passe derrière une fiche avec pointures', () => {
    const ready = candidate({ id: 'ready', sizes: ['41', '42'], availability: 'in_stock', image: 'https://cdn.tn/a.jpg', images: ['https://cdn.tn/a.jpg'] });
    const oos = candidate({ id: 'oos', availability: 'out_of_stock', match: 99, image: 'https://cdn.tn/b.jpg' });
    expect(shopperScore(ready)).toBeGreaterThan(shopperScore(oos));
    const ranked = filterDisplayableCandidates([oos, ready], 8);
    expect(ranked.map((item) => item.id)).toEqual(['ready']);
  });
});

describe('harvest : plus de liens à kachter', () => {
  it('garde les URLs sans prix SerpApi derrière les fiches tarifées', () => {
    const priced = candidate({ id: 'p', sourceUrl: 'https://a.tn/p', image: 'https://cdn.tn/a.jpg' });
    const bare = candidate({ id: 'b', sourceUrl: 'https://b.tn/p', price: null as any, currency: null as any, image: 'https://cdn.tn/b.jpg' });
    const harvested = harvestForScrape([priced, bare], 8);
    expect(harvested.map((item) => item.id)).toEqual(['p', 'b']);
  });
});
