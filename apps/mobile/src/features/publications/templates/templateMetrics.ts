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
 *  └ Modèle `sponsored_pair` (14/11 : planche GBox « WE Fashion » 224107)
 *     bandeau (Sponsorisé + titre) puis image qui part de x = 48 px et DÉBORDE à
 *     droite : 672 × 322 px ⇒ rapport 2,09 ; 110 px ⇒ 56 dp de blanc ; puis DEUX
 *     cartes de 320 px ⇒ 160 dp, retrait 16 dp, écart 8 dp, photo 461 px (1,44).
 *
 * 14/11 — relevés GBox complémentaires (Vans 224048, The Ordinary 224628) :
 *  • container : cartes 304 px ⇒ 152 dp (13/11 : 163 dp, planche Saucony), écart 32 px ⇒ 16 dp, photo (1,44),
 *    112 px ⇒ 56 dp entre le bandeau et les cartes, 77 px ⇒ ~32 dp jusqu'à « + Follow » ;
 *  • media : photos 206 px ⇒ 103 dp, filet 8 px, amorce 31 px ⇒ 3,15 photos visibles,
 *    hauteur 296 px (1,44).
 */

import { CARD_SYSTEM, cardRailMetrics, cardWidthFor } from '../../../design/cardSystem';
import { RHYTHM } from '../../../design/rhythm';

/*
 * 13/11 (captures 073653 → 073818) — SYSTÈME DE CARTES (`src/design/cardSystem.ts`) :
 * les trois modèles partagent UNE marge (12, celle de l'app), UN écart (8) et
 * UNE carte de largeur égale (2 entières sur téléphone : 164 dp à 360 dp). Les anciennes
 * cotes « 1,96 carte » (container) et « 3,15 vignettes » (media) laissaient des
 * marges inégales et des cartes coupées au bord : elles sont retirées.
 */
export const PUBLICATION_TEMPLATE = {
  /** Largeur de l'écran de référence (720 px ÷ 2). */
  referenceWidth: 360,
  /** Au-delà, la colonne est centrée (tablette) : les blocs ne s'étirent pas. */
  maxContentWidth: 640,
  /**
   * Espace vertical entre deux blocs. 13/11 : 32 → 16 (consigne « قلّل
   * المسافات بين البلوكات باش يبان أكثر »). 14/11 (système de rythme) : chaque
   * bloc porte désormais SA barre d'interaction ; le blanc qui suit la barre
   * doit être nettement plus grand que celui qui la relie à son bloc, sinon on
   * ne sait plus à quel bloc elle appartient (Publication « chargée ») ⇒
   * `RHYTHM.cluster` (32).
   */
  blockSpacing: RHYTHM.cluster,
  /** Bloc ↔ sa barre d'interaction : la barre appartient au bloc (proximité). */
  barTop: RHYTHM.inline,

  /* Modèle `media` */
  /** 13/11 : la marge commune des cartes et de l'app (12). */
  mediaInset: CARD_SYSTEM.gutter,
  imageAspect: 2.07,
  videoAspect: 1,
  mediaRadius: 8,
  /** Espace entre le média et la rangée de cartes. */
  rowSpacing: 12,

  /* Modèle `container` */
  /** 13/11 : titre, cartes et « Suivre » partent de la MÊME marge (était 24 pour le texte). */
  bandInset: CARD_SYSTEM.gutter,
  /** 14/11 (rythme, bandeau bleu Zalando ≈ 24–30 dp) : 16 → `RHYTHM.block`. */
  bandPaddingTop: RHYTHM.block,
  /** 14/11 : 16 → `RHYTHM.block` — le titre du bandeau respire (planche Zalando 125655). */
  bandPaddingBottom: RHYTHM.block,
  panelPaddingTop: 56,
  cardRatio: CARD_SYSTEM.imageRatio,
  cardRadius: CARD_SYSTEM.radius,
  cardSpacing: CARD_SYSTEM.gap,
  containerMediaAspect: 2.07,
  /** Bas du panneau : 89 px entre le texte des cartes et la pilule « + Suivre » ⇒ 24 dp + interlignes. */
  followTop: RHYTHM.cluster,
  /** 14/11 : 24 → `RHYTHM.cluster` — la pilule « + Suivre » ne colle plus au bas du panneau. */
  panelPaddingBottom: RHYTHM.cluster,

  /* Modèle `sponsored_pair` */
  pairInset: CARD_SYSTEM.gutter,
  pairSpacing: CARD_SYSTEM.gap,
  pairMediaAspect: 2.09,
  pairTitleGap: 16,
  pairCardsTop: 56,
  pairCardRatio: CARD_SYSTEM.imageRatio,

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
    /** Cartes de la rangée sous le média : la même carte que les autres modèles. */
    tileWidth: number;
    tileHeight: number;
  };
  container: {
    cardWidth: number;
    cardImageHeight: number;
    /** Pas d'aimantation de la rangée (carte + écart). */
    snap: number;
    mediaHeight: number;
  };
  pair: {
    /** Largeur de CHAQUE carte produit sous l'image. */
    tileWidth: number;
    cardImageHeight: number;
    /** Image du bandeau : de `bandInset` jusqu'au bord droit. */
    mediaWidth: number;
    mediaHeight: number;
  };
}

const finite = (value: number, fallback: number) => (Number.isFinite(value) && value > 0 ? value : fallback);

export function publicationTemplateMetrics(screenWidth: number): PublicationTemplateMetrics {
  const T = PUBLICATION_TEMPLATE;
  const width = Math.min(T.maxContentWidth, finite(screenWidth, T.referenceWidth));

  const mediaWidth = Math.max(1, width - T.mediaInset * 2);
  // Une seule carte pour les trois modèles : partage égal de la colonne.
  const rail = cardRailMetrics(width);
  // Le duo reste DEUX cartes égales, même sur tablette.
  const pairTile = cardWidthFor(width, 2);

  return {
    width,
    media: {
      width: mediaWidth,
      imageHeight: Math.round(mediaWidth / T.imageAspect),
      videoHeight: Math.round(mediaWidth / T.videoAspect),
      tileWidth: rail.cardWidth,
      tileHeight: rail.imageHeight,
    },
    container: {
      cardWidth: rail.cardWidth,
      cardImageHeight: rail.imageHeight,
      snap: rail.snap,
      mediaHeight: Math.round((width - T.bandInset * 2) / T.containerMediaAspect),
    },
    pair: {
      tileWidth: pairTile,
      cardImageHeight: Math.round(pairTile * T.pairCardRatio),
      mediaWidth: Math.max(1, width - T.bandInset),
      mediaHeight: Math.round(Math.max(1, width - T.bandInset) / T.pairMediaAspect),
    },
  };
}
