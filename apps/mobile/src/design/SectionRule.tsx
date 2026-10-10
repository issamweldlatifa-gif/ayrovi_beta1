/**
 * Filet gris fin entre deux sections de l'accueil (pleine largeur).
 *
 * Sans lui, les blocs se confondent : une image puis un titre paraissent appartenir
 * au même bloc. Le filet utilise la couleur de trait du thème (jamais une couleur en dur).
 */
import { View } from 'react-native';
import { useTheme } from './theme';
import { FullBleed } from './layout';

/** Épaisseur visible sur tous les écrans (un hairline disparaît sur les écrans haute densité). */
export const SECTION_RULE_WIDTH = 1;

export function SectionRule() {
  const theme = useTheme();
  return (
    <FullBleed>
      <View
        style={{ height: SECTION_RULE_WIDTH, backgroundColor: theme.colors.line }}
        testID="section-rule"
      />
    </FullBleed>
  );
}
