/**
 * Logique pure du carrousel Hero — géométrie, index et défilement.
 *
 * Sans React ni React Native : testable en isolation (`tests/heroCarouselLogic.test.ts`).
 * Le composant `HeroCarousel` n'y met que l'état et les effets.
 *
 * ── Décisions (modèle « gouttière égale + carte centrée ») ─────────────────
 * • La gouttière aux DEUX bords de l'écran (`EDGE_GUTTER`) vaut l'espace ENTRE
 *   deux cartes (`CARD_GAP`) : la première et la dernière carte reposent avec
 *   exactement le même respir que celui qui sépare deux voisines.
 * • Chaque carte intérieure se CENTRE à son point d'arrêt : le reste d'écran se
 *   répartit également entre la voisine précédente et la voisine suivante.
 * • La première carte repose sur la gouttière de départ (il n'y a rien avant
 *   elle à montrer) et la dernière sur la gouttière finale — `maxScroll` la
 *   borne, sans jamais dupliquer de carte.
 * • La largeur de carte est une PART de l'écran (`CARD_WIDTH_RATIO`), bornée
 *   pour les tablettes. Aucune valeur fixe par appareil.
 * • Pas de boucle : à la dernière carte, le défilement automatique s'arrête.
 *   Revenir à la première créerait un saut visible à travers toutes les cartes.
 */

/** Ratio d'affichage des cartes (5:8 : hauteur = largeur × 1,6), proche de la carte Amazon de référence. */
export const CARD_ASPECT = 5 / 8;
/** Espace entre deux cartes (proportions Amazon : serrées). */
export const CARD_GAP = 8;
/** Gouttière aux bords de l'écran : la MÊME valeur que l'espace entre cartes. */
export const EDGE_GUTTER = CARD_GAP;
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
  /** Gouttière de départ : la première carte repose à cette distance du bord (= `EDGE_GUTTER`). */
  startInset: number;
  /** Gouttière de fin : la dernière carte repose à cette distance de l'autre bord (= `EDGE_GUTTER`). */
  endInset: number;
  /** Position (depuis le bord) du bord d'une carte CENTRÉE. */
  centerInset: number;
  /** Correction de centrage : ce qu'on retranche d'un pas pour centrer la carte `index ≥ 1`. */
  centeringOffset: number;
  /** Défilement maximal pour `count` cartes : borne le repos de la dernière sur la gouttière de fin. */
  maxScroll: number;
}

/**
 * Géométrie « gouttière égale » : le contenu commence et finit à `EDGE_GUTTER`
 * du bord, comme l'espace entre deux cartes. `centeringOffset` est la correction
 * qui centre les cartes intérieures ; `maxScroll` garantit que la dernière carte
 * repose elle aussi sur sa gouttière, sans dépasser le contenu.
 */
export function carouselGeometry(screenWidth: number, count = 1): CarouselGeometry {
  const cards = Math.max(1, Math.floor(count));
  const width = Math.max(0, screenWidth);
  const wanted = Math.round(width * CARD_WIDTH_RATIO);
  // Jamais plus large que l'écran moins les deux gouttières.
  const room = Math.max(0, width - 2 * EDGE_GUTTER);
  const cardWidth = Math.min(room, Math.min(CARD_MAX_WIDTH, Math.max(CARD_MIN_WIDTH, wanted)));
  const centerInset = Math.max(0, (width - cardWidth) / 2);
  // Sur écran minuscule, la gouttière ne dépasse jamais la position centrée.
  const startInset = Math.min(EDGE_GUTTER, centerInset);
  const stride = cardWidth + CARD_GAP;
  const contentWidth = startInset + cards * cardWidth + (cards - 1) * CARD_GAP + startInset;
  return {
    cardWidth,
    stride,
    startInset,
    endInset: startInset,
    centerInset,
    centeringOffset: Math.max(0, centerInset - startInset),
    maxScroll: Math.max(0, contentWidth - width),
  };
}

