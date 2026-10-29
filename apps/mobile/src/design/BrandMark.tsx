/**
 * Mot-symbole officiel ZAYROVI.
 *
 * Sans écusson « Z » séparé : le nom `ZAYROVI` s'affiche seul en capitales
 * nettes avec un interlettrage aéré (`WORDMARK_STYLE` défini dans `tokens.mobile.ts`),
 * lisible en mode clair comme en mode sombre.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { FONTS } from './tokens.generated';
import { WORDMARK_STYLE } from './tokens.mobile';
import { useTheme } from './theme';
import { Z_MARK } from './zMark';

export interface BrandMarkProps {
  size?: number;
  withName?: boolean;
  nameSize?: number;
  nameColor?: string;
  color?: string;
}

/** Le Z seul, à la couleur donnée — réutilisé par l'écran de chargement. */
export function ZMark({ width, color }: { width: number; color: string }) {
  const height = Math.round(((width * Z_MARK.height) / Z_MARK.width) * 10) / 10;
  return (
    <Svg width={width} height={height} viewBox={Z_MARK.viewBox} accessibilityElementsHidden importantForAccessibility="no">
      <Path d={Z_MARK.d} fill={color} />
    </Svg>
  );
}

export function BrandMark({
  color,
  nameColor,
}: BrandMarkProps) {
  const theme = useTheme();
  return (
    <View style={styles.row} accessibilityRole="header">
      <Text
        style={[
          styles.word,
          WORDMARK_STYLE,
          { color: color ?? nameColor ?? theme.colors.ink, fontFamily: FONTS.latin.bold },
        ]}
        numberOfLines={1}
      >
        ZAYROVI
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  word: {},
});
