import { describe, expect, it } from 'vitest';

import {
  AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES,
  hasVerifiedAyWebsQuote,
  priceCandidatesOf,
  shouldRetryAyWebsCaptureForPrice,
} from '@/features/aywebs/captureFlow';

const verified = {
  price: 12.5, currency: 'USD', priceVerified: true, currencyVerified: true,
};

describe('captureFlow — relance si prix absent', () => {
  it('relance quand aucun texte de prix, dans la limite', () => {
    expect(shouldRetryAyWebsCaptureForPrice([], 0)).toBe(true);
    expect(shouldRetryAyWebsCaptureForPrice([{ text: '  ' }], AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES - 1)).toBe(true);
    expect(shouldRetryAyWebsCaptureForPrice([], AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES)).toBe(false);
  });

  it('ne relance pas quand un prix a été lu', () => {
    expect(shouldRetryAyWebsCaptureForPrice([{ text: '12,50 $' }], 0)).toBe(false);
  });

  it('extrait les candidats de la capture sans planter sur une forme inattendue', () => {
    expect(priceCandidatesOf({ priceCandidates: [{ text: '9', source: 'dom' }, 'x', null] })).toEqual([{ text: '9', source: 'dom' }]);
    expect(priceCandidatesOf({})).toEqual([]);
  });
});

describe('captureFlow — jamais de feuille à 0,00', () => {
  it('accepte un prix vérifié avec devise ISO et devis', () => {
    expect(hasVerifiedAyWebsQuote(verified, 'quote-1')).toBe(true);
  });

  it('refuse prix nul, prix absent, non vérifié, devise invalide ou devis vide', () => {
    expect(hasVerifiedAyWebsQuote({ ...verified, price: 0 }, 'q')).toBe(false);
    expect(hasVerifiedAyWebsQuote({ ...verified, price: null }, 'q')).toBe(false);
    expect(hasVerifiedAyWebsQuote({ ...verified, priceVerified: false }, 'q')).toBe(false);
    expect(hasVerifiedAyWebsQuote({ ...verified, currency: 'usd' }, 'q')).toBe(false);
    expect(hasVerifiedAyWebsQuote(verified, '   ')).toBe(false);
  });
});
