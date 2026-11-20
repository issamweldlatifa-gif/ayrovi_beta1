import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { router } from 'expo-router';
import { mediaUrl } from '@/api/client';
import type { ReferencePublication } from '@/api/referencePublications';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { OfficialAvatar } from '@/design/OfficialAvatar';
import { useTheme } from '@/design/theme';
import { PUBLICATION_THEME, veil } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import type { ProductFavorites } from '@/features/reels/useProductFavorites';
import { OFFICIAL_PUBLISHER_ID, OFFICIAL_PUBLISHER_NAME, OFFICIAL_PUBLISHER_ROUTE } from './officialPublisher';
import { PublicationIcon, PublicationText } from './publicationDesign';
import { PUBLICATION_REFERENCE as R, referenceMeasurements } from './referencePublicationLayout';
import { usePublisherFollow } from './usePublisherFollow';

function ActiveVideo({ url, inset, muted, paused }: { url: string; inset: boolean; muted: boolean; paused: boolean }) {
  const t = useT();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const player = useVideoPlayer({ uri: mediaUrl(url) }, instance => { instance.loop = true; instance.muted = true; });
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => setFailed(status === 'error'));
    return () => sub.remove();
  }, [player]);
  useEffect(() => {
    player.muted = muted;
    if (paused) player.pause(); else player.play();
  }, [player, muted, paused]);
  return <>
    <VideoView player={player} style={[StyleSheet.absoluteFill, !ready ? styles.buffering : null]} surfaceType="textureView"
      pointerEvents="none" nativeControls={false} contentFit={inset ? 'contain' : 'cover'} onFirstFrameRender={() => setReady(true)} />
    {failed ? <View pointerEvents="none" style={styles.videoError}><PublicationText variant="caption" color={PUBLICATION_THEME.paper}>{t('publication.videoError')}</PublicationText></View> : null}
  </>;
}

function PublicationMedia({ post, width, height, active, autoplay, onActivate }: {
  post: ReferencePublication; width: number; height: number; active: boolean; autoplay: boolean; onActivate: () => void;
}) {
  const t = useT();
  const [intent, setIntent] = useState<'play' | 'pause' | null>(null);
  const [muted, setMuted] = useState(true);
  // Sound is always reset when the card leaves the viewport/background.
  useEffect(() => { if (!active) setMuted(true); }, [active]);
  const { media } = post;
  if (!media) return null;
  const isVideo = media.type === 'video';
  const inset = post.layout === 'video-inset';
  const playing = active && (intent === 'play' || (intent !== 'pause' && autoplay));
  const focal = media.focalX !== undefined || media.focalY !== undefined
    ? { left: `${media.focalX ?? 50}%` as const, top: `${media.focalY ?? 50}%` as const } : undefined;
  return <View testID={`reference-media-${post.layout}`} style={[styles.media, { width, height }]}>
    {!isVideo ? <AppImage uri={mediaUrl(media.url)} style={StyleSheet.absoluteFill} contentFit={media.fit ?? 'cover'}
      contentPosition={focal} accessibilityLabel={media.alt || post.title || undefined} decorative={!media.alt && !post.title} /> : <>
      {inset && media.poster ? <AppImage uri={mediaUrl(media.poster)} decorative contentFit="cover" blurRadius={28} style={StyleSheet.absoluteFill} /> : null}
      <View style={[styles.videoFrame, inset ? { width: '50%' } : styles.fullWidth]}>
        {media.poster ? <AppImage uri={mediaUrl(media.poster)} decorative contentFit={inset ? 'contain' : 'cover'} style={StyleSheet.absoluteFill} /> : null}
        {active ? <ActiveVideo key={media.url} url={media.url} inset={inset} muted={muted} paused={!playing} /> : null}
      </View>
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel={t(playing ? 'social.pause' : 'social.play')}
          testID="reference-video-play" style={styles.videoTouch} onPress={() => { setIntent(playing ? 'pause' : 'play'); if (!playing) onActivate(); }}>
          <View style={styles.videoDisc}><PublicationIcon name={playing ? 'pause-outline' : 'play-outline'} color={PUBLICATION_THEME.paper} /></View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t(muted || !active ? 'publication.unmute' : 'publication.mute')}
          testID="reference-video-mute" style={styles.videoTouch} onPress={() => {
            if (!active) { setIntent('play'); setMuted(false); onActivate(); } else setMuted(value => !value);
          }}>
          <View style={styles.videoDisc}><PublicationIcon name={muted || !active ? 'volume-mute-outline' : 'volume-high-outline'} color={PUBLICATION_THEME.paper} /></View>
        </Pressable>
      </View>
    </>}
  </View>;
}

