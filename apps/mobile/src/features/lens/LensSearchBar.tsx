/**
 * Barre de recherche flottante de Z Lens — posée SUR la photo, toujours
 * visible.
 *
 * Pourquoi elle existe : la recherche vivait dans le tiroir, qui peut monter
 * plein écran et masquer la photo ET l'information « qu'est-ce qu'on cherche
 * ? ». Google Lens, lui, garde une barre en haut, au-dessus de l'image, et les
 * résultats passent dessous.
 *
 * La barre ne montre JAMAIS une information que le serveur n'a pas envoyée :
 * elle affiche l'étape d'avancement (donc l'identification) ou la requête
 * réellement trouvée, et rien d'autre.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { RADIUS, frost, veil } from '@/design/tokens.mobile';

const THUMB = 30;

export function LensSearchBar({
  uri,
  label,
  onCancel,
  busy,
}: {
  /** Vignette de la photo analysée (null tant qu'aucune photo). */
  uri: string | null;
  /** Le texte affiché : étape d'avancement ou requête trouvée. */
  label: string;
  onCancel: () => void;
  /** La recherche est-elle en cours ? (l'annulation a du sens) */
  busy: boolean;
}) {
  const theme = useTheme();
  const t = useT();
  return (
    <View
      style={[
        styles.wrap,
        // Pastille GIVRÉE (blanc de marque) posée sur la photo : le texte
        // reste lisible sur n'importe quelle image, claire ou sombre.
        { backgroundColor: frost(0.9), flexDirection: theme.isRTL ? 'row-reverse' : 'row' },
      ]}
      testID="lens-search-bar"
    >
      {uri ? (
        <View style={[styles.thumb, { borderColor: veil(0.12) }]}>
          <AppImage uri={uri} contentFit="cover" style={StyleSheet.absoluteFill} decorative />
        </View>
      ) : null}
      <View style={styles.label} testID="lens-search-bar-label">
        <AppText variant="caption" weight="semibold" color={theme.colors.ink} numberOfLines={1}>
          {label}
        </AppText>
      </View>
      {busy ? (
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          testID="lens-search-bar-cancel"
          hitSlop={10}
          style={({ pressed }) => [styles.cancel, { opacity: pressed ? theme.opacity.subtle : 1 }]}
        >
          <Ionicons name="close" size={theme.iconSize.sm} color={theme.colors.ink} accessibilityElementsHidden />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { flex: 1 },
  cancel: { padding: 2 },
});
