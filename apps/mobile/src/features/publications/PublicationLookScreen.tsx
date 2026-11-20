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
import { OfficialAvatar } from '@/design/OfficialAvatar';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { PUBLICATION_THEME as P, RADIUS } from '@/design/tokens.mobile';
import { useProductFavorites } from '@/features/reels/useProductFavorites';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';
import { OFFICIAL_PUBLISHER_ID, OFFICIAL_PUBLISHER_NAME, OFFICIAL_PUBLISHER_ROUTE } from './officialPublisher';
import { PublicationAuthSheet } from './PublicationAuthSheet';
import { PublicationIcon, PublicationText } from './publicationDesign';
import { PublicationFullscreenVideo, type PublicationPlayback } from './PublicationFullscreenVideo';
import { PublicationLookProduct } from './PublicationLookProduct';
import { PublicationInlineVideo } from './PublicationInlineVideo';
import { usePublisherFollow } from './usePublisherFollow';

const LOOK = { heroAspect: 720 / 1107, avatar: 56, heart: 40, handle: 76, handleGap: 3, identityTop: 28, identityBottom: 34, maxWidth: 600, titleSize: 26, titleLine: 30 } as const;

export function PublicationLookScreen({ id, collection = false }: { id: string; collection?: boolean }) {
  const t = useT();
  const theme = useTheme();
  const focused = useIsFocused();
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
  const isVideo = media?.type === 'video';
  const grid = collection && media?.type === 'image';
  const list = useRef<FlatList<LinkedProduct>>(null);
  const [auth, setAuth] = useState(false);
  const [fullscreen, setFullscreen] = useState<PublicationPlayback | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [heroVisible, setHeroVisible] = useState(true);
  const [showTop, setShowTop] = useState(false);
  const position = useRef<PublicationPlayback>({ time: 0, muted: true });
  const follow = usePublisherFollow(post?.channelId ?? '', () => setAuth(true));
  const favorites = useProductFavorites(signedIn, session.account?.id);
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
  const heroHeight = grid ? (pageWidth - 24) * 318 / 658 : pageWidth / LOOK.heroAspect;
  const tileWidth = (pageWidth - 24 - 8) / 2;
  const focal = media?.focalX !== undefined || media?.focalY !== undefined
    ? { left: `${media.focalX ?? 50}%` as const, top: `${media.focalY ?? 50}%` as const } : undefined;
  const videoFit = post?.layout === 'video-panoramic' ? 'contain' : 'cover';
  const preview = focused && foreground && !fullscreen && !auth && heroVisible && !reducedMotion;
  const official = post?.channelId === OFFICIAL_PUBLISHER_ID;
  const publisher = official ? OFFICIAL_PUBLISHER_NAME : post?.channelName;
  const followLabel = t(follow.state === 'following' ? 'publication.following' : follow.state === 'error' ? 'publication.followRetry' : 'publication.follow');
  const saved = signedIn && Boolean(post?.saved);
  const openPlayer = () => setFullscreen({ ...position.current });
  const back = <Pressable onPress={() => goBack('/publications')} accessibilityRole="button" accessibilityLabel={t('common.back')}
    testID="publication-look-back" style={[styles.back, { flexDirection: direction }]}>
    <PublicationIcon name={theme.isRTL ? 'chevron-forward' : 'chevron-back'} size={18} color={P.ink} />
    <PublicationText variant="bodyStrong">{t('common.back')}</PublicationText>
  </Pressable>;
  const title = isVideo ? t('publication.lookTitle') : post?.title || t('publication.lookTitle');
  const followButton = post?.channelId ? <Pressable testID="publication-look-follow" accessibilityRole="button" accessibilityLabel={followLabel}
    accessibilityState={{ selected: follow.state === 'following', disabled: follow.disabled }} disabled={follow.disabled}
    onPress={follow.press} style={[styles.follow, grid && styles.outlinedFollow, { flexDirection: direction }]}>
    <PublicationIcon name={follow.state === 'following' ? 'checkmark-outline' : 'add-outline'} size={grid ? 24 : 18} color={P.ink} />
    <PublicationText variant="bodyStrong">{follow.state === 'pending' ? '…' : followLabel}</PublicationText>
  </Pressable> : null;
  const publisherName = publisher ? <PublicationText numberOfLines={1} style={styles.publisher}>{publisher}</PublicationText> : null;
  const message = follow.writeFailed || favoriteLook.isError ? <PublicationText accessibilityRole="alert" variant="caption">
    {t(favoriteLook.isError ? 'publication.lookSaveError' : 'publication.followError')}
  </PublicationText> : null;
  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="publication-look-page">
    {focused ? <StatusBar style="dark" /> : null}
    <View style={styles.content} accessibilityElementsHidden={Boolean(fullscreen) || auth} importantForAccessibility={fullscreen || auth ? 'no-hide-descendants' : 'auto'}>
      {!post || !media ? <>{back}{look.isPending ? <LoadingBlock /> : look.isError ?
        <ErrorBlock error={look.error} onRetry={() => void look.refetch()} /> : <PublicationText style={styles.notice}>{t('publication.lookMissing')}</PublicationText>}</> :
        <FlatList key={grid ? 'grid' : 'list'} ref={list} data={post.products} keyExtractor={product => product.id}
          testID={grid ? 'publication-collection-products' : 'publication-look-products'} numColumns={grid ? 2 : 1}
          columnWrapperStyle={grid ? [styles.columns, { flexDirection: direction }] : undefined}
          style={styles.list} contentContainerStyle={styles.listContent} initialNumToRender={5}
          onScroll={event => {
            const offset = event.nativeEvent.contentOffset.y;
            if (isVideo) setHeroVisible(offset < heroHeight * 0.75);
            setShowTop(offset > heroHeight * 0.75);
          }} scrollEventThrottle={64}
          ListHeaderComponent={<>
            {back}
            <View style={[styles.hero, grid && styles.compactHero, isVideo && videoFit === 'contain' && styles.videoMatte, { height: heroHeight }]}
              testID={grid ? 'publication-collection-hero' : 'publication-look-hero'}>
              {isVideo ? <>
                {media.poster ? <AppImage uri={mediaUrl(media.poster)} contentFit={videoFit} decorative style={StyleSheet.absoluteFill} /> : null}
                {preview ? <PublicationInlineVideo key={media.url} url={media.url} muted paused={false} fit={videoFit} position={position} /> : null}
                <Pressable accessibilityRole="button" accessibilityLabel={t('publication.playerOpen')} onPress={openPlayer}
                  testID="publication-look-video" style={StyleSheet.absoluteFill}>
                  {reducedMotion ? <View style={styles.playHint}><PublicationIcon name="play-outline" color={P.paper} /></View> : null}
                </Pressable>
              </> : <AppImage uri={mediaUrl(media.url)} contentFit="cover" contentPosition={focal}
                accessibilityLabel={media.alt || post.title || undefined} decorative={!media.alt && !post.title} style={StyleSheet.absoluteFill} />}
              {!grid ? <Pressable accessibilityRole="button" accessibilityState={{ selected: saved, disabled: favoriteLook.isPending }}
                accessibilityLabel={t(saved ? 'publication.lookUnsave' : 'publication.lookSave')} disabled={favoriteLook.isPending}
                onPress={() => signedIn ? favoriteLook.mutate(!saved) : setAuth(true)} testID="publication-look-save" style={styles.heroHeart}>
                <View style={styles.heroHeartDisc}><PublicationIcon name={saved ? 'heart' : 'heart-outline'} size={28} color={P.ink} /></View>
              </Pressable> : null}
            </View>
            {grid ? <View style={styles.collectionIntro}>
              <PublicationText accessibilityRole="header" variant="h1" style={styles.collectionTitle}>{title}</PublicationText>
              {post.subtitle && post.subtitle !== title ? <PublicationText variant="h1" style={styles.collectionTitle}>{post.subtitle}</PublicationText> : null}
              <Pressable testID="publication-collection-discover" accessibilityRole="link" style={[styles.discover, { flexDirection: direction }]}
                onPress={() => router.push({ pathname: '/publication-look/[id]', params: { id } })}>
                <PublicationText variant="bodyStrong">{t('shopping.discover')}</PublicationText>
                <PublicationIcon name={theme.isRTL ? 'arrow-back' : 'arrow-forward'} color={P.ink} />
              </Pressable>
              <View style={[styles.collectionPublisher, { flexDirection: direction }]}>{followButton}{publisherName}</View>{message}
            </View> : <>
              <View style={styles.handle} />
              <View style={[styles.identity, { flexDirection: direction }]}>
                {official ? <Pressable accessibilityRole="link" accessibilityLabel={publisher} onPress={() => router.push(OFFICIAL_PUBLISHER_ROUTE)}>
                  <OfficialAvatar size={LOOK.avatar} />
                </Pressable> : post.channelAvatar ? <AppImage uri={mediaUrl(post.channelAvatar)} decorative contentFit="cover" style={styles.avatar} /> : null}
                <View style={styles.identityText}>
                  <PublicationText accessibilityRole="header" variant="h2">{title}</PublicationText>
                  {!isVideo && post.subtitle && post.subtitle !== title ? <PublicationText>{post.subtitle}</PublicationText> : null}
                  <View style={[styles.byline, { flexDirection: direction }]}>{publisherName}{followButton}</View>{message}
                </View>
              </View>
            </>}
          </>}
          ListEmptyComponent={<PublicationText style={styles.notice}>{t('publication.lookNoProducts')}</PublicationText>}
          renderItem={({ item }) => <PublicationLookProduct item={item} tileWidth={grid ? tileWidth : undefined}
            saved={signedIn && favorites.isFavorite(item.id)} onFavorite={() => signedIn ? favorites.toggle(item.id) : setAuth(true)} />} />}
      {showTop && post && media ? <Pressable accessibilityRole="button" accessibilityLabel={t('publication.scrollTop')}
        testID="publication-look-top" style={styles.toTop} onPress={() => list.current?.scrollToOffset({ offset: 0, animated: !reducedMotion })}>
        <PublicationIcon name="arrow-up-outline" color={P.paper} size={20} />
      </Pressable> : null}
    </View>
    {fullscreen && media?.type === 'video' ? <PublicationFullscreenVideo start={fullscreen} url={media.url} poster={media.poster}
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
  compactHero: { marginHorizontal: 12, borderRadius: RADIUS.md },
  heroHeart: { position: 'absolute', top: 3, end: 3, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heroHeartDisc: { width: LOOK.heart, height: LOOK.heart, borderRadius: LOOK.heart / 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: P.paper },
  playHint: { position: 'absolute', alignSelf: 'center', top: '45%', width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: P.viewerDarkSurface },
  handle: { width: LOOK.handle, height: 4, marginTop: LOOK.handleGap, alignSelf: 'center', backgroundColor: P.ink },
  identity: { paddingHorizontal: 12, paddingTop: LOOK.identityTop, paddingBottom: LOOK.identityBottom, alignItems: 'center', gap: 12 },
  avatar: { width: LOOK.avatar, height: LOOK.avatar, borderRadius: RADIUS.md, backgroundColor: P.neutral },
  identityText: { flex: 1 },
  byline: { alignItems: 'center', gap: 6 },
  publisher: { flexShrink: 1 },
  follow: { minHeight: 44, alignItems: 'center', gap: 4 },
  collectionIntro: { paddingTop: 16, paddingBottom: 48, paddingHorizontal: 12 },
  collectionTitle: { fontSize: LOOK.titleSize, lineHeight: LOOK.titleLine },
  discover: { minHeight: 44, gap: 6, alignItems: 'center', alignSelf: 'flex-start', marginTop: 8 },
  collectionPublisher: { marginTop: 8, alignItems: 'center', justifyContent: 'center', gap: 12 },
  outlinedFollow: { minWidth: 128, justifyContent: 'center', borderWidth: 1, borderColor: P.ink, minHeight: 48, borderRadius: RADIUS.full, paddingHorizontal: 12 },
  columns: { paddingHorizontal: 12, gap: 8, marginBottom: 32 },
  toTop: { position: 'absolute', bottom: 16, end: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: P.ink,
    alignItems: 'center', justifyContent: 'center' },
  notice: { padding: 16 },
});
