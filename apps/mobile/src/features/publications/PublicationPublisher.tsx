import { View, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useI18n } from '@/i18n';
import { ZMark } from '@/design/BrandMark';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { mediaUrl } from '@/api/client';
import { FONTS } from '@/design/tokens.generated';
import {
  PUBLICATION_THEME as P,
  PUBLICATION_METRICS as PM,
  RADIUS,
} from '@/design/tokens.mobile';
import type { FeedPost } from '@/api/publicationFeed';

/** Standard Material verified icon, gated exclusively by actual publisher metadata. */
export function PublicationVerifiedBadge() {
  const { locale } = useI18n();
  return (
    <View
      testID="publication-verified-badge"
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        locale === 'ar' ? 'ناشر رسمي موثّق' : 'Éditeur officiel vérifié'
      }
    >
      <MaterialIcons
        name="verified"
        size={PM.verified}
        color={P.verified}
        accessible={false}
      />
    </View>
  );
}
export function PublicationPublisher({
  post,
  dark = false,
}: {
  post: FeedPost;
  dark?: boolean;
}) {
  const { locale } = useI18n();
  const ink = dark ? P.paper : P.ink;
  const ownBrand = /^zayrovi(?:\s+official)?$/i.test(post.channelName.trim());
  return (
    <View testID="publication-publisher-header" style={styles.row}>
      <View style={styles.name}>
        <AppText
          testID="publication-publisher-name"
          variant="bodyStrong"
          numberOfLines={1}
          color={ink}
          style={{
            fontFamily: locale === 'ar' ? FONTS.arabic.bold : FONTS.latin.bold,
          }}
        >
          {ownBrand ? 'ZAYROVI' : post.channelName || 'ZAYROVI'}
        </AppText>
        {post.content?.sponsored ? (
          <AppText variant="caption" color={dark ? P.paper : P.muted}>{`${
            locale === 'ar' ? 'إعلان' : 'Sponsorisé'
          }${
            post.content.sponsorName ? ` · ${post.content.sponsorName}` : ''
          }`}</AppText>
        ) : null}
      </View>
      <View testID="publication-publisher-avatar" style={styles.avatarWrap}>
        <View style={styles.avatar}>
          {post.publisherAvatar ? (
            <AppImage
              uri={mediaUrl(post.publisherAvatar)}
              style={styles.image}
              contentFit="cover"
              accessibilityLabel={post.channelName}
            />
          ) : ownBrand ? (
            <ZMark width={24} color={P.ink} />
          ) : (
            <AppText
              testID="publication-publisher-initial"
              variant="captionStrong"
              color={P.ink}
            >
              {post.channelName.trim().slice(0, 1).toUpperCase() || '?'}
            </AppText>
          )}
        </View>
        {post.publisherOfficial ? (
          <View testID="publication-publisher-seal" style={styles.seal}>
            <PublicationVerifiedBadge />
          </View>
        ) : null}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  name: { flex: 1, minWidth: 0, gap: 2 },
  avatarWrap: { width: 48, height: 48, flexShrink: 0 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    backgroundColor: P.neutral,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  seal: {
    position: 'absolute',
    left: -2,
    bottom: -2,
    borderRadius: RADIUS.full,
    padding: 2,
    backgroundColor: P.paper,
  },
});
