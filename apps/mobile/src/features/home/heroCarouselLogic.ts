/**
 * Logique pure du carrousel Hero — géométrie, index et défilement.
 *
 * Sans React ni React Native : testable en isolation (`tests/heroCarouselLogic.test.ts`).
 * Le composant `HeroCarousel` n'y met que l'état et les effets.
 *
 * ── Décisions ──────────────────────────────────────────────────────────────
 * • La première carte commence au bord. Les cartes suivantes se centrent,
 *   avec des voisines visibles à parts égales (sauf la dernière, sans duplication).
 * • La largeur de carte est une PART de l'écran (`CARD_WIDTH_RATIO`), bornée
 *   pour les tablettes. Aucune valeur fixe par appareil.
 * • Pas de boucle : à la dernière carte, le défilement automatique s'arrête.
 *   Revenir à la première créerait un saut visible à travers toutes les cartes.
 */

/** Ratio d'affichage des cartes (5:8 : hauteur = largeur × 1,6), proche de la carte Amazon de référence. */
export const CARD_ASPECT = 5 / 8;
/** Espace entre deux cartes (proportions Amazon : serrées). */
export const CARD_GAP = 8;
/** Part de l'écran occupée par la carte active. Les voisines se devinent sur les côtés. */
export const CARD_WIDTH_RATIO = 0.76;
/** Bornes : sur téléphone étroit (240) et sur tablette (400 — le 4:5 géant n'a pas de sens). */
export const CARD_MIN_WIDTH = 240;
export const CARD_MAX_WIDTH = 400;

export interface CarouselGeometry {
  /** Largeur de la carte. */
  cardWidth: number;
  /** Pas entre deux cartes (carte + espace). */
  stride: number;
  /** Marge de départ : la première carte commence à cette distance du bord. */
  sideInset: number;
}

/**
 * Géométrie centrée : edgeInset réserve une marge minimale sur écran étroit.
 * sideInset est la correction de centrage des cartes après la première.
 * Aucun padding de départ ; padding de fin = sideInset pour centrer la dernière.
 */
export function carouselGeometry(screenWidth: number, edgeInset = 0): CarouselGeometry {
  const inset = Math.max(0, edgeInset);
  const room = Math.max(0, screenWidth - 2 * inset);
  const wanted = Math.round(screenWidth * CARD_WIDTH_RATIO);
  // Jamais plus large que l'espace disponible entre les deux marges.
  const cardWidth = Math.min(room, Math.min(CARD_MAX_WIDTH, Math.max(CARD_MIN_WIDTH, wanted)));
  return {
    cardWidth,
    stride: cardWidth + CARD_GAP,
    sideInset: Math.max(0, (screenWidth - cardWidth) / 2),
  };
}

/**
 * Décalage de défilement pour atteindre la carte `index`. En RTL (liste
 * `inverted`), le décalage est négatif, comme le lit `indexForOffset`.
 */
export function scrollOffsetForIndex(index: number, stride: number, rtl: boolean, centerInset = 0): number {
  const offset = index <= 0 ? 0 : Math.max(0, index * Math.max(0, stride) - centerInset);
  return rtl ? -offset : offset;
}

/** Index de la carte qui se trouve au centre, pour un offset de défilement donné. */
export function indexForOffset(offset: number, stride: number, count: number, centerInset = 0): number {
  if (count <= 0 || stride <= 0) return 0;
  // `inverted` (RTL) donne un offset négatif : la valeur absolue suit toujours l'index.
  const distance = Math.abs(offset);
  if (distance < Math.max(0, stride - centerInset) / 2) return 0;
  const index = Math.round((distance + centerInset) / stride);
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

/**
 * Fondu enchaîné du fond de section : une couche par carte (le fond de SA photo),
 * empilées dans l'ordre. La couche 0 est toujours opaque ; la couche `index`
 * apparaît pendant que le carrousel va de la carte `index − 1` à la carte `index`,
 * et reste opaque au-delà (elle recouvre alors les précédentes).
 *
 * Toujours DEUX points par plage : avec une seule carte publiée, une interpolation
 * à un seul point levait « Bad output range » et tout l'accueil plantait.
 */
export function backdropLayerRange(index: number): { inputRange: number[]; outputRange: number[] } | null {
  if (!Number.isInteger(index) || index < 1) return null;
  return { inputRange: [index - 1, index], outputRange: [0, 1] };
}


/** First card starts at the edge; every later snap centers its card. */
export function carouselSnapOffsets(count: number, stride: number, centerInset: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => scrollOffsetForIndex(index, stride, false, centerInset));
}
