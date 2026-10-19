/**
 * AYWEBs — « Add to Cart » ne dépend jamais entièrement de la capture WebView.
 *
 * Le serveur traite la capture comme un ACCÉLÉRATEUR : un refus ou une absence
 * de capture ne bloque rien, la fiche est relue côté serveur (et servie du cache
 * si elle y est). Le client doit suivre la même règle : sinon une page muette,
 * un script non chargé ou une requête coupée pendant la capture font échouer
 * l'ajout entier, alors que la même fiche s'ouvre très bien depuis l'historique.
 *
 *  • capture impossible (script, page muette, message illisible) → on résout
 *    **sans capture** ;
 *  • résolution AVEC capture coupée par le réseau → une seule reprise **sans
 *    capture** (corps plus petit, même chemin que le web) ;
 *  • timeout serveur → pas de reprise (30 s de plus n'aident pas) ;
 *  • annulation (écran fermé) → on propage, sans rien relancer.
 */
import { isApiError } from '@/api/errors';

export interface CaptureFallbackInput<T> {
  /** Lecture de la page par le pont. Absente quand la capture n'est pas permise. */
  readCapture?: () => Promise<unknown>;
  /** Résolution serveur ; `capture` vaut `undefined` quand on résout sans capture. */
  resolve: (capture: unknown | undefined) => Promise<T>;
}

export interface CaptureFallbackResult<T> {
  outcome: T;
  /** La capture réellement utilisée (`undefined` si on a résolu sans). */
  capture: unknown | undefined;
}

const isAbortedFailure = (error: unknown): boolean => isApiError(error) && error.isAborted;
const isNetworkFailure = (error: unknown): boolean => isApiError(error) && error.isOffline;

export async function resolveWithCaptureFallback<T>(
  input: CaptureFallbackInput<T>,
): Promise<CaptureFallbackResult<T>> {
  let capture: unknown | undefined;
  if (input.readCapture) {
    try {
      capture = await input.readCapture();
    } catch (error) {
      if (isAbortedFailure(error)) throw error;
      capture = undefined;
    }
  }

  try {
    return { outcome: await input.resolve(capture), capture };
  } catch (error) {
    if (capture === undefined || !isNetworkFailure(error)) throw error;
    return { outcome: await input.resolve(undefined), capture: undefined };
  }
}

/**
 * Variante PARALLÈLE (18/10/2026): la lecture serveur part AVANT la fin de la
 * capture, pour que le serveur travaille pendant que la page se lit.
 *
 * En série, un Amazon dont la capture échoue coûte 15 s d'attente + 13–17 s de
 * lecture serveur (≈ 32 s). En parallèle: ≈ 17 s. Coût assumé: la lecture
 * serveur part même si la capture réussit ensuite (une lecture serveur de plus).
 *
 *  • capture réussie ⇒ résolution AVEC capture (rapide, sans requête marchande) ;
 *  • capture échouée ou absente ⇒ on attend la lecture parallèle déjà en route ;
 *  • capture réussie mais résolution coupée par le réseau ⇒ repli sur la lecture parallèle ;
 *  • annulation (écran fermé) ⇒ on propage.
 *
 * `onPhase` dit à l'écran ce qui se passe, pour que la progression ne mente pas.
 */
export type ParallelPhase = 'capture-ok' | 'server-only';

export interface ParallelCaptureInput<T> extends CaptureFallbackInput<T> {
  onPhase?: (phase: ParallelPhase) => void;
}

export async function resolveWithParallelCapture<T>(
  input: ParallelCaptureInput<T>,
): Promise<CaptureFallbackResult<T>> {
  // Lecture serveur sans capture, lancée tout de suite.
  const serverRead = input.resolve(undefined);
  // Évite un rejet « non géré » si la capture l'emporte et qu'on ne l'attend pas.
  serverRead.catch(() => undefined);

  let capture: unknown | undefined;
  if (input.readCapture) {
    try {
      capture = await input.readCapture();
    } catch (error) {
      if (isAbortedFailure(error)) throw error;
      capture = undefined;
    }
  }

  if (capture !== undefined) {
    input.onPhase?.('capture-ok');
    try {
      return { outcome: await input.resolve(capture), capture };
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
      // Repli: la lecture parallèle est déjà en route, on l'attend.
    }
  }

  input.onPhase?.('server-only');
  return { outcome: await serverRead, capture: undefined };
}

/**
 * Attend que la page finisse de charger avant de la lire (19/10/2026).
 *
 * Sans ça, « Add to Cart » peut lancer la capture pendant que la page Amazon
 * charge encore : le script lit un DOM incomplet (prix absent ⇒ NO_PRICE_TEXT).
 * On attend donc la fin du chargement, avec une borne : une page qui ne finit
 * jamais de charger (publicités, scripts) ne bloque pas l'ajout — on lit quand
 * même après `timeoutMs`.
 *
 * Renvoie `true` si la page est prête, `false` si la borne est atteinte.
 */
export async function waitForPageIdle(
  isLoading: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const intervalMs = options.intervalMs ?? 250;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let waited = 0;
  while (isLoading()) {
    if (waited >= timeoutMs) return false;
    await wait(intervalMs);
    waited += intervalMs;
  }
  return true;
}
