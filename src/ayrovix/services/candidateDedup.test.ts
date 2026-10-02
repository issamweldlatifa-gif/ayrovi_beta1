import { describe, it, expect } from 'vitest';
import { deduplicateCandidates } from './candidateDedup';
import type { AyrovixCandidate } from '../types';

describe('Deduplicate', () => {
  function cand(overrides: Partial<AyrovixCandidate> = {}): AyrovixCandidate {
    return {
      id: `id_${Math.random().toString(36).slice(2,6)}`,
      kind: 'external',
      title: 'Nike Air Max 270 White',
      brand: 'Nike',
      model: null,
      colors: [],
      sizes: [],
      source: 'Amazon',
      sourceUrl: 'https://amazon.com/nike-air-max-270-white',
      image: '',
      price: 120,
      currency: 'EUR',
      priceTnd: null,
      match: 80,
      ...overrides,
    };
  }
  it('dedup by exact URL (strip query)', () => {
    const a = cand({ sourceUrl: 'https://amazon.com/nike?ref=123' });
    const b = cand({ id: 'other', sourceUrl: 'https://amazon.com/nike?ref=456' });
    const res = deduplicateCandidates([a,b]);
    expect(res.length).toBe(1);
  });
  it('dedup by normalized title+brand+source (jaccard >0.88)', () => {
    const a = cand({ title: 'Nike Air Max 270 White Sneakers', source: 'Amazon' });
    const b = cand({ id: '2', title: 'Nike Air Max 270 White Sneakers', source: 'Amazon', sourceUrl: 'https://amazon.com/other' });
    const res = deduplicateCandidates([a,b]);
    expect(res.length).toBe(1);
  });
  it('NOT dedup different source', () => {
    const a = cand({ source: 'Amazon', sourceUrl: 'https://amazon.com/a' });
    const b = cand({ id: '2', source: 'eBay', sourceUrl: 'https://ebay.com/a' });
    const res = deduplicateCandidates([a,b]);
    expect(res.length).toBe(2);
  });
  it('NOT dedup different brand', () => {
    const a = cand({ brand: 'Nike' });
    const b = cand({ id: '2', brand: 'Adidas', sourceUrl: 'https://example.com/b' });
    const res = deduplicateCandidates([a,b]);
    expect(res.length).toBe(2);
  });
  it('keeps distinct products (shirt vs shoes)', () => {
    const a = cand({ title: 'T-shirt oversize noir', brand: null, sourceUrl: 'https://zara.com/tshirt' });
    const b = cand({ id: '2', title: 'Sneakers blanches Nike', brand: 'Nike', sourceUrl: 'https://nike.com/shoe' });
    const res = deduplicateCandidates([a,b]);
    expect(res.length).toBe(2);
  });
  it('handles empty', () => {
    expect(deduplicateCandidates([]).length).toBe(0);
  });
});

describe('Performance guard', () => {
  it('no AI per touch — only confirm triggers AI (checking that deduplicate is sync, not async per move)', () => {
    const cands = Array.from({length:5}, (_,i)=> ({
      id: `id_${i}`,
      kind: 'external' as const,
      title: `Product ${i}`,
      brand: null,
      model: null,
      colors: [],
      sizes: [],
      source: 'Test',
      sourceUrl: `https://example.com/${i}`,
      image: '',
      price: 10,
      currency: 'EUR',
      priceTnd: null,
      match: 70,
    }));
    const start = Date.now();
    const res = deduplicateCandidates(cands);
    const elapsed = Date.now() - start;
    expect(res.length).toBe(5);
    expect(elapsed).toBeLessThan(50); // fast local
  });
});
