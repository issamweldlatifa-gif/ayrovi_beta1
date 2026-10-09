/**
 * شاشة «الرابط هذا ما عندوش شاشة» — آخر باب، موش شاشة بيضاء.
 *
 * علاش موجودة: روابط عميقة (`https://ayrovi.tn/...`) تفتح التطبيق على مسار
 * موجود في الموقع وموش موجود في التطبيق. بلا هذي الشاشة، المستعمل يلقى صفحة
 * فارغة ولا يرجع للتلفون يخمّم «التطبيق مكسور». هنا:
 *  • نقولو الرابط شنوّة بالضبط (موش نخبّيوه)؛
 *  • بابان حقيقيان: نفس الرابط في المتصفّح، ولا الرجوع للرئيسية.
 * ما فماش «قريباً» بلا معنى، ولا إعادة توجيه صامتة تخبّي الحالة.
 */
import { StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import * as Linking from 'expo-linking';
import { AppText, Button, Card } from '@/design/ui';
import { SubScreen } from '@/design/subScreen';
import { useTheme } from '@/design/theme';
import { API_BASE_URL, DEFAULT_API_BASE_URL } from '@/api/config';
import { useT } from '@/i18n';

export default function NotFoundScreen() {
  const t = useT();
  const theme = useTheme();
  const path = usePathname();

  /** نفس المسار على الموقع: الأصل متاع الخادم معروف، والمسار كما هو. */
  const siteUrl = `${API_BASE_URL || DEFAULT_API_BASE_URL}${path || ''}`;

  return (
    <SubScreen title={t('notFound.title')} subtitle={t('notFound.hint')} fallback="/">
      <Card>
        <AppText variant="caption" color={theme.colors.muted}>{t('notFound.path')}</AppText>
        <View style={[styles.path, { borderColor: theme.colors.line, borderRadius: theme.radius.control }]}>
          <AppText variant="body">{path || '—'}</AppText>
        </View>
        <Button
          label={t('notFound.openSite')}
          onPress={() => { Linking.openURL(siteUrl).catch(() => undefined); }}
        />
        <Button label={t('notFound.home')} tone="quiet" onPress={() => router.replace('/')} />
      </Card>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  path: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8, marginTop: 6 },
});
