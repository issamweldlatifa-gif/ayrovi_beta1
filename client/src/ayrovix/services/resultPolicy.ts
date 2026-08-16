import type { AyrovixCandidate, AyrovixProduct } from '../types';

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

export function displayRating(candidate: Pick<AyrovixCandidate, 'rating' | 'match'>): number {
  const rating = Number(candidate.rating);
  return Number.isFinite(rating) && rating > 0 && rating <= 5
    ? Math.round(rating * 10) / 10
    : Math.round(Math.max(1, Math.min(5, candidate.match / 20)) * 10) / 10;
}

export function isDisplayableCandidate(candidate: AyrovixCandidate): boolean {
  return Number.isFinite(Number(candidate.price))
    && Number(candidate.price) > 0
    && Boolean(candidate.currency)
    && validProductUrl(candidate.sourceUrl);
}

export function isDisplayableProduct(product: AyrovixProduct): boolean {
  return Number.isFinite(Number(product.price))
    && Number(product.price) > 0
    && Boolean(product.currency)
    && validProductUrl(product.sourceUrl);
}
