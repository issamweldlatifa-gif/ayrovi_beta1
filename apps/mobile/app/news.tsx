/**
 * شاشة الأخبار (Q2) — قائمة أخبار، وكل خبر يفتح صفحتو الكاملة.
 *
 * الترتيب: الأحدث نشراً أوّلاً (الخادم يرتب هو أيضاً، بس الترتيب هنا قرار
 * عرض، والمصدر واحد).
 */
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { useNews } from '@/api/hooks';
import { NewsCard } from '@/features/sections/NewsCard';
import type { NewsItem } from '@/api/sections';

/**
 * Filet de sécurité de l'écran : si le rendu lève, expo-router affiche le repli
 * (arabe + français, bouton « عاود ») à la place de l'écran — l'application
 * reste ouverte, l'utilisateur peut revenir. Voir `src/design/AppErrorBoundary.tsx`
 * et la cause du 25/10/2026 (ordre des hooks). Toute route en a un : c'est
 * vérifié par `tests/error-boundary-coverage.test.ts`.
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function NewsScreen() {
  const theme = useTheme();
  const t = useT();
  const news = useNews();

  const rows = [...(news.data ?? [])].sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));

  const open = (item: NewsItem) => router.push({ pathname: '/news/[id]', params: { id: item.id } });

  return (
    <SubScreen
      title={t('sections.news')}
      onRefresh={() => news.refetch()}
      refreshing={news.isFetching}
      fallback="/(tabs)"
    >
      {news.isPending ? <LoadingBlock /> : null}
      {news.isError ? <ErrorBlock error={news.error} onRetry={() => news.refetch()} /> : null}

      {!news.isPending && !news.isError && rows.length === 0 ? <EmptyBlock>{t('sections.empty')}</EmptyBlock> : null}

      <View style={styles.list}>
        {rows.map((item) => (
          <NewsCard key={item.id} item={item} onOpen={open} />
        ))}
      </View>

      <AppText variant="caption" color={theme.colors.muted}>{`${rows.length} · ${t('sections.news')}`}</AppText>
      <View style={styles.spacer} />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 12 },
  spacer: { height: 24 },
});
