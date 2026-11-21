import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useZayroviHighlights } from '@/api/zayroviHighlights';
import { MediaSectionMark } from '@/design/MediaSectionMark';
import { AppText } from '@/design/ui';
import { BRAND } from '@/design/tokens.generated';
import { RADIUS } from '@/design/tokens.mobile';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { useHiddenReels } from '@/features/reels/reelVisibility';
import { useReelPreviewActivity } from '@/features/reels/useReelPreviewActivity';
import { WATCH_SHOP_PATH, WatchShopGrid, watchShopReels } from './WatchShopGrid';

export function HighlightsSection() {
  const anchor = useRef<View>(null);
  const { visible } = useReelPreviewActivity(anchor);
  const query = useZayroviHighlights(visible);
  const hidden = useHiddenReels();
  const t = useT();
  const { isRTL, opacity } = useTheme();
  const reels = watchShopReels(query.data?.reels ?? [], hidden);
  return <View>
    <View ref={anchor} collapsable={false} style={styles.anchor} />
    {query.data?.enabled !== false ? <View testID="home-highlights" style={styles.section}>
      <View style={[styles.heading, { flexDirection: rowDirectionFor(isRTL) }]}>
        <View style={styles.mark}><MediaSectionMark lead="Watshis" suffix="Shop" tone="onMedia" /></View>
        <Pressable testID="watch-shop-explore" accessibilityRole="link" onPress={() => router.push(WATCH_SHOP_PATH as Href)}
          style={({ pressed }) => [styles.explore, pressed && { opacity: opacity.subtle }]}>
          <AppText variant="label" color={BRAND.white}>{t('socialCommerce.explore')}</AppText>
        </Pressable>
      </View>
      {reels.length ? <WatchShopGrid reels={reels} /> : !query.isPending ?
        <AppText variant="caption" color={BRAND.white}>{t(query.isError ? 'highlights.loadError' : 'highlights.empty')}</AppText> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  anchor: { height: 1 },
  section: { width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: BRAND.black, borderRadius: RADIUS.md, padding: 12, gap: 6 },
  heading: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mark: { flex: 1 }, explore: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
