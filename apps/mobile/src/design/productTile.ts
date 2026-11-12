/**
 * CARTE PRODUIT DE GRILLE — cotes et règles (13/11/2026).
 *
 * ── D'où viennent les nombres ───────────────────────────────────────────────
 * Vidéo de référence du propriétaire (Drive, `SVID_20261112_221547_1.mp4`,
 * enregistrement d'écran 576 × 1280 px d'une grille « Sélection baskets ») :
 * l'écran fait **360 dp**, donc **1 dp = 1,6 px**. Chaque cote porte sa mesure en
 * pixels, relevée au pixel sur l'image fixe (0 s) de la grille :
 *
 *   image gauche  x 0 → 285,  image droite x 291 → 576  (bord à bord, 6 px entre)
 *   image         y 203 → 634 (431 px de haut pour 285 de large : 0,661 ≈ 2/3)
 *   points        y 650 → 659, 10 px de diamètre, 19 px d'un point au suivant
 *   marque        y 678 → 698 (capitales 17 px)      → corps 15, gras
 *   nom           y 708 → 721 (capitales 14 px)      → corps 13
 *   prix conseillé y 735 → 756                       → corps 13, gris
 *   prix          y 769 → 794                        → corps 17, gras
 *   bloc texte    y 634 → 838 (204 px = 127,5 dp), la photo suivante commence
 *                 au pixel 839 : AUCUN écart vertical entre deux rangées.
 *   texte         x 20 → (20 px = 12,5 dp de retrait, même retrait que les points)
 *
 * ── Les trois règles qu'on en tire ──────────────────────────────────────────
 *  1. **Des lignes fixes.** Chaque carte a EXACTEMENT les mêmes lignes, à la
 *     même hauteur : points · marque · nom · ligne d'info · prix. Une ligne vide
 *     garde sa place (jamais de carte plus courte que sa voisine), un texte
 *     trop long est coupé sur une ligne. Toutes les cartes ont donc la même
 *     hauteur, et les marques, noms et prix de deux voisines sont alignés.
 *  2. **On navigue dans la carte.** Les photos défilent au doigt dans la
 *     vignette ; les points SOUS la photo disent où on en est ; un appui ouvre
 *     la fiche sur la photo regardée.
 *  3. **Grand ou petit.** Une bascule passe de la grille (2 colonnes sur
 *     téléphone) aux grandes photos (1 colonne), sans changer les lignes.
 *
 * Ce fichier n'importe pas React Native : il est testé tel quel par Vitest
 * (`tests/product-tile-geometry-2026-11-13.test.ts`).
 */

/** Affichage de la grille : `grid` = petites photos, `large` = grandes photos. */
export type ProductDensity = 'grid' | 'large';

export const PRODUCT_DENSITIES: readonly ProductDensity[] = ['grid', 'large'];

export function isProductDensity(value: unknown): value is ProductDensity {
  return value === 'grid' || value === 'large';
}

/** La bascule : un appui passe à l'autre affichage. */
export function nextProductDensity(current: ProductDensity): ProductDensity {
  return current === 'grid' ? 'large' : 'grid';
}

export const PRODUCT_TILE = {
  /** Largeur de l'écran enregistré : 576 px ÷ 1,6. */
  referenceWidth: 360,
  /** 285 × 431 px ⇒ 0,661 : le 2/3 portrait (même rapport que Lens). */
  mediaRatio: 2 / 3,
  /** 291 − 285 = 6 px ⇒ 3,75 dp : un filet blanc de 4 entre deux colonnes. */
  columnGap: 4,
  /** 838 → 839 : la photo suivante touche le bloc texte. */
  rowGap: 0,
  /** Grille bord à bord : aucune marge à gauche ni à droite (x = 0 et x = 576). */
  gridPadding: 0,
  /** 20 px ⇒ 12,5 dp : retrait du texte ET des points. */
  textInset: 12,
  /** Grandes photos (1 colonne) : la marge commune de l'application. */
  textInsetLarge: 16,

  /* Rangée des points (sous la photo, alignée sur le texte) */
  dotsTop: 10,        // 650 − 634 = 16 px
  dot: 6,             // 10 px, actif et inactif de même taille
  dotPitch: 12,       // 19 px d'un centre au suivant
  dotsBottom: 8,      // 678 − 659 = 19 px, moins la jambe de la marque
  dotsMax: 6,         // la référence montre 6 points pour 6 photos

  /* Lignes de texte (corps / interligne) */
  brandSize: 15,      // capitales de 17 px ⇒ 10,6 dp ⇒ corps 15, gras
  brandLine: 18,
  nameSize: 13,       // capitales de 14 px ⇒ 8,75 dp ⇒ corps 13
  nameLine: 18,
  metaSize: 13,       // « Prix conseillé », gris
  metaLine: 20,
  priceSize: 17,      // chiffres de 20 px ⇒ corps 17, gras
  priceLine: 24,
  bottom: 24,         // 838 − 794 = 44 px ⇒ 27 dp sous le prix (jambes comprises)

  /* Pastille posée au ras du bord, en bas de la photo (« Dernières pièces ») */
  badgeHeight: 20,    // 552 → 584 px sur la fiche = 32 px
  badgeBottom: 12,

  /** Plafond du grossissement système : les lignes grandissent ensemble, sans couper la grille. */
  maxFontScale: 1.2,
} as const;

