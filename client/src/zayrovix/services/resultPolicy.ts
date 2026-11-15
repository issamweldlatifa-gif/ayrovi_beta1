import type { ZayrovixCandidate, ZayrovixProduct } from '../types';

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

export function isDisplayableCandidate(candidate: ZayrovixCandidate): boolean {
  return Number.isFinite(Number(candidate.price))
    && Number(candidate.price) > 0
    && Boolean(candidate.currency)
    && validProductUrl(candidate.sourceUrl);
}

// D2-10 lenient PENDING — valid URL + title, price à confirmer (no 0-result when lens has matches without price)
export function isLenientCandidate(candidate: ZayrovixCandidate): boolean {
  return validProductUrl(candidate.sourceUrl)
    && typeof candidate.title === 'string'
    && candidate.title.trim().length >= 4;
}

export function isDisplayableOrPending(candidate: ZayrovixCandidate): boolean {
  return isDisplayableCandidate(candidate) || isLenientCandidate(candidate);
}

export function isDisplayableProduct(product: ZayrovixProduct): boolean {
  return Number.isFinite(Number(product.price))
    && Number(product.price) > 0
    && Boolean(product.currency)
    && validProductUrl(product.sourceUrl);
}
