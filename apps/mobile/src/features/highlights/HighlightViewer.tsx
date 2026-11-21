import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { mediaUrl } from '@/api/client';
import { useSocialCounts } from '@/api/hooks';
import type { Reel } from '@/api/social';
import { highlightsKey } from '@/api/zayroviHighlights';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { BRAND } from '@/design/tokens.generated';
import { useTheme } from '@/design/theme';
import { RADIUS, veil } from '@/design/tokens.mobile';
import { ReactionButton } from '@/design/reactions/ReactionButton';
import { useContentReaction } from '@/design/reactions/useContentReaction';
import { PublicationAuthSheet } from '@/features/publications/PublicationAuthSheet';
import { ReelPlayback } from '@/features/reels/ReelPlayback';
import { ReelPublisher } from '@/features/reels/ReelPublisher';
import { reelCaption } from '@/features/reels/reelCaption';
import { formatRailCount } from '@/features/reels/reelTray';
import { ReelCommentsModal } from '@/features/social/ReelCommentsModal';
import { useI18n } from '@/i18n';
import { useSessionId } from '@/session/session';
import { useSession } from '@/state/session';
import { HighlightProductCard } from './HighlightProductCard';
import { highlightProducts } from './highlightProducts';

export function HighlightOverlayButton({ icon, label, onPress, testID }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID?: string;
}) {
  const { iconSize } = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.control}>
    <Ionicons name={icon} size={iconSize.md} color={BRAND.white} accessibilityElementsHidden />
  </Pressable>;
}

