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
 *
 * 16/11 (retour du propriétaire) : pendant la recherche, le tiroir « Produits
 * similaires » (squelettes) ne monte PLUS. La barre prend toute la largeur en haut :
 * la petite photo ronde est entourée d'un anneau qui tourne et d'un halo qui
 * respire, au bleu d'action. Le tiroir n'arrive qu'avec les premiers résultats.
 */
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { RADIUS, frost, veil } from '@/design/tokens.mobile';
import { LENS_COLORS } from './lensPalette';

const THUMB = 30;
/** Anneau de chargement autour de la vignette (vignette + 3 dp de chaque côté). */
const RING = 36;

export function LensSearchBar({
  uri,
  label,
  onCancel,
  busy,
  loading = false,
}: {
  /** Vignette de la photo analysée (null tant qu'aucune photo). */
  uri: string | null;
  /** Le texte affiché : étape d'avancement ou requête trouvée. */
  label: string;
  onCancel: () => void;
  /** La recherche est-elle en cours ? (l'annulation a du sens) */
  busy: boolean;
  /** Recherche lancée, aucun résultat encore : anneau qui tourne + halo qui respire. */
  loading?: boolean;
}) {
  const theme = useTheme();
  const t = useT();
  const reduced = theme.motion.reduced === 0;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!loading || reduced) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [loading, reduced, pulse]);
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
        <View style={styles.ringBox} testID={loading ? 'lens-search-bar-loading' : undefined}>
          {loading ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.halo,
                { backgroundColor: LENS_COLORS.active, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.32] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] }) }] },
              ]}
            />
          ) : null}
          <View style={[styles.thumb, { borderColor: veil(0.12) }]}>
            <AppImage uri={uri} contentFit="cover" style={StyleSheet.absoluteFill} decorative />
          </View>
          {loading ? (
            <View pointerEvents="none" style={styles.spinner}>
              <ActivityIndicator size="large" color={LENS_COLORS.active} accessibilityElementsHidden />
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.label} testID="lens-search-bar-label">
        <AppText variant="captionStrong" color={loading ? LENS_COLORS.black : theme.colors.ink} numberOfLines={1}>
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
  ringBox: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: RING, height: RING, borderRadius: RING / 2 },
  spinner: { position: 'absolute', width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
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
