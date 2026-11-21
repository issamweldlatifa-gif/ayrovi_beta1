import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { mediaUrl } from '@/api/client';
import { useZayroviNews } from '@/api/zayroviNews';
import { AppImage } from '@/design/appImage';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { RADIUS } from '@/design/tokens.mobile';
import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { openDailyOffer } from '@/features/home/DailyOfferCard';
import { useI18n } from '@/i18n';
import type { NewsCard } from '../../../shared/zayroviNews';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

function open(item: NewsCard) {
  const id = item.targetId;
  if (id && item.kind === 'story') router.push({ pathname: '/stories', params: { id } });
  else if (id && item.kind === 'reel') router.push({ pathname: '/reels-viewer', params: { id, shared: '1' } });
  else if (id && item.kind === 'publication') router.push({ pathname: '/publication-look/[id]', params: { id } });
  else if (id && item.kind === 'article') router.push({ pathname: '/news/[id]', params: { id } });
  else router.push(`/zayrovi-news?item=${encodeURIComponent(item.id)}` as Href);
}

export default function ZayroviNewsScreen() {
  const { view, item } = useLocalSearchParams<{ view?: string; item?: string }>();
  const query = useZayroviNews();
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const daily = query.data?.daily;
  const entries = query.data?.entries ?? [];
  const showDaily = view === 'daily';
  const dailyAvailable = daily && (daily.showHome || daily.showNews);
  const article = item ? entries.find(entry => entry.id === item && entry.kind === 'notice') : undefined;
  const copy = (value: { fr: string; ar: string }) => value[locale] || value.fr;
  const weekday = daily && new Intl.DateTimeFormat(locale === 'ar' ? 'ar-TN' : 'fr-TN', { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2024, 0, daily.day)));
  const title = showDaily && dailyAvailable ? copy(daily.title) : article ? copy(article.title) : t('zNews.title');
  const card = (label: string, title: string, press: () => void, image?: string, description?: string, id?: string) =>
    <Pressable key={id ? `entry:${id}` : 'daily'} accessibilityRole="link" accessibilityLabel={title} style={[styles.card, { borderColor: colors.line }]} onPress={press} testID={id ? `zayrovi-news-entry-${id}` : 'zayrovi-news-daily'}>
      {image ? <AppImage uri={mediaUrl(image)} decorative contentFit="cover" style={styles.cover} /> : null}
      <View style={styles.copy}>
        <AppText variant="label" color={colors.muted}>{label}</AppText>
        <AppText variant="h2">{title}</AppText>
        {description ? <AppText numberOfLines={2} color={colors.muted}>{description}</AppText> : null}
      </View>
    </Pressable>;
  return <SubScreen title={title} fallback={showDaily || item ? '/zayrovi-news' : '/(tabs)'} onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
    {query.isPending ? <LoadingBlock /> : query.isError && !query.data ? <ErrorBlock error={query.error} onRetry={() => query.refetch()} /> : showDaily ?
      dailyAvailable ? <View style={styles.article} testID="zayrovi-daily-detail">
        <AppText variant="label" color={colors.muted}>{t('zNews.system')} · {weekday}</AppText>
        <AppText variant="h2">{daily.percent === null ? t('zNews.inactive') : t('zNews.percent', { percent: daily.percent })}</AppText>
        <AppText variant="bodyStrong">{copy(daily.teaser)}</AppText>
        <AppText>{copy(daily.body)}</AppText>
      </View> : <EmptyBlock>{t('sections.empty')}</EmptyBlock> : item ?
      article ? <View style={styles.article}>
        {article.image ? <AppImage uri={mediaUrl(article.image)} decorative contentFit="cover" style={styles.cover} /> : null}
        <AppText>{copy(article.body)}</AppText>
      </View> : <EmptyBlock>{t('sections.empty')}</EmptyBlock> : <View style={styles.list}>
        {daily?.showNews ? card(t('zNews.system'), copy(daily.title), openDailyOffer, undefined, copy(daily.teaser)) : null}
        {entries.map(entry => card(t(`zNews.${entry.kind}`), copy(entry.title), () => open(entry), entry.image, copy(entry.body), entry.id))}
        {!daily?.showNews && !entries.length ? <EmptyBlock>{t('sections.empty')}</EmptyBlock> : null}
      </View>}
  </SubScreen>;
}
const styles = StyleSheet.create({
  list: { gap: 12 },
  article: { gap: 12 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.lg, overflow: 'hidden' },
  cover: { aspectRatio: 16 / 9, width: '100%' },
  copy: { padding: 12, gap: 4 },
});
