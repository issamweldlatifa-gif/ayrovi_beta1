import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { HIGHLIGHT_LIMIT } from '../../../../../shared/zayroviHighlights';
import { mediaUrl } from '@/api/client';
import type { Reel } from '@/api/social';
import { useZayroviHighlights } from '@/api/zayroviHighlights';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { BRAND } from '@/design/tokens.generated';
import { MEDIA_RATIO, RADIUS, veil } from '@/design/tokens.mobile';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { reelCaption } from '@/features/reels/reelCaption';
import { useHiddenReels } from '@/features/reels/reelVisibility';
import { useReelPreviewActivity } from '@/features/reels/useReelPreviewActivity';
import { HighlightProductCard } from './HighlightProductCard';
import { hasHighlightImage } from './highlightProducts';

const openHighlight = ({ id }: Reel) => router.push(`/highlight-viewer?id=${encodeURIComponent(id)}` as Href);

/** Posters only: a player is created in the modal, never for the Home tiles. */
export function HighlightsSection() {
  const anchor = useRef<View>(null);
  const { visible } = useReelPreviewActivity(anchor);
  const query = useZayroviHighlights(visible);
  const hidden = useHiddenReels();
  const { t, locale } = useI18n();
  const { isRTL } = useTheme();
  const reels = (query.data ?? []).filter(reel => !hidden.includes(reel.id) && reel.videoUrl && reel.posterUrl && hasHighlightImage(reel.product));
  const row = { flexDirection: rowDirectionFor(isRTL) };
  return <View>
    <View ref={anchor} collapsable={false} style={styles.anchor} />
    {reels.length === HIGHLIGHT_LIMIT ? <View testID="home-highlights" style={styles.section}>
      <View style={[styles.eyebrow, row]}>
        <Ionicons name="sparkles" size={13} color={BRAND.yellow} accessibilityElementsHidden />
        <AppText variant="captionStrong" color={BRAND.yellow}>ZAYROVI HIGHLIGHTS</AppText>
      </View>
      <AppText variant="h2" accessibilityRole="header" color={BRAND.white}>{t('highlights.title')}</AppText>
      <View style={styles.grid}>
        {[reels.slice(0, 2), reels.slice(2, 4)].map((items, index) => <View key={index} style={[styles.gridRow, row]}>
          {items.map(reel => <View style={styles.tile} key={reel.id}>
            <AppImage uri={mediaUrl(reel.posterUrl)} contentFit="cover" decorative style={StyleSheet.absoluteFill} />
            <Pressable testID={`highlight-tile-${reel.id}`} onPress={() => openHighlight(reel)} accessibilityRole="button"
              accessibilityLabel={`${t('highlights.watch')} · ${reelCaption(reel, locale).title}`}
              style={[StyleSheet.absoluteFill, styles.tileButton]}>
              <View style={styles.play}><Ionicons name="play" size={16} color={BRAND.white} accessibilityElementsHidden /></View>
            </Pressable>
            <View style={styles.productPin} pointerEvents="box-none">
              {reel.product ? <HighlightProductCard compact testID={`highlight-overlay-${reel.id}`} product={reel.product} onPress={() => openHighlight(reel)} /> : null}
            </View>
          </View>)}
        </View>)}
      </View>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  anchor: { height: 1 },
  section: { width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: BRAND.black, borderRadius: RADIUS.md, padding: 12, gap: 6 },
  eyebrow: { alignItems: 'center', gap: 6 },
  grid: { gap: 8, marginTop: 6 },
  gridRow: { gap: 8 },
  tile: { flex: 1, aspectRatio: MEDIA_RATIO.reel, borderRadius: RADIUS.md, backgroundColor: veil(0.8), overflow: 'hidden' },
  tileButton: { alignItems: 'flex-start', padding: 8 },
  play: { width: 30, height: 30, borderRadius: RADIUS.full, backgroundColor: veil(0.65), alignItems: 'center', justifyContent: 'center' },
  productPin: { position: 'absolute', right: 7, bottom: 7 },
});
