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
 */
export const ARTICLE_CARD = {
  width: 336,
  height: 158,
  radius: 16,
  padding: 10,
  gap: 12,
  thumb: 118,
  thumbRadius: 11,
  brandSize: 15,
  titleSize: 13,
  titleLines: 2,
  priceSize: 14,
  favourite: 30,
} as const;
