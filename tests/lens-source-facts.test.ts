/*
 * LES FAITS DE LA SOURCE PRIMENT SUR NOS DEVINETTES (25/09/2026).
 *
 * Google Lens renvoie `in_stock` et `condition` sur chaque correspondance.
 * Nous les jetions, puis nous devinions l'état du produit à partir de mots
 * trouvés dans le titre : un titre mal rédigé faisait disparaître un produit
 * neuf, ou laissait passer une occasion. Ce que le marchand AFFIRME prime.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectProductCondition, isUsedListing, filterOutUsedCandidates } from '../src/ayrovix/services/productCondition';
import type { AyrovixCandidate } from '../src/ayrovix/types';

const candidate = (over: Partial<AyrovixCandidate>): AyrovixCandidate => ({
  id: 'c', kind: 'external', title: 'Veste', brand: null, model: null, colors: [], sizes: [],
  source: 'Boutique', sourceUrl: 'https://boutique.example/p', image: '', price: 10, currency: 'EUR',
  priceTnd: null, match: 80, ...over,
} as AyrovixCandidate);

describe('état du produit — la source parle en premier', () => {
  it('« Used » déclaré par la source écarte l’annonce, même sur une boutique classique', () => {
    expect(detectProductCondition({ title: 'Veste K-Way', sourceUrl: 'https://boutique.example/p', sourceCondition: 'Used' })).toBe('used');
    expect(isUsedListing({ title: 'Veste K-Way', sourceCondition: 'Pre-owned' })).toBe(true);
  });

  it('« New » déclaré par la source sauve un titre malheureux', () => {
    // Sans le champ de la source, le mot « vintage condition » suffisait à écarter le produit.
    expect(detectProductCondition({ title: 'Sneakers vintage condition look' })).toBe('used');
    expect(detectProductCondition({ title: 'Sneakers vintage condition look', sourceCondition: 'New' })).toBe('new');
  });

  it('un état déclaré incompréhensible ne casse rien : on retombe sur la lecture habituelle', () => {
    expect(detectProductCondition({ title: 'Veste occasion', sourceCondition: 'XYZ' })).toBe('used');
    expect(detectProductCondition({ title: 'Veste neuve', sourceCondition: '' })).toBe('unknown');
  });

  it('le filtre de liste transmet le fait au lieu de le perdre', () => {
    const kept = filterOutUsedCandidates([
      candidate({ id: 'neuf', title: 'Sneakers vintage condition', sourceCondition: 'New' }),
      candidate({ id: 'occasion', title: 'Sneakers', sourceCondition: 'Refurbished' }),
    ]);
    expect(kept.map((item) => item.id)).toEqual(['neuf']);
  });
});

describe('disponibilité annoncée par la source', () => {
  const source = readFileSync('src/ayrovix/services/visualSearch.ts', 'utf8');

  it('`in_stock` est enfin lu, et un silence reste « unknown »', () => {
    expect(source).toContain("row?.in_stock === true ? 'in_stock' as const");
    expect(source).toContain("row?.in_stock === false ? 'out_of_stock' as const");
    expect(source).toContain("'unknown' as const");
  });

  it('un silence n’est JAMAIS promu en disponibilité', () => {
    const block = source.split('availability:')[1].split('sourceCondition')[0];
    expect(block).not.toMatch(/\?\?\s*'in_stock'/);
    expect(block).not.toMatch(/\|\|\s*'in_stock'/);
  });

  it('l’état déclaré est conservé tel quel, borné, jamais réécrit', () => {
    expect(source).toContain('sourceCondition: typeof row?.condition');
    expect(source).toContain('.slice(0, 60)');
  });
});
