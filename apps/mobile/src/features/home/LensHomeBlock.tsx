import { memo } from 'react';
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

import { apiGetData } from '@/api/client';
import { AppImage } from '@/design/appImage';
const CLEAN_HOME_RATIO = 16 / 9;
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

export const LensHomeBlock = memo(function LensHomeBlock() {
  const theme = useTheme();
  const t = useT();
  const lens = useLensHome();
  const content = lens.data ?? null;

  if (!content || !content.enabled) return null;

  return (
    <View style={styles.section} testID="home-lens">
      <AppText variant="caption" color={theme.colors.muted}>Clean</AppText>
      <AppText variant="h3">{t('home.clean.title')}</AppText>
      <AppText variant="body" color={theme.colors.secondary}>{t('home.clean.body')}</AppText>
      <AppImage localSource={require('../../../../../assets/brand/clean/promo.webp')} style={[styles.image, { borderRadius: theme.radius.card }]} contentFit="contain" accessibilityLabel={t('home.clean.title')} decorative={false} />
      <Button
        label={t('home.clean.cta')}
        onPress={() => router.push('/(tabs)/sonim')}
        tone="quiet"
        block
        testID="home-lens-open"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  section: { paddingVertical: 12, gap: 10 },
  image: { width: '100%', aspectRatio: CLEAN_HOME_RATIO },
});
