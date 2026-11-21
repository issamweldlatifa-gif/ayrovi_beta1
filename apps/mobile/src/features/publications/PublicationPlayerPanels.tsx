import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ReferencePublication } from '@/api/referencePublications';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { formatAmount } from '@/format/money';
import { RADIUS, veil } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { PublicationIcon, PublicationText } from './publicationDesign';
import { PUBLICATION_PALETTE as P, PUBLICATION_PLAYER as C, PUBLICATION_OVERLAY_TEXT } from './publicationTokens';
import { videoClock } from './publicationVideoQueue';

export type PlayerPanel = 'shop' | 'videos';
export type RelatedStatus = 'loading' | 'error' | 'ready';

export function PublicationPlayerActions({ panel, hasProducts, showVideos, onPanel, onLearnMore }: {
  panel: PlayerPanel | null; hasProducts: boolean; showVideos: boolean;
  onPanel: (panel: PlayerPanel) => void; onLearnMore: () => void;
}) {
  const t = useT();
  const { isRTL, iconSize } = useTheme();
  const action = (id: string, name: keyof typeof Ionicons.glyphMap, label: string, press: () => void, expanded?: boolean) => (
    <Pressable testID={`publication-player-${id}`} accessibilityRole={expanded === undefined ? 'link' : 'button'} accessibilityLabel={label}
      accessibilityState={expanded === undefined ? undefined : { expanded }} style={styles.action} onPress={press}>
      <View testID={`publication-player-${id}-icon`} style={styles.actionIcon}>
        <Ionicons name={name} color={P.paper} size={iconSize.md} accessibilityElementsHidden />
      </View>
      <PublicationText variant="captionStrong" align="center" color={P.paper} style={PUBLICATION_OVERLAY_TEXT}>{label}</PublicationText>
    </Pressable>
  );
  return <View style={[styles.actions, { flexDirection: rowDirectionFor(isRTL) }]}>
    {hasProducts ? action('shop', 'bag-outline', t('publication.playerShop'), () => onPanel('shop'), panel === 'shop') : null}
    {action('learn-more', 'information-circle-outline', t('publication.learnMore'), onLearnMore)}
    {showVideos ? action('more-videos', 'videocam-outline', t('publication.playerMoreVideos'), () => onPanel('videos'), panel === 'videos') : null}
  </View>;
}

export function PublicationPlayerPanel({ panel, post, videos, status, compact, onProduct, onVideo, onRetry, onDismiss }: {
  panel: PlayerPanel; post: ReferencePublication; videos: ReferencePublication[]; status: RelatedStatus; compact: boolean;
  onProduct: (id: string) => void; onVideo: (post: ReferencePublication) => void; onRetry: () => void; onDismiss: () => void;
}) {
  const t = useT();
  const { isRTL } = useTheme();
  const isShop = panel === 'shop';
  const reducedMotion = useReduceMotion();
  const [offset] = useState(() => new Animated.Value(reducedMotion ? 0 : 18));
  useEffect(() => {
    if (reducedMotion) { offset.setValue(0); return; }
    const animation = Animated.timing(offset, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web', isInteraction: false });
    animation.start();
    return () => animation.stop();
  }, [offset, reducedMotion]);
  return <Animated.View style={[styles.sheet, { transform: [{ translateY: offset }] }]} testID={`publication-player-panel-${panel}`}>
    <View style={[styles.heading, { flexDirection: rowDirectionFor(isRTL) }]}>
      <PublicationText variant="bodyStrong" accessibilityRole="header" color={P.paper} style={styles.headingTitle}>
        {t(isShop ? 'publication.playerShop' : 'publication.playerRelatedTitle')}
      </PublicationText>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onDismiss} style={styles.dismiss}>
        <PublicationIcon name="chevron-down" color={P.paper} size={20} />
      </Pressable>
    </View>
    {!isShop && !videos.length ? <View style={styles.empty}>
      <PublicationText variant="caption" color={P.paper}>{t(status === 'loading' ? 'publication.playerRelatedLoading' : status === 'error' ? 'publication.playerRelatedError' : 'publication.playerRelatedEmpty')}</PublicationText>
      {status === 'error' ? <Pressable accessibilityRole="button" onPress={onRetry} style={styles.dismiss}><PublicationText variant="bodyStrong" color={P.paper}>{t('common.retry')}</PublicationText></Pressable> : null}
    </View> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {isShop ? post.products.map(product => (
        <Pressable key={product.id} accessibilityRole="link" accessibilityLabel={product.name} onPress={() => onProduct(product.id)} style={styles.product}>
          {product.image ? <AppImage uri={mediaUrl(product.image)} decorative contentFit="contain" style={[styles.productImage, compact && styles.compactImage]} /> : <View style={[styles.productImage, compact && styles.compactImage]} />}
          <View style={styles.copy}>
            <PublicationText variant="caption" numberOfLines={2}>{product.name}</PublicationText>
            <PublicationText variant="bodyStrong">{formatAmount(product.price)} {product.currency}</PublicationText>
            {!product.available ? <PublicationText variant="caption">{t('catalog.stock.out_of_stock')}</PublicationText> : null}
          </View>
        </Pressable>
      )) : videos.map(item => {
        const title = item.title || item.subtitle || t('publication.playerVideo');
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={title} onPress={() => onVideo(item)} style={styles.clip}>
          <View style={[styles.thumbnail, compact && styles.compactImage]}>
            {item.media?.poster ? <AppImage uri={mediaUrl(item.media.poster)} decorative contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
            <View style={styles.previewPlay}><PublicationIcon name="play-outline" color={P.paper} size={22} /></View>
            {item.media?.durationSeconds ? <PublicationText variant="caption" color={P.paper} style={styles.duration}>{videoClock(item.media.durationSeconds)}</PublicationText> : null}
          </View>
          <View style={styles.copy}>
            <PublicationText variant="bodyStrong" color={P.paper} numberOfLines={2}>{title}</PublicationText>
            {item.channelName ? <PublicationText variant="caption" color={P.paper} numberOfLines={1}>{item.channelName}</PublicationText> : null}
          </View>
        </Pressable>;
      })}
    </ScrollView>}
  </Animated.View>;
}

const styles = StyleSheet.create({
  actions: { justifyContent: 'space-evenly', alignItems: 'flex-start', paddingVertical: 4 },
  action: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  actionIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: C.menu, borderTopLeftRadius: RADIUS.md, borderTopRightRadius: RADIUS.md, paddingBottom: 8 },
  heading: { alignItems: 'center', paddingStart: 12, paddingEnd: 4 },
  headingTitle: { flex: 1 },
  dismiss: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  empty: { paddingHorizontal: 12, paddingBottom: 8, alignItems: 'flex-start' },
  rail: { gap: 8, paddingHorizontal: 10 },
  product: { width: 138, borderRadius: RADIUS.sm, overflow: 'hidden', backgroundColor: P.paper },
  productImage: { width: '100%', height: 94, backgroundColor: P.neutral },
  compactImage: { height: 60 },
  clip: { width: 190, backgroundColor: P.ink, borderRadius: RADIUS.sm, overflow: 'hidden' },
  thumbnail: { height: 96, backgroundColor: P.backdrop, alignItems: 'center', justifyContent: 'center' },
  previewPlay: { backgroundColor: veil(0.65), width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  duration: { position: 'absolute', bottom: 4, end: 4, backgroundColor: veil(0.65), paddingHorizontal: 4 },
  copy: { padding: 6, gap: 2 },
});
