/**
 * Marque AYROVI — dessinée ici, avec les jetons de l'identité.
 *
 * Aucune image importée, aucun SVG externe : un carré à l'accent de la marque,
 * la lettre « A » (l'identité officielle est « AYROVI A »), et le nom à côté.
 * C'est VOLONTAIREMENT la même famille graphique que `SonimMark` : deux marques
 * d'un même produit doivent se ressembler, sinon ce n'est plus un système de
 * design mais deux dessins qui cohabitent.
 *
 * Contraste mesuré, pas goûté : sur `#FF7900`, le blanc tient ≈ 3:1 — seuil
 * NON-TEXTUEL. Un « A » est un signe, pas une phrase : c'est acceptable pour
 * un glyphe épais, ce qui justifie de garder le NOM en `ink` à côté plutôt que
 * posé sur l'orange.
 */
import { View } from 'react-native';

import { AppText } from './ui';
import { rowDirectionFor } from './layoutLogic';
import { useTheme } from './theme';

export interface BrandMarkProps {
  /** Côté du carré, en points. */
  size?: number;
  /** Afficher le nom à côté du signe. */
  withName?: boolean;
  /** Taille du nom (défaut : proportionnelle au signe). */
  nameSize?: number;
}

export function BrandMark({ size = 36, withName = true, nameSize }: BrandMarkProps) {
  const theme = useTheme();

  return (
    <View style={[{ flexDirection: rowDirectionFor(theme.isRTL) }, { alignItems: 'center', gap: 10 }]} accessibilityRole="image">
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
          color={theme.colors.ink}
          style={{ fontSize: nameSize ?? Math.round(size * 0.5), letterSpacing: 1 }}
        >
          AYROVI
        </AppText>
      ) : null}
    </View>
  );
}
