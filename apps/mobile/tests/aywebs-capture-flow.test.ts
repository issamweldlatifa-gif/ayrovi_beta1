import { describe, expect, it } from 'vitest';
import {
  AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES,
  AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS,
  hasAyWebsPriceCandidate,
  hasVerifiedAyWebsQuote,
  shouldRetryAyWebsCaptureForPrice,
} from '../src/features/aywebs/captureFlow';

const verifiedProduct = {
  sourcePrice: 179.98,
  currency: 'USD',
  priceVerified: true,
  currencyVerified: true,
};

describe('AYWEBs — capture timing and verified quote gate', () => {
  it('retries only a bounded number of times when the merchant DOM has no price yet', () => {
    expect(AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES).toBe(2);
    expect(AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS).toBe(450);
    expect(hasAyWebsPriceCandidate([])).toBe(false);
    expect(shouldRetryAyWebsCaptureForPrice([], 0)).toBe(true);
    expect(shouldRetryAyWebsCaptureForPrice([], 1)).toBe(true);
    expect(shouldRetryAyWebsCaptureForPrice([], 2)).toBe(false);
    expect(shouldRetryAyWebsCaptureForPrice([{ text: '  $179.98  ' }], 0)).toBe(false);
  });

  it('refuses to treat zero, unverified, currency-less, or unsigned data as a usable quote', () => {
    expect(hasVerifiedAyWebsQuote(verifiedProduct, 'signed-quote')).toBe(true);
    expect(hasVerifiedAyWebsQuote({ ...verifiedProduct, sourcePrice: 0 }, 'signed-quote')).toBe(false);
    expect(hasVerifiedAyWebsQuote({ ...verifiedProduct, sourcePrice: null }, 'signed-quote')).toBe(false);
    expect(hasVerifiedAyWebsQuote({ ...verifiedProduct, priceVerified: false }, 'signed-quote')).toBe(false);
    expect(hasVerifiedAyWebsQuote({ ...verifiedProduct, currencyVerified: false }, 'signed-quote')).toBe(false);
    expect(hasVerifiedAyWebsQuote({ ...verifiedProduct, currency: '—' }, 'signed-quote')).toBe(false);
    expect(hasVerifiedAyWebsQuote(verifiedProduct, '  ')).toBe(false);
  });
});
