/**
 * CARTE « ARTICLE » — contrat partagé (24/10/2026).
 *
 * Décision du propriétaire : module RETENU = **la carte entière est pressable**,
 * sans bouton « Découvrir ». Une seule forme pour le Reel, la Story, la
 * Publication et l'aperçu du back-office.
 *
 * ── Refonte du 24/10/2026 (planche `docs/design/reel/compare/mockup-v4-24-10.png`)
 * La carte a été redessinée **d'après le modèle mesuré au pixel** (663×303 px sur
 * un écran de 720 ⇒ 359×164 dp, rayon 20 px ⇒ 3 % de la largeur) puis ramenée à
 * 300 de large pour rester « petite » : 300×137, rayon 10 (même 3 %), photo en
 * bande rectangulaire de 90 pleine hauteur, **sans bordure et sans ombre**, et
 * la marque au-dessus du titre (elle manquait). Le cœur est facultatif — il
 * n'existe que si un gestionnaire de favoris est fourni.
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
  /** Largeur de référence dans une visionneuse de 390 px (marges 13 + 13). */
  width: 300,
  /** Hauteur : mêmes proportions que le modèle (663×303 px ⇒ 0.457). */
  height: 137,
  radius: 10,
  /** Aucun rembourrage : la photo occupe toute la hauteur, bord à bord. */
  padding: 0,
  /** Écart photo → texte (colonne de texte). */
  gap: 12,
  /** Largeur de la bande photo : 30 % de la carte, pleine hauteur. */
  thumb: 90,
  /** Rectangle franc : le rayon de la carte suffit à arrondir les angles. */
  thumbRadius: 0,
  brandSize: 13,
  titleSize: 12,
  /** Deux lignes puis ellipse. */
  titleLines: 2,
  priceSize: 12,
  favourite: 21,
} as const;

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
