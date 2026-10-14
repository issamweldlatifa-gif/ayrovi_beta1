import { describe, expect, it } from 'vitest';

import { readProductFacts } from './productEnrichment';

describe('faits produit source-backed', () => {
  it('classe matière, coupe et détails sans interpréter la prose', () => {
    const facts = readProductFacts({
      features: [
        { name: 'Material', text: '100% cotton' },
        { name: 'Fit', text: 'Regular fit' },
        { name: 'Pattern', text: 'Striped' },
      ],
    });
    expect(facts).toEqual([
      { key: 'material', label: 'Material', value: '100% cotton', section: 'material' },
      { key: 'fit', label: 'Fit', value: 'Regular fit', section: 'fit' },
      { key: 'pattern', label: 'Pattern', value: 'Striped', section: 'details' },
    ]);
  });

  it('écarte commerce, URL, HTML vide et doublons', () => {
    const facts = readProductFacts({
      features: [
        { name: 'Price', text: '29 EUR' },
        { name: 'Delivery', text: 'Tomorrow' },
        { name: 'Material', text: '<b>Linen</b>' },
        { name: 'Material', text: '<b>Linen</b>' },
        { name: 'Manual', text: 'https://merchant.example/manual' },
      ],
    });
    expect(facts).toEqual([
      { key: 'material', label: 'Material', value: 'Linen', section: 'material' },
    ]);
  });

  it('borne strictement la quantité et la taille des valeurs exposées', () => {
    const features = Array.from({ length: 30 }, (_, index) => ({
      name: `Fact ${index}`,
      text: 'x'.repeat(400),
    }));
    const facts = readProductFacts({ features });
    expect(facts).toHaveLength(18);
    expect(facts.every((fact) => fact.value.length <= 240)).toBe(true);
  });
});
