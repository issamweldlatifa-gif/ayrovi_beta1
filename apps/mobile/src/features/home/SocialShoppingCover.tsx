import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { mediaUrl } from '@/api/client';
import type { HomeCover as Settings } from '@/api/public';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { useT } from '@/i18n';
import { socialHref } from '@/features/social-commerce/navigation';

export const SOCIAL_SHOPPING_ART = require('../../../assets/cover/cover-social-shopping.jpg');

export function SocialShoppingCover({ settings }: { settings: Settings }) {
  const theme = useTheme();
  const t = useT();
  const social = settings.destination === 'social';
  const image = social ? settings.slides.map(item => item.type === 'image' ? item.url : item.poster).find(Boolean) : '';
  const title = (social && settings.title.trim()) || t('socialCommerce.title');
  return <Pressable testID="home-social-shopping-cover" accessibilityRole="link" accessibilityLabel={title}
    onPress={() => router.push(socialHref())} style={({ pressed }) => [styles.card, {
      borderRadius: theme.radius.card, borderColor: theme.colors.line, backgroundColor: theme.colors.surface, opacity: pressed ? theme.opacity.subtle : 1,
    }]}>
    <AppImage uri={image ? mediaUrl(image) : null} localSource={image ? undefined : SOCIAL_SHOPPING_ART} contentFit="cover" decorative style={styles.cover} />
    <View style={styles.copy}>
      <AppText variant="h3" accessibilityRole="header">{title}</AppText>
      <AppText variant="body" color={theme.colors.muted}>{t('socialCommerce.coverSubtitle')}</AppText>
      <View style={[styles.cta, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
        <AppText variant="label">{(social && settings.ctaLabel.trim()) || t('socialCommerce.coverAction')}</AppText>
        <Ionicons name={theme.isRTL ? 'arrow-back-outline' : 'arrow-forward-outline'} size={theme.iconSize.sm} color={theme.colors.accentText} accessibilityElementsHidden />
      </View>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cover: { width: '100%', aspectRatio: 16 / 9 },
  copy: { padding: 12, gap: 6 },
  cta: { alignItems: 'center', gap: 6, marginTop: 4 },
});
