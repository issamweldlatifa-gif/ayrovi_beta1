/**
 * Feuille de résultats de Z Lens — logique PURE des crans (sans `react-native`,
 * testée par les tests de logique ; le composant `SearchSheet` l'exécute).
 *
 * Les positions sont des décalages vers le bas (translateY) depuis la feuille
 * pleine page : 0 = plein écran ; plus grand = plus bas.
 *
 * Trois crans, comme Google Lens :
 *  • plein écran — on lève la feuille : elle couvre toute la page ;
 *  • repos (défaut) — bas, à 69 % de la hauteur : la photo reste visible ;
 *  • aperçu — tout en bas, seul le titre dépasse : la photo entière se voit.
 */

/** Avec une photo, la feuille repose bas : son haut à 69 % de l'écran (Google Lens). */
export const LENS_SHEET_REST_RATIO = 0.69;
/** Partie visible au cran le plus bas : poignée + titre. */
export const LENS_SHEET_PEEK = 112;
/** Vitesse (px/ms) d'un lancer : la feuille passe au cran suivant dans ce sens. */
export const LENS_SHEET_FLICK = 0.45;
/** Sans lancer, on projette la position sur cette durée pour choisir le cran le plus proche. */
export const LENS_SHEET_PROJECTION_MS = 120;
/** Mouvement minimal avant que la feuille ne prenne le geste (évite de voler un toucher). */
export const LENS_SHEET_SLOP = 6;

export interface LensSheetGeometry {
  /** Haut de la feuille quand elle est pleine page (sous la barre d'état). */
  expandedTop: number;
  /** Haut de la feuille au repos. */
  restTop: number;
  /** Crans, en décalage depuis la pleine page, triés : [0, repos, aperçu?]. */
  stops: number[];
  /** Cran de repos (décalage). */
  rest: number;
}

export function lensSheetGeometry(input: {
  screenHeight: number;
  topInset: number;
  bottomInset: number;
  withPhoto: boolean;
  busy: boolean;
}): LensSheetGeometry {
  const { screenHeight, topInset, bottomInset, withPhoto, busy } = input;
  const expandedTop = Math.max(0, Math.round(topInset));
  const restTop = withPhoto
    ? Math.round(screenHeight * LENS_SHEET_REST_RATIO)
    : Math.round(busy ? Math.max(210, screenHeight * 0.34) : Math.max(150, screenHeight * 0.24));
  const rest = Math.max(0, restTop - expandedTop);
  const stops = [0, rest];
  if (withPhoto) {
    const peek = Math.round(screenHeight - bottomInset - LENS_SHEET_PEEK) - expandedTop;
    if (peek > rest + 24) stops.push(peek);
  }
  return { expandedTop, restTop: expandedTop + rest, stops: [...new Set(stops)].sort((a, b) => a - b), rest };
}

/** Position bornée entre la pleine page (0) et le cran le plus bas. */
export function clampLensSheet(value: number, stops: readonly number[]): number {
  const lowest = stops.length ? Math.max(...stops) : 0;
  return Math.min(lowest, Math.max(0, value));
}

/**
 * Cran visé au lâcher. `velocity` en px/ms, positive vers le bas.
 *  • lancer vers le haut / le bas ⇒ le cran suivant dans ce sens (un seul cran) ;
 *  • sinon ⇒ le cran le plus proche de la position projetée.
 */
export function snapLensSheet(position: number, velocity: number, stops: readonly number[]): number {
  const sorted = [...new Set(stops)].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  if (velocity <= -LENS_SHEET_FLICK) {
    const above = sorted.filter((stop) => stop < position - 1);
    return above.length ? above[above.length - 1] : sorted[0];
  }
  if (velocity >= LENS_SHEET_FLICK) {
    return sorted.find((stop) => stop > position + 1) ?? sorted[sorted.length - 1];
  }
  const projected = position + velocity * LENS_SHEET_PROJECTION_MS;
  return sorted.reduce((best, stop) => (Math.abs(stop - projected) < Math.abs(best - projected) ? stop : best));
}

/**
 * Qui possède un glissement vertical : la feuille ou la liste qu'elle contient ?
 *  • feuille pas encore pleine page ⇒ la feuille, dans les deux sens (on la lève
 *    ou on la baisse depuis n'importe quel point, pas seulement la poignée) ;
 *  • pleine page ⇒ la liste défile ; la feuille ne reprend la main que pour un
 *    glissement vers le bas quand la liste est déjà tout en haut.
 */
export function lensSheetOwnsPan(position: number, scrollY: number, dx: number, dy: number): boolean {
  if (Math.abs(dy) <= LENS_SHEET_SLOP || Math.abs(dy) <= Math.abs(dx) * 1.2) return false;
  if (position > 1) return true;
  return dy > 0 && scrollY <= 0;
}

/** Toucher la poignée : pleine page ⇒ repos ; sinon ⇒ pleine page. */
export function toggleLensSheet(position: number, rest: number): number {
  return position <= 1 ? rest : 0;
}
