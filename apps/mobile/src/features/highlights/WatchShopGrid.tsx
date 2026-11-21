import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { mediaUrl } from '@/api/client';
import type { Reel } from '@/api/social';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { MEDIA_RATIO, RADIUS, veil } from '@/design/tokens.mobile';
import { BRAND } from '@/design/tokens.generated';
import { useTheme } from '@/design/theme';
import { reelCaption } from '@/features/reels/reelCaption';
import { useI18n } from '@/i18n';
import { HighlightProductCard } from './HighlightProductCard';
import { hasHighlightImage } from './highlightProducts';

export const WATCH_SHOP_NAME = 'Watshis Shop';
export const WATCH_SHOP_PATH = '/watch-shop';

export const watchShopReels = (reels: Reel[], hidden: readonly string[]) => reels.filter(
  reel => !hidden.includes(reel.id) && reel.videoUrl && reel.posterUrl && hasHighlightImage(reel.product),
);

const openVideo = (id: string) => router.push(`/highlight-viewer?id=${encodeURIComponent(id)}` as Href);

/** Poster tiles only: the selected video owns the only player. */
export function WatchShopGrid({ reels, edgeToEdge = false }: { reels: Reel[]; edgeToEdge?: boolean }) {
  const { t, locale } = useI18n();
  const { isRTL, iconSize } = useTheme();
  return <View testID="watch-shop-grid" style={[styles.grid, edgeToEdge && styles.flush]}>
    {reels.filter((_, index) => index % 2 === 0).map((first, index) => (
      <View key={first.id} style={[styles.row, edgeToEdge && styles.flush, { flexDirection: rowDirectionFor(isRTL) }]}>
        {reels.slice(index * 2, index * 2 + 2).map(reel => <View key={reel.id} testID={`watch-shop-frame-${reel.id}`}
          style={[styles.tile, !edgeToEdge && styles.rounded]}>
          <AppImage uri={mediaUrl(reel.posterUrl)} contentFit="cover" decorative style={StyleSheet.absoluteFill} />
          <Pressable testID={`highlight-tile-${reel.id}`} onPress={() => openVideo(reel.id)} accessibilityRole="button"
            accessibilityLabel={`${t('highlights.watch')} · ${reelCaption(reel, locale).title}`} style={[StyleSheet.absoluteFill, styles.tileButton]}>
            <View style={styles.play}><Ionicons name="play" size={iconSize.sm} color={BRAND.white} accessibilityElementsHidden /></View>
          </Pressable>
          <View style={styles.productPin} pointerEvents="box-none">
            {reel.product ? <HighlightProductCard compact testID={`highlight-overlay-${reel.id}`}
              product={reel.product} onPress={() => openVideo(reel.id)} /> : null}
          </View>
        </View>)}
        {index * 2 + 1 >= reels.length ? <View style={styles.spacer} /> : null}
      </View>
    ))}
  </View>;
}

const styles = StyleSheet.create({
  grid: { gap: 8 }, row: { gap: 8 }, flush: { gap: 4 },
  tile: { flex: 1, aspectRatio: MEDIA_RATIO.reel, backgroundColor: veil(0.8), overflow: 'hidden' },
  rounded: { borderRadius: RADIUS.md }, spacer: { flex: 1 },
  tileButton: { alignItems: 'flex-end', padding: 8 },
  play: { width: 30, height: 30, borderRadius: RADIUS.full, backgroundColor: veil(0.65), alignItems: 'center', justifyContent: 'center' },
  productPin: { ...StyleSheet.absoluteFill, alignItems: 'flex-end', justifyContent: 'flex-end', padding: 6 },
});