export function HighlightViewer({ reel, focused, onClose }: { reel: Reel; focused: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { iconSize } = useTheme();
  const safe = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const client = useQueryClient();
  const session = useSession();
  const guest = useSessionId();
  const signedIn = session.status === 'signedIn';
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(true);
  const [comments, setComments] = useState(false);
  const [auth, setAuth] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { data } = useSocialCounts([reel.id]);
  const counts = data?.[reel.id];
  const openAuth = useCallback(() => setAuth(true), []);
  const autoplayMuted = useCallback(() => setSound(false), []);
  const reaction = useContentReaction({ targetId: reel.id, initial: reel.myReaction ?? null,
    initialCount: counts ? counts.likes + (counts.loves ?? 0) : reel.likes,
    signedIn, sessionId: guest || undefined, onAuthRequired: openAuth,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: highlightsKey });
      void client.invalidateQueries({ queryKey: ['social', 'counts'] });
    },
  });
  const products = highlightProducts(reel);
  const primary = products[0];
  const extras = products.length - 1;
  const showCarousel = extras > 0 && expanded;
  const dockWidth = Math.min(216, Math.max(128, (width - safe.left - safe.right) * 0.53));
  const cardWidth = Math.min(122, dockWidth - 24);
  const { title, description } = reelCaption(reel, locale);
  const openProduct = (id: string) => router.push({ pathname: '/product/[id]', params: { id } });

  return <View style={styles.screen} testID="highlight-viewer">
    <AppImage uri={mediaUrl(reel.posterUrl)} contentFit="cover" decorative style={StyleSheet.absoluteFill} />
    <ReelPlayback id={reel.id} uri={mediaUrl(reel.videoUrl)} contentFit="cover"
      blocked={!focused || comments || auth} paused={paused} onPausedChange={setPaused} showPauseGlyph
      soundOn={sound} onAutoplayMuted={autoplayMuted} />
    <LinearGradient pointerEvents="none" colors={[veil(0.72), veil(0)]} style={[styles.topScrim, { height: safe.top + 90 }]} />
    <LinearGradient pointerEvents="none" colors={[veil(0), veil(0.48), veil(0.88)]} style={[styles.bottomScrim, { height: safe.bottom + 268 }]} />
    <View pointerEvents="box-none" style={[styles.header, { top: safe.top + 8, left: safe.left + 12, right: safe.right + 12 }]}>
      <HighlightOverlayButton icon="close" label={t('common.close')} onPress={onClose} testID="highlight-close" />
      <ReelPublisher onMedia />
      <HighlightOverlayButton icon={sound ? 'volume-high-outline' : 'volume-mute-outline'} label={t(sound ? 'social.mute' : 'social.unmute')}
        onPress={() => setSound(value => !value)} testID="highlight-sound" />
    </View>
    <View pointerEvents="box-none" style={[styles.footer, { bottom: safe.bottom + 12, left: safe.left + 12, right: safe.right + 12 }]}>
      <View pointerEvents="none" style={styles.caption}>
        {title ? <AppText variant="label" color={BRAND.white} numberOfLines={2}>{title}</AppText> : null}
        {description && description !== title ? <AppText variant="caption" color={BRAND.white} numberOfLines={3}>{description}</AppText> : null}
        {reaction.error ? <AppText accessibilityRole="alert" variant="caption" color={BRAND.white}>{t('common.retry')}</AppText> : null}
      </View>
      <View pointerEvents="box-none" style={[styles.dock, { width: showCarousel ? dockWidth : primary ? Math.min(104, cardWidth) : 60 }]}>
        <View pointerEvents="box-none" style={styles.actions}>
          <ReactionButton testID="highlight-reaction" variant="rail" reaction={reaction.reaction} count={formatRailCount(reaction.count)}
            onTap={reaction.tap} onPick={reaction.pick} guest={!signedIn} ink={BRAND.white} />
          <Pressable testID="highlight-comments" accessibilityRole="button" accessibilityLabel={t('social.comments')}
            onPress={() => setComments(true)} style={styles.comment}>
            <Ionicons name="chatbubble-outline" size={iconSize.md} color={BRAND.white} accessibilityElementsHidden />
            <AppText variant="captionStrong" color={BRAND.white}>{formatRailCount(counts?.comments ?? 0)}</AppText>
          </Pressable>
        </View>
        {extras > 0 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: showCarousel }} testID="highlight-more-products"
          onPress={() => setExpanded(value => !value)} style={styles.tag}>
          <Ionicons name={showCarousel ? 'close' : 'pricetag-outline'} size={iconSize.xs} color={BRAND.white} accessibilityElementsHidden />
          <AppText variant="captionStrong" color={BRAND.white}>{t(showCarousel ? 'highlights.less' : extras === 1 ? 'highlights.moreOne' : 'highlights.more', { count: extras })}</AppText>
        </Pressable> : null}
        {showCarousel ? <ScrollView testID="highlight-product-carousel" horizontal nestedScrollEnabled directionalLockEnabled
          snapToInterval={cardWidth + 6} decelerationRate="fast" style={styles.carousel} contentContainerStyle={styles.slides}>
          {products.map(product => <View key={product.id} style={{ width: cardWidth }}>
            <HighlightProductCard testID={`highlight-buy-${product.id}`} product={product} onPress={() => openProduct(product.id)} />
          </View>)}
        </ScrollView> : primary ? <HighlightProductCard testID={`highlight-buy-${primary.id}`} product={primary} onPress={() => openProduct(primary.id)} /> : null}
      </View>
    </View>
    {comments ? <ReelCommentsModal reel={reel} onClose={() => setComments(false)} /> : null}
    {auth ? <PublicationAuthSheet visible onClose={() => setAuth(false)} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.black },
  topScrim: { ...StyleSheet.absoluteFill, bottom: undefined },
  bottomScrim: { ...StyleSheet.absoluteFill, top: undefined },
  header: { ...StyleSheet.absoluteFill, bottom: undefined, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  control: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: veil(0.46), alignItems: 'center', justifyContent: 'center' },
  footer: { ...StyleSheet.absoluteFill, top: undefined, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  caption: { flex: 1, gap: 6, paddingBottom: 4 },
  dock: { alignItems: 'flex-end', gap: 6 },
  actions: { alignItems: 'center', gap: 4 },
  comment: { minWidth: 44, minHeight: 44, borderRadius: RADIUS.full, backgroundColor: veil(0.46), alignItems: 'center', justifyContent: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, borderRadius: RADIUS.full, backgroundColor: veil(0.65), paddingHorizontal: 10 },
  carousel: { width: '100%', flexGrow: 0 },
  slides: { gap: 6, paddingBottom: 2 },
});
