import { useRef, type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { openPublicationProduct } from './publicationProductNavigation';
import { PublicationIcon, PublicationText } from './publicationDesign';
import { PUBLICATION_REFERENCE as R, referenceMeasurements } from './referencePublicationLayout';
import { PublicationInlineVideo } from './PublicationInlineVideo';
import type { PublicationPlayback } from './PublicationFullscreenVideo';
import { usePublisherFollow } from './usePublisherFollow';

function PublicationMedia({ post, width, height, preview, muted, onToggleMute, onVideo, onPhoto, playback }: {
  post: ReferencePublication; width: number; height: number; preview: boolean; muted: boolean; onToggleMute: () => void;
  onPhoto?: () => void; onVideo?: (state: PublicationPlayback) => void; playback: RefObject<PublicationPlayback>;
}) {
  const t = useT();
  const { media } = post;
  if (!media) return null;
  const isVideo = media.type === 'video';
  const square = post.layout === 'video-square';
  const inset = post.layout === 'video-inset' || (square && media.fit !== 'cover');
  const openVideo = () => onVideo?.({ ...playback.current, muted });
  const focal = media.focalX !== undefined || media.focalY !== undefined
    ? { left: `${media.focalX ?? 50}%` as const, top: `${media.focalY ?? 50}%` as const } : undefined;
  return <View testID={`reference-media-${post.layout}`} style={[styles.media, { width, height }]}>
    {!isVideo ? <>
      <AppImage uri={mediaUrl(media.url)} style={StyleSheet.absoluteFill} contentFit={media.fit ?? 'cover'}
      contentPosition={focal} accessibilityLabel={media.alt || post.title || undefined} decorative={Boolean(onPhoto) || (!media.alt && !post.title)} />
      {onPhoto ? <Pressable testID="reference-photo-open" accessibilityRole="button"
        accessibilityLabel={t('publication.photoOpen')} accessibilityHint={media.alt || post.title || undefined}
        style={StyleSheet.absoluteFill} onPress={onPhoto} /> : null}
    </> : <>
      {inset && media.poster ? <AppImage uri={mediaUrl(media.poster)} decorative contentFit="cover" blurRadius={28} style={StyleSheet.absoluteFill} /> : null}
      <View style={[styles.videoFrame, inset ? { width: square ? '56%' : '50%' } : styles.fullWidth]}>
        {media.poster ? <AppImage uri={mediaUrl(media.poster)} decorative contentFit={inset ? 'contain' : 'cover'} style={StyleSheet.absoluteFill} /> : null}
        {preview ? <PublicationInlineVideo key={media.url} url={media.url} fit={inset ? 'contain' : 'cover'} muted={muted}
          paused={false} position={onVideo ? playback : undefined} /> : null}
      </View>
      {onVideo ? <Pressable testID="reference-video-fullscreen" accessibilityRole="button" accessibilityLabel={t('publication.playerOpen')}
        style={StyleSheet.absoluteFill} onPress={openVideo} /> : null}
      <View style={styles.controls}>
        {onVideo ? <Pressable accessibilityRole="button" accessibilityLabel={t('publication.playerOpen')}
          testID="reference-video-play" style={styles.videoTouch} onPress={openVideo}>
          <View style={styles.videoDisc}><PublicationIcon name="play-outline" color={PUBLICATION_THEME.paper} /></View>
        </Pressable> : null}
        {preview ? <Pressable accessibilityRole="button" accessibilityLabel={t(muted ? 'publication.unmute' : 'publication.mute')}
          testID="reference-video-mute" style={styles.videoTouch} onPress={onToggleMute}>
          <View style={styles.videoDisc}><PublicationIcon name={muted ? 'volume-mute-outline' : 'volume-high-outline'} color={PUBLICATION_THEME.paper} /></View>
        </Pressable> : null}
      </View>
    </>}
  </View>;
}

export function ReferencePublicationCard({ post, viewport, preview, muted, onToggleMute, onVideo, onPhoto, onMore, onCaption, onOptions, onSponsor, favorites, signedIn, onAuth }: {
  post: ReferencePublication; viewport: number; preview: boolean; muted: boolean;
  onToggleMute: () => void; onPhoto?: () => void; onVideo?: (state: PublicationPlayback, resumeAt: (state: PublicationPlayback) => void) => void; onMore: () => void; onCaption?: () => void; onOptions: () => void; onSponsor: () => void;
  favorites: ProductFavorites; signedIn: boolean; onAuth: () => void;
}) {
  const playback = useRef<PublicationPlayback>({ time: 0, muted: true });
  const t = useT();
  const { isRTL } = useTheme();
  const direction = rowDirectionFor(isRTL);
  const { width, tileWidth, tileHeight, mediaHeight } = referenceMeasurements(viewport, post.layout);
  const squareRail = post.layout === 'video-square' && post.products.length === 2;
  const railInset = squareRail ? width * 38 / 658 : 0;
  const adaptedTileWidth = squareRail ? (width - railInset - 2 * R.railGap) / 3 : tileWidth;
  const tileSize = { width: adaptedTileWidth, height: squareRail ? adaptedTileWidth / R.tileAspect : tileHeight };
  const moreLabel = t('publication.learnMore');
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
    <PublicationMedia post={post} width={width} height={mediaHeight} preview={preview} muted={muted} onToggleMute={onToggleMute} playback={playback} onPhoto={onPhoto}
      onVideo={onVideo && (state => onVideo(state, resume => { playback.current = resume; }))} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={`reference-products-${post.id}`}
      style={styles.rail} contentContainerStyle={[styles.railContent, { direction: isRTL ? 'rtl' : 'ltr', paddingStart: railInset }]}>
      {post.products.map(product => {
        const saved = signedIn && favorites.isFavorite(product.id);
        return <View key={product.id} style={[styles.tile, tileSize]} testID="reference-product-tile">
          <Pressable style={styles.fullHeight} accessibilityRole="link" accessibilityLabel={product.name}
            onPress={() => openPublicationProduct(product.id)}>
            <AppImage uri={mediaUrl(product.image)} decorative contentFit="contain" style={StyleSheet.absoluteFill} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t(saved ? 'publisher.unsave' : 'publisher.save', { name: product.name })}
            accessibilityState={{ selected: saved }} onPress={() => signedIn ? favorites.toggle(product.id) : onAuth()} style={styles.heartTouch}>
            <View style={styles.heartDisc}><PublicationIcon name={saved ? 'heart' : 'heart-outline'} color={PUBLICATION_THEME.ink} /></View>
          </Pressable>
        </View>;
      })}
      <Pressable testID="reference-more-tile" accessibilityRole="button" accessibilityLabel={moreLabel}
        onPress={onMore} style={[styles.tile, styles.more, tileSize]}>
        <View style={styles.moreDisc}><PublicationIcon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={26} color={PUBLICATION_THEME.ink} /></View>
        <PublicationText variant="captionStrong" align="center">{moreLabel}</PublicationText>
      </Pressable>
    </ScrollView>
    <View style={[styles.caption, { flexDirection: direction }]} testID="reference-publication-caption">
      <Pressable onPress={onCaption ?? onMore} accessibilityRole="button" accessibilityLabel={post.title || post.subtitle || t('reel.captionMore')} style={styles.captionText}>
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
