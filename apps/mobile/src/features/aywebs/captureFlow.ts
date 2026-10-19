/**
 * AYWEBS — règles de la lecture au clic « Add to Cart » (portées de fc3cce38, 19/10/2026).
 *
 *  • Prix absent dans la capture ⇒ on relance la capture, au plus
 *    AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES fois, après un court délai (le marchand
 *    rend souvent le prix après le DOM initial).
 *  • Jamais de feuille d'options avec un prix nul, non vérifié par le serveur,
 *    ou une devise non ISO-3 : on affiche un échec explicite à la place.
 */
import type { AyWebsResolvedProduct } from '@/api/aywebs';

export const AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES = 2;
export const AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS = 450;

export interface AyWebsPriceCandidate {
  text: string;
}

/** Extrait les candidats-prix de la capture (tableau `priceCandidates`, sinon vide). */
export function priceCandidatesOf(capture: Record<string, unknown>): AyWebsPriceCandidate[] {
  const raw = capture.priceCandidates;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is AyWebsPriceCandidate =>
      typeof entry === 'object' && entry !== null && typeof (entry as { text?: unknown }).text === 'string',
  );
}

export function hasAyWebsPriceCandidate(candidates: readonly AyWebsPriceCandidate[]): boolean {
  return candidates.some((candidate) => candidate.text.trim().length > 0);
}

/** Relance seulement si aucun texte de prix n'a été lu, et dans la limite. */
export function shouldRetryAyWebsCaptureForPrice(
  candidates: readonly AyWebsPriceCandidate[],
  retryCount: number,
): boolean {
  return Number.isInteger(retryCount)
    && retryCount >= 0
    && retryCount < AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES
    && !hasAyWebsPriceCandidate(candidates);
}

/** Vérifie que le serveur a validé le prix ET la devise, et qu'un devis signé existe. */
export function hasVerifiedAyWebsQuote(
  product: Pick<AyWebsResolvedProduct, 'price' | 'currency' | 'priceVerified' | 'currencyVerified'>,
  quoteToken: string,
): boolean {
  return product.price !== null
    && Number.isFinite(product.price)
    && product.price > 0
    && /^[A-Z]{3}$/.test(product.currency)
    && product.priceVerified
    && product.currencyVerified
    && Boolean(quoteToken.trim());
}
