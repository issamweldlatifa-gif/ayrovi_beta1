/**
 * Logique pure du carrousel Hero — géométrie, index et défilement.
 *
 * Sans React ni React Native : testable en isolation (`tests/heroCarouselLogic.test.ts`).
 * Le composant `HeroCarousel` n'y met que l'état et les effets.
 *
 * ── Décisions ──────────────────────────────────────────────────────────────
 * • La carte active est CENTRÉE : `sideInset` = (largeur − carte) / 2. Les
 *   deux voisines dépassent ainsi des deux côtés (référence Amazon), et
 *   l'index se lit directement depuis l'offset, sans correction.
 * • La largeur de carte est une PART de l'écran (`CARD_WIDTH_RATIO`), bornée
 *   pour les tablettes. Aucune valeur fixe par appareil.
 * • Pas de boucle : à la dernière carte, le défilement automatique s'arrête.
 *   Revenir à la première créerait un saut visible à travers toutes les cartes.
 */

/** Ratio d'affichage des cartes (5:8 : hauteur = largeur × 1,6, proportions Amazon). */
export const CARD_ASPECT = 5 / 8;
/** Espace entre deux cartes (proportions Amazon : serrées). */
export const CARD_GAP = 8;
/** Part de l'écran occupée par la carte active. Les voisines se devinent sur les côtés. */
export const CARD_WIDTH_RATIO = 0.76;
/** Bornes : sur téléphone étroit (240) et sur tablette (400 — le 4:5 géant n'a pas de sens). */
export const CARD_MIN_WIDTH = 240;
export const CARD_MAX_WIDTH = 400;

export interface CarouselGeometry {
  /** Largeur de la carte active. */
  cardWidth: number;
  /** Pas entre deux cartes (carte + espace). */
  stride: number;
  /** Retrait à gauche (et à droite) pour que la carte active soit centrée. */
  sideInset: number;
}

export function carouselGeometry(screenWidth: number): CarouselGeometry {
  const wanted = Math.round(screenWidth * CARD_WIDTH_RATIO);
  // Jamais plus large que l'écran lui-même (cas des très petits écrans).
  const cardWidth = Math.min(screenWidth, Math.min(CARD_MAX_WIDTH, Math.max(CARD_MIN_WIDTH, wanted)));
  return {
    cardWidth,
    stride: cardWidth + CARD_GAP,
    sideInset: Math.max(0, (screenWidth - cardWidth) / 2),
  };
}

/** Index de la carte qui se trouve au centre, pour un offset de défilement donné. */
export function indexForOffset(offset: number, stride: number, count: number): number {
  if (count <= 0 || stride <= 0) return 0;
  // `inverted` (RTL) donne un offset négatif : la valeur absolue suit toujours l'index.
  const index = Math.round(Math.abs(offset) / stride);
  return Math.min(count - 1, Math.max(0, index));
}

/** Carte suivante, sans boucle : bloquée sur la dernière. */
export function nextIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(current + 1, count - 1);
}

/** Vrai tant qu'il reste une carte à afficher après `current`. */
export function shouldAutoplayAdvance(current: number, count: number): boolean {
  return count > 1 && current < count - 1;
}

/**
 * Vitesse de fin de glissement. Sous ce seuil, RN n'enchaîne pas de momentum
 * et ne déclenche pas `onMomentumScrollEnd` : il faut alors libérer la pause ici.
 */
export const STILL_VELOCITY = 0.05;

export function isStillAfterDrag(velocityX: number | undefined): boolean {
  return velocityX === undefined || Math.abs(velocityX) < STILL_VELOCITY;
}
