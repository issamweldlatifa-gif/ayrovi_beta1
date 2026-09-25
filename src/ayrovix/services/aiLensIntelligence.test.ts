import { describe, it, expect } from 'vitest';
import { deduplicateCandidates, understandSelectedProduct, understandCustomerIntent } from './aiLensIntelligence';
import type { AyrovixCandidate, AyrovixIdentification } from '../types';

function mockId(overrides: Partial<AyrovixIdentification> = {}): AyrovixIdentification {
  return {
    input_kind: 'product_photo',
    category: 'shoes',
    brand: 'Nike',
    model: 'Air Max 270',
    color: ['white', 'black'],
    visible_text: ['NIKE'],
    possible_model_codes: ['270'],
    description: 'Sneakers Nike Air Max 270 blanches',
    confidence: 0.82,
    detected_price: { amount: 0, currency: '', label: 'none', confidence: 0 },
    pricing: { sale_price: null, original_price: null, shipping_price: null, total_price: null, currency: null, discount_percent: null },
    products: [
      { name: 'Sneakers Nike Air Max', brand: 'Nike', category: 'shoes', subcategory: 'sneakers', price: null, currency: null, box: [0.2,0.3,0.5,0.4], color: ['white'], pattern: null, material: 'mesh' },
      { name: 'T-shirt oversize', brand: null, category: 'clothing', subcategory: 't-shirt', price: null, currency: null, box: [0.1,0.05,0.3,0.4], color: ['black'], pattern: 'logo-print', material: 'coton' },
    ],
    url: null,
    seller: null,
    ...overrides,
  };
}

describe('AI product understanding', () => {
  it('separates visible vs inferred, no invention when brand null', () => {
    const id = mockId({ brand: null, products: [{ name: 'Sac cuir', brand: null, category: 'bags', subcategory: 'handbag', price: null, currency: null, box: null, color: ['brown'], pattern: null, material: 'cuir' }] });
    const u = understandSelectedProduct(id, 0);
    expect(u.selectedProduct.brand).toBeNull();
    expect(u.selectedProduct.attributesVisible).not.toContain('brand:');
    expect(u.selectedProduct.attributesInferred).toContain('brand:unknown');
    expect(u.selectedProduct.material).toBe('cuir');
  });
  it('detects multi-products count', () => {
    const id = mockId();
    const u = understandSelectedProduct(id);
    expect(u.multiProductsDetected).toBe(2);
  });
});

describe('Customer intent', () => {
  it('merges selected object + optional text + context', () => {
    const id = mockId();
    const intent = understandCustomerIntent(id, 'cherche taille 42', 'Sneakers Nike Air Max');
    expect(intent.selectedObject).toBe('Sneakers Nike Air Max');
    expect(intent.customerIntent).toContain('cherche taille 42');
    expect(intent.context).toContain('product_photo');
    expect(intent.optionalText).toBe('cherche taille 42');
  });
  it('handles no optional text', () => {
    const id = mockId();
    const intent = understandCustomerIntent(id, null);
    expect(intent.optionalText).toBeNull();
    expect(intent.customerIntent).toBeTruthy();
  });
});

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
  it('does NOT merge distinct source URLs just because title, brand and merchant match', () => {
    const a = cand({ title: 'Nike Air Max 270 White Sneakers', source: 'Amazon' });
    const b = cand({ id: '2', title: 'Nike Air Max 270 White Sneakers', source: 'Amazon', sourceUrl: 'https://amazon.com/other' });
    const res = deduplicateCandidates([a,b]);
    expect(res.length).toBe(2);
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
    // deduplicate is sync local, generateOptimizedSearch is async only on confirm
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
