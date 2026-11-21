import { isPublicationCampaign } from '../../../shared/publicationCampaign';
import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useIsFocused } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { AppState, BackHandler, FlatList, Pressable, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchReferencePublications, publicationLookKey, type ReferencePublication } from '@/api/referencePublications';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { Field } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { AppSheet } from '@/design/sheet/AppSheet';
import { useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { PUBLICATION_THEME } from '@/design/tokens.mobile';
import { PublicationCampaignCard } from '@/features/publications/PublicationCampaignCard';
import { PublicationCampaignHeader } from '@/features/publications/PublicationCampaignHeader';
import type { PublicationPlayback } from '@/features/publications/PublicationFullscreenVideo';
import { PublicationVideoSession } from '@/features/publications/PublicationVideoSession';
import { PublicationHeader } from '@/features/publications/PublicationHeader';
import { PublicationAuthSheet } from '@/features/publications/PublicationAuthSheet';
import { openPublicationProduct } from '@/features/publications/publicationProductNavigation';
import { PublicationIcon, PublicationText } from '@/features/publications/publicationDesign';
import { ReferencePublicationCard } from '@/features/publications/ReferencePublicationCard';
import { PUBLICATION_REFERENCE as R } from '@/features/publications/referencePublicationLayout';
import { OFFICIAL_PUBLISHER_ID, OFFICIAL_PUBLISHER_ROUTE } from '@/features/publications/officialPublisher';
import { useProductFavorites } from '@/features/reels/useProductFavorites';
import { useSession } from '@/state/session';
import { useT } from '@/i18n';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

type Selection = { post: ReferencePublication; mode: 'details' | 'options' | 'sponsor'; open: boolean };

export default function PublicationsScreen() {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const reducedMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const session = useSession();
  const client = useQueryClient();
  const owner = session.account?.id || 'guest';
  const signedIn = session.status === 'signedIn';
  const favorites = useProductFavorites(signedIn, session.account?.id);
  const [visiblePost, setVisiblePost] = useState<string | null>(null);
  const [search, setSearch] = useState<{ id: string; query: string } | null>(null);
  const [auth, setAuth] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState == null || AppState.currentState === 'active');
  const [feedMuted, setFeedMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState<{ post: ReferencePublication; start: PublicationPlayback; resumeAt: (state: PublicationPlayback) => void } | null>(null);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const viewability = useRef({ itemVisiblePercentThreshold: 45, minimumViewTime: 160 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<ReferencePublication>[] }) => {
    setVisiblePost(viewableItems.find(entry => entry.isViewable)?.item.id ?? null);
    setActiveVideo(viewableItems.find(({ item, isViewable }) => isViewable && !isPublicationCampaign(item.layout) && item.media?.type === 'video')?.item.id ?? null);
  }).current;
  const closeSelection = () => setSelection(value => value && { ...value, open: false });
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!selection) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { closeSelection(); return true; });
    return () => listener.remove();
  }, [Boolean(selection)]);
  const feed = useInfiniteQuery({
    queryKey: ['publication-feed', owner, 'reference-layouts'],
    queryFn: ({ pageParam, signal }) => fetchReferencePublications(pageParam, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last, _, __, cursors) => last.nextCursor && !cursors.includes(last.nextCursor) ? last.nextCursor : undefined,
    staleTime: 60_000,
  });
  const posts = useMemo(() => {
    const unique = new Map<string, ReferencePublication>();
    for (const page of feed.data?.pages ?? []) for (const post of page.items) if (!unique.has(post.id)) unique.set(post.id, post);
    return [...unique.values()];
  }, [feed.data]);
  const next = () => { if (feed.hasNextPage && !feed.isFetching) void feed.fetchNextPage(); };
  const open = (post: ReferencePublication, mode: Selection['mode']) => setSelection({ post, mode, open: true });
  const openLook = (post: ReferencePublication) => {
    client.setQueryData(publicationLookKey(owner, post.id), post);
    router.push({ pathname: '/publication-look/[id]', params: { id: post.id } });
  };
  const blocked = Boolean(selection) || auth || Boolean(fullscreen);
  const playingAllowed = focused && foreground && !blocked;
  const direction = rowDirectionFor(theme.isRTL);
  const current = posts.find(post => post.id === visiblePost) ?? posts[0];
  const campaign = current && isPublicationCampaign(current.layout) ? current : null;
  const campaignSearch = search && search.id === campaign?.id ? search : null;
  const footer = feed.isFetchingNextPage ? <LoadingBlock /> : feed.hasNextPage && (feed.isFetchNextPageError || !posts.length) ?
    <Pressable onPress={next} accessibilityRole="button" style={styles.action}><PublicationText variant="label">{t(feed.isFetchNextPageError ? 'common.retry' : 'reel.captionMore')}</PublicationText></Pressable> :
    posts.length && !feed.hasNextPage ? <PublicationText variant="h1" align="center" style={styles.end}>{t('publication.feedEnd')}</PublicationText> : null;

  return <View testID="publication-page" style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    {focused ? <StatusBar style="dark" /> : null}
    <View style={styles.content} accessibilityElementsHidden={blocked} importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}>
      {campaign ? <PublicationCampaignHeader title={campaign.layout === 'campaign_orange' ? campaign.actionLabel : ''} onSearch={() => setSearch(campaignSearch ? null : { id: campaign.id, query: '' })} /> : <PublicationHeader />}
      {campaignSearch ? <View style={styles.search}>
        <Field testID="publication-campaign-search" autoFocus value={campaignSearch.query} maxLength={100} placeholder={t('catalog.search')}
          accessibilityLabel={t('catalog.search')} onChangeText={query => setSearch({ id: campaignSearch.id, query })} returnKeyType="search" />
      </View> : null}
      <FlatList testID="reference-publication-feed" data={posts} keyExtractor={post => post.id}
        contentContainerStyle={[styles.list, posts[0] && isPublicationCampaign(posts[0].layout) ? styles.campaignStart : null]} keyboardShouldPersistTaps="handled" initialNumToRender={2} maxToRenderPerBatch={2} windowSize={5}
        viewabilityConfig={viewability} onViewableItemsChanged={onViewableItemsChanged}
        onEndReachedThreshold={0.5} onEndReached={posts.length && !feed.isFetchNextPageError ? next : undefined}
        onRefresh={() => void feed.refetch()} refreshing={feed.isRefetching}
        renderItem={({ item }) => isPublicationCampaign(item.layout) ? <PublicationCampaignCard post={item} layout={item.layout}
          viewport={width} query={search?.id === item.id ? search.query : ''} favorites={favorites} signedIn={signedIn}
          onAuth={() => setAuth(true)} onSponsor={() => open(item, 'sponsor')} onOpen={() => openLook(item)} /> : <ReferencePublicationCard post={item} viewport={width}
          preview={playingAllowed && !reducedMotion && activeVideo === item.id} muted={feedMuted}
          onToggleMute={() => setFeedMuted(value => !value)}
          onPhoto={item.media?.type === 'image' ? () => openLook(item) : undefined}
          onVideo={item.media?.type === 'video' ? (start, resumeAt) => {
            if (item.media) setFullscreen({ post: item, start, resumeAt });
          } : undefined}
          onMore={() => openLook(item)} onCaption={() => open(item, 'details')} onOptions={() => open(item, 'options')} onSponsor={() => open(item, 'sponsor')}
          favorites={favorites} signedIn={signedIn} onAuth={() => setAuth(true)} />}
        ListEmptyComponent={feed.isPending ? <LoadingBlock /> : feed.isError && !feed.data ?
          <ErrorBlock error={feed.error} onRetry={() => void feed.refetch()} /> :
          !feed.hasNextPage ? <PublicationText color={PUBLICATION_THEME.muted} align="center" style={styles.end}>{t('publication.empty')}</PublicationText> : null}
        ListFooterComponent={footer} />
    </View>
    {selection ? <AppSheet open={selection.open} onDismiss={closeSelection} onClosed={() => setSelection(null)} presentation="bottom" heightRatio={0.75} surfaceColor={PUBLICATION_THEME.paper}
      header={<Pressable testID="reference-publication-close" accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={closeSelection} style={styles.close}>
        <PublicationIcon name="close" color={PUBLICATION_THEME.ink} />
      </Pressable>}>
      <View testID={`reference-publication-sheet-${selection.mode}`} style={styles.sheetContent}>
        <PublicationText variant="h2" accessibilityRole="header">{selection.mode === 'sponsor' ? t('publication.sponsored') : selection.post.title || selection.post.subtitle || t('reel.captionMore')}</PublicationText>
        {selection.mode === 'sponsor' ? <PublicationText>{selection.post.sponsorName ? t('publication.sponsoredBy', { name: selection.post.sponsorName }) : t('publication.sponsoredInfo')}</PublicationText> :
          selection.mode === 'options' ? <>
            <Pressable onPress={() => setSelection(value => value && { ...value, mode: 'details' })} accessibilityRole="button" style={styles.action}><PublicationText>{t('reel.captionMore')}</PublicationText></Pressable>
            {selection.post.channelId === OFFICIAL_PUBLISHER_ID ? <Pressable accessibilityRole="link" style={styles.action} onPress={() => {
              setSelection(null); router.push(OFFICIAL_PUBLISHER_ROUTE);
            }}><PublicationText>{t('publication.openPublisher')}</PublicationText></Pressable> : null}
          </> : <>
            {selection.post.subtitle && selection.post.subtitle !== selection.post.title ? <PublicationText>{selection.post.subtitle}</PublicationText> : null}
            {selection.post.description ? <PublicationText>{selection.post.description}</PublicationText> : null}
            {selection.post.products.map(product => <Pressable key={product.id} accessibilityRole="link" accessibilityLabel={product.name} style={[styles.product, { flexDirection: direction }]}
              onPress={() => { setSelection(null); openPublicationProduct(product.id); }}>
              <AppImage uri={mediaUrl(product.image)} decorative contentFit="contain" style={styles.thumbnail} />
              <PublicationText numberOfLines={2} style={styles.content}>{product.name}</PublicationText>
              <PublicationIcon name={theme.isRTL ? 'arrow-back' : 'arrow-forward'} color={PUBLICATION_THEME.ink} />
            </Pressable>)}
          </>}
      </View>
    </AppSheet> : null}
    {fullscreen ? <PublicationVideoSession post={fullscreen.post} start={fullscreen.start}
      onLearnMore={(post, state) => { fullscreen.resumeAt(state); setFeedMuted(state.muted); setFullscreen(null); openLook(post); }}
      onProduct={(id, state) => { fullscreen.resumeAt(state); setFeedMuted(state.muted); setFullscreen(null); openPublicationProduct(id); }}
      onClose={state => { fullscreen.resumeAt(state); setFeedMuted(state.muted); setFullscreen(null); }} /> : null}
    {auth ? <PublicationAuthSheet visible onClose={() => setAuth(false)} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PUBLICATION_THEME.headerBar },
  content: { flex: 1 },
  list: { paddingTop: R.startGap, paddingBottom: 24 },
  campaignStart: { paddingTop: 0 },
  search: { paddingHorizontal: 16, paddingVertical: 8 },
  end: { paddingHorizontal: R.inset, paddingVertical: 32 },
  close: { alignSelf: 'flex-end', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  action: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  sheetContent: { gap: 12 },
  product: { alignItems: 'center', paddingVertical: 8, gap: 12 },
  thumbnail: { width: 56, height: 72, backgroundColor: PUBLICATION_THEME.neutral, borderRadius: R.cardRadius },
});
