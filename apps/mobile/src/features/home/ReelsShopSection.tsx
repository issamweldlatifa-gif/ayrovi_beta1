import { ReelPageFooter } from '@/features/reels/ReelPageFooter';
/**
 * Real, muted Reel previews. 15/11 : la vignette est nue — ni pastille « lecture »
 * sur la photo, ni ligne éditeur (avatar + « Zayrovi Team » + •••) dessous.
 */
import { memo, useMemo, useRef, useState } from 'react';
import {
  useWindowDimensions,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useReels } from '@/api/hooks';
import { AppText } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { mediaUrl } from '@/api/client';
import { FullBleed, useResponsive } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { MEDIA_RATIO, REEL_TILE } from '@/design/tokens.mobile';
import { CARD_SYSTEM } from '@/design/cardSystem';
import { FadeIn } from '@/design/motion';
import { useT, useI18n } from '@/i18n';
import { ReelsShopMark } from '@/features/reels/ReelsShopMark';
import { ReelPreview } from '@/features/reels/ReelPreview';
import { useReelPreviewActivity } from '@/features/reels/useReelPreviewActivity';
import {
  useHiddenReels,
  restoreHiddenReels,
} from '@/features/reels/reelVisibility';
import type { Reel } from '@/api/social';

export const ReelsShopSection = memo(function ReelsShopSection() {
  const theme = useTheme(),
    t = useT(),
    { locale } = useI18n();
  const { gutter } = useResponsive(),
    { width } = useWindowDimensions();
  const section = useRef<View>(null);
  const autoplay = useReelPreviewActivity(section);
  // Below-fold media must not compete with the first visible homepage content.
  const reels = useReels(autoplay.visible);
  const hidden = useHiddenReels();
  const rows = useMemo(() => {
    const excluded = new Set(hidden);
    return (reels.data ?? []).filter(row => !excluded.has(row.id));
  }, [reels.data, hidden]);
  const [visibleId, setVisibleId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item?: Reel }> }) =>
      setVisibleId(viewableItems[0]?.item?.id ?? null)
  ).current;
  if (!rows.length && !hidden.length) return <View ref={section} collapsable={false} style={{ minHeight: 1 }} />;
  const tileWidth = Math.round((width - gutter * 2) * REEL_TILE.widthFraction);
  const tileHeight = Math.round(tileWidth / MEDIA_RATIO.reel);
  const open = (reel: Reel) =>
    router.push({ pathname: '/reels-viewer', params: { id: reel.id } });
  return (
    <FadeIn testID="home-reels-shop">
      <View ref={section} collapsable={false}>
        <View style={[styles.section, { paddingBottom: theme.space[2] }]}>
          <ReelsShopMark />
        </View>
        <FullBleed>
          <FlatList
            onEndReached={() => { if (reels.hasNextPage && !reels.isFetching && !reels.isFetchNextPageError) void reels.fetchNextPage(); }}
            onEndReachedThreshold={0.5}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            windowSize={3}
            horizontal
            data={rows}
            keyExtractor={(item) => item.id}
            ListFooterComponent={<ReelPageFooter query={reels} />}
            showsHorizontalScrollIndicator={false}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            // Arrêt net sur chaque Reel : la tuile se cale à la marge, la suivante
            // reste entamée sur le flanc. 13/11 : l'écart du système de cartes (8, était 12).
            snapToInterval={tileWidth + CARD_SYSTEM.gap}
            decelerationRate="fast"
            disableIntervalMomentum
            contentContainerStyle={{
              paddingHorizontal: gutter,
              gap: CARD_SYSTEM.gap,
              paddingBottom: theme.space[2],
            }}
            renderItem={({ item }) => (
              <View style={{ width: tileWidth }}>
                <View
                  testID={`home-reel-media-${item.id}`}
                  style={[
                    styles.tile,
                    {
                      width: tileWidth,
                      height: tileHeight,
                      borderRadius: theme.radius.card,
                      backgroundColor: theme.colors.shimmer,
                    },
                  ]}
                >
                  <View testID={`home-reel-visual-${item.id}`} pointerEvents="none" collapsable={false} style={StyleSheet.absoluteFill}>
                    {item.posterUrl ? (
                      <AppImage
                        uri={mediaUrl(item.posterUrl)}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        decorative
                      />
                    ) : null}
                    {autoplay.visible && autoplay.autoplay &&
                    item.id === (visibleId ?? rows[0]?.id) ? (
                      <ReelPreview
                        uri={item.videoUrl}
                        playing={autoplay.autoplay}
                      />
                    ) : null}
                  </View>
                  {/* Keep the touch target above, not around, Android PlayerView. */}
                  <Pressable
                    testID={`home-reel-tile-${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={item.title || t('home.reelsShop.open')}
                    onPress={() => open(item)}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              </View>
            )}
          />
        </FullBleed>
        {hidden.length ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setError('');
              restoreHiddenReels().catch(() =>
                setError(
                  locale === 'ar'
                    ? 'تعذّرت الاستعادة. حاول مجددًا.'
                    : 'Restauration impossible. Réessayez.'
                )
              );
            }}
            style={styles.restore}
          >
            <AppText variant="caption">
              {locale === 'ar'
                ? 'إظهار الفيديوهات المخفية على هذا الجهاز'
                : 'Réafficher les Reels masqués sur cet appareil'}
            </AppText>
          </Pressable>
        ) : null}
        {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
      </View>
    </FadeIn>
  );
});
const styles = StyleSheet.create({
  /* 15/11 — plus de filet : le titre suit directement l'espace de section (48 dp, `SectionBreak`). */
  section: { paddingTop: 0 },
  tile: { overflow: 'hidden' },
  restore: { minHeight: 44, justifyContent: 'center' },
});
