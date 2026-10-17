/**
 * Géométrie de la carte résultat — une seule source, partagée par la carte
 * réelle et par son squelette pour que l'écran ne saute pas à l'arrivée des
 * résultats.
 *
 * Mesure de référence (commerce/Zalando, modèle fourni) : 557 × 835 px,
 * soit un rapport largeur/hauteur de **0,667 — le 2/3**, et non 3/4 ni 4/5.
 * Une vignette plus courte écrasait le produit ; à 2/3 la carte respire.
 */
export const LENS_CARD_MEDIA_RATIO = 2 / 3;

/** Gouttière et marge de la grille (identiques dans la grille et le squelette). */
export const LENS_CARD_GRID_GAP = 4;
export const LENS_CARD_GRID_PADDING = 4;

/** Hauteur de la vignette pour une largeur d'écran et un nombre de colonnes. */
export function lensCardMediaHeight(
  gridWidth: number,
  columns = 2,
  gap = LENS_CARD_GRID_GAP,
  padding = LENS_CARD_GRID_PADDING,
): number {
  const usable = gridWidth - padding * 2 - gap * Math.max(0, columns - 1);
  const cardWidth = usable / Math.max(1, columns);
  return Math.max(1, Math.round(cardWidth / LENS_CARD_MEDIA_RATIO));
}
