import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, FlatList, Pressable, ScrollView, StyleSheet, View, type ViewToken } from 'react-native';
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { socialCommerceKey, useSocialCommerce, type DiscoveryItem } from '@/api/socialCommerce';
import { editorialSnapshot } from '@/api/socialCommerceCache';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { BrandSymbol } from '@/design/BrandMark';
import { revealChrome } from '@/design/chrome';
import { ErrorBlock, LoadingBlock, EmptyBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { BRAND } from '@/design/tokens.generated';
import { RADIUS, SOCIAL_EDITORIAL, veil } from '@/design/tokens.mobile';
import { AppText } from '@/design/ui';
import { useI18n } from '@/i18n';
import { useHiddenReels } from '@/features/reels/reelVisibility';
import { LiveCartButton } from '@/features/shopping/LiveCartGlyph';
import { StoryViewer } from '@/features/social/StoryViewer';
import { openStoryTarget } from '@/features/social/storyTarget';
import type { StoryItem } from '@/api/sections';
import { parseSocialFilter, SOCIAL_FILTERS } from './navigation';
import { SocialFeedCard } from './SocialFeedCard';
import { useEditorialSnapshot } from './useEditorialSnapshot';

type FeedRow = DiscoveryItem | { kind: 'filters'; id: 'filters' };
const filters: FeedRow = { kind: 'filters', id: 'filters' };
const COVER_COLORS = SOCIAL_EDITORIAL.cover;

function useAutoplay() {
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let live = true;
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const app = AppState.addEventListener('change', state => setForeground(state === 'active'));
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduced(value); }).catch(() => {});
    return () => { live = false; motion.remove(); app.remove(); };
  }, []);
  return focused && foreground && !reduced;
}

