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
 * Refonte du même jour : 300×137, rayon 10, photo en bande de 90 pleine hauteur,
 * sans bordure ni ombre, marque au-dessus du titre (planche mockup-v4).
 */
export const ARTICLE_CARD = {
  width: 300,
  height: 137,
  radius: 10,
  padding: 0,
  gap: 12,
  thumb: 90,
  thumbRadius: 0,
  brandSize: 13,
  titleSize: 12,
  titleLines: 2,
  priceSize: 12,
  favourite: 21,
} as const;
