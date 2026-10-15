/**
 * Marque AYROVI — dessinée ici, avec les jetons de l'identité.
 *
 * Aucune image importée, aucun SVG externe : un carré au VIOLET de la marque
 * (`accent`, #571EF6), la lettre « A » en blanc (`onAccent`, 7,19:1), et le
 * nom à côté en `ink`.
 */
import { View } from 'react-native';

import { AppText } from './ui';
import { useTheme } from './theme';

export interface BrandMarkProps {
  /** Côté du carré, en points. */
  size?: number;
  /** Afficher le nom à côté du signe. */
  withName?: boolean;
  /** Taille du nom (défaut : proportionnelle au signe). */
  nameSize?: number;
  /** Couleur du nom (défaut : encre du thème). Le header sur une carte Hero la confie au contraste. */
  nameColor?: string;
}

export function BrandMark({ size = 36, withName = true, nameSize, nameColor }: BrandMarkProps) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityRole="image">
      <View
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          backgroundColor: theme.colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppText
          variant="label"
          weight="bold"
          color={theme.colors.onAccent}
          style={{ fontSize: Math.round(size * 0.58), lineHeight: Math.round(size * 0.66) }}
        >
          A
        </AppText>
      </View>

      {withName ? (
        <AppText
          variant="label"
          weight="bold"
          color={nameColor ?? theme.colors.ink}
          style={{ fontSize: nameSize ?? Math.round(size * 0.5), letterSpacing: 1 }}
        >
          AYROVI
        </AppText>
      ) : null}
    </View>
  );
}
