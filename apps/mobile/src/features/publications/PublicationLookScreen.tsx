import { useVideoAutoplay } from '@/state/prefs';
import { isPublicationCampaign } from '../../../../../shared/publicationCampaign';
import { useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LinkedProduct } from '@/api/linkedProduct';
import { mediaUrl } from '@/api/client';
import { fetchPublicationLook, publicationLookKey, savePublicationLook, type ReferencePublication } from '@/api/referencePublications';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useReduceMotion } from '@/design/motion';
import { goBack } from '@/design/navigation';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { PUBLICATION_THEME as P, RADIUS } from '@/design/tokens.mobile';
import { useProductFavorites } from '@/features/reels/useProductFavorites';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';
import { OFFICIAL_PUBLISHER_ID, OFFICIAL_PUBLISHER_NAME, OFFICIAL_PUBLISHER_ROUTE } from './officialPublisher';
import { PublicationAuthSheet } from './PublicationAuthSheet';
import { PublicationIcon, PublicationText } from './publicationDesign';
import type { PublicationPlayback } from './PublicationFullscreenVideo';
import { PublicationVideoSession } from './PublicationVideoSession';
import { openPublicationProduct } from './publicationProductNavigation';
import { PublicationLookProduct } from './PublicationLookProduct';
import { PublicationInlineVideo } from './PublicationInlineVideo';
import { usePublisherFollow } from './usePublisherFollow';
import { PublicationCampaignDetail } from './PublicationCampaignDetail';
import { PublisherShowcase } from './OfficialPublisherScreen';
import { PUBLICATION_VIDEO_TYPE as T } from './publicationTokens';

const LOOK = { heroAspect: 720 / 1107, heart: 40, maxWidth: 600 } as const;

