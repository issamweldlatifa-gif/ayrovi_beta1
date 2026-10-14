/**
 * بلوك Lens في الصفحة الرئيسية — نفس مصدر الموقع: `/api/public/lens-hero` (Admin → Contenu → LENS).
 *
 *  • النص والصورة والزر يجيوا من الخادم؛ ما فيش نص مكتوب باليد.
 *  • الزر يفتح شاشة Lens داخل التطبيق (`/lens`)، لا صفحة الموقع.
 *  • التطبيق يعرض صورة الغلاف فقط؛ الفيديو يبقى على الموقع.
 *  • مخفي إذا كان القسم مطفأ أو الطلب فشل: ما فماش بلوك فارغ.
 */
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { apiGetData, mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { MEDIA_RATIO } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { parseLensHome } from './lensHomeContent';

export function useLensHome() {
  return useQuery({
    queryKey: ['lens-hero'],
    queryFn: async () => parseLensHome(await apiGetData<unknown>('/api/public/lens-hero')),
    staleTime: 5 * 60_000,
  });
}

export function LensHomeBlock() {
  const theme = useTheme();
  const t = useT();
  const lens = useLensHome();
  const content = lens.data ?? null;

  if (!content || !content.enabled || !content.title) return null;

  return (
    <View style={styles.section} testID="home-lens">
      {content.eyebrow ? (
        <AppText variant="caption" color={theme.colors.muted}>{content.eyebrow}</AppText>
      ) : null}
      <AppText variant="title" weight="semibold">{content.title}</AppText>
      {content.description ? (
        <AppText variant="body" color={theme.colors.secondary}>{content.description}</AppText>
      ) : null}
      {content.poster ? (
        <AppImage
          uri={mediaUrl(content.poster)}
          style={[styles.image, { borderRadius: theme.radius.card }]}
          contentFit="cover"
          accessibilityLabel={content.title}
          decorative={false}
        />
      ) : null}
      <Button
        label={content.ctaLabel || t('home.lens.cta')}
        onPress={() => router.push('/lens')}
        tone="quiet"
        block
        testID="home-lens-open"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingVertical: 12, gap: 10 },
  image: { width: '100%', aspectRatio: MEDIA_RATIO.square },
});
