import { router, type Href } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import type { HomeDailyOffer } from '../../../../../shared/zayroviNews';
import { NavigationIcon } from '@/design/NavigationIcon';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { DAILY_OFFER, RADIUS } from '@/design/tokens.mobile';
import { RHYTHM } from '@/design/rhythm';
import { useI18n } from '@/i18n';

export const ZAYROVI_NEWS_ROUTE = '/zayrovi-news' as Href;
export const openDailyOffer = () => router.push('/zayrovi-news?view=daily' as Href);

export function DailyOfferCard({ daily }: { daily: HomeDailyOffer }) {
  const { t, locale } = useI18n();
  const { isRTL } = useTheme();
  const row = { flexDirection: rowDirectionFor(isRTL) };
  return <View style={styles.wrap} testID="home-daily-offer">
    <Pressable accessibilityRole="link" accessibilityLabel={daily.title[locale]} accessibilityHint={daily.cta[locale]} onPress={openDailyOffer} testID="home-daily-offer-open">
      <LinearGradient colors={DAILY_OFFER.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heading}>
        <View style={[styles.top, row]}>
          <AppText variant="h2" color={DAILY_OFFER.ink} style={styles.title}>{daily.title[locale]}</AppText>
          <NavigationIcon name="information-circle-outline" size={22} color={DAILY_OFFER.ink} accessibilityElementsHidden />
        </View>
        <AppText variant="body" color={DAILY_OFFER.ink}>{daily.teaser[locale]}</AppText>
        {daily.percent !== null ? <AppText variant="bodyStrong" color={DAILY_OFFER.ink}>{t('zNews.percent', { percent: daily.percent })}</AppText> : null}
      </LinearGradient>
    </Pressable>
    <View style={[styles.bar, row]}>
      <Pressable accessibilityRole="link" onPress={openDailyOffer} style={styles.cta}><AppText variant="captionStrong" color={DAILY_OFFER.ink} align="center">{daily.cta[locale]}</AppText></Pressable>
      <Pressable accessibilityRole="link" onPress={() => router.push(ZAYROVI_NEWS_ROUTE)} style={styles.cta}><AppText variant="captionStrong" color={DAILY_OFFER.ink} align="center">{t('zNews.title')}</AppText></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  // 19/11 : plus de marges écrites à la main — les mêmes valeurs, nommées
  // par leur rôle (carte liée au Hero, puis respiration avant la section suivante).
  wrap: { marginTop: RHYTHM.related, marginBottom: RHYTHM.group, borderRadius: RADIUS.lg, overflow: 'hidden' },
  heading: { padding: 12, gap: 6 },
  top: { alignItems: 'flex-start', gap: 8 }, title: { flex: 1 },
  bar: { backgroundColor: DAILY_OFFER.bar, paddingHorizontal: 8 },
  cta: { flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 4, paddingVertical: 4 },
});
