/**
 * SONIM — la marque, dessinée ici.
 *
 * Une marque n'est pas un logo importé : c'est une forme qui se construit avec
 * les jetons de l'identité (rayon, accent, cible tactile). Ce composant ne
 * contient aucune image, aucun SVG externe, aucun glyphe « récupéré » : un
 * carré à l'accent de la marque, une étincelle, et le nom à côté.
 *
 * Le contraste est un choix mesuré, pas un goût : sur `#FF7900`, du blanc
 * tient 3:1 — suffisant pour une ICONE (seuil non-texte), insuffisant pour du
 * texte. Le nom est donc porté en `ink` sur le fond de la page, jamais posé sur
 * l'orange. Écrire « SONIM » en blanc sur l'accent serait joli et illisible.
 */
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';

export interface SonimMarkProps {
  /** Côté du carré, en points. */
  size?: number;
  /** Afficher le nom à côté de la marque. */
  withName?: boolean;
  /** Afficher l'indice « BETA » — la phase réelle du produit, pas un décor. */
  withPhase?: boolean;
  /** Nom affiché (injecté : la marque ne connaît pas la langue). */
  name?: string;
  phase?: string;
}

export function SonimMark({
  size = 36, withName = true, withPhase = false, name = 'SONIM', phase = '',
}: SonimMarkProps) {
  const theme = useTheme();
  const glyph = Math.round(size * 0.55);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        accessibilityElementsHidden
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          backgroundColor: theme.colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="sparkles" size={glyph} color={theme.colors.onAccent} />
      </View>

      {withName ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <AppText variant="label" weight="bold" color={theme.colors.ink} style={{ fontSize: 17, letterSpacing: 0.6 }}>
            {name}
          </AppText>
          {withPhase && phase ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: theme.radius.control,
                borderWidth: 1,
                borderColor: theme.colors.line,
              }}
            >
              <AppText variant="caption" color={theme.colors.muted}>{phase}</AppText>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