/**
 * Décalage de défilement pour atteindre la carte `index`. La carte 0 repose sur
 * la gouttière de départ (offset 0) ; les suivantes sont centrées, puis bornées
 * par `maxScroll` pour que la dernière respecte la gouttière de fin.
 * En RTL (liste `inverted`), le décalage est négatif, comme le lit `indexForOffset`.
 */
export function scrollOffsetForIndex(
  index: number,
  stride: number,
  rtl: boolean,
  centeringOffset = 0,
  maxScroll = Number.POSITIVE_INFINITY,
): number {
  const raw = index <= 0
    ? 0
    : Math.min(maxScroll, Math.max(0, index * Math.max(0, stride) - centeringOffset));
  return rtl ? -raw : raw;
}

/** Index de la carte qui se trouve au centre, pour un offset de défilement donné. */
export function indexForOffset(offset: number, stride: number, count: number, centeringOffset = 0): number {
  if (count <= 0 || stride <= 0) return 0;
  // `inverted` (RTL) donne un offset négatif : la valeur absolue suit toujours l'index.
  const distance = Math.abs(offset);
  if (distance < Math.max(0, stride - centeringOffset) / 2) return 0;
  const index = Math.round((distance + centeringOffset) / stride);
  return Math.min(count - 1, Math.max(0, index));
}

/**
 * Points d'arrêt du carrousel : 0 pour la première carte (gouttière de départ),
 * centrage pour les cartes intérieures, `maxScroll` pour la dernière (gouttière
 * de fin). Strictement croissants, même quand le bornage écrase la fin.
 */
export function carouselSnapOffsets(
  count: number,
  stride: number,
  centeringOffset: number,
  maxScroll = Number.POSITIVE_INFINITY,
): number[] {
  const total = Math.max(0, Math.floor(count));
  const offsets: number[] = [];
  for (let index = 0; index < total; index += 1) {
    const offset = scrollOffsetForIndex(index, stride, false, centeringOffset, maxScroll);
    if (offsets.length === 0 || offset > offsets[offsets.length - 1]) offsets.push(offset);
  }
  return offsets;
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

/**
 * Défilement → avancement « en cartes » (12/11/2026), pour que la couleur de
 * fond SUIVE LE DOIGT au lieu de basculer une fois le geste fini.
 *
 * Points d'appui : l'offset de chaque arrêt (`scrollOffsetForIndex`) ↔ l'index
 * de la carte. Entre deux arrêts, l'avancement est linéaire ; la fin bornée par
 * `maxScroll` est respectée (si deux arrêts tombent au même offset, la
 * dernière carte l'emporte). La plage est MIROIR (offsets négatifs ⇒ mêmes
 * index) : une liste `inverted` (arabe) peut rapporter un offset négatif selon
 * la plateforme, et l'interpolation n'a pas de valeur absolue.
 *
 * `null` sous deux cartes : rien à faire avancer (et une plage à un seul point
 * ferait planter l'interpolation, cf. `backdropLayerRange`).
 */
export function backdropProgressRange(
  count: number,
  stride: number,
  centeringOffset = 0,
  maxScroll = Number.POSITIVE_INFINITY,
): { inputRange: number[]; outputRange: number[] } | null {
  const total = Math.max(0, Math.floor(count));
  if (total < 2 || !(stride > 0)) return null;
  const points: Array<{ offset: number; index: number }> = [];
  for (let index = 0; index < total; index += 1) {
    const offset = scrollOffsetForIndex(index, stride, false, centeringOffset, maxScroll);
    const last = points[points.length - 1];
    if (!last || offset > last.offset) points.push({ offset, index });
    else last.index = index;
  }
  if (points.length < 2) return null;
  const mirrored = points.slice(1).reverse();
  return {
    inputRange: [...mirrored.map((point) => -point.offset), ...points.map((point) => point.offset)],
    outputRange: [...mirrored.map((point) => point.index), ...points.map((point) => point.index)],
  };
}
