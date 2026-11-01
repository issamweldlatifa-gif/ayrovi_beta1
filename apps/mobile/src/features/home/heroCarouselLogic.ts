/**
 * Logique pure du carrousel Hero — géométrie, index et défilement.
 *
 * Sans React ni React Native : testable en isolation (`tests/heroCarouselLogic.test.ts`).
 * Le composant `HeroCarousel` n'y met que l'état et les effets.
 *
 * ── Décisions ──────────────────────────────────────────────────────────────
 * • La carte ALIGNÉE SUR LE BORD : la première carte commence exactement à la
 *   marge de la page (même `gutter` que les titres et le header), et la
 *   dernière finit exactement à la marge droite en fin de défilement. Pas de
 *   vide d'un côté ni de l'autre. La voisine apparaît sur le côté droit.
 *   L'index se lit directement depuis l'offset (un pas = une carte).
 * • La largeur de carte est une PART de l'écran (`CARD_WIDTH_RATIO`), bornée
 *   pour les tablettes. Aucune valeur fixe par appareil.
 * • Pas de boucle : à la dernière carte, le défilement automatique s'arrête.
 *   Revenir à la première créerait un saut visible à travers toutes les cartes.
 */

/** Ratio d'affichage des cartes (5:9 : hauteur = largeur × 1,8). Rallongé de ~12 % (retour utilisateur : plus court qu'Amazon). */
export const CARD_ASPECT = 5 / 9;
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
 * Géométrie du carrousel. `edgeInset` = la marge de la page (le `gutter`), la
 * même que celle du header : la première carte s'aligne sur elle, et la dernière
 * (en fin de défilement) s'aligne sur la marge droite.
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
    sideInset: inset,
  };
}

/**
 * Décalage de défilement pour atteindre la carte `index`. En RTL (liste
 * `inverted`), le décalage est négatif, comme le lit `indexForOffset`.
 */
export function scrollOffsetForIndex(index: number, stride: number, rtl: boolean): number {
  const offset = Math.max(0, index) * Math.max(0, stride);
  return rtl ? -offset : offset;
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
