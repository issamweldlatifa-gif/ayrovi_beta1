/**
 * CARTE « ARTICLE » — contrat partagé (24/10/2026).
 *
 * Décision du propriétaire : module RETENU = **la carte entière est pressable**,
 * sans bouton « Découvrir ». Une seule forme pour le Reel, la Story, la
 * Publication et l'aperçu du back-office.
 *
 * ── Refonte du 24/10/2026 (planche `docs/design/reel/compare/mockup-v4-24-10.png`)
 * La carte a été redessinée **d'après le modèle mesuré au pixel** (663×303 px sur
 * un écran de 720 ⇒ 359×164 dp), **sans bordure et sans ombre**, avec la marque
 * au-dessus du titre. Le cœur est facultatif — il n'existe que si un
 * gestionnaire de favoris est fourni.
 *
 * ── Correction du 24/10/2026 (soir) — la carte était TROP PETITE
 * Comparaison appareil ↔ modèle : 300×137 contre 664×303 px sur un écran de
 * 720 (332×151,5 dp). Sur un écran de 360 dp, notre carte mesurait 300 dp au
 * lieu de 332 : 10 % de moins, et surtout elle flottait avec 90 dp de vide à
 * droite au lieu d'aller d'un bord à l'autre. La carte n'a donc plus de largeur
 * figée : `articleCardSize(largeurEcran)` la fait **affleurer à 12 dp du bord et
 * montrer 9 dp de la suivante** — exactement les cotes du modèle. À 360 dp on
 * retrouve au pixel les 332×151,5 du modèle (voir `articleCardSize`).
 *
 * ── Source des nombres ───────────────────────────────────────────────────────
 * Les cotes vivent aussi dans `docs/design/reel/assets/card.css` (la maquette
 * HTML) et dans `apps/mobile/src/design/articleCard.ts` (React Native). Un test
 * (`tests/article-card-contract.test.ts`) refuse toute divergence : trois rendus,
 * un seul contrat.
 *
 * ── Règle des données absentes ───────────────────────────────────────────────
 * Une information manquante DISPARAÎT. Aucun « — » à la place d'un prix, aucune
 * image d'attente qui se ferait passer pour le produit, aucune disponibilité
 * affirmée sans preuve. C'est la règle déjà tenue par `shoppableContent.ts`.
 */

export const ARTICLE_CARD = {
  /** Largeur canonique à 390 dp : 390 − 12 (marge) − 9 (amorce) − 7 (écart). */
  width: 362,
  /** Hauteur : proportions exactes du modèle (664×303 px ⇒ 0.4563). */
  height: 165,
  radius: 11,
  /** Aucun rembourrage : la photo occupe toute la hauteur, bord à bord. */
  padding: 0,
  /** Écart photo → texte : 17 px sur le modèle (≈ 8,5 dp), ramené à l'échelle 8. */
  gap: 8,
  /** Largeur de la bande photo : 200 px sur 664 ⇒ 30 %, pleine hauteur. */
  thumb: 109,
  /** Rectangle franc : le rayon de la carte suffit à arrondir les angles. */
  thumbRadius: 0,
  brandSize: 14,
  titleSize: 13,
  /** Deux lignes puis ellipse. */
  titleLines: 2,
  priceSize: 14,
  favourite: 22,
  /** Marge au bord de l'écran : 24 px sur le modèle (12 dp). */
  inset: 12,
  /** Amorce de la carte suivante, au bord opposé (19 px sur le modèle). */
  preview: 9,
  /** Écart entre deux cartes (13 px sur le modèle). */
  cardGap: 7,
  /** Plafond : sur tablette la carte ne s'étire pas en bannière. */
  maxWidth: 420,
} as const;

/**
 * Largeur de la carte pour un écran donné.
 *
 * Le modèle (application de référence, capture 720 px) : 24 px de marge, une
 * carte de 664 px, 13 px d'écart, puis 19 px de la carte suivante. En dp cela
 * donne 12 + carte + 7 + 9 = largeur de l'écran ⇒ carte = écran − 28.
 * Sur un écran de 360 dp : 332 dp — la mesure du modèle, au pixel près.
 *
 * Bornes : jamais moins de 240 (petit téléphone), jamais plus de `maxWidth`.
 */
export function articleCardWidth(viewportWidth: number): number {
  const raw = Math.round(viewportWidth - ARTICLE_CARD.inset - ARTICLE_CARD.preview - ARTICLE_CARD.cardGap);
  return Math.max(240, Math.min(ARTICLE_CARD.maxWidth, raw));
}

/** Cotes dérivées : hauteur et bande photo gardent les proportions du modèle. */
export function articleCardSize(viewportWidth: number): { width: number; height: number; thumb: number } {
  const width = articleCardWidth(viewportWidth);
  const scale = width / ARTICLE_CARD.width;
  return {
    width,
    height: Math.round(ARTICLE_CARD.height * scale),
    thumb: Math.round(ARTICLE_CARD.thumb * scale),
  };
}

export interface ArticleCardFacts {
  name?: string | null;
  brand?: string | null;
  /** Prix final, déjà calculé par le serveur. Jamais un prix d'affichage local. */
  price?: number | null;
  currency?: string | null;
  image?: string | null;
  /** `null` = inconnu : on n'écrit alors ni « disponible » ni « épuisé ». */
  available?: boolean | null;
}

export interface ArticleCardVisibility {
  /** Sans nom, il n'y a pas de carte du tout (pas de carte vide). */
  render: boolean;
  brand: string | null;
  title: string;
  price: string | null;
  image: string | null;
  /** Seul un `false` explicite s'écrit « indisponible ». */
  unavailable: boolean;
}

/** Dérive ce qui s'affiche. Pur, testable, sans invention possible. */
export function articleCardVisibility(facts: ArticleCardFacts): ArticleCardVisibility {
  const name = typeof facts.name === 'string' ? facts.name.trim() : '';
  const brand = typeof facts.brand === 'string' && facts.brand.trim() ? facts.brand.trim() : null;
  const price = typeof facts.price === 'number' && Number.isFinite(facts.price) && facts.price > 0
    ? `${facts.price.toFixed(2)} ${(facts.currency || 'TND').trim() || 'TND'}`
    : null;
  const image = typeof facts.image === 'string' && facts.image.trim() ? facts.image.trim() : null;
  return {
    render: name.length > 0,
    brand,
    title: name,
    price,
    image,
    unavailable: facts.available === false,
  };
}
