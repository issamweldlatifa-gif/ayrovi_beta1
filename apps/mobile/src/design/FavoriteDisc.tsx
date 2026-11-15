/**
 * Bouton favori des cartes produit — modèle du 15/11 (capture 004641) :
 * un rond blanc, un cœur au trait sombre au centre.
 *
 *  • repos  : cœur au trait (famille des glyphes du rail, trait 1.8) en encre ;
 *  • actif  : cœur plein au bleu d'action (règle de marque « élément actif »).
 *
 * Le rond reste blanc dans les deux modes : il se pose sur une photo, pas sur
 * une surface du thème, et une ombre très légère le détache d'un fond blanc.
 * Une seule forme pour toutes les cartes (accueil, Publication, AYWEBs, Lens).
 */
import { StyleSheet, View } from 'react-native';

import { useTheme } from './theme';
import { CARD_SYSTEM } from './cardSystem';
import { BRAND } from './tokens.generated';
import { ReelGlyph } from '@/features/reels/ReelIcons';

export const FAVORITE_DISC = {
  ink: BRAND.black,
  surface: BRAND.white,
  /** Le rond reste blanc en mode sombre : le bleu coché est donc le bleu de marque fixe. */
  active: BRAND.violet,
} as const;

export function FavoriteDiscGlyph({ active, size = CARD_SYSTEM.heartIcon, disc = CARD_SYSTEM.heartDisc, testID }: {
  active: boolean;
  size?: number;
  disc?: number;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.disc, theme.elevation.low, { width: disc, height: disc, borderRadius: disc / 2, backgroundColor: FAVORITE_DISC.surface }]}
    >
      <ReelGlyph name="heart" size={size} color={active ? FAVORITE_DISC.active : FAVORITE_DISC.ink} filled={active} />
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center' },
});
