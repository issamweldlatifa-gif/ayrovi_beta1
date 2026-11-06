import { Pressable, View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useI18n } from '@/i18n';
import { BrandMark, ZMark } from '@/design/BrandMark';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { mediaUrl } from '@/api/client';
import { FONTS } from '@/design/tokens.generated';
import {
  PUBLICATION_THEME as P,
  PUBLICATION_METRICS as PM,
  RADIUS,
  OPACITY,
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
  onFollow,
  following,
  busy,
}: {
  post: FeedPost;
  dark?: boolean;
  onFollow?: () => void;
  following?: boolean;
  busy?: boolean;
}) {
  const { locale } = useI18n();
  const ink = dark ? P.paper : P.ink;
  // The official outlined wordmark is exempt from body typography. Other publishers keep their own name.
  const ownBrand = /^zayrovi(?:\s+official)?$/i.test(post.channelName.trim());
  return (
    <View
      style={[
        styles.row,
        { flexDirection: locale === 'ar' ? 'row-reverse' : 'row' },
      ]}
    >
      <View style={styles.avatar}>
        {post.publisherAvatar ? (
          <AppImage
            uri={mediaUrl(post.publisherAvatar)}
            style={styles.image}
            contentFit="cover"
            accessibilityLabel={post.channelName}
          />
        ) : ownBrand ? (
          <ZMark width={20} color={P.ink} />
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
      <View style={styles.name}>
        <View
          style={[
            styles.identity,
            { flexDirection: locale === 'ar' ? 'row-reverse' : 'row' },
          ]}
        >
          {ownBrand ? (
            <BrandMark nameSize={18} color={ink} />
          ) : (
            <AppText
              variant="captionStrong"
              numberOfLines={1}
              color={ink}
              style={{ flexShrink: 1 }}
            >
              {post.channelName || 'ZAYROVI'}
            </AppText>
          )}
          {post.publisherOfficial ? <PublicationVerifiedBadge /> : null}
        </View>
        <AppText variant="caption" color={dark ? P.paper : P.muted}>
          {post.content?.sponsored
            ? `Sponsorisé${
                post.content.sponsorName ? ` · ${post.content.sponsorName}` : ''
              }`
            : post.publishAt && Number.isFinite(Date.parse(post.publishAt))
            ? new Date(post.publishAt).toLocaleDateString(
                locale === 'ar' ? 'ar-TN' : 'fr-TN'
              )
            : ''}
        </AppText>
      </View>
      {onFollow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            following
              ? locale === 'ar'
                ? 'إلغاء متابعة الناشر'
                : 'Ne plus suivre cet éditeur'
              : locale === 'ar'
              ? 'متابعة الناشر'
              : 'Suivre cet éditeur'
          }
          disabled={busy}
          accessibilityState={{ selected: !!following, disabled: !!busy }}
          onPress={onFollow}
          style={[
            styles.follow,
            {
              borderColor: ink,
              opacity: busy ? OPACITY.disabled : 1,
              flexDirection: locale === 'ar' ? 'row-reverse' : 'row',
            },
          ]}
        >
          {following ? (
            <Ionicons name="checkmark-outline" size={PM.verified} color={ink} />
          ) : null}
          <AppText
            variant="captionStrong"
            color={ink}
            style={
              locale === 'ar' ? undefined : { fontFamily: FONTS.latin.bold }
            }
          >
            {following
              ? locale === 'ar'
                ? 'متابَع'
                : 'Suivi'
              : locale === 'ar'
              ? 'متابعة'
              : 'Suivre'}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    minHeight: 20,
  },
  avatar: {
    width: PM.avatar,
    height: PM.avatar,
    borderRadius: RADIUS.full,
    backgroundColor: P.neutral,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  name: { flex: 1, gap: 1 },
  follow: {
    minWidth: 88,
    minHeight: 44,
    paddingHorizontal: 12,
    gap: 4,
    borderWidth: 1,
    borderRadius: RADIUS.full,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
