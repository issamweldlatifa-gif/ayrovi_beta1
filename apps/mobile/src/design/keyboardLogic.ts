/**
 * Calculs PURS du clavier (sans React Native) — testables sous vitest.
 * Voir `design/keyboard.tsx` pour le pourquoi.
 */
export interface KeyboardCoordinates {
  screenY?: number;
  height?: number;
}

/** Recouvrement effectif d'une vue par le clavier, en points (≥ 0, arrondi). */
export function keyboardOverlap(viewTop: number, viewHeight: number, keyboardTop: number | null): number {
  if (keyboardTop === null || !Number.isFinite(keyboardTop)) return 0;
  return Math.max(0, Math.round(viewTop + viewHeight - keyboardTop));
}

/**
 * Repli sans mesure (12/11/2026) — ce que fournirait `react-native-keyboard-
 * controller`, sans module natif : quand la vue ne peut pas être mesurée
 * (`measureInWindow` absent, vue pas encore posée ⇒ hauteur 0 / NaN), on
 * suppose qu'elle touche le bas de la fenêtre : recouvrement = fenêtre − haut
 * du clavier. Jamais négatif, jamais plus grand que la fenêtre.
 */
export function fallbackKeyboardOverlap(windowHeight: number, keyboardTop: number | null): number {
  if (keyboardTop === null || !Number.isFinite(keyboardTop) || !(windowHeight > 0)) return 0;
  return Math.round(Math.min(windowHeight, Math.max(0, windowHeight - keyboardTop)));
}

/** Une mesure `measureInWindow` est-elle exploitable ? (vue posée, nombres finis) */
export function measuredViewIsUsable(y: number, height: number): boolean {
  return Number.isFinite(y) && Number.isFinite(height) && height > 0;
}

/**
 * Haut du clavier, dans les coordonnées de l'écran. `screenY` est la source ;
 * s'il manque ou est aberrant (certains claviers tiers), on le déduit de la
 * hauteur de l'écran.
 */
export function keyboardTopFrom(
  coordinates: KeyboardCoordinates | null | undefined,
  screenHeight: number,
): number | null {
  if (!coordinates) return null;
  const height = Number(coordinates.height ?? 0);
  const screenY = Number(coordinates.screenY);
  if (Number.isFinite(screenY) && screenY > 0 && screenY < screenHeight + 1) return screenY;
  if (Number.isFinite(height) && height > 0) return screenHeight - height;
  return null;
}


/**
 * Feuille de commentaires ANCRÉE PAR LE HAUT (11/11/2026 — « comme Instagram /
 * Facebook, sans monter ni descendre avec la frappe ») : à l'ouverture du
 * clavier, le bord HAUT de la feuille ne bouge pas ; seul son bord bas (le
 * champ) monte sur le clavier, la liste perd la part recouverte.
 *
 * Hauteur visible de la feuille :
 *   • sans clavier : `restHeight` ;
 *   • avec clavier : `restHeight − overlap` (haut immobile) ;
 *   • jamais moins que `minHeight` (en-tête + champ + quelques lignes) — seul
 *     cas où le haut doit monter, clavier très grand ;
 *   • jamais plus que `maxHeight` (espace visible au-dessus du clavier).
 */
export function anchoredSheetHeight(restHeight: number, overlap: number, minHeight: number, maxHeight: number): number {
  const rest = Math.max(0, restHeight);
  if (!(overlap > 0)) return Math.min(rest, Math.max(0, maxHeight));
  const ceiling = Math.max(0, maxHeight);
  return Math.round(Math.min(ceiling, Math.max(rest - overlap, Math.min(minHeight, ceiling))));
}
