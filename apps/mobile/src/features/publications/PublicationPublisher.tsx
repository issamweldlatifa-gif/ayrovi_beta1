import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useI18n } from '@/i18n';
import { Platform } from 'react-native';
import { ZMark } from '@/design/BrandMark';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { mediaUrl } from '@/api/client';
import { PUBLICATION_THEME as P, RADIUS } from '@/design/tokens.mobile';
import type { FeedPost } from '@/api/publicationFeed';

export function PublicationPublisher({ post, dark = false }: { post: FeedPost; dark?: boolean }) {
  const { locale } = useI18n();
  const hidden = Platform.OS === 'web' ? { 'aria-hidden': true as const } : { accessibilityElementsHidden: true };
  return <View style={styles.row}>
    <View style={styles.avatar}>{post.publisherAvatar ? <AppImage uri={mediaUrl(post.publisherAvatar)} style={styles.image} contentFit="cover" accessibilityLabel={post.channelName} /> : <ZMark width={24} color={P.ink} />}</View>
    <View style={styles.name}>
      <View style={styles.row}><AppText variant="captionStrong" color={dark ? P.paper : P.ink}>{post.channelName || 'ZAYROVI'}</AppText>
        {post.publisherOfficial ? <View accessible accessibilityLabel={locale === 'ar' ? 'ناشر رسمي موثّق' : 'Éditeur officiel vérifié'}><Svg width={18} height={18} viewBox="0 0 24 24" {...hidden}><Path d="m12 1 3 2 4 .5.5 4 2 3-2 3-.5 4-4 .5-3 2-3-2-4-.5-.5-4-2-3 2-3 .5-4 4-.5Z" fill={P.verified} /><Path d="m7 12 3 3 7-7" fill="none" stroke={P.paper} strokeWidth={2} /></Svg></View> : null}
      </View>
      <AppText variant="caption" color={dark ? P.paper : P.muted}>{post.content?.sponsored ? `Sponsorisé${post.content.sponsorName ? ` · ${post.content.sponsorName}` : ''}` : post.publishAt ? new Date(post.publishAt).toLocaleDateString() : ''}</AppText>
    </View>
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, avatar: { width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: P.neutral, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, image: { width: '100%', height: '100%' }, name: { gap: 2, flexShrink: 1 } });
