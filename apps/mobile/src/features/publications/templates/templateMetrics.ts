/**
 * Cotes des modèles Publication — relevées au pixel sur les planches Zalando
 * fournies par le propriétaire (écrans de 720 px = 360 dp, donc 1 dp = 2 px).
 *
 * Module PUR (aucun import natif) : la grille, les tests et les composants
 * lisent la même source.
 *
 *  ┌ Modèle `media` (planches Felix Hardy, Tommy Hilfiger, sascha.xtz)
 *  │  média x 24→695 px : retrait 12 dp, largeur 336 dp ;
 *  │  photo 672 × 323 px ⇒ rapport ≈ 2,07 ; vidéo 672 × 674 px ⇒ carré ;
 *  │  filet de 8 px (4 dp) entre le média et la rangée, et entre deux photos ;
 *  │  photos produit 205 × 297 px ⇒ 102 × 148 dp, hauteur/largeur 1,45 ;
 *  │  trois photos entières + une amorce visible.
 *  ├ Modèle `container` (planches Vans, adidas, WE Fashion)
 *  │  texte du bandeau à 50 px du bord ⇒ retrait 24 dp ; bandeau 208 px ⇒ 104 dp
 *  │  (16 dp au-dessus de « Sponsorisé », titre sur deux lignes) ;
 *  │  panneau : 110 px ⇒ 55 dp avant les cartes (48 sur l'échelle) ;
 *  │  photo de carte 302 × 438 px ⇒ 151 × 219 dp, rapport 1,45, rayon 12 ;
 *  │  écart entre cartes 34 px ⇒ 16 dp ; deux cartes entières + une amorce.
 *  └ Modèle `sponsored_pair` (planches Fred Perry, GUESS)
 *     deux tuiles de 320 px ⇒ 160 dp, retrait 16 dp, écart 8 dp ;
 *     photo 462 px de haut des DEUX côtés, encart = bloc texte voisin :
 *     les deux tuiles ont exactement la même taille.
 */

import { productTileMetrics, PRODUCT_TILE, type ProductTileMetrics } from '@/design/productTile';

export const PUBLICATION_TEMPLATE = {
  /** Largeur de l'écran de référence (720 px ÷ 2). */
  referenceWidth: 360,
  /** Au-delà, la colonne est centrée (tablette) : les blocs ne s'étirent pas. */
  maxContentWidth: 640,
  /**
   * Espace vertical entre deux blocs. 13/11 : 32 → 16 (consigne « قلّل
   * المسافات بين البلوكات باش يبان أكثر » ; planches Zalando ≈ 16 dp).
   */
  blockSpacing: 16,

  /* Modèle `media` */
  mediaInset: 12,
  imageAspect: 2.07,
  videoAspect: 1,
  mediaRadius: 8,
  rowSpacing: 4,
  rowTileRatio: 1.45,
  rowTilesVisible: 3.2,
  rowTilesVisibleWide: 5.2,

  /* Modèle `container` */
  bandInset: 24,
  bandPaddingTop: 16,
  /** Planche : 29 px sous la 2e ligne du titre ⇒ 16 dp (24 laissait un bandeau trop haut). */
  bandPaddingBottom: 16,
  panelPaddingTop: 48,
  cardRatio: 1.45,
  cardRadius: 12,
  cardSpacing: 16,
  cardsVisible: 2.13,
  cardsVisibleWide: 4.2,
  containerMediaAspect: 2.07,
  /** Bas du panneau : 89 px entre le texte des cartes et la pilule « + Suivre » ⇒ 24 dp + interlignes. */
  followTop: 24,
  panelPaddingBottom: 24,

  /* Modèle `sponsored_pair` */
  pairInset: 16,
  pairSpacing: 8,

  /** Seuil « tablette » (même valeur que la grille produit). */
  wideFrom: 600,
} as const;

export interface PublicationTemplateMetrics {
  /** Largeur utile de la colonne (écran, plafonnée sur tablette). */
  width: number;
  media: {
    width: number;
    imageHeight: number;
    videoHeight: number;
    tileWidth: number;
    tileHeight: number;
  };
  container: {
    cardWidth: number;
    cardImageHeight: number;
    mediaHeight: number;
  };
  pair: {
    /** Largeur de CHAQUE tuile (gauche sponsorisée, droite produit). */
    tileWidth: number;
  };
}

const finite = (value: number, fallback: number) => (Number.isFinite(value) && value > 0 ? value : fallback);

export function publicationTemplateMetrics(screenWidth: number): PublicationTemplateMetrics {
  const T = PUBLICATION_TEMPLATE;
  const width = Math.min(T.maxContentWidth, finite(screenWidth, T.referenceWidth));
  const wide = width >= T.wideFrom;

  const mediaWidth = Math.max(1, width - T.mediaInset * 2);
  const tilesVisible = wide ? T.rowTilesVisibleWide : T.rowTilesVisible;
  // n photos visibles ⇒ n − 1 filets entiers + celui qui précède l'amorce.
  const tileWidth = Math.max(1, (mediaWidth - T.rowSpacing * Math.floor(tilesVisible)) / tilesVisible);

  const cardsVisible = wide ? T.cardsVisibleWide : T.cardsVisible;
  const cardWidth = Math.max(1, (width - T.bandInset - T.cardSpacing * Math.floor(cardsVisible)) / cardsVisible);

  const pairTile = Math.max(1, (width - T.pairInset * 2 - T.pairSpacing) / 2);

  return {
    width,
    media: {
      width: mediaWidth,
      imageHeight: Math.round(mediaWidth / T.imageAspect),
      videoHeight: Math.round(mediaWidth / T.videoAspect),
      tileWidth,
      tileHeight: Math.round(tileWidth * T.rowTileRatio),
    },
    container: {
      cardWidth,
      cardImageHeight: Math.round(cardWidth * T.cardRatio),
      mediaHeight: Math.round((width - T.bandInset * 2) / T.containerMediaAspect),
    },
    pair: {
      tileWidth: pairTile,
    },
  };
}

/**
 * Cotes de la carte produit du duo : la carte de grille de l'application
 * (`ProductTile`, mêmes lignes et même bloc texte) posée à la largeur du duo.
 * La tuile sponsorisée reçoit EXACTEMENT ces cotes : photo de même hauteur,
 * encart de la hauteur du bloc texte — les deux tuiles sont identiques en taille.
 */
export function pairTileMetrics(tileWidth: number, fontScale = 1): ProductTileMetrics {
  const base = productTileMetrics({ width: PRODUCT_TILE.referenceWidth, density: 'grid', fontScale });
  const cardWidth = Math.max(1, tileWidth);
  const mediaHeight = Math.max(1, Math.round(cardWidth / PRODUCT_TILE.mediaRatio));
  return { ...base, columns: 2, cardWidth, mediaHeight, height: mediaHeight + base.textHeight };
}
