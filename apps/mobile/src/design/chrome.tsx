/**
 * Chrome réactif — la barre d'onglets s'efface vers le bas, revient vers le
 * haut (Q8, demande explicite).
 *
 * ── Pourquoi un magasin de module plutôt qu'un contexte ─────────────────────
 * Les émetteurs sont les ÉCRANS (ils savent où en est le défilement) et
 * l'abonné est la BARRE, qui vit dans un autre sous-arbre du routeur. Les
 * relier par un contexte obligerait à envelopper le routeur entier pour une
 * seule valeur booléenne. Un magasin de module à un seul abonné est plus
 * simple et ne survit pas à l'écran : rien à réinitialiser.
 *
 * ── La décision est une fonction PURE ───────────────────────────────────────
 * `chromeHiddenFor` vit dans `chromeLogic.ts`, sans aucune dépendance à React
 * Native : c'est ce qui permet de tester le COMPORTEMENT (seuil, haut de page,
 * tremblement) au lieu de tester du React.
 *
 * ── L'animation (refaite le 12/11/2026) ────────────────────────────────────
 * Avant : `display: 'none'` + `LayoutAnimation`. La barre disparaissait d'un
 * coup (un `display` ne s'anime pas), l'écran entier changeait de hauteur, et
 * `LayoutAnimation` — GLOBAL — animait au passage tout autre changement de mise
 * en page du même instant (images, carrousel) : c'est le « saut » ressenti.
 * Pire : en bas de page, l'écran qui grandit fait reculer le défilement, lu
 * comme une remontée ⇒ la barre ressortait, l'écran rétrécissait… et ainsi de
 * suite (clignotement).
 *
 * Maintenant : la barre est POSÉE au-dessus de l'écran (voir
 * `app/(tabs)/_layout.tsx`, `SlidingTabBar`) et ne fait que GLISSER
 * (`translateY`, fil natif). Aucune hauteur ne change jamais : l'écran réserve
 * une fois pour toutes la place de la barre (`AppScreen hasBottomBar`). La
 * décision suit une course cumulée (`nextChromeTravel`), pas un écart entre
 * deux événements.
 */
import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { nextChromeTravel } from './chromeLogic';

/* ── Magasin minimal ──────────────────────────────────────────────────────── */

let chromeHidden = false;
const listeners = new Set<() => void>();

const emit = () => { for (const listener of listeners) listener(); };

export function setChromeHidden(next: boolean): void {
  if (next === chromeHidden) return;
  chromeHidden = next;
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** État lu par la barre d'onglets. */
export function useChromeHidden(): boolean {
  return useSyncExternalStore(subscribe, () => chromeHidden, () => false);
}

/**
 * Gestionnaire de défilement à poser sur les écrans qui défilent.
 *
 * `scrollEventThrottle` doit être réglé par l'appelant : sans lui, React
 * Native ne transmet qu'un événement de temps en temps et le seuil ne serait
 * presque jamais atteint.
 */
export function useChromeScroll() {
  // Point de retournement propre à l'écran ; l'état visible/masqué, lui, est
  // partagé (un changement d'onglet peut l'avoir remis à « visible »).
  const anchor = useRef(0);

  return useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const maxY = contentSize && layoutMeasurement
      ? Math.max(0, contentSize.height - layoutMeasurement.height)
      : undefined;
    const next = nextChromeTravel({ hidden: chromeHidden, anchor: anchor.current }, contentOffset.y, { maxY });
    anchor.current = next.anchor;
    setChromeHidden(next.hidden);
  }, []);
}

/** Remet la barre visible — appelé en quittant un écran (voir les onglets). */
export function revealChrome(): void {
  previousReset();
  setChromeHidden(false);
}

function previousReset(): void {
  // Les écrans gardent leur propre `previousY` ; forcer la révélation suffit :
  // au prochain défilement, la référence locale est remise à jour.
}
