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
import { captureMatchesPageUrl } from '@/features/aywebs/webNavigation';

export const AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES = 2;
export const AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS = 450;

/**
 * Délais de relance quand la capture revient SANS prix (26/10/2026).
 *
 * Le délai fixe de 450 ms supposait un prix qui arrive juste après le DOM
 * initial. Sur les fiches rendues par une APPLICATION MONO-PAGE (SHEIN, TEMU),
 * le prix arrive après l'hydratation : trois relances à 450 ms retombaient
 * toutes dans la même fenêtre vide, et le bouton restait en « Chargement… »
 * pour rien. On attend donc de plus en plus (borné, total ≈ 3,2 s) — et on
 * s'arrête de toute façon au nombre de relances prévu.
 */
export const AYWEBS_CAPTURE_PRICE_RETRY_DELAYS_MS = [450, 1200, 1600] as const;

/** Délai de la relance n° `retryCount` (0 = première relance). */
export function priceRetryDelayMs(retryCount: number): number {
  const schedule = AYWEBS_CAPTURE_PRICE_RETRY_DELAYS_MS;
  if (!Number.isInteger(retryCount) || retryCount < 0) return AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS;
  return schedule[Math.min(retryCount, schedule.length - 1)];
}

/**
 * Budget de la PRÉ-LECTURE silencieuse (à l'ouverture d'une fiche).
 *
 * Elle ne doit jamais tenir l'écran : c'est un accélérateur, pas une condition.
 * Au-delà de ce budget, l'écran cesse d'afficher « Chargement… » et le client
 * peut appuyer — l'appui relit la page s'il le faut.
 */
export const AYWEBS_PREFETCH_BUDGET_MS = 12_000;

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
 * Délai accordé au bouton « Add to Cart » avant d'ouvrir la feuille (20/10/2026).
 * Tout compris : préparation du lecteur, attente de la page, lecture. Au-delà,
 * le bouton n'attend plus : il explique ce qui manque.
 */

/**
 * Âge maximal d'une lecture faite à l'ouverture de la page (20/10/2026). Au-delà, on relit
 * la page : le client a pu changer de taille ou de couleur sans que l'URL change.
 */
export const AYWEBS_PREFETCH_MAX_AGE_MS = 30_000;

export interface PrefetchEntry {
  url: string;
  at: number;
  status: 'reading' | 'ok' | 'failed';
}

/**
 * Faut-il réutiliser la lecture faite à l'ouverture (20/10/2026) ? Oui si elle est pour cette
 * page, et soit encore en cours, soit terminée depuis moins de `AYWEBS_PREFETCH_MAX_AGE_MS`.
 * Sinon (absente, en échec, périmée, autre page) : on relit au moment du clic.
 */
export function canReusePrefetch(entry: PrefetchEntry | null, pageUrl: string, now: number): boolean {
  if (!entry || (entry.url !== pageUrl && !captureMatchesPageUrl(entry.url, pageUrl))) return false;
  if (entry.status === 'reading') return true;
  return entry.status === 'ok' && now - entry.at < AYWEBS_PREFETCH_MAX_AGE_MS;
}

const BUDGET_EXCEEDED: unique symbol = Symbol('ayweb-add-budget-exceeded');

/** Course entre une promesse et le délai : rend la valeur, ou `BUDGET_EXCEEDED`. */
function withBudget<T>(promise: Promise<T>, ms: number): Promise<T | typeof BUDGET_EXCEEDED> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(BUDGET_EXCEEDED), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Refus clair quand la page n'a pas été lue à temps : nomme les deux champs. */
function captureRefusal(): ApiError {
  return new ApiError('http', 'Nous n’avons pas pu lire le titre ou le prix de ce produit.', {
    status: 422,
    code: 'CAPTURE_INCOMPLETE',
    missingFields: ['title', 'price'],
  });
}

/**
 * Parcours « Add to Cart » (20/10/2026, réécrit) :
 *
 *  1. la page est lue DANS le navigateur du client, jusqu'à la fin de la lecture
 *     (sans minuteur : `waitForCapture`). Le bouton reste en chargement ;
 *  2. lecture réussie ⇒ UNE résolution serveur AVEC cette lecture (vérification) ;
 *  3. lecture en échec ⇒ refus immédiat `CAPTURE_INCOMPLETE`,
 *     SANS lecture serveur de repli (elle prend 10 s et échoue sur Amazon) ;
 *  4. annulation (écran fermé, nouvel appui) ⇒ on propage, sans rien ouvrir.
 *
 * Sans `budgetMs`, l'ancien chemin (repli serveur) reste disponible pour les
 * appelants qui le demandent explicitement.
 */
