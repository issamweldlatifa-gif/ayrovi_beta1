/**
 * Section « Reels • Shop » de l'accueil, sous « À la une ».
 *
 * Présentation (d'après la référence Facebook) : en-tête « ▶ Reels • Shop », puis une
 * rangée horizontale de vignettes verticales 9:16. La première vignette occupe
 * `REEL_TILE.widthFraction` de la colonne et la suivante dépasse à droite (indice de
 * défilement). Les marges viennent de l'écran (`gutter`), la hauteur du ratio partagé.
 *
 * Données : les Reels publiés (même source que la page Reels). Rien à afficher ⇒
 * rien ne s'affiche (pas de bloc vide, pas de bloc de chargement sur l'accueil).
 *
 * Toucher une vignette ouvre la visionneuse plein écran à ce Reel.
 */
import { useWindowDimensions, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useReels } from '@/api/hooks';
import { AppText } from '@/design/ui';
import { FullBleed, useResponsive } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { MEDIA_RATIO, REEL_TILE } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { ReelsShopMark } from '@/features/reels/ReelsShopMark';
import type { Reel } from '@/api/social';

export function ReelsShopSection() {
  const theme = useTheme();
  const t = useT();
  const { gutter } = useResponsive();
  const { width } = useWindowDimensions();
  const reels = useReels();

  const rows = reels.data ?? [];
  if (rows.length === 0) return null;

  const tileWidth = Math.round((width - gutter * 2) * REEL_TILE.widthFraction);
  const tileHeight = Math.round(tileWidth / MEDIA_RATIO.reel);

  const open = (reel: Reel) => {
    router.push({ pathname: '/reels-viewer', params: { id: reel.id } });
  };

  return (
    <View testID="home-reels-shop">
      <View style={[styles.section, { gap: theme.space[3] }]}>
        <ReelsShopMark />
      </View>

      <FullBleed>
        <FlatList
          horizontal
          data={rows}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: gutter, gap: theme.space[1], paddingBottom: theme.space[4] }}
          renderItem={({ item }) => (
            <Pressable
              testID={`home-reel-tile-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={item.title || t('home.reelsShop.open')}
              onPress={() => open(item)}
              style={({ pressed }) => [
                styles.tile,
                {
                  width: tileWidth,
                  height: tileHeight,
                  borderRadius: theme.radius.card,
                  backgroundColor: theme.colors.surface,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={styles.poster}>
                <Ionicons name="play-circle-outline" size={44} color={theme.colors.muted} accessibilityElementsHidden />
              </View>
              {item.title ? (
                <View style={styles.caption}>
                  <AppText variant="label" weight="bold" color={theme.colors.onMedia} numberOfLines={2}>
                    {item.title}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      </FullBleed>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: 16 },
  tile: { overflow: 'hidden', justifyContent: 'flex-end' },
  poster: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  caption: { padding: 10, backgroundColor: 'rgba(0,0,0,0.35)' },
});
