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
 * ── L'animation ────────────────────────────────────────────────────────────
 * `LayoutAnimation` plutôt qu'un `Animated.Value` : la barre d'onglets est
 * construite par React Navigation, ce n'est PAS un composant animé, et y
 * injecter un nœud animé ne produirait rien. Intercaler notre propre barre
 * aurait fonctionné — au prix d'un composant qui réimplémente les onglets.
 * `LayoutAnimation` anime le changement de hauteur en une ligne, sans rien
 * réimplémenter.
 */
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { LayoutAnimation, Platform, UIManager, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { chromeHiddenFor } from './chromeLogic';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ── Magasin minimal ──────────────────────────────────────────────────────── */

let chromeHidden = false;
const listeners = new Set<() => void>();

const emit = () => { for (const listener of listeners) listener(); };

export function setChromeHidden(next: boolean): void {
  if (next === chromeHidden) return;
  // configureNext doit être appelé AVANT le changement d'état : c'est lui qui
  // transforme la disparition sèche en glissement.
  try {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  } catch {
    // Animation indisponible : la barre disparaîtra sèchement, ce qui reste
    // mieux que pas de réaction du tout.
  }
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
  const previousY = useRef(0);

  return useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    setChromeHidden(chromeHiddenFor(y, previousY.current, chromeHidden));
    previousY.current = y;
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
