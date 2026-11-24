import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useZayroviHighlights } from '@/api/zayroviHighlights';
import { MediaSectionMark } from '@/design/MediaSectionMark';
import { SectionBreak } from '@/design/SectionRule';
import { AppText } from '@/design/ui';
import { BRAND } from '@/design/tokens.generated';
import { FullBleed, useResponsive } from '@/design/layout';
import Ionicons from '@expo/vector-icons/Ionicons';
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
  const { isRTL, opacity, iconSize } = useTheme();
  const { gutter } = useResponsive();
  const reels = watchShopReels(query.data?.reels ?? [], hidden);
  return <>
    <SectionBreak />
    <FullBleed>
    <View ref={anchor} collapsable={false} style={styles.anchor} />
    {query.data?.enabled !== false ? <View testID="home-highlights" style={styles.section}>
      <View style={[styles.heading, { flexDirection: rowDirectionFor(isRTL), paddingHorizontal: gutter }]}>
        <View style={styles.mark}><MediaSectionMark lead="Watshis" suffix="Shop" tone="onMedia" /></View>
        <Pressable testID="watch-shop-explore" accessibilityRole="link" onPress={() => router.push(WATCH_SHOP_PATH as Href)}
          style={({ pressed }) => [styles.explore, { flexDirection: rowDirectionFor(isRTL) }, pressed && { opacity: opacity.subtle }]}>
          <AppText variant="label" color={BRAND.white}>{t('socialCommerce.explore')}</AppText>
          <Ionicons name={isRTL ? 'arrow-back' : 'arrow-forward'} size={iconSize.sm} color={BRAND.white} accessibilityElementsHidden />
        </Pressable>
      </View>
      {reels.length ? <WatchShopGrid reels={reels} edgeToEdge /> : !query.isPending ?
        <AppText variant="caption" color={BRAND.white} style={{ marginHorizontal: gutter }}>{t(query.isError ? 'highlights.loadError' : 'highlights.empty')}</AppText> : null}
    </View> : null}
  </FullBleed>
  </>;
}

const styles = StyleSheet.create({
  anchor: { height: 1 },
  section: { backgroundColor: BRAND.black, paddingBottom: 4, gap: 8 },
  heading: { alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', paddingVertical: 8, gap: 8 },
  mark: { flexGrow: 1 }, explore: { minHeight: 44, alignItems: 'center', gap: 6 },
});
