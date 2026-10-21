import type { AyWebsProduct } from '@/api/aywebs';

export const AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES = 2;
export const AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS = 450;

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
): boolean {
  return Number.isInteger(retryCount)
    && retryCount >= 0
    && retryCount < AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES
    && !hasAyWebsPriceCandidate(candidates);
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
