import { Platform, Pressable, View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useI18n } from '@/i18n';
import { BrandMark, ZMark } from '@/design/BrandMark';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { mediaUrl } from '@/api/client';
import { FONTS } from '@/design/tokens.generated';
import { PUBLICATION_THEME as P, RADIUS } from '@/design/tokens.mobile';
import type { FeedPost } from '@/api/publicationFeed';

/** Optical-size vector rosette, never an emoji or a text/font-dependent checkmark. */
export function PublicationVerifiedBadge() {
  const { locale } = useI18n();
  const hidden = Platform.OS === 'web' ? { 'aria-hidden': true as const } : { accessibilityElementsHidden: true };
  return <View accessible accessibilityRole="image" accessibilityLabel={locale === 'ar' ? 'ناشر رسمي موثّق' : 'Éditeur officiel vérifié'}>
    <Svg width={22} height={22} viewBox="0 0 24 24" {...hidden}>
      <Path d="m12 1 2.8 1.8 3.3.2 1.2 3.1 2.5 2.2-.8 3.2.8 3.2-2.5 2.2-1.2 3.1-3.3.2L12 23l-2.8-1.8-3.3-.2-1.2-3.1-2.5-2.2.8-3.2-.8-3.2 2.5-2.2L5.9 4l3.3-.2Z" fill={P.verified} />
      <Path d="m7.3 12.1 3.1 3.1 6.4-6.4" fill="none" stroke={P.paper} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  </View>;
}
export function PublicationPublisher({ post, dark = false, onFollow, following, busy }: { post: FeedPost; dark?: boolean; onFollow?: () => void; following?: boolean; busy?: boolean }) {
  const { locale } = useI18n(); const ink = dark ? P.paper : P.ink;
  // The official outlined wordmark is exempt from body typography. Other publishers keep their own name.
  const ownBrand = /^zayrovi(?:\s+official)?$/i.test(post.channelName.trim());
  return <View style={styles.row}>
    <View style={styles.avatar}>{post.publisherAvatar ? <AppImage uri={mediaUrl(post.publisherAvatar)} style={styles.image} contentFit="cover" accessibilityLabel={post.channelName} /> : <ZMark width={28} color={P.ink} />}</View>
    <View style={styles.name}>
      <View style={styles.identity}>{ownBrand ? <BrandMark nameSize={20} color={ink} /> : <AppText variant="captionStrong" color={ink}>{post.channelName || 'ZAYROVI'}</AppText>}
        {post.publisherOfficial ? <PublicationVerifiedBadge /> : null}
        {onFollow ? <><AppText color={P.muted}>·</AppText><Pressable accessibilityRole="button" accessibilityLabel={following ? (locale === 'ar' ? 'إلغاء متابعة الناشر' : 'Ne plus suivre cet éditeur') : (locale === 'ar' ? 'متابعة الناشر' : 'Suivre cet éditeur')} disabled={busy} accessibilityState={{ selected: !!following, disabled: !!busy }} onPress={onFollow} style={styles.follow}><AppText variant="captionStrong" color={P.accent} style={locale === 'ar' ? undefined : { fontFamily: FONTS.latin.bold }}>{following ? (locale === 'ar' ? 'متابَع' : 'Abonné') : (locale === 'ar' ? 'متابعة' : 'Suivre')}</AppText></Pressable></> : null}
      </View>
      <AppText variant="caption" color={dark ? P.paper : P.muted}>{post.content?.sponsored ? `Sponsorisé${post.content.sponsorName ? ` · ${post.content.sponsorName}` : ''}` : post.publishAt && Number.isFinite(Date.parse(post.publishAt)) ? new Date(post.publishAt).toLocaleDateString(locale === 'ar' ? 'ar-TN' : 'fr-TN') : ''}</AppText>
    </View>
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }, identity: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, minHeight: 26 }, avatar: { width: 46, height: 46, borderRadius: RADIUS.full, backgroundColor: P.neutral, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, image: { width: '100%', height: '100%' }, name: { flex: 1, gap: 1 }, follow: { minHeight: 44, justifyContent: 'center' } });
