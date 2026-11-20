import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReferencePublication } from '@/api/referencePublications';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { BackButton } from '@/design/BackButton';
import { rowDirectionFor } from '@/design/layoutLogic';
import { goBack } from '@/design/navigation';
import { OfficialAvatar } from '@/design/OfficialAvatar';
import { useTheme } from '@/design/theme';
import { PUBLICATION_THEME as P, RADIUS } from '@/design/tokens.mobile';
import { useProductFavorites } from '@/features/reels/useProductFavorites';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';
import { OFFICIAL_PUBLISHER_ID, OFFICIAL_PUBLISHER_NAME, OFFICIAL_PUBLISHER_ROUTE } from './officialPublisher';
import { PublicationAuthSheet } from './PublicationAuthSheet';
import { PublicationIcon, PublicationText, PUBLICATION_TYPE } from './publicationDesign';
import { PublicationLookProduct } from './PublicationLookProduct';
import { PublisherInfoSheet } from './PublisherInfoSheet';
import { usePublisherFollow } from './usePublisherFollow';

export const CAMPAIGN_DETAIL = { maxWidth: 600, inset: 12, gap: 12, coverAspect: 658 / 317 } as const;

export function PublicationCampaignDetail({ post, refreshing, onRefresh }: {
  post: ReferencePublication; refreshing: boolean; onRefresh: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const { isRTL } = useTheme();
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const favorites = useProductFavorites(signedIn, session.account?.id);
  const [authOpen, setAuthOpen] = useState(false);
  const [info, setInfo] = useState<'open' | 'closing' | 'closed'>('closed');
  const follow = usePublisherFollow(post.channelId, () => setAuthOpen(true));
  const official = post.channelId === OFFICIAL_PUBLISHER_ID;
  const publisher = official ? OFFICIAL_PUBLISHER_NAME : post.channelName;
  const title = post.detailTitle || post.title || post.subtitle || t('publication.lookTitle');
  const copy = [post.subtitle, post.description].filter((text, index, values) => text && text !== title && values.indexOf(text) === index).join('\n\n');
  const authoredCover = post.media?.type === 'image' ? post.media.url : post.coverImage || post.media?.poster;
  const cover = authoredCover || post.products.find(product => product.image)?.image;
  const focal = post.media?.type === 'image' && (post.media.focalX !== undefined || post.media.focalY !== undefined)
    ? { left: `${post.media.focalX ?? 50}%` as const, top: `${post.media.focalY ?? 50}%` as const } : undefined;
  const contentWidth = Math.max(0, Math.min(width, CAMPAIGN_DETAIL.maxWidth) - 2 * CAMPAIGN_DETAIL.inset);
  const tileWidth = Math.max(0, (contentWidth - CAMPAIGN_DETAIL.gap) / 2);
  const direction = rowDirectionFor(isRTL);
  const modalOpen = info !== 'closed' || authOpen;
  const followLabel = t(follow.state === 'following' ? 'publication.following' : follow.state === 'error' ? 'publication.followRetry' : 'publication.follow');
  const identity = <>
    {official ? <OfficialAvatar size={24} testID="publication-campaign-avatar" /> : post.channelAvatar ?
      <AppImage uri={mediaUrl(post.channelAvatar)} decorative style={styles.avatar} /> : null}
    {publisher ? <PublicationText variant="bodyStrong" style={styles.publisher}>{publisher}</PublicationText> : null}
  </>;

  return <View testID="publication-campaign-detail" style={[styles.screen, { paddingTop: insets.top }]}>
    {focused ? <StatusBar style="dark" /> : null}
    <View style={styles.content} accessibilityElementsHidden={modalOpen} importantForAccessibility={modalOpen ? 'no-hide-descendants' : 'auto'}>
      <View style={[styles.bar, { flexDirection: direction }]}>
        <View style={styles.back}><BackButton testID="publication-campaign-back" label={t('common.back')} color={P.ink} onPress={() => goBack('/publications')} /></View>
      </View>
      <FlatList testID="publication-campaign-detail-products" style={styles.list} data={post.products} numColumns={2}
        keyExtractor={product => product.id} columnWrapperStyle={[styles.columns, { flexDirection: direction }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} refreshing={refreshing} onRefresh={onRefresh}
        ListHeaderComponent={<View style={styles.intro}>
          {cover ? <AppImage testID="publication-campaign-cover" uri={mediaUrl(cover)} decorative
            contentFit={authoredCover ? 'cover' : 'contain'} contentPosition={focal} style={styles.cover} /> : null}
          <View style={styles.info}>
            <Pressable testID="publication-campaign-info" accessibilityRole="button" accessibilityLabel={t('publisher.about')}
              onPress={() => setInfo('open')} style={styles.infoButton}>
              <PublicationIcon name="information-circle-outline" size={28} color={P.ink} />
            </Pressable>
          </View>
          <PublicationText variant="h1" accessibilityRole="header">{title}</PublicationText>
          {copy ? <PublicationText style={styles.description}>{copy}</PublicationText> : null}
          <View style={[styles.byline, { flexDirection: direction }]}>
            {official ? <Pressable accessibilityRole="link" accessibilityLabel={publisher} onPress={() => router.push(OFFICIAL_PUBLISHER_ROUTE)}
              style={[styles.identity, { flexDirection: direction }]}>{identity}</Pressable> : <View style={[styles.identity, { flexDirection: direction }]}>{identity}</View>}
            {post.channelId ? <Pressable testID="publication-campaign-detail-follow" accessibilityRole="button" accessibilityLabel={followLabel}
              accessibilityState={{ selected: follow.state === 'following', disabled: follow.disabled }} disabled={follow.disabled} onPress={follow.press}
              style={[styles.follow, { flexDirection: direction }]}>
              <PublicationIcon name={follow.state === 'following' ? 'checkmark-outline' : 'add-outline'} size={24} color={P.ink} />
              <PublicationText variant="bodyStrong">{follow.state === 'pending' ? '…' : followLabel}</PublicationText>
            </Pressable> : null}
          </View>
          {follow.writeFailed ? <PublicationText variant="caption" accessibilityRole="alert">{t('publication.followError')}</PublicationText> : null}
          <PublicationText style={styles.count}>{t(post.products.length === 1 ? 'publication.photoOneProduct' : 'publisher.count', { count: post.products.length })}</PublicationText>
        </View>}
        ListEmptyComponent={<PublicationText style={styles.empty}>{t('publication.lookNoProducts')}</PublicationText>}
        renderItem={({ item }) => <PublicationLookProduct item={item} tileWidth={tileWidth} saved={signedIn && favorites.isFavorite(item.id)}
          onFavorite={() => signedIn ? favorites.toggle(item.id) : setAuthOpen(true)} />} />
    </View>
    {info !== 'closed' ? <PublisherInfoSheet scoped showFilters={false} open={info === 'open'} close={() => setInfo('closing')} onClosed={() => setInfo('closed')} /> : null}
    {authOpen ? <PublicationAuthSheet visible onClose={() => setAuthOpen(false)} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.paper },
  content: { flex: 1 },
  bar: { alignItems: 'center', minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: P.line },
  back: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderEndWidth: StyleSheet.hairlineWidth, borderColor: P.line },
  list: { width: '100%', maxWidth: CAMPAIGN_DETAIL.maxWidth, alignSelf: 'center' },
  intro: { paddingHorizontal: CAMPAIGN_DETAIL.inset },
  cover: { width: '100%', aspectRatio: CAMPAIGN_DETAIL.coverAspect, borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: P.neutral },
  info: { paddingTop: 8, alignItems: 'flex-end' },
  infoButton: { minWidth: PUBLICATION_TYPE.touch, minHeight: PUBLICATION_TYPE.touch, alignItems: 'center', justifyContent: 'center' },
  description: { marginTop: 8 },
  byline: { marginTop: 16, flexWrap: 'wrap', gap: 16, alignItems: 'center' },
  identity: { gap: 8, alignItems: 'center', minHeight: PUBLICATION_TYPE.touch, flexShrink: 1 },
  avatar: { width: 24, height: 24, borderRadius: RADIUS.full },
  publisher: { flexShrink: 1 },
  follow: { gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, minHeight: PUBLICATION_TYPE.touch, borderWidth: 1, borderRadius: RADIUS.full, borderColor: P.ink },
  count: { marginTop: 32, marginBottom: 16, paddingHorizontal: 12 },
  columns: { paddingHorizontal: CAMPAIGN_DETAIL.inset, gap: CAMPAIGN_DETAIL.gap, marginBottom: 24 },
  empty: { marginHorizontal: CAMPAIGN_DETAIL.inset, marginBottom: 24 },
});
