/**
 * قسم «المتجر» في الرئيسية (Q1).
 *
 * كل حالة لها جملتها: التحميل ≠ الفاضي ≠ الخطأ. والفاضي **موّش** نصّ تعليمات عام —
 * يقول «ما فمّاش منتوجات معروضة توّا» (حقيقة قابلة للتحقّق من الخادم)، موش
 * «مرحباً بالمتجر، اكتشف…» (ديكور يغطّي فراغ).
 */
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, Button, Card } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock, RetryButton } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { useCatalogProducts } from '@/api/hooks';
import type { CatalogProduct } from '@/api/catalog';
import { ProductCard } from './ProductCard';

export interface CatalogSectionProps {
  /** عدد البطاقات في الرئيسية — «شوف الكل» يفتح الشاشة الكاملة. */
  previewCount?: number;
}

export function CatalogSection({ previewCount = 6 }: CatalogSectionProps) {
  const theme = useTheme();
  const t = useT();
  const products = useCatalogProducts();

  const open = useCallback((product: CatalogProduct) => {
    router.push({ pathname: '/product/[id]', params: { id: product.id } });
  }, []);

  if (products.isPending) {
    return (
      <Card title={t('catalog.title')} hint={t('catalog.subtitle')}>
        <LoadingBlock />
      </Card>
    );
  }

  if (products.isError) {
    return (
      <Card title={t('catalog.title')}>
        <ErrorBlock error={products.error} onRetry={() => products.refetch()} />
        <AppText variant="caption" color={theme.colors.danger}>{t('catalog.error')}</AppText>
      </Card>
    );
  }

  const all = products.data ?? [];
  if (all.length === 0) {
    return (
      <Card title={t('catalog.title')} hint={t('catalog.subtitle')}>
        <EmptyBlock>{t('catalog.empty')}</EmptyBlock>
        <RetryButton onPress={() => products.refetch()} />
      </Card>
    );
  }

  const preview = all.slice(0, previewCount);

  return (
    <Card title={t('catalog.title')} hint={t('catalog.subtitle')}>
      <View style={styles.grid}>
        {preview.map((product) => (
          <ProductCard key={product.id} product={product} onOpen={open} />
        ))}
      </View>
      {all.length > preview.length ? (
        <Button label={t('catalog.seeAll')} onPress={() => router.push('/catalog')} />
      ) : null}
      <AppText variant="caption" color={theme.colors.muted}>{products.isFetching ? '…' : ' '}</AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
