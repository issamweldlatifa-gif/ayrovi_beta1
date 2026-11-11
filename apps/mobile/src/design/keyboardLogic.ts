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

