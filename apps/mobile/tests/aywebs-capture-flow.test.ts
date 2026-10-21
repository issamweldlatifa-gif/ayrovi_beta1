import { describe, expect, it } from 'vitest';
import {
  AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES,
  AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS,
  AYWEBS_AMAZON_EMPTY_PRICE_RETRIES,
  AYWEBS_AMAZON_EMPTY_PRICE_RETRY_DELAY_MS,
  ayWebsCaptureRetryDelayMs,
  canOpenAyWebsAddSheet,
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
  it('keeps Add to Cart locked until automatic page reading has resolved a product', () => {
    const ready = {
      enabled: true, loaded: true, native: true, busy: false, rejected: false, hasResolvedProduct: true,
    };
    expect(canOpenAyWebsAddSheet(ready)).toBe(true);
    expect(canOpenAyWebsAddSheet({ ...ready, hasResolvedProduct: false })).toBe(false);
    expect(canOpenAyWebsAddSheet({ ...ready, busy: true })).toBe(false);
    expect(canOpenAyWebsAddSheet({ ...ready, rejected: true })).toBe(false);
    expect(canOpenAyWebsAddSheet({ ...ready, loaded: false })).toBe(false);
  });

  it('retries only a bounded number of times when the merchant DOM has no price yet', () => {
    expect(AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES).toBe(2);
    expect(AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS).toBe(450);
    expect(hasAyWebsPriceCandidate([])).toBe(false);
    expect(shouldRetryAyWebsCaptureForPrice([], 0)).toBe(true);
    expect(shouldRetryAyWebsCaptureForPrice([], 1)).toBe(true);
    expect(shouldRetryAyWebsCaptureForPrice([], 2)).toBe(false);
    expect(shouldRetryAyWebsCaptureForPrice([{ text: '  $179.98  ' }], 0)).toBe(false);
  });

  it('gives Amazon extra bounded reads for its delayed mobile price while keeping other stores unchanged', () => {
    expect(AYWEBS_AMAZON_EMPTY_PRICE_RETRIES).toBe(4);
    expect(AYWEBS_AMAZON_EMPTY_PRICE_RETRY_DELAY_MS).toBe(900);
    expect(ayWebsCaptureRetryDelayMs('amazon')).toBe(900);
    expect(ayWebsCaptureRetryDelayMs('zalando')).toBe(450);
    expect(shouldRetryAyWebsCaptureForPrice([], 3, 'amazon')).toBe(true);
    expect(shouldRetryAyWebsCaptureForPrice([], 4, 'amazon')).toBe(false);
    expect(shouldRetryAyWebsCaptureForPrice([{ text: '$129.99' }], 0, 'amazon')).toBe(false);
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
