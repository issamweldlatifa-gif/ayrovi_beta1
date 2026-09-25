import type { AyrovixCandidate } from '../types';
import { isUnsafeHostname } from '../../services/safeUrl';
import { isUsedListing } from './productCondition';

// NEUF UNIQUEMENT (demande client 24/09/2026) : toute annonce explicitement
// d'occasion est écartée — une seule photo, pas de fiche complète, isolation
// cassée. Appliqué aux deux niveaux (strict et lenient) ci-dessous.
function notUsed(candidate: AyrovixCandidate): boolean {
  return !isUsedListing({
    title: candidate.title,
    description: candidate.description,
    sourceUrl: candidate.sourceUrl,
    sourceCondition: candidate.sourceCondition,
  });
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

/* ── NIVEAUX DE CONFIANCE MARCHAND (24/09/2026, demande client) ──
 * « trusted »  : notre catalogue, ou un marchand DÉJÀ PROUVÉ (profil complet
 *                récupéré par le passé : description + ≥2 photos) → priorité
 *                d'affichage.
 * « verified » : marchand inconnu qui se PROUVE sur la fiche courante :
 *                ≥2 images + description réelle + disponibilité explicite.
 * « unknown »  : tout le reste → affiché APRÈS les deux niveaux supérieurs.
 * Aucune invention : le trust se gagne par des preuves, jamais par une liste
 * figée sans historique. */
export type MerchantTrust = 'trusted' | 'verified' | 'unknown';

const trustedMerchantHosts = new Set<string>();

function hostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Un profil complet crawlé prouve le marchand (appelé par product profiles). */
export function registerTrustedMerchantHost(rawUrl: string): void {
  const host = hostOf(rawUrl);
  if (host) trustedMerchantHosts.add(host);
}

export function isTrustedMerchantHost(rawUrl: string): boolean {
  return trustedMerchantHosts.has(hostOf(rawUrl));
}

/** Disponibilité explicite uniquement — « unknown » n'est pas une preuve. */
function hasExplicitAvailability(candidate: AyrovixCandidate): boolean {
  const availability = (candidate as { availability?: string }).availability;
  return availability === 'in_stock' || availability === 'limited';
}

export function merchantTrust(candidate: AyrovixCandidate): MerchantTrust {
  if (candidate.kind === 'catalog' || isTrustedMerchantHost(candidate.sourceUrl)) return 'trusted';
  const images = new Set([candidate.image, ...(Array.isArray(candidate.images) ? candidate.images : [])].filter(Boolean));
  const hasEnoughImages = images.size >= 2;
  const hasRealDescription = typeof candidate.description === 'string' && candidate.description.trim().length >= 40;
  if (hasEnoughImages && hasRealDescription && hasExplicitAvailability(candidate)) return 'verified';
  return 'unknown';
}

const TRUST_RANK: Record<MerchantTrust, number> = { trusted: 0, verified: 1, unknown: 2 };

function byTrustThenMatch(left: AyrovixCandidate, right: AyrovixCandidate): number {
  const tierDelta = TRUST_RANK[merchantTrust(left)] - TRUST_RANK[merchantTrust(right)];
  return tierDelta !== 0 ? tierDelta : right.match - left.match;
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
    .sort(byTrustThenMatch)
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
    .sort(byTrustThenMatch)
    .slice(0, limit);
}

export function filterWithFallback(items: AyrovixCandidate[], limit = 8): AyrovixCandidate[] {
  const strict = filterDisplayableCandidates(items, limit);
  if (strict.length > 0) return strict;
  const lenient = filterLenientCandidates(items, limit);
  if (lenient.length) console.warn(`[AYROVIX candidatePolicy] strict filter empty — lenient fallback ${lenient.length} PENDING candidates`);
  return lenient;
}
