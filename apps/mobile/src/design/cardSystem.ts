/**
 * SYSTÈME DE CARTES — une seule règle pour les rangées et duos de cartes
 * produit de l'application (13/11/2026, consigne « توحيد نظام صور وبطقات »).
 *
 * Constat sur l'appareil (captures 073653 → 073818, 706 px = 360 dp) :
 *  • modèle container : 24 dp à gauche au repos, ~0 dp à droite ; après un
 *    petit glissement 10 dp à gauche et 7 dp à droite — la rangée débordait de
 *    30 dp (1,96 carte « visible » + un retrait compté une seule fois) ;
 *  • modèle media : vignettes de 103 dp coupées au bord (3,15 visibles) ;
 *  • titre du bandeau à 24 dp, cartes à 16 dp : deux lignes de départ ;
 *  • cœur dans un rond blanc de 40 dp posé SUR la photo ;
 *  • Reels : 12 dp entre deux vignettes, 8 partout ailleurs.
 *
 * La règle :
 *  1. **Partage égal.** Une rangée montre un nombre ENTIER de cartes (2 sur
 *     téléphone, 4 sur tablette) qui remplissent la largeur : même marge à
 *     gauche et à droite, au repos comme en fin de rangée. Au-delà, la rangée
 *     glisse d'une carte à la fois et s'arrête toujours sur la marge.
 *  2. **Une marge, un écart.** Marge `gutter` = la marge d'écran de l'app sur
 *     téléphone (`SPACE[2]` = 12, `layoutLogic`), écart `gap` = 8, pour les
 *     cartes ET pour le texte qui les accompagne (titre, « Suivre »). À 360 dp :
 *     12 · 164 · 8 · 164 · 12 — des cartes plus grandes que les 152/163 d'avant.
 *  3. **Une carte.** Cadre gris arrondi 12, photo entière, rapport 1,44 ;
 *     marque · nom · prix sous le cadre ; l'ancien prix sur SA ligne.
 *  4. **Un cœur.** Trait fin nu (sans rond blanc), 18 dp, dans le coin haut,
 *     cible 40 dp : il ne cache plus la photo.
 *
 * La grille du catalogue (bord à bord, 2/3, cotes de la vidéo du propriétaire)
 * garde sa géométrie mais partage le même cœur.
 *
 * Module PUR (aucun import natif) : composants, aperçu CRM et tests lisent les
 * mêmes nombres.
 */

import { SPACE } from './tokens.generated';

export const CARD_SYSTEM = {
  /** Marge de page des rangées de cartes = marge d'écran téléphone de l'app (12). */
  gutter: SPACE[2],
  /** Écart entre deux cartes voisines. */
  gap: 8,
  /** Cartes entières visibles : téléphone / tablette. */
  perView: 2,
  perViewWide: 4,
  /** Seuil tablette (même valeur que la grille produit). */
  wideFrom: 600,
  /** Cadre de la photo. */
  radius: 12,
  imageRatio: 1.44,
  /** Cœur : trait nu, sans pastille. */
  heartIcon: 18,
  heartTarget: 40,
  heartInset: 2,
} as const;

/**
 * Largeur d'une carte pour `perView` cartes entières dans `width` :
 * deux marges, `perView − 1` écarts, aucune amorce coupée.
 */
export function cardWidthFor(width: number, perView: number = CARD_SYSTEM.perView): number {
  const C = CARD_SYSTEM;
  const count = Math.max(1, Math.floor(perView));
  const safe = Number.isFinite(width) && width > 0 ? width : 360;
  return Math.max(1, (safe - C.gutter * 2 - C.gap * (count - 1)) / count);
}

/** Cartes visibles selon la largeur (2 sur téléphone, 4 sur tablette). */
export function cardsPerView(width: number): number {
  return width >= CARD_SYSTEM.wideFrom ? CARD_SYSTEM.perViewWide : CARD_SYSTEM.perView;
}

export interface CardRailMetrics {
  cardWidth: number;
  imageHeight: number;
  /** Pas d'aimantation : une carte + un écart (la rangée s'arrête toujours sur la marge). */
  snap: number;
  perView: number;
}

export function cardRailMetrics(width: number, perView: number = cardsPerView(width)): CardRailMetrics {
  const cardWidth = cardWidthFor(width, perView);
  return {
    cardWidth,
    imageHeight: Math.round(cardWidth * CARD_SYSTEM.imageRatio),
    snap: cardWidth + CARD_SYSTEM.gap,
    perView,
  };
}

/**
 * Décalage maximal d'une rangée de `count` cartes : toujours un multiple du pas
 * (la dernière carte s'arrête sur la marge de droite, comme la première à gauche).
 */
export function cardRailMaxOffset(count: number, metrics: CardRailMetrics): number {
  return Math.max(0, count - metrics.perView) * metrics.snap;
}
