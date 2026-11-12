/**
 * Mouvement de navigation (11/11/2026) — une seule source pour tout le Stack.
 *
 *  • push   : l'écran suivant glisse depuis le bord de lecture (droite en
 *             français, gauche en arabe), retour au geste du bord ;
 *  • sheet  : connexion, assistant — monte depuis le bas comme une feuille ;
 *  • media  : Reels, Lens, stories — fondu court : la vidéo ou la caméra ne
 *             glisse jamais (c'est ce qui donne l'impression « lourde ») ;
 *  • moins de mouvement (réglage système) : aucune animation.
 *
 * Durées courtes (iOS ; Android suit la courbe native du système) : 260 ms
 * pour pousser, 220 ms pour un fondu — la référence des applications sociales.
 */
export type StackAnimation = 'slide_from_right' | 'slide_from_left' | 'slide_from_bottom' | 'fade' | 'none';

export interface StackMotionOptions {
  animation: StackAnimation;
  animationDuration?: number;
  gestureEnabled?: boolean;
  fullScreenGestureEnabled?: boolean;
  animationMatchesGesture?: boolean;
}

export const NAV_PUSH_MS = 260;
export const NAV_FADE_MS = 220;

export function stackMotion(rtl: boolean, reduce: boolean): {
  push: StackMotionOptions; sheet: StackMotionOptions; media: StackMotionOptions;
} {
  if (reduce) {
    const none: StackMotionOptions = { animation: 'none', gestureEnabled: true };
    return { push: none, sheet: none, media: none };
  }
  return {
    push: {
      animation: rtl ? 'slide_from_left' : 'slide_from_right',
      animationDuration: NAV_PUSH_MS,
      gestureEnabled: true,
      fullScreenGestureEnabled: true,
      animationMatchesGesture: true,
    },
    sheet: { animation: 'slide_from_bottom', animationDuration: NAV_PUSH_MS, gestureEnabled: true },
    media: { animation: 'fade', animationDuration: NAV_FADE_MS, gestureEnabled: true },
  };
}

/**
 * Changement d'onglet (12/11/2026) — fondu croisé très court, comme les
 * applications sociales : l'onglet ne « saute » plus, sans glissement latéral
 * (les onglets sont des destinations, pas une pile). Moins de mouvement ⇒ rien.
 */
export const NAV_TAB_MS = 150;

export interface TabMotionOptions {
  animation: 'fade' | 'none';
  transitionSpec?: { animation: 'timing'; config: { duration: number } };
}

export function tabMotion(reduce: boolean): TabMotionOptions {
  if (reduce) return { animation: 'none' };
  return { animation: 'fade', transitionSpec: { animation: 'timing', config: { duration: NAV_TAB_MS } } };
}
