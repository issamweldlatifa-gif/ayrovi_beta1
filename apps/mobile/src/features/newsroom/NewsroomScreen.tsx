import { useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useZayroviNews } from '@/api/zayroviNews';
import { BackButton } from '@/design/BackButton';
import { KeyboardAvoider } from '@/design/keyboard';
import { goBack } from '@/design/navigation';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useResponsive } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { AppText, Field } from '@/design/ui';
import { openDailyOffer } from '@/features/home/DailyOfferCard';
import { useI18n } from '@/i18n';
import { NEWS_SECTIONS, type NewsCard, type NewsSection } from '../../../../../shared/zayroviNews';
import { NewsroomArticle, NewsroomBody, NewsroomCard, newsroomCopy } from './NewsroomCards';

const sectionKeys = { news: 'zNews.latest', tools: 'zNews.tools', about: 'zNews.about' } as const;

export default function NewsroomScreen() {
  const { view, item } = useLocalSearchParams<{ view?: string; item?: string }>();
  const query = useZayroviNews();
  const { t, locale } = useI18n();
  const theme = useTheme();
  const safe = useSafeAreaInsets();
  const { gutter } = useResponsive();
  const scroll = useRef<ScrollView>(null);
  const [panel, setPanel] = useState<'search' | 'menu' | null>(null);
  const [text, setText] = useState('');
  const [section, setSection] = useState<NewsSection | null>(null);
  const row = { flexDirection: rowDirectionFor(theme.isRTL) };
  const daily = query.data?.daily;
  const entries = [...(query.data?.entries ?? []), ...(query.data?.guides ?? [])];
  const article = entries.find(entry => entry.id === item && entry.kind === 'notice');
  const detail = !!item || view === 'daily';
  const dailyCard: NewsCard | null = daily?.showNews ? { id: 'daily', kind: 'notice', title: daily.title, body: daily.body, summary: daily.teaser, image: '' } : null;
  const feature = entries.find(entry => (!entry.section || entry.section === 'news') && entry.image);
  const matching = (entry: NewsCard) => {
    const q = text.trim().toLocaleLowerCase(locale);
    return [entry.title, entry.summary, entry.body].some(copy => copy && newsroomCopy(copy, locale).toLocaleLowerCase(locale).includes(q));
  };
  const group = (kind: NewsSection) => entries.filter(entry => (entry.section ?? 'news') === kind);
  const selectSection = (next: NewsSection | null) => {
    setSection(next); setPanel(null); setText(''); scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const closeOrBack = () => {
    if (!detail && (panel || section)) { selectSection(null); return; }
    goBack(detail ? '/zayrovi-news' : '/(tabs)');
  };
  const titleRow = (label: string) => <AppText variant="h3" accessibilityRole="header">{label}</AppText>;

  return <KeyboardAvoider style={[styles.page, { backgroundColor: theme.colors.canvas }]}>
    <View testID="zayrovi-news-header" style={[styles.header, row, { paddingTop: safe.top, paddingHorizontal: gutter, borderColor: theme.colors.line }] }>
      <BackButton label={t('common.back')} color={theme.colors.ink} onPress={closeOrBack} />
      <AppText variant="h3" accessibilityRole="header" numberOfLines={1} style={styles.masthead}>{t('zNews.title')}</AppText>
      {!detail ? <>
        <Pressable accessibilityRole="button" accessibilityLabel={t('zNews.search')} accessibilityState={{ expanded: panel === 'search' }} style={styles.hit}
          onPress={() => { setPanel(panel === 'search' ? null : 'search'); setText(''); }}>
          <Ionicons name="search-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t(panel === 'menu' ? 'common.close' : 'zNews.menu')} accessibilityState={{ expanded: panel === 'menu' }} style={styles.hit}
          onPress={() => setPanel(panel === 'menu' ? null : 'menu')}>
          <Ionicons name={panel === 'menu' ? 'close-outline' : 'menu-outline'} size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
        </Pressable>
      </> : null}
    </View>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingHorizontal: gutter, paddingBottom: safe.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
      {query.isPending ? <LoadingBlock /> : query.isError && !query.data ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> : detail ? (
        view === 'daily' ? daily && (daily.showHome || daily.showNews) ? <View testID="zayrovi-daily-detail" style={styles.group}>
          <AppText variant="h2" accessibilityRole="header">{newsroomCopy(daily.title, locale)}</AppText>
          <AppText variant="label" color={theme.colors.muted}>{t('zNews.system')} · {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-TN' : 'fr-TN', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, daily.day)))}</AppText>
          {titleRow(daily.percent === null ? t('zNews.inactive') : t('zNews.percent', { percent: daily.percent }))}
          <AppText variant="bodyStrong">{newsroomCopy(daily.teaser, locale)}</AppText>
          <NewsroomBody body={newsroomCopy(daily.body, locale)} />
        </View> : <EmptyBlock>{t('sections.empty')}</EmptyBlock> : article ? <NewsroomArticle item={article} /> : <EmptyBlock>{t('sections.empty')}</EmptyBlock>
      ) : panel === 'menu' ? <View style={styles.group} testID="zayrovi-news-menu">
        {([null, ...NEWS_SECTIONS] as const).map(kind => <Pressable key={kind ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: kind === section }}
          onPress={() => selectSection(kind)} style={[styles.menuItem, row, { borderColor: theme.colors.line }]}>
          <AppText variant="h3" style={styles.masthead}>{t(kind ? sectionKeys[kind] : 'zNews.title')}</AppText>
          <Ionicons name={theme.isRTL ? 'chevron-back-outline' : 'chevron-forward-outline'} color={theme.colors.accentText} size={theme.iconSize.sm} accessibilityElementsHidden />
        </Pressable>)}
      </View> : panel === 'search' ? <View style={styles.group}>
        <Field testID="zayrovi-news-search-input" label={t('zNews.search')} accessibilityLabel={t('zNews.search')} autoFocus autoCorrect={false} value={text} onChangeText={setText} returnKeyType="search" />
        {text.trim() ? <View testID="zayrovi-news-search-results">
          {dailyCard && matching(dailyCard) ? <NewsroomCard item={dailyCard} onPress={openDailyOffer} testID="zayrovi-news-daily" /> : null}
          {entries.filter(matching).map(entry => <NewsroomCard key={entry.id} item={entry} />)}
          {!entries.some(matching) && !(dailyCard && matching(dailyCard)) ? <EmptyBlock>{t('sections.empty')}</EmptyBlock> : null}
        </View> : null}
      </View> : <>
        {!section && feature ? <NewsroomCard item={feature} featured /> : null}
        {(section ? [section] : NEWS_SECTIONS).map(kind => {
          const rows = group(kind).filter(entry => section || entry !== feature);
          const dailyRow = kind === 'news' && dailyCard;
          if (!rows.length && !dailyRow && !section) return null;
          return <View key={kind} style={[styles.group, { borderTopColor: theme.colors.line, borderTopWidth: StyleSheet.hairlineWidth }]} testID={`zayrovi-news-section-${kind}`}>
            {titleRow(t(sectionKeys[kind]))}
            {dailyRow ? <NewsroomCard item={dailyRow} onPress={openDailyOffer} testID="zayrovi-news-daily" /> : null}
            {rows.map(entry => <NewsroomCard key={entry.id} item={entry} />)}
            {!rows.length && !dailyRow ? <EmptyBlock>{t('sections.empty')}</EmptyBlock> : null}
          </View>;
        })}
        {!section && !entries.length && !dailyCard ? <EmptyBlock>{t('sections.empty')}</EmptyBlock> : null}
      </>}
    </ScrollView>
  </KeyboardAvoider>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, header: { alignItems: 'center', minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  masthead: { flex: 1, minWidth: 0 }, hit: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1, paddingTop: 16, gap: 24 }, group: { gap: 8, paddingTop: 12 },
  menuItem: { minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: 12, paddingVertical: 12 },
});
