/**
 * Cotes de la carte « article » côté React Native.
 *
 * Elles sont IDENTIQUES à `shared/articleCard.ts` et à
 * `docs/design/reel/assets/card.css`. Ce n'est pas une troisième source : un test
 * (`tests/article-card-contract.test.ts`) compare les trois et échoue à la
 * moindre divergence. Metro ne peut pas lire `shared/` (racine du projet
 * Expo = `apps/mobile`), d'où cette copie contrôlée plutôt qu'un import cassé.
 *
 * Décision du 24/10/2026 : la carte ENTIÈRE est pressable — pas de bouton.
 * Refonte du même jour : 362×165 à 390 dp, rayon 11, photo en bande de 30 % pleine
 * hauteur, sans bordure ni ombre, marque au-dessus du titre (planche mockup-v4).
 *
 * Correction du soir : la carte ne prend plus une largeur figée. Sur l'appareil
 * elle mesurait 300 dp là où le modèle en fait 332 sur un écran de 360 : elle
 * flottait au milieu avec 90 dp de vide. `articleCardSize(largeurÉcran)` la
 * colle aux cotes du modèle (marge 12, amorce 9, écart 7).
 */
export const ARTICLE_CARD = {
  width: 362,
  height: 165,
  radius: 11,
  padding: 0,
  gap: 8,
  thumb: 109,
  thumbRadius: 0,
  brandSize: 14,
  titleSize: 13,
  titleLines: 2,
  priceSize: 14,
  favourite: 22,
  inset: 12,
  preview: 9,
  cardGap: 7,
  maxWidth: 420,
} as const;

/** Même formule que `shared/articleCard.ts` (le test de contrat compare les cotes). */
export function articleCardWidth(viewportWidth: number): number {
  const raw = Math.round(viewportWidth - ARTICLE_CARD.inset - ARTICLE_CARD.preview - ARTICLE_CARD.cardGap);
  return Math.max(240, Math.min(ARTICLE_CARD.maxWidth, raw));
}

export function articleCardSize(viewportWidth: number): { width: number; height: number; thumb: number } {
  const width = articleCardWidth(viewportWidth);
  const scale = width / ARTICLE_CARD.width;
  return {
    width,
    height: Math.round(ARTICLE_CARD.height * scale),
    thumb: Math.round(ARTICLE_CARD.thumb * scale),
  };
}