export function ReferencePublicationCard({ post, viewport, active, autoplay, onActivate, onMore, onOptions, onSponsor, favorites, signedIn, onAuth }: {
  post: ReferencePublication; viewport: number; active: boolean; autoplay: boolean;
  onActivate: () => void; onMore: () => void; onOptions: () => void; onSponsor: () => void;
  favorites: ProductFavorites; signedIn: boolean; onAuth: () => void;
}) {
  const t = useT();
  const { isRTL } = useTheme();
  const direction = rowDirectionFor(isRTL);
  const { width, tileWidth, tileHeight, mediaHeight } = referenceMeasurements(viewport, post.layout);
  const tileSize = { width: tileWidth, height: tileHeight };
  const official = post.channelId === OFFICIAL_PUBLISHER_ID;
  const publisher = official ? OFFICIAL_PUBLISHER_NAME : post.channelName;
  const follow = usePublisherFollow(post.channelId, onAuth);
  const followLabel = t(follow.state === 'following' ? 'publication.following' : follow.state === 'error' ? 'publication.followRetry' : 'publication.follow');
  const publisherIdentity = <>
    {official ? <OfficialAvatar size={20} /> : post.channelAvatar ? <AppImage uri={mediaUrl(post.channelAvatar)} decorative style={styles.avatar} /> : null}
    <PublicationText numberOfLines={1} style={styles.publisherText}>{publisher}</PublicationText>
  </>;
  return <View testID={`reference-publication-${post.id}`} style={[styles.card, { width }]}>
    {publisher ? <View style={[styles.publisherRow, { flexDirection: direction }]}>
      {official ? <Pressable accessibilityRole="link" accessibilityLabel={publisher} onPress={() => router.push(OFFICIAL_PUBLISHER_ROUTE)}
        style={[styles.publisher, { flexDirection: direction }]}>{publisherIdentity}</Pressable> :
        <View style={[styles.publisher, { flexDirection: direction }]}>{publisherIdentity}</View>}
      {post.channelId ? <Pressable accessibilityRole="button" accessibilityLabel={followLabel} disabled={follow.disabled}
        onPress={follow.press} style={styles.follow}>
        <PublicationText style={styles.publisherText}>{`· ${follow.state === 'pending' ? '…' : followLabel}`}</PublicationText>
      </Pressable> : null}
    </View> : null}
    {follow.writeFailed ? <PublicationText variant="caption" accessibilityRole="alert">{t('publication.followError')}</PublicationText> : null}
    {post.sponsored ? <Pressable accessibilityRole="button" accessibilityLabel={t('publication.sponsored')} onPress={onSponsor}
      style={[styles.sponsor, { flexDirection: direction }]}>
      <PublicationText variant="caption" color={PUBLICATION_THEME.muted}>{t('publication.sponsored')}</PublicationText>
      <PublicationIcon name="information-circle-outline" size={14} color={PUBLICATION_THEME.muted} />
    </Pressable> : null}
    <PublicationMedia post={post} width={width} height={mediaHeight} active={active} autoplay={autoplay} onActivate={onActivate} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={`reference-products-${post.id}`}
      style={styles.rail} contentContainerStyle={[styles.railContent, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      {post.products.map(product => {
        const saved = signedIn && favorites.isFavorite(product.id);
        return <View key={product.id} style={[styles.tile, tileSize]} testID="reference-product-tile">
          <Pressable style={styles.fullHeight} accessibilityRole="link" accessibilityLabel={product.name}
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })}>
            <AppImage uri={mediaUrl(product.image)} decorative contentFit="contain" style={StyleSheet.absoluteFill} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t(saved ? 'publisher.unsave' : 'publisher.save', { name: product.name })}
            accessibilityState={{ selected: saved }} onPress={() => signedIn ? favorites.toggle(product.id) : onAuth()} style={styles.heartTouch}>
            <View style={styles.heartDisc}><PublicationIcon name={saved ? 'heart' : 'heart-outline'} color={PUBLICATION_THEME.ink} /></View>
          </Pressable>
        </View>;
      })}
      <Pressable testID="reference-more-tile" accessibilityRole="button" accessibilityLabel={t('reel.captionMore')}
        onPress={onMore} style={[styles.tile, styles.more, tileSize]}>
        <View style={styles.moreDisc}><PublicationIcon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={26} color={PUBLICATION_THEME.ink} /></View>
        <PublicationText variant="captionStrong" align="center">{t('reel.captionMore')}</PublicationText>
      </Pressable>
    </ScrollView>
    <View style={[styles.caption, { flexDirection: direction }]} testID="reference-publication-caption">
      <Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel={post.title || post.subtitle || t('reel.captionMore')} style={styles.captionText}>
        {post.title ? <PublicationText variant="bodyStrong" style={styles.headline}>{post.title}</PublicationText> : null}
        {post.subtitle ? <PublicationText variant="bodyStrong" style={styles.headline}>{post.subtitle}</PublicationText> : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t('publication.postOptions')} onPress={onOptions} style={styles.options}>
        <PublicationIcon name="ellipsis-horizontal-outline" size={24} color={PUBLICATION_THEME.ink} />
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { alignSelf: 'center', marginBottom: R.postGap },
  publisherRow: { alignItems: 'center', paddingStart: 8 },
  publisher: { alignItems: 'center', gap: 8, flexShrink: 1, minHeight: 36 },
  avatar: { width: 20, height: 20, borderRadius: 10 },
  publisherText: { fontSize: R.publisherSize, lineHeight: R.publisherLine, flexShrink: 1 },
  follow: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  sponsor: { minHeight: 28, alignItems: 'center', gap: 8 },
  media: { overflow: 'hidden', borderRadius: R.cardRadius, backgroundColor: PUBLICATION_THEME.neutral, alignItems: 'center' },
  videoFrame: { height: '100%' },
  fullWidth: { width: '100%' },
  buffering: { opacity: 0 },
  videoError: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: PUBLICATION_THEME.viewerDarkSurface },
  controls: { position: 'absolute', end: R.videoControlInset - 2, bottom: R.videoControlInset - 2, gap: R.videoControlGap - 4 },
  videoTouch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  videoDisc: { width: R.videoControlDiameter, height: R.videoControlDiameter, borderRadius: R.videoControlDiameter / 2,
    backgroundColor: veil(0.58), alignItems: 'center', justifyContent: 'center' },
  rail: { marginTop: R.mediaGap },
  railContent: { gap: R.railGap },
  tile: { borderRadius: R.cardRadius, backgroundColor: PUBLICATION_THEME.neutral, overflow: 'hidden' },
  fullHeight: { flex: 1 },
  heartTouch: { position: 'absolute', end: R.heartInset - 6, top: R.heartInset - 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heartDisc: { width: R.heartDiameter, height: R.heartDiameter, borderRadius: R.heartDiameter / 2, backgroundColor: PUBLICATION_THEME.paper, alignItems: 'center', justifyContent: 'center' },
  more: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  moreDisc: { width: R.moreDiameter, height: R.moreDiameter, borderRadius: R.moreDiameter / 2, backgroundColor: PUBLICATION_THEME.paper, alignItems: 'center', justifyContent: 'center' },
  caption: { marginTop: R.captionGap, alignItems: 'flex-start' },
  captionText: { flex: 1, paddingEnd: 4 },
  headline: { fontSize: R.headingSize, lineHeight: R.headingLine },
  options: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
});
