import type { AyrovixCandidate } from '../types';
import { isUnsafeHostname } from '../../services/safeUrl';

/**
 * One policy for every AYROVIX surface (Lens, QR, Assistant and alternates).
 * A visible shopping result must be actionable and auditable: positive price,
 * explicit ISO-like currency and a public merchant URL.
 */
export function hasValidProductUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length > 4096) return false;
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol)
      && !url.username
      && !url.password
      && !isUnsafeHostname(url.hostname);
  } catch {
    return false;
  }
}

export function isDisplayableCandidate(candidate: AyrovixCandidate): boolean {
  return Number.isFinite(Number(candidate.price))
    && Number(candidate.price) > 0
    && typeof candidate.currency === 'string'
    && /^[A-Z]{3}$/.test(candidate.currency.toUpperCase())
    && hasValidProductUrl(candidate.sourceUrl);
}

export function withDisplayRating(candidate: AyrovixCandidate): AyrovixCandidate {
  const merchantRating = Number(candidate.rating);
  if (Number.isFinite(merchantRating) && merchantRating > 0 && merchantRating <= 5) {
    return { ...candidate, rating: Math.round(merchantRating * 10) / 10, ratingKind: candidate.ratingKind || 'merchant' };
  }
  return {
    ...candidate,
    rating: Math.round(Math.max(1, Math.min(5, candidate.match / 20)) * 10) / 10,
    ratingCount: null,
    ratingKind: 'match',
  };
}

export function filterDisplayableCandidates(items: AyrovixCandidate[], limit = 8): AyrovixCandidate[] {
  const seen = new Set<string>();
  return items
    .filter(isDisplayableCandidate)
    .map(withDisplayRating)
    .filter((item) => {
      const key = `${item.sourceUrl}|${item.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.match - left.match)
    .slice(0, limit);
}
