import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/api/errors';
import { parseCartLineQuote } from '../src/api/pricing';

describe('Devis produit public', () => {
  it('lit le prix autoritaire, le prix de référence et la promo', () => {
    expect(parseCartLineQuote({
      lineTotalTND: 96,
      originalLineTotalTND: 100,
      promo: { percent: 4, label: 'Promo du jour', discountTND: 4 },
      pricingVersion: 7,
    })).toEqual({
      lineTotalTnd: 96,
      originalLineTotalTnd: 100,
      promo: { percent: 4, label: 'Promo du jour', discountTnd: 4 },
      pricingVersion: 7,
    });
  });

  it('sans promo, aucune remise n’est inventée', () => {
    const quote = parseCartLineQuote({ lineTotalTND: 100, originalLineTotalTND: null, promo: null });
    expect(quote.promo).toBeNull();
    expect(quote.originalLineTotalTnd).toBeNull();
  });

  it('un montant absent ou nul casse le contrat', () => {
    expect(() => parseCartLineQuote({ lineTotalTND: 0 })).toThrow(ApiError);
    expect(() => parseCartLineQuote(null)).toThrow(ApiError);
  });
});