/** Nombre de colonnes : téléphone 2 / 1, petite tablette 3 / 2, grande tablette 4 / 2. */
export function productTileColumns(width: number, density: ProductDensity): number {
  if (density === 'large') return width >= 600 ? 2 : 1;
  if (width >= 900) return 4;
  if (width >= 600) return 3;
  return 2;
}

/** Grossissement appliqué aux interlignes : jamais sous 1, jamais au-delà du plafond. */
export function productTileFontScale(fontScale: number | undefined): number {
  const value = Number.isFinite(fontScale) ? (fontScale as number) : 1;
  return Math.min(PRODUCT_TILE.maxFontScale, Math.max(1, value));
}

export interface ProductTileLines {
  brand: number;
  name: number;
  meta: number;
  price: number;
}

export interface ProductTileMetrics {
  density: ProductDensity;
  columns: number;
  /** Largeur d'UNE carte (non arrondie : la somme des colonnes retombe sur la largeur). */
  cardWidth: number;
  mediaHeight: number;
  /** Hauteur des lignes (déjà multipliée par le grossissement plafonné). */
  lines: ProductTileLines;
  /** Hauteur du bloc sous la photo : points + 4 lignes + pied. */
  textHeight: number;
  /** Hauteur totale d'une carte : la même pour TOUTES les cartes de la grille. */
  height: number;
  inset: number;
  fontScale: number;
}

/**
 * Cotes d'une carte pour une largeur de grille. Une seule fonction, appelée une
 * fois par la grille et transmise à chaque carte : deux voisines ne peuvent pas
 * calculer des hauteurs différentes.
 */
export function productTileMetrics({
  width,
  density,
  fontScale = 1,
}: {
  width: number;
  density: ProductDensity;
  fontScale?: number;
}): ProductTileMetrics {
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : PRODUCT_TILE.referenceWidth);
  const columns = productTileColumns(safeWidth, density);
  const usable = safeWidth - PRODUCT_TILE.gridPadding * 2 - PRODUCT_TILE.columnGap * (columns - 1);
  const cardWidth = Math.max(1, usable / columns);
  const mediaHeight = Math.max(1, Math.round(cardWidth / PRODUCT_TILE.mediaRatio));
  const scale = productTileFontScale(fontScale);
  const lines: ProductTileLines = {
    brand: Math.ceil(PRODUCT_TILE.brandLine * scale),
    name: Math.ceil(PRODUCT_TILE.nameLine * scale),
    meta: Math.ceil(PRODUCT_TILE.metaLine * scale),
    price: Math.ceil(PRODUCT_TILE.priceLine * scale),
  };
  const textHeight = PRODUCT_TILE.dotsTop + PRODUCT_TILE.dot + PRODUCT_TILE.dotsBottom
    + lines.brand + lines.name + lines.meta + lines.price + PRODUCT_TILE.bottom;
  return {
    density,
    columns,
    cardWidth,
    mediaHeight,
    lines,
    textHeight,
    height: mediaHeight + textHeight,
    inset: columns === 1 ? PRODUCT_TILE.textInsetLarge : PRODUCT_TILE.textInset,
    fontScale: scale,
  };
}

/**
 * Fenêtre des points visibles : au plus `max` points ; au-delà, la fenêtre suit
 * la photo active (qui reste vers le milieu) et s'arrête aux deux bouts.
 */
export function productTileDotWindow(page: number, count: number, max: number = PRODUCT_TILE.dotsMax): { first: number; length: number } {
  const total = Math.max(0, Math.floor(count));
  const length = Math.min(total, Math.max(1, Math.floor(max)));
  if (total === 0) return { first: 0, length: 0 };
  const active = Math.max(0, Math.min(total - 1, Math.floor(page)));
  const first = Math.max(0, Math.min(active - Math.floor((length - 1) / 2), total - length));
  return { first, length };
}

/** Page affichée pour un décalage horizontal (arrondi à la page la plus visible). */
export function productTilePageAt(offsetX: number, pageWidth: number, count: number): number {
  if (!(pageWidth > 0) || count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(Math.max(0, offsetX) / pageWidth)));
}

/** Liste de photos d'une carte : sans vide, sans doublon, dans l'ordre reçu. */
export function productTileImages(...groups: Array<string | null | undefined | Array<string | null | undefined>>): string[] {
  const out: string[] = [];
  for (const group of groups) {
    for (const uri of Array.isArray(group) ? group : [group]) {
      const clean = typeof uri === 'string' ? uri.trim() : '';
      if (clean && !out.includes(clean)) out.push(clean);
    }
  }
  return out;
}

/**
 * Nombre de rangées à monter d'abord : environ six cartes en grille, deux
 * grandes cartes en une colonne (une grande carte dépasse déjà la moitié de l'écran).
 */
export function productTileInitialRows(columns: number): number {
  const safe = Math.max(1, Math.floor(columns));
  if (safe === 1) return 2;
  return Math.max(2, Math.ceil(6 / safe));
}

/**
 * Photo d'arrivée sur la fiche (`/product/[id]?photo=2`) : celle que le client
 * regardait dans la carte. Absente, illisible, négative ou fractionnaire ⇒ un
 * entier ≥ 0 (la première photo par défaut). La fiche la borne ensuite à sa galerie.
 */
export function productTileArrivalPhoto(param: unknown): number {
  const raw = Array.isArray(param) ? param[0] : param;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
