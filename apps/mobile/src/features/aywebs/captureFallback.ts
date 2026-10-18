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
