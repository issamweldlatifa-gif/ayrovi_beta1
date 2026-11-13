import { ReelPageFooter } from '@/features/reels/ReelPageFooter';
/** Real, muted Reel previews with a first-party publisher row outside the media. */
import { memo, useMemo, useRef, useState } from 'react';
import {
  useWindowDimensions,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useReels } from '@/api/hooks';
import { AppText } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { mediaUrl } from '@/api/client';
import { FullBleed, useResponsive } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { MEDIA_RATIO, REEL_TILE, RADIUS } from '@/design/tokens.mobile';
import { CARD_SYSTEM } from '@/design/cardSystem';
import { FadeIn } from '@/design/motion';
import { useT, useI18n } from '@/i18n';
import { ReelsShopMark } from '@/features/reels/ReelsShopMark';
import { ReelPublisher } from '@/features/reels/ReelPublisher';
import { ReelPreview } from '@/features/reels/ReelPreview';
import { ReelOptions } from '@/features/reels/ReelOptions';
import { useReelPreviewActivity } from '@/features/reels/useReelPreviewActivity';
import {
  useHiddenReels,
  restoreHiddenReels,
} from '@/features/reels/reelVisibility';
import { shareReel } from '@/features/reels/shareReel';
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
  const [options, setOptions] = useState<Reel | null>(null);
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
                    !options &&
                    item.id === (visibleId ?? rows[0]?.id) ? (
                      <ReelPreview
                        uri={item.videoUrl}
                        playing={autoplay.autoplay}
                      />
                    ) : null}
                    <View
                      pointerEvents="none"
                      style={[
                        styles.videoMark,
                        { backgroundColor: theme.colors.onMedia },
                      ]}
                    >
                      <Ionicons
                        name="play"
                        size={theme.iconSize.xs}
                        color={theme.colors.muted}
                        accessibilityElementsHidden
                      />
                    </View>
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
                <View style={styles.publisherRow}>
                  <ReelPublisher />
                  <Pressable
                    testID={`home-reel-options-${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={
                      locale === 'ar' ? 'خيارات الفيديو' : 'Options de la vidéo'
                    }
                    onPress={() => setOptions(item)}
                    style={styles.options}
                  >
                    <Ionicons
                      name="ellipsis-horizontal-outline"
                      size={theme.iconSize.md}
                      color={theme.colors.ink}
                    />
                  </Pressable>
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
      {options ? (
        <ReelOptions
          reel={options}
          onClose={() => setOptions(null)}
          onShare={() => shareReel(options)}
        />
      ) : null}
    </FadeIn>
  );
});
const styles = StyleSheet.create({
  /* 13/11 — « فراغ كبير ابيض » : 12 + l'écart d'écran (12) = 24 après le filet, comme le bloc Lens (était 24 + 12). */
  section: { paddingTop: 12 },
  tile: { overflow: 'hidden' },
  videoMark: {
    position: 'absolute',
    top: 10,
    start: 10,
    width: 20,
    height: 16,
    borderRadius: RADIUS.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publisherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    paddingVertical: 4,
  },
  options: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restore: { minHeight: 44, justifyContent: 'center' },
});