export interface AddToCartFlowInput {
  readCapture?: () => Promise<unknown>;
  resolve: (capture: unknown | undefined) => Promise<AyWebsResolveOutcome>;
  signal?: AbortSignal;
  onPhase?: (phase: 'reading' | 'resolving' | 'server-fallback') => void;
  /** Délai de lecture (optionnel). Le bouton « Add » ne le passe PAS : il attend la lecture. */
  budgetMs?: number;
  /** Attendre la fin de la lecture, sans délai ni minuteur (succès ou échec seulement). */
  waitForCapture?: boolean;
  /** Appelé quand le délai expire, pour libérer la page en cours de lecture. */
  onBudgetExceeded?: () => void;
}

export interface AddToCartFlowResult {
  decision: AddToCartDecision;
  /** Absent quand la page n'a pas été lue (aucune résolution n'a eu lieu). */
  outcome: AyWebsResolveOutcome | undefined;
  capture: unknown | undefined;
}

export async function resolveAddToCart(input: AddToCartFlowInput): Promise<AddToCartFlowResult> {
  if ((input.budgetMs !== undefined || input.waitForCapture === true) && input.readCapture) {
    if (input.signal?.aborted) throw new ApiError('aborted', 'Requête interrompue.');
    input.onPhase?.('reading');
    let captured: unknown | typeof BUDGET_EXCEEDED;
    try {
      captured = input.budgetMs !== undefined
        ? await withBudget(input.readCapture(), input.budgetMs)
        : await input.readCapture();
    } catch (error) {
      if (input.signal ? input.signal.aborted : (error instanceof ApiError && error.isAborted)) throw error;
      captured = undefined;
    }
    if (input.signal?.aborted) throw new ApiError('aborted', 'Requête interrompue.');
    if (captured === BUDGET_EXCEEDED) input.onBudgetExceeded?.();
    if (captured === BUDGET_EXCEEDED || captured === undefined) {
      return { decision: { kind: 'refused', error: captureRefusal() }, outcome: undefined, capture: undefined };
    }
    input.onPhase?.('resolving');
    const outcome = await input.resolve(captured);
    return { decision: addToCartDecision(outcome), outcome, capture: captured };
  }

  const { outcome, capture } = await resolveWithCaptureFallback<AyWebsResolveOutcome>(input);
  return { decision: addToCartDecision(outcome), outcome, capture };
}


/**
 * Qui a demandé la lecture de la page ?
 *   • `user`   — « Add to Cart » : le client attend une réponse, le bouton tourne ;
 *   • `silent` — la pré-lecture automatique à l'ouverture de la fiche.
 */
export type ReadIntent = 'user' | 'silent';

/**
 * Faut-il lancer une nouvelle lecture dans le WebView, ou se rattacher à celle
 * qui tourne déjà ?
 *
 * Constaté le 23/10/2026 (capture d'écran du client) : à 04:14:19 « lecture
 * demandée », à 04:14:28 « script injecté » ; la page finit de charger, la
 * pré-lecture silencieuse démarre **au même instant** et remplace la lecture du
 * client. Résultat : « Requête interrompue » pour l'appui du client, deux
 * scripts injectés pour rien, et un bouton qui reste en « Chargement… ».
 *
 * Règle : une lecture silencieuse ne remplace JAMAIS une lecture demandée par le
 * client — elle s'y rattache (même page, même capture). Le client, lui, reste
 * prioritaire : son appui remplace n'importe quelle lecture en cours.
 */
export function readDecision(
  inFlight: { intent: ReadIntent; pageUrl: string } | null,
  intent: ReadIntent,
  pageUrl: string,
): 'start' | 'join' {
  if (!inFlight) return 'start';
  const sameDocument = inFlight.pageUrl === pageUrl || captureMatchesPageUrl(inFlight.pageUrl, pageUrl);
  if (intent === 'silent' && inFlight.intent === 'user' && sameDocument) return 'join';
  return 'start';
}

/** Filet de sécurité de la lecture WebView : au-delà, on rend la main (le bouton redevient normal). */
export const AYWEBS_CAPTURE_WATCHDOG_MS = 20_000;
