import { describe, expect, it } from 'vitest';
import { amazonCaptureHasPricedSelection } from '@/features/aywebs/amazonFastQuote';

describe('Amazon exact priced selection fast path', () => {
  const selection = { color: 'Blue', size: 'M' };
  const row = { attributes: { couleur: 'Blue', taille: 'M' }, price: '109 EUR', available: true };
  it('accepts exactly matching published facts, including translated names', () => {
    expect(amazonCaptureHasPricedSelection({ variantMatrix: [row] }, selection)).toBe(true);
  });
  it('never assumes price, stock or another combination', () => {
    for (const changed of [
      { ...row, price: null }, { ...row, priceFrom: true }, { ...row, available: false },
      { ...row, available: null }, { ...row, attributes: { couleur: 'Red', taille: 'M' } },
      { ...row, attributes: { couleur: 'Blue' } },
      { ...row, attributes: { couleur: 'Blue', color: 'Blue' } },
    ]) expect(amazonCaptureHasPricedSelection({ variantMatrix: [changed] }, selection)).toBe(false);
  });
});
