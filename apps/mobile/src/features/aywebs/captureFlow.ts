import type { AyWebsProduct } from '@/api/aywebs';

export const AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES = 2;
export const AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS = 450;
export const AYWEBS_AMAZON_EMPTY_PRICE_RETRIES = 4;
export const AYWEBS_AMAZON_EMPTY_PRICE_RETRY_DELAY_MS = 900;

export function ayWebsCaptureRetryDelayMs(storeId: string): number {
  return storeId.trim().toLowerCase() === 'amazon'
    ? AYWEBS_AMAZON_EMPTY_PRICE_RETRY_DELAY_MS
    : AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS;
}

export interface AyWebsPriceCandidate {
  text: string;
}

export function hasAyWebsPriceCandidate(candidates: readonly AyWebsPriceCandidate[]): boolean {
  return candidates.some((candidate) => candidate.text.trim().length > 0);
}

/** Retry only a bounded number of times when the merchant has not rendered a price yet. */
export function shouldRetryAyWebsCaptureForPrice(
  candidates: readonly AyWebsPriceCandidate[],
  retryCount: number,
  storeId = '',
): boolean {
  const maxRetries = storeId.trim().toLowerCase() === 'amazon'
    ? AYWEBS_AMAZON_EMPTY_PRICE_RETRIES
    : AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES;
  return Number.isInteger(retryCount)
    && retryCount >= 0
    && retryCount < maxRetries
    && !hasAyWebsPriceCandidate(candidates);
}

/** Keep the reader CTA unavailable while reading and after a rejected page. */
export function canStartAyWebsCapture(input: {
  enabled: boolean;
  loaded: boolean;
  native: boolean;
  busy: boolean;
  rejected: boolean;
}): boolean {
  return input.enabled && input.loaded && input.native && !input.busy && !input.rejected;
}

/** Never open the product/options sheet for an unverified or zero-price result. */
export function hasVerifiedAyWebsQuote(
  product: Pick<AyWebsProduct, 'sourcePrice' | 'currency' | 'priceVerified' | 'currencyVerified'>,
  quoteToken: string,
): boolean {
  return product.sourcePrice !== null
    && Number.isFinite(product.sourcePrice)
    && product.sourcePrice > 0
    && /^[A-Z]{3}$/.test(product.currency)
    && product.priceVerified
    && product.currencyVerified
    && Boolean(quoteToken.trim());
}
