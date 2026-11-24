/**
 * État de chargement de l'accueil — logique pure, donc testable sans rendu.
 *
 * ── Le défaut corrigé ─────────────────────────────────────────────────────
 * Chaque bloc de l'accueil (Hero, cover, Stories, Reels, Watshis…) décide seul
 * de disparaître quand SA requête échoue. C'est le bon comportement bloc par
 * bloc, mais hors ligne TOUS échouent : l'accueil devenait une page presque
 * vide (en-tête, onglets, pied de page) sans un mot d'explication — un client
 * conclut que l'application est cassée, pas que le réseau manque.
 *
 * On n'affiche donc l'état d'échec que dans le seul cas où il est vrai :
 * aucune requête n'a réussi, aucune n'attend encore, et au moins une a échoué.
 * Une seule réponse valide (même vide, même « section désactivée ») suffit à
 * garder la page silencieuse — on ne crie pas « hors ligne » pour une rubrique
 * secondaire.
 */
export interface HomeQueryState {
  isPending: boolean;
  isError: boolean;
}

export function homeLoadFailed(states: readonly HomeQueryState[]): boolean {
  if (!states.length) return false;
  if (states.some((state) => state.isPending)) return false;
  return states.every((state) => state.isError);
}
