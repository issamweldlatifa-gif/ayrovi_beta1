/**
 * المتجر — كل المنتوجات (Q1، 08/10/2026).
 *
 * الشكل أصلي (شبكة أصلية، بطاقات، تنقّلات التطبيق). المرجع المأخوذ من الموقع هو
 * **الخاصية**: «أشوف المنتوجات المتاحة بأسعارها» — موش تصميم `ProductGrid`.
 *
 * والفلترة بالوصولة (arrivage) موجودة من الأول لأنّ الخادم يدعمها
 * (`?arrivalId=`) وهي من أهم تبويبات الموقع.
 */
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { AppText, Segmented } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useT } from '@/i18n';
import { fetchCatalogArrivals, fetchCatalogProducts } from '@/api/catalog';
import { ProductCard } from '@/features/catalog/ProductCard';
import type { CatalogProduct } from '@/api/catalog';

const ALL = '';

export default function CatalogScreen() {
  const theme = useTheme();
  const t = useT();
  // وصولة مفتوحة من رابط عميق (ستوري، عرض، خبر) ⇒ تُنتقى من الأول.
  const params = useLocalSearchParams<{ arrivalId?: string }>();
  const [arrivalId, setArrivalId] = useState(params.arrivalId ?? ALL);

  const products = useQuery({
    queryKey: ['catalog', 'products', arrivalId],
    queryFn: ({ signal }) => fetchCatalogProducts({ signal, arrivalId: arrivalId || undefined, limit: 50 }),
    staleTime: 120_000,
  });
  const arrivals = useQuery({
    queryKey: ['catalog', 'arrivals'],
    queryFn: ({ signal }) => fetchCatalogArrivals({ signal }),
    staleTime: 120_000,
  });

  const reload = useCallback(() => {
    products.refetch();
    arrivals.refetch();
  }, [products, arrivals]);

  const open = useCallback((product: CatalogProduct) => {
    router.push({ pathname: '/product/[id]', params: { id: product.id } });
  }, []);

  // «الكل» + وصولة واحدة لكل وصولة معلنة في الخادم — ما نخترعش تبويبات.
  const tabs = useMemo(() => {
    const list = arrivals.data ?? [];
    return [{ value: ALL, label: t('catalog.title') }, ...list.map((arrival) => ({ value: arrival.id, label: arrival.name }))];
  }, [arrivals.data, t]);

  const rows = products.data ?? [];

  return (
    <SubScreen
      title={t('catalog.title')}
      subtitle={t('catalog.subtitle')}
      onRefresh={reload}
      refreshing={products.isFetching || arrivals.isFetching}
    >
      {tabs.length > 1 ? (
        <Segmented value={arrivalId} onChange={setArrivalId} options={tabs} />
      ) : null}

      {products.isPending ? <LoadingBlock /> : null}
      {products.isError ? <ErrorBlock error={products.error} onRetry={() => products.refetch()} /> : null}

      {!products.isPending && !products.isError && rows.length === 0 ? (
        <EmptyBlock>{t('catalog.empty')}</EmptyBlock>
      ) : null}

      <View style={[styles.grid, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
        {rows.map((product) => (
          <ProductCard key={product.id} product={product} onOpen={open} />
        ))}
      </View>

      <AppText variant="caption" color={theme.colors.muted}>
        {/* السعر المعروض هو سعر الخادم: التطبيق ما يحسبش ديناراً واحداً. */}
        {`${rows.length} · ${t('catalog.totalTnd')}`}
      </AppText>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 12 },
});
