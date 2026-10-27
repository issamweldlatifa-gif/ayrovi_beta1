/**
 * Les « correspondances visuelles » : les pages que la recherche visuelle
 * (SerpApi) juge ressemblantes à la photo.
 *
 * SerpApi ne rend pas de boîtes : il n'y a donc pas de cadre à poser sur
 * l'image. Ce qu'on montre, c'est la LISTE — comme la rubrique « Visual
 * matches » de Google Lens. Taper une correspondance ouvre sa fiche ; le prix
 * est alors lu sur la page marchande, jamais deviné.
 *
 * Aucun prix ici : la page est la seule preuve du prix.
 */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { useT } from '@/i18n';
import type { LensVisualMatch } from '@/api/lens';
import { LENS_COLORS } from './lensPalette';
import { OPACITY, RADIUS } from '@/design/tokens.mobile';

export function LensVisualMatches({
  matches,
  onOpen,
}: {
  matches: readonly LensVisualMatch[];
  onOpen: (match: LensVisualMatch) => void;
}) {
  const t = useT();
  if (matches.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      testID="lens-visual-matches"
    >
      {matches.map((match, index) => (
        <Pressable
          key={`${match.url}-${index}`}
          onPress={() => onOpen(match)}
          accessibilityRole="button"
          accessibilityLabel={t('lens.select.product', { name: match.name })}
          style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}
          testID={`lens-visual-match-${index}`}
        >
          {match.image ? (
            <AppImage uri={match.image} contentFit="cover" style={styles.image} decorative />
          ) : (
            <View style={styles.image} />
          )}
          <AppText variant="caption" weight="semibold" color={LENS_COLORS.white} numberOfLines={1}>
            {match.name}
          </AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  item: {
    width: 104,
    gap: 4,
    padding: 6,
    borderRadius: RADIUS.md,
    backgroundColor: LENS_COLORS.cameraControl,
  },
  image: { width: 92, height: 64, borderRadius: RADIUS.sm, backgroundColor: LENS_COLORS.black },
  pressed: { opacity: OPACITY.subtle },
});
