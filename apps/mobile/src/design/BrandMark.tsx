/**
 * Marque ZAYROVI — dessinée ici, avec les jetons de l'identité.
 *
 * L'emblème est le Z officiel (tracé vectoriel `Z_MARK`, aucune image importée),
 * en encre du thème : noir sur fond clair, blanc sur fond sombre. Le logo est
 * monochrome — pas de violet : le violet reste réservé à l'action principale.
 * Le nom suit, dans la même encre.
 *
 * `size` garde son sens d'origine (côté de la boîte de l'emblème, en points) :
 * le Z est inscrit dans cette largeur, donc l'en-tête ne change pas de gabarit.
 */
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from './ui';
import { useTheme } from './theme';
import { Z_MARK } from './zMark';

export interface BrandMarkProps {
  /** Largeur de la boîte de l'emblème, en points. */
  size?: number;
  /** Afficher le nom à côté du signe. */
  withName?: boolean;
  /** Taille du nom (défaut : proportionnelle au signe). */
  nameSize?: number;
  /** Couleur du signe et du nom (défaut : encre du thème). Le header sur une carte Hero la confie au contraste. */
  nameColor?: string;
}

/** Le Z seul, à la couleur donnée — réutilisé par l'écran de chargement. */
export function ZMark({ width, color }: { width: number; color: string }) {
  const height = Math.round((width * Z_MARK.height) / Z_MARK.width * 10) / 10;
  return (
    <Svg width={width} height={height} viewBox={Z_MARK.viewBox} accessibilityElementsHidden importantForAccessibility="no">
      <Path d={Z_MARK.d} fill={color} />
    </Svg>
  );
}

export function BrandMark({ size = 36, withName = true, nameSize, nameColor }: BrandMarkProps) {
  const theme = useTheme();
  const color = nameColor ?? theme.colors.ink;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityRole="image">
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <ZMark width={size} color={color} />
      </View>

      {withName ? (
        <AppText
          variant="label"
          weight="bold"
          color={color}
          style={{ fontSize: nameSize ?? Math.round(size * 0.5) }}
        >
          ZAYROVI
        </AppText>
      ) : null}
    </View>
  );
}
