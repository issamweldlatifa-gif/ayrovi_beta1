import type { AyrovixCandidate, AyrovixProduct } from '../types';
import { presentCandidate } from './presentCandidate';

const PRIVATE_HOST = /^(?:localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[?::1\]?)$/i;

export function validProductUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol)
      && !url.username
      && !url.password
      && !PRIVATE_HOST.test(url.hostname)
      && !url.hostname.endsWith('.local');
  } catch { return false; }
}

/** Show only an actual merchant-provided review score, never a converted match percentage. */
export function displayRating(candidate: { rating?: number | null; ratingKind?: string }): number | null {
  const rating = candidate.rating;
  return candidate.ratingKind === 'merchant' && typeof rating === 'number' && Number.isFinite(rating) && rating > 0 && rating <= 5
    ? Math.round(rating * 10) / 10 : null;
}

export function isDisplayableCandidate(candidate: AyrovixCandidate): boolean {
  const view = presentCandidate(candidate);
  return typeof view.price === 'number' && Number.isFinite(view.price)
    && view.price > 0 && Boolean(view.currency)
    && validProductUrl(view.sourceUrl);
}

// D2-10 lenient PENDING — valid URL + title, price à confirmer (no 0-result when lens has matches without price)
export function isLenientCandidate(candidate: AyrovixCandidate): boolean {
  const view = presentCandidate(candidate);
  return validProductUrl(view.sourceUrl) && view.title.trim().length >= 4;
}

export function isDisplayableOrPending(candidate: AyrovixCandidate): boolean {
  return isDisplayableCandidate(candidate) || isLenientCandidate(candidate);
}

export function isDisplayableProduct(product: AyrovixProduct): boolean {
  const quote = product.canonical;
  const price = quote ? quote.pricing.sourcePrice : product.price;
  const currency = quote ? quote.pricing.sourceCurrency : product.currency;
  const sourceUrl = quote ? quote.identity.sourceUrl : product.sourceUrl;
  return typeof price === 'number' && Number.isFinite(price) && price > 0
    && Boolean(currency) && validProductUrl(sourceUrl || '');
}
