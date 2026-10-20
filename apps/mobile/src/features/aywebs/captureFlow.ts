/**
 * AYWEBS — règles de la lecture au clic « Add to Cart » (portées de fc3cce38, 19/10/2026).
 *
 *  • Prix absent dans la capture ⇒ on relance la capture, au plus
 *    AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES fois, après un court délai (le marchand
 *    rend souvent le prix après le DOM initial).
 *  • Jamais de feuille d'options avec un prix nul, non vérifié par le serveur,
 *    ou une devise non ISO-3 : on affiche un échec explicite à la place.
 */
import type { AyWebsResolveOutcome, AyWebsResolvedProduct } from '@/api/aywebs';
import { ApiError } from '@/api/errors';
import { resolveWithCaptureFallback } from '@/features/aywebs/captureFallback';

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

/**
 * Décision après résolution (19/10/2026) : ouvrir la feuille « Ajouter au panier » ou
 * expliquer pourquoi non. Une fiche sans prix/devise/titre vérifiés NE OUVRE PAS la
 * feuille, et l'erreur NOMME les champs manquants (`CAPTURE_INCOMPLETE`), au lieu du
 * message générique. Pur : aucune requête, aucune écriture de panier.
 */
export type AddToCartDecision =
  | { kind: 'sheet' }
  | { kind: 'refused'; error: ApiError };

export function addToCartDecision(outcome: AyWebsResolveOutcome): AddToCartDecision {
  if (hasVerifiedAyWebsQuote(outcome.product, outcome.quoteToken ?? '')) return { kind: 'sheet' };
  const missing = outcome.missing ?? [];
  if (missing.length) {
    return {
      kind: 'refused',
      error: new ApiError('http', 'Nous n’avons pas pu lire toutes les informations du produit.', {
        status: 422,
        code: 'CAPTURE_INCOMPLETE',
        missingFields: missing,
      }),
    };
  }
  return { kind: 'refused', error: new ApiError('http', 'Prix ou devise non vérifiés.', { code: 'PRICE_UNVERIFIED' }) };
}

/**
 * Parcours « Add to Cart » complet (19/10/2026), sans écran : une capture, UNE
 * résolution (avec capture, ou sans si elle échoue ou tarde), puis la décision.
 * Aucune requête panier ici : la feuille (et l'ajout) ne s'ouvre qu'ensuite.
 */
export interface AddToCartFlowInput {
  readCapture?: () => Promise<unknown>;
  resolve: (capture: unknown | undefined) => Promise<AyWebsResolveOutcome>;
  signal?: AbortSignal;
  onPhase?: (phase: 'reading' | 'resolving' | 'server-fallback') => void;
}

export async function resolveAddToCart(input: AddToCartFlowInput): Promise<{
  decision: AddToCartDecision;
  outcome: AyWebsResolveOutcome;
  capture: unknown | undefined;
}> {
  const { outcome, capture } = await resolveWithCaptureFallback<AyWebsResolveOutcome>(input);
  return { decision: addToCartDecision(outcome), outcome, capture };
}
