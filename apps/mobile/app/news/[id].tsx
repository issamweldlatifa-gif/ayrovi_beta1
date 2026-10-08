/**
 * صفحة خبر (Q2) — المحتوى الكامل.
 *
 * والروابط الموجودة هي اللي **موجودة حقيقة**: خبر مربوط بمنتوج ⇒ زر المنتوج؛
 * مربوط بوصولة ⇒ زر الوصولة. وما فمّاش ⇒ ما فمّاش زر (موّش زر يفتح والو).
 */
import { useCallback } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppText, Button, Card } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { newsCategoryText } from '@/api/labels';
import { useNews } from '@/api/hooks';

function longDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function NewsDetailScreen() {
  const theme = useTheme();
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const news = useNews();

  const item = (news.data ?? []).find((entry) => entry.id === id) ?? null;

  const openProduct = useCallback(() => {
    if (item?.productId) router.push({ pathname: '/product/[id]', params: { id: item.productId } });
  }, [item?.productId]);

  const openArrival = useCallback(() => {
    if (item?.arrivalId) router.push({ pathname: '/catalog', params: { arrivalId: item.arrivalId } });
  }, [item?.arrivalId]);

  if (news.isPending) {
    return (
      <SubScreen title={t('sections.news')} fallback="/news">
        <LoadingBlock />
      </SubScreen>
    );
  }

  if (news.isError || !item) {
    return (
      <SubScreen
        title={t('sections.news')}
        onRefresh={() => news.refetch()}
        refreshing={news.isFetching}
        fallback="/news"
      >
        {news.isError ? <ErrorBlock error={news.error} onRetry={() => news.refetch()} /> : <EmptyBlock>{t('sections.empty')}</EmptyBlock>}
      </SubScreen>
    );
  }

  const published = longDate(item.publishedAt);
  const category = newsCategoryText(item.category, t);

  return (
    <SubScreen
      title={item.title}
      subtitle={[category, published].filter(Boolean).join(' · ') || undefined}
      onRefresh={() => news.refetch()}
      refreshing={news.isFetching}
      fallback="/news"
    >
      {item.image ? (
        <Image source={{ uri: mediaUrl(item.image) }} style={styles.hero} resizeMode="cover" />
      ) : null}

      {item.summary ? (
        <AppText variant="label" weight="bold" color={theme.colors.ink}>{item.summary}</AppText>
      ) : null}

      {item.content ? <AppText variant="body">{item.content}</AppText> : null}

      {item.author ? (
        <Card title={t('sections.news')}>
          <AppText variant="caption" color={theme.colors.muted}>{t('sections.by', { value: item.author })}</AppText>
        </Card>
      ) : null}

      <View style={styles.actions}>
        {item.productId ? <Button label={t('sections.products')} onPress={openProduct} /> : null}
        {item.arrivalId ? <Button label={t('sections.arrivals')} onPress={openArrival} /> : null}
      </View>
      <View style={styles.spacer} />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', aspectRatio: 16 / 9, marginBottom: 12, borderRadius: 12 },
  actions: { gap: 10, marginTop: 12 },
  spacer: { height: 24 },
});