export default function SocialCommerceScreen() {
  const theme = useTheme();
  const { locale, t } = useI18n();
  const { top, bottom } = useSafeAreaInsets();
  const filter = parseSocialFilter(useLocalSearchParams<{ filter?: string }>().filter);
  const feed = useSocialCommerce(filter);
  const queryClient = useQueryClient();
  const hidden = useHiddenReels();
  const autoplay = useAutoplay();
  const first = feed.data?.pages[0];
  const snapshot = useEditorialSnapshot(filter, first, feed.dataUpdatedAt);
  const cached = !first || feed.isError || feed.isPaused;
  const [now, setNow] = useState(Date.now);
  const [viewer, setViewer] = useState<{ rows: StoryItem[]; index: number } | null>(null);
  const edition = first?.edition ?? (cached ? snapshot?.edition : null);
  const candidates = useMemo(() => cached
    ? (feed.data?.pages.map(page => editorialSnapshot(page, now)) ?? (snapshot ? [snapshot] : []))
    : (feed.data?.pages ?? []), [cached, feed.data, snapshot, now]);
  const items = useMemo(() => {
    const ids = new Set<string>();
    return candidates.flatMap(page => page.items).filter(row => {
      const key = `${row.kind}:${row.id}`;
      if (ids.has(key) || (row.kind === 'reel' && hidden.includes(row.id))) return false;
      if (row.kind === 'story' && row.story.expiresAt && !(Date.parse(row.story.expiresAt) > now)) return false;
      ids.add(key);
      return true;
    });
  }, [candidates, hidden, now]);
  useEffect(() => {
    const expires = Math.min(...items.flatMap(item => item.kind === 'story' && item.story.expiresAt ? [Date.parse(item.story.expiresAt)] : []));
    if (!Number.isFinite(expires)) return;
    const timer = setTimeout(() => {
      setNow(Date.now());
      setViewer(current => current?.rows.some(story => story.expiresAt && Date.parse(story.expiresAt) <= Date.now()) ? null : current);
    }, Math.min(Math.max(expires - Date.now(), 1), 2_147_483_647));
    return () => clearTimeout(timer);
  }, [items]);
  const data = useMemo(() => [filters, ...items], [items]);
  const storyRows = useMemo(() => items.flatMap(item => item.kind === 'story' ? [item.story] : []), [items]);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const [preview, setPreview] = useState<string | null>(null);
  const viewability = useMemo(() => [
    { viewabilityConfig: { itemVisiblePercentThreshold: 60 }, onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const next = viewableItems.find(row => row.item?.kind === 'reel')?.item.id;
      if (next) setPreview(next);
    } },
    { viewabilityConfig: { itemVisiblePercentThreshold: 40 }, onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      setPreview(previous => previous && viewableItems.some(row => row.item?.kind === 'reel' && row.item.id === previous) ? previous : null);
    } },
  ], []);
  const list = useRef<FlatList<FeedRow>>(null);
  const headerHeight = useRef(0);
  const jump = useRef(false);
  const goToFilter = useCallback(() => list.current?.scrollToOffset({ offset: headerHeight.current, animated: false }), []);
  useFocusEffect(useCallback(() => { revealChrome(); }, []));
  useEffect(() => {
    setPreview(null);
    if (filter !== 'all') {
      jump.current = !headerHeight.current;
      if (!jump.current) goToFilter();
    } else jump.current = false;
  }, [filter, goToFilter]);
  const openStory = (id: string) => {
    if (cached) return;
    const rows = storyRows.filter(row => !row.expiresAt || Date.parse(row.expiresAt) > Date.now());
    const index = rows.findIndex(row => row.id === id);
    if (index >= 0) setViewer({ rows, index });
  };
  const reload = () => void queryClient.resetQueries({ queryKey: socialCommerceKey(filter), exact: true });
  const loadMore = () => { if (!cached && feed.hasNextPage && !feed.isFetching && !feed.isFetchNextPageError) void feed.fetchNextPage(); };
  const storyLabel = (story: StoryItem) => (locale === 'ar' ? story.titleAr : undefined) || story.title || t('sections.stories');
  return (
    <View testID="social-commerce" style={{ flex: 1, paddingTop: top, backgroundColor: theme.colors.canvas }}>
      <View style={[styles.header, { borderColor: theme.colors.line, flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
        <BrandSymbol width={34} />
        <AppText variant="h3" accessibilityRole="header" style={{ flex: 1 }}>{t('tabs.social')}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('socialCommerce.lens')} onPress={() => router.push('/z-lens')} style={styles.hit}>
          <Ionicons name="search-outline" color={theme.colors.ink} size={theme.iconSize.md} />
        </Pressable>
        <LiveCartButton label={t('cart.title')} countLabel={(count) => t('cart.unitsA11y', { count })}
          onPress={() => router.push('/panier')} color={theme.colors.ink} ringColor={theme.colors.canvas} hitStyle={styles.hit} />
      </View>
      <FlatList ref={list} data={data} stickyHeaderIndices={[1]} keyExtractor={item => `${item.kind}:${item.id}`}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: theme.chrome.tabBar + bottom + 24 }}
        windowSize={5} initialNumToRender={3} maxToRenderPerBatch={4} onEndReachedThreshold={0.35} onEndReached={loadMore}
        refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => void feed.refetch()}
        viewabilityConfigCallbackPairs={viewability}
        ListHeaderComponent={<View onLayout={({ nativeEvent }) => {
          headerHeight.current = nativeEvent.layout.height;
          if (jump.current) { jump.current = false; goToFilter(); }
        }}>
          <View style={styles.cover}>
            <LinearGradient colors={COVER_COLORS} style={StyleSheet.absoluteFill} />
            {edition?.cover ? <>
              <AppImage uri={mediaUrl(edition.cover)} contentFit="cover" decorative background={null} style={StyleSheet.absoluteFill} />
              <LinearGradient colors={['transparent', veil(0.88)]} style={StyleSheet.absoluteFill} />
            </> : null}
            <View style={styles.coverCopy}>
              <AppText variant="label" color={BRAND.white}>{edition ? t('socialCommerce.edition', { number: edition.number }) : `ZAYROVI / ${t('tabs.social')}`}</AppText>
              <AppText variant="h1" accessibilityRole="header" color={BRAND.white}>{edition?.title || t('socialCommerce.coverTitle')}</AppText>
              <AppText variant="body" color={BRAND.white}>{edition?.subtitle || t('socialCommerce.coverSubtitle')}</AppText>
              <Pressable accessibilityRole="button" style={styles.coverButton} onPress={goToFilter}>
                <AppText variant="label" color={BRAND.black}>{t('socialCommerce.coverAction')}</AppText>
              </Pressable>
            </View>
          </View>
          {cached && items.length ? <View style={styles.group}><AppText variant="caption" accessibilityLiveRegion="polite">{t('socialCommerce.cached')}</AppText></View> : null}
          {(filter === 'all' || filter === 'stories') && storyRows.length ? <View style={styles.group}>
            <AppText variant="h3" accessibilityRole="header">{t('socialCommerce.storiesNow')}</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyRail}>
              {storyRows.slice(0, 8).map(story => (
                <Pressable key={story.id} accessibilityRole="button" accessibilityLabel={storyLabel(story)} style={styles.story} disabled={cached} onPress={() => openStory(story.id)}>
                  <View style={[styles.storyRing, { borderColor: seen.has(story.id) ? theme.colors.line : COVER_COLORS[1] }]}>
                    {story.mediaType === 'IMAGE' ? <AppImage uri={mediaUrl(story.mediaUrl)} decorative style={styles.storyImage} />
                      : <Ionicons name="play" size={theme.iconSize.sm} color={theme.colors.ink} />}
                  </View>
                  <AppText variant="caption" numberOfLines={1}>{storyLabel(story)}</AppText>
                </Pressable>
              ))}
            </ScrollView>
          </View> : null}
        </View>}
        renderItem={({ item, index }) => item.kind === 'filters' ? <View style={{ backgroundColor: theme.colors.canvas, borderBottomColor: theme.colors.line, borderBottomWidth: StyleSheet.hairlineWidth }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {SOCIAL_FILTERS.map(value => <Pressable accessibilityRole="tab" accessibilityState={{ selected: filter === value }} key={value}
              onPress={() => { router.setParams({ filter: value }); goToFilter(); }}
              style={[styles.chip, { borderColor: filter === value ? theme.colors.ink : theme.colors.line, backgroundColor: filter === value ? theme.colors.ink : theme.colors.canvas }]}>
              <AppText variant="label" color={filter === value ? theme.colors.canvas : theme.colors.ink}>{t(`socialCommerce.filter.${value}`)}</AppText>
            </Pressable>)}
          </ScrollView>
        </View> :
          <SocialFeedCard item={item} cached={cached} onOpenStory={openStory} active={!cached && autoplay && !viewer && item.kind === 'reel' && item.id === preview} square={index % 2 === 0} />}
        ListFooterComponent={<View style={styles.group}>
          {feed.isPending || feed.isFetchingNextPage ? <LoadingBlock /> : null}
          {feed.isError ? <ErrorBlock error={feed.error} onRetry={feed.isFetchNextPageError ? reload : () => void feed.refetch()} /> : null}
          {!feed.isPending && !feed.isError && !items.length && !feed.hasNextPage ? <EmptyBlock>{t('socialCommerce.empty')}</EmptyBlock> : null}
          {!cached && feed.hasNextPage && !feed.isFetching && !feed.isFetchNextPageError ? <Pressable accessibilityRole="button" style={styles.hit} onPress={loadMore}>
            <AppText variant="label">{t('socialCommerce.more')}</AppText>
          </Pressable> : null}
          {filter === 'all' ? <Pressable accessibilityRole="button" testID="social-pub-to-shop" style={[styles.publications, { borderColor: theme.colors.line }]}
            onPress={() => router.push('/publications')}>
            <AppText variant="h3">Pub to Shop</AppText>
            <AppText variant="body">{t('socialCommerce.publications')}</AppText>
          </Pressable> : null}
        </View>}
      />
      {viewer && !cached ? <StoryViewer visible stories={viewer.rows} initialIndex={viewer.index} onClose={() => setViewer(null)}
        onStorySeen={({ id }) => setSeen(previous => previous.has(id) ? previous : new Set([...previous, id]))}
        onOpenTarget={story => { setViewer(null); openStoryTarget(story); }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 6, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  hit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cover: { aspectRatio: 4 / 5, minHeight: 280, justifyContent: 'flex-end' },
  coverCopy: { padding: 24, gap: 10 },
  coverButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, borderRadius: RADIUS.full, paddingHorizontal: 20, backgroundColor: BRAND.white },
  group: { paddingHorizontal: 16, paddingVertical: 12, gap: 16 },
  storyRail: { gap: 16 },
  story: { width: 68, alignItems: 'center', gap: 4 },
  storyRing: { width: 68, height: 68, borderWidth: 2, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  storyImage: { width: 58, height: 58, borderRadius: 29 },
  filters: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  chip: { borderRadius: RADIUS.full, borderWidth: 1, paddingHorizontal: 16, justifyContent: 'center', minHeight: 44 },
  publications: { borderTopWidth: StyleSheet.hairlineWidth, minHeight: 64, gap: 4, paddingVertical: 8 },
});