export function PublicationLookScreen({ id }: { id: string }) {
  const t = useT();
  const theme = useTheme();
  const focused = useIsFocused();
  const autoplay = useVideoAutoplay();
  const reducedMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const session = useSession();
  const client = useQueryClient();
  const owner = session.account?.id || 'guest';
  const signedIn = session.status === 'signedIn';
  const cacheKey = publicationLookKey(owner, id);
  const look = useQuery({ queryKey: cacheKey, queryFn: ({ signal }) => fetchPublicationLook(id, { signal }), staleTime: 15_000 });
  const post = look.data;
  const media = post?.media;
  const isCampaign = Boolean(post && isPublicationCampaign(post.layout));
  const isVideo = !isCampaign && media?.type === 'video';
  const productGrid = isVideo;
  const list = useRef<FlatList<LinkedProduct>>(null);
  const [auth, setAuth] = useState(false);
  const [fullscreen, setFullscreen] = useState<PublicationPlayback | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [heroVisible, setHeroVisible] = useState(true);
  const [showTop, setShowTop] = useState(false);
  const position = useRef<PublicationPlayback>({ time: 0, muted: true });
  const follow = usePublisherFollow((isVideo ? post?.channelId : undefined) ?? '', () => setAuth(true));
  const favorites = useProductFavorites(signedIn && isVideo, session.account?.id);
  const favoriteLook = useMutation({
    mutationFn: (saved: boolean) => savePublicationLook(id, saved),
    onSuccess: saved => {
      client.setQueryData<ReferencePublication | null>(cacheKey, current => current ? { ...current, saved } : current);
      void client.invalidateQueries({ queryKey: ['publication-feed', owner] });
    },
  });
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);

  const direction = rowDirectionFor(theme.isRTL);
  const pageWidth = Math.min(width, LOOK.maxWidth);
  const heroHeight = pageWidth / LOOK.heroAspect;
  const tileWidth = (pageWidth - (isVideo ? 48 : 24) - 8) / 2;
  const videoFit = post?.layout === 'video-panoramic' ? 'contain' : 'cover';
  const preview = autoplay && focused && foreground && !fullscreen && !auth && heroVisible && !reducedMotion;
  const official = post?.channelId === OFFICIAL_PUBLISHER_ID;
  const publisher = official ? OFFICIAL_PUBLISHER_NAME : post?.channelName;
  const followLabel = t(follow.state === 'following' ? 'publication.following' : follow.state === 'error' ? 'publication.followRetry' : 'publication.follow');
  const saved = signedIn && Boolean(post?.saved);
  const openPlayer = () => setFullscreen({ ...position.current, muted: false });
  const back = <Pressable onPress={() => goBack('/publications')} accessibilityRole="button" accessibilityLabel={t('common.back')}
    testID="publication-look-back" style={[styles.back, { flexDirection: direction }]}>
    <PublicationIcon name={theme.isRTL ? 'chevron-forward' : 'chevron-back'} size={18} color={P.ink} />
    <PublicationText variant="bodyStrong">{t('common.back')}</PublicationText>
  </Pressable>;
  const title = post?.title || t('publication.lookTitle');
  const followButton = post?.channelId ? <Pressable testID="publication-look-follow" accessibilityRole="button" accessibilityLabel={followLabel}
    accessibilityState={{ selected: follow.state === 'following', disabled: follow.disabled }} disabled={follow.disabled}
    onPress={follow.press} style={[styles.follow, productGrid && styles.outlinedFollow, isVideo && styles.videoFollow, { flexDirection: direction }]}>
    <PublicationIcon name={follow.state === 'following' ? 'checkmark-outline' : 'add-outline'} size={productGrid ? 24 : 18} color={P.ink} />
    <PublicationText variant="bodyStrong">{follow.state === 'pending' ? '…' : followLabel}</PublicationText>
  </Pressable> : null;
  const publisherName = publisher ? <PublicationText numberOfLines={1} style={styles.publisher}>{publisher}</PublicationText> : null;
  const message = follow.writeFailed || favoriteLook.isError ? <PublicationText accessibilityRole="alert" variant="caption">
    {t(favoriteLook.isError ? 'publication.lookSaveError' : 'publication.followError')}
  </PublicationText> : null;
  if (post && isCampaign) return <PublicationCampaignDetail post={post} refreshing={look.isRefetching}
    onRefresh={() => void look.refetch()} />;
  if (post && media?.type === 'image') return <>
    <PublisherShowcase publication={post} refreshing={look.isRefetching} onRefresh={() => void look.refetch()}
      onSavePublication={favoriteLook.isPending ? undefined : () => signedIn ? favoriteLook.mutate(!saved) : setAuth(true)}
      publicationSaveError={favoriteLook.isError} />
    {auth ? <PublicationAuthSheet visible onClose={() => setAuth(false)} /> : null}
  </>;
  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="publication-look-page">
    {focused ? <StatusBar style="dark" /> : null}
    <View style={styles.content} accessibilityElementsHidden={Boolean(fullscreen) || auth} importantForAccessibility={fullscreen || auth ? 'no-hide-descendants' : 'auto'}>
      {!post || !media ? <>{back}{look.isPending ? <LoadingBlock /> : look.isError ?
        <ErrorBlock error={look.error} onRetry={() => void look.refetch()} /> : <PublicationText style={styles.notice}>{t('publication.lookMissing')}</PublicationText>}</> :
        <FlatList key={productGrid ? 'grid' : 'list'} ref={list} data={post.products} keyExtractor={product => product.id}
          testID="publication-look-products" numColumns={productGrid ? 2 : 1}
          columnWrapperStyle={productGrid ? [styles.columns, isVideo && styles.videoColumns, { flexDirection: direction }] : undefined}
          style={styles.list} contentContainerStyle={styles.listContent} initialNumToRender={5}
          onScroll={event => {
            const offset = event.nativeEvent.contentOffset.y;
            if (isVideo) setHeroVisible(offset < heroHeight * 0.75);
            setShowTop(offset > heroHeight * 0.75);
          }} scrollEventThrottle={64}
          ListHeaderComponent={<>
            {!isVideo ? back : null}
            <View style={[styles.hero, isVideo && videoFit === 'contain' && styles.videoMatte, { height: heroHeight }]}
              testID="publication-look-hero">
              {isVideo ? <>
                {media.poster ? <AppImage uri={mediaUrl(media.poster)} contentFit={videoFit} decorative style={StyleSheet.absoluteFill} /> : null}
                {preview ? <PublicationInlineVideo key={media.url} url={media.url} muted paused={false} fit={videoFit} position={position} /> : null}
                <Pressable accessibilityRole="button" accessibilityLabel={t('publication.playerOpen')} onPress={openPlayer}
                  testID="publication-look-video" style={StyleSheet.absoluteFill}>
                  {(!autoplay || reducedMotion) ? <View style={styles.playHint}><PublicationIcon name="play-outline" color={P.paper} /></View> : null}
                </Pressable>
              </> : null}
              <Pressable accessibilityRole="button" accessibilityState={{ selected: saved, disabled: favoriteLook.isPending }}
                accessibilityLabel={t(saved ? 'publication.lookUnsave' : 'publication.lookSave')} disabled={favoriteLook.isPending}
                onPress={() => signedIn ? favoriteLook.mutate(!saved) : setAuth(true)} testID="publication-look-save" style={styles.heroHeart}>
                <View style={styles.heroHeartDisc}><PublicationIcon name={saved ? 'heart' : 'heart-outline'} size={28} color={P.ink} /></View>
              </Pressable>
            </View>
            {isVideo ? <View testID="publication-video-information" style={styles.videoIntro}>
              {publisher ? <PublicationText variant="bodyStrong" style={styles.videoTitle}>{publisher}</PublicationText> : null}
              <PublicationText accessibilityRole="header" variant="h1" style={styles.videoTitle}>{title}</PublicationText>
              {post.subtitle && post.subtitle !== title ? <PublicationText style={styles.videoTitle}>{post.subtitle}</PublicationText> : null}
              {post.description ? <PublicationText style={styles.videoDescription}>{post.description}</PublicationText> : null}
              <View style={[styles.videoPublisher, { flexDirection: direction }]}>
                {official ? <Pressable accessibilityRole="link" onPress={() => router.push(OFFICIAL_PUBLISHER_ROUTE)}>{publisherName}</Pressable> : publisherName}
                {followButton}
              </View>{message}
            </View> : null}
          </>}
          ListEmptyComponent={<PublicationText style={styles.notice}>{t('publication.lookNoProducts')}</PublicationText>}
          renderItem={({ item }) => <PublicationLookProduct item={item} tileWidth={productGrid ? tileWidth : undefined}
            saved={signedIn && favorites.isFavorite(item.id)} onFavorite={() => signedIn ? favorites.toggle(item.id) : setAuth(true)} />} />}
      {isVideo ? <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} testID="publication-look-back"
        onPress={() => goBack('/publications')} style={styles.videoClose}>
        <PublicationIcon name="close" color={P.ink} size={26} />
      </Pressable> : null}
      {showTop && post && media ? <Pressable accessibilityRole="button" accessibilityLabel={t('publication.scrollTop')}
        testID="publication-look-top" style={styles.toTop} onPress={() => list.current?.scrollToOffset({ offset: 0, animated: !reducedMotion })}>
        <PublicationIcon name="arrow-up-outline" color={P.paper} size={20} />
      </Pressable> : null}
    </View>
    {fullscreen && post && media?.type === 'video' ? <PublicationVideoSession post={post} start={fullscreen}
      onLearnMore={(selected, state) => {
        position.current = { ...state, muted: true };
        setFullscreen(null);
        if (selected.id === post.id) list.current?.scrollToOffset({ offset: Math.max(0, heroHeight - 48), animated: !reducedMotion });
        else {
          client.setQueryData(publicationLookKey(owner, selected.id), selected);
          router.push({ pathname: '/publication-look/[id]', params: { id: selected.id } });
        }
      }}
      onProduct={(id, state) => { position.current = { ...state, muted: true }; setFullscreen(null); openPublicationProduct(id); }}
      onClose={state => { position.current = { ...state, muted: true }; setFullscreen(null); }} /> : null}
    {auth ? <PublicationAuthSheet visible onClose={() => setAuth(false)} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.paper },
  content: { flex: 1 },
  list: { width: '100%', maxWidth: LOOK.maxWidth, alignSelf: 'center' },
  listContent: { paddingBottom: 24 },
  back: { minHeight: 50, paddingHorizontal: 12, gap: 2, alignItems: 'flex-start', paddingTop: 4, alignSelf: 'stretch' },
  hero: { backgroundColor: P.neutral, overflow: 'hidden', borderBottomStartRadius: RADIUS.md, borderBottomEndRadius: RADIUS.md },
  videoMatte: { backgroundColor: P.ink },
  heroHeart: { position: 'absolute', top: 3, end: 3, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heroHeartDisc: { width: LOOK.heart, height: LOOK.heart, borderRadius: LOOK.heart / 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: P.paper },
  playHint: { position: 'absolute', alignSelf: 'center', top: '45%', width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: P.viewerDarkSurface },
  publisher: { flexShrink: 1 },
  follow: { minHeight: 44, alignItems: 'center', gap: 4 },
  videoClose: { position: 'absolute', start: 24, top: 8, width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', backgroundColor: P.paper },
  videoIntro: { paddingTop: 24, paddingHorizontal: 12, paddingBottom: 24 },
  videoTitle: { fontSize: T.infoTitleSize, lineHeight: T.infoTitleLine },
  videoDescription: { marginTop: 16, lineHeight: T.infoBodyLine },
  videoPublisher: { marginTop: 32, marginHorizontal: 12, gap: 12, alignItems: 'center' },
  videoFollow: { minWidth: 98, minHeight: 34 },
  videoColumns: { paddingHorizontal: 24 },
  outlinedFollow: { minWidth: 128, justifyContent: 'center', borderWidth: 1, borderColor: P.ink, minHeight: 48, borderRadius: RADIUS.full, paddingHorizontal: 12 },
  columns: { paddingHorizontal: 12, gap: 8, marginBottom: 32 },
  toTop: { position: 'absolute', bottom: 16, end: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: P.ink,
    alignItems: 'center', justifyContent: 'center' },
  notice: { padding: 16 },
});
