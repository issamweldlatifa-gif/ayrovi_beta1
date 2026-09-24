import type { AyrovixCandidate } from '../types';
import { isUnsafeHostname } from '../../services/safeUrl';
import { isUsedListing } from './productCondition';

// NEUF UNIQUEMENT (demande client 24/09/2026) : toute annonce explicitement
// d'occasion est écartée — une seule photo, pas de fiche complète, isolation
// cassée. Appliqué aux deux niveaux (strict et lenient) ci-dessous.
function notUsed(candidate: AyrovixCandidate): boolean {
  return !isUsedListing({ title: candidate.title, description: candidate.description, sourceUrl: candidate.sourceUrl });
}

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

// D2-10: lenient fallback — visual matches without price are still useful
// (user can request manual quote PENDING_MANUAL instead of zero results)
export function isLenientCandidate(candidate: AyrovixCandidate): boolean {
  return hasValidProductUrl(candidate.sourceUrl)
    && typeof candidate.title === 'string'
    && candidate.title.trim().length >= 4;
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
    .filter(notUsed)
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

export function filterLenientCandidates(items: AyrovixCandidate[], limit = 8): AyrovixCandidate[] {
  const seen = new Set<string>();
  return items
    .filter(isLenientCandidate)
    .filter(notUsed)
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

export function filterWithFallback(items: AyrovixCandidate[], limit = 8): AyrovixCandidate[] {
  const strict = filterDisplayableCandidates(items, limit);
  if (strict.length > 0) return strict;
  const lenient = filterLenientCandidates(items, limit);
  if (lenient.length) console.warn(`[AYROVIX candidatePolicy] strict filter empty — lenient fallback ${lenient.length} PENDING candidates`);
  return lenient;
}
