/**
 * المتجر — كل المنتوجات (Q1، 08/10/2026).
 *
 * الشكل أصلي (شبكة أصلية، بطاقات، تنقّلات التطبيق). المرجع المأخوذ من الموقع هو
 * **الخاصية**: «أشوف المنتوجات المتاحة بأسعارها» — موش تصميم `ProductGrid`.
 *
 * والفلترة بالوصولة (arrivage) موجودة من الأول لأنّ الخادم يدعمها
 * (`?arrivalId=`) وهي من أهم تبويبات الموقع.
 *
 * 13/11/2026 — الشبكة على مقاسات فيديو المرجع (`@/design/productTile.ts`) :
 * من الحاشية للحاشية، فاصل 4 بين الأعمدة، بلا فراغ بين السطور ؛ كل الكروت
 * بنفس الطول (المقاسات تتحسب مرّة وحدة للشبكة الكل) ؛ فوقها « N منتوج » وزرّ
 * صور كبيرة / صغيرة (عمود واحد ↔ عمودين، 2↔3 أو 4 في التابلات) ؛ والضغطة
 * تحلّ الفيش على الصورة اللي كان يتفرّج فيها.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, FlatList, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { Button, Segmented } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { FullBleed } from '@/design/layout';
import { ProductGridBar, useProductDensity } from '@/design/ProductGridBar';
import { PRODUCT_TILE, productTileInitialRows, productTileMetrics } from '@/design/productTile';
import { useT } from '@/i18n';
import { fetchCatalogArrivals, searchCatalog } from '@/api/catalog';
import { CatalogFilterSheet, CatalogSearchControls } from '@/features/catalog/CatalogSearchControls';
import type { CatalogSearchFilters } from '../../../shared/catalogSearch';
import { ProductCard } from '@/features/catalog/ProductCard';
import type { CatalogProduct } from '@/api/catalog';

const ALL = '';

/**
 * Filet de sécurité de l'écran : si le rendu de le catalogue lève, expo-router
 * affiche le repli (arabe + français, bouton « عاود ») à la place de l'écran —
 * l'application reste ouverte, l'utilisateur peut revenir. Voir
 * `src/design/AppErrorBoundary.tsx` et la cause du 25/10/2026 (ordre des hooks).
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function CatalogScreen() {
  const theme = useTheme();
  const t = useT();
  const window = useWindowDimensions();
  const { density, toggle } = useProductDensity();
  // عرض الشبكة الحقيقي (بلا هوامش الشاشة) — التقدير الأوّل هو عرض الشاشة.
  const [gridWidth, setGridWidth] = useState(window.width);
  const onGridLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) setGridWidth((current) => (Math.abs(current - width) > 0.5 ? width : current));
  }, []);
  const metrics = useMemo(
    () => productTileMetrics({ width: gridWidth, density, fontScale: window.fontScale }),
    [gridWidth, density, window.fontScale],
  );
  // وصولة مفتوحة من رابط عميق (ستوري، عرض، خبر) ⇒ تُنتقى من الأول.
  const params = useLocalSearchParams<{ arrivalId?: string }>();
  const [arrivalId, setArrivalId] = useState(params.arrivalId ?? ALL);

  const [q, setQuery] = useState('');
  const [filters, setFilters] = useState<CatalogSearchFilters>({});
  const [filterOpen, setFilterOpen] = useState(false);
  useEffect(() => {
    if (!filterOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setFilterOpen(false); return true; });
    return () => subscription.remove();
  }, [filterOpen]);
  const listRef = useRef<FlatList<CatalogProduct>>(null);
  const resetScroll = () => listRef.current?.scrollToOffset({ offset: 0, animated: false });
  const products = useInfiniteQuery({
    queryKey: ['catalog', 'search', arrivalId, q, filters],
    queryFn: ({ signal, pageParam }) => searchCatalog({ ...filters, q, arrivalId, offset: pageParam }, { signal }),
    initialPageParam: 0,
    getNextPageParam: last => last.nextOffset ?? undefined,
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

  /** الفيش تتحلّ على الصورة اللي كان يتفرّج فيها في الكارت (0 = الأولى، بلا بارامتر). */
  const open = useCallback((product: CatalogProduct, photo = 0) => {
    router.push({
      pathname: '/product/[id]',
      params: photo > 0 ? { id: product.id, photo: String(photo) } : { id: product.id },
    });
  }, []);
  /** « + » jaune de la carte : la fiche s'ouvre et lance l'ajout (taille demandée d'abord si besoin). */
  const add = useCallback((product: CatalogProduct) => {
    router.push({ pathname: '/product/[id]', params: { id: product.id, add: '1' } });
  }, []);

  // «الكل» + وصولة واحدة لكل وصولة معلنة في الخادم — ما نخترعش تبويبات.
  const tabs = useMemo(() => {
    const list = arrivals.data ?? [];
    return [{ value: ALL, label: t('catalog.title') }, ...list.map((arrival) => ({ value: arrival.id, label: arrival.name }))];
  }, [arrivals.data, t]);

  const rows = useMemo(() => {
    const unique = new Map<string, CatalogProduct>();
    for (const page of products.data?.pages ?? []) {
      for (const product of page.items) if (!unique.has(product.id)) unique.set(product.id, product);
    }
    return [...unique.values()];
  }, [products.data]);
  const firstPage = products.data?.pages[0];
  const loadMore = () => {
    if (products.hasNextPage && !products.isFetching) void products.fetchNextPage();
  };

  const updateFilters = (value: CatalogSearchFilters) => {
    if (JSON.stringify(value) !== JSON.stringify(filters)) { resetScroll(); setFilters(value); }
  };
  return (
    <View style={styles.list}>
      <View style={styles.list} accessibilityElementsHidden={filterOpen} importantForAccessibility={filterOpen ? 'no-hide-descendants' : 'auto'}>
        <SubScreen
          scroll={false}
          title={t('catalog.title')}
          subtitle={t('catalog.subtitle')}
          onRefresh={reload}
          refreshing={products.isRefetching || arrivals.isRefetching}
        >
          {tabs.length > 1 ? (
            <Segmented value={arrivalId} onChange={id => { if (id !== arrivalId) { resetScroll(); setArrivalId(id); setFilters({}); } }} options={tabs} />
          ) : null}

          <CatalogSearchControls arrivalId={arrivalId} query={q} filters={filters} facets={firstPage?.facets} onSuggestion={open}
            onSearch={value => { if (value !== q) { resetScroll(); setQuery(value); } }}
            onFilters={updateFilters} onOpenFilters={() => setFilterOpen(true)} />

          {products.isPending ? <LoadingBlock /> : null}
          {products.isError && !products.data ? <ErrorBlock error={products.error} onRetry={() => products.refetch()} /> : null}

          {!products.isPending && !products.isError && rows.length === 0 ? (
            <EmptyBlock>{q || Object.keys(filters).length ? t('catalog.search.empty') : t('catalog.empty')}</EmptyBlock>
          ) : null}

          {rows.length > 0 ? (
            <ProductGridBar count={firstPage?.total ?? rows.length} density={density} onToggle={toggle} />
          ) : null}

          {/* السعر المعروض في كل كارت هو سعر الخادم: التطبيق ما يحسبش ديناراً واحداً. */}
          <FullBleed style={styles.list}>
            <FlatList
              // numColumns ما يتبدّلش على قائمة مركّبة : مفتاح جديد لكل عدد أعمدة.
              key={`catalog-grid-${metrics.columns}`}
              ref={listRef}
              testID="catalog-list"
              keyboardShouldPersistTaps="handled"
              onEndReachedThreshold={0.45}
              onEndReached={products.isFetchNextPageError ? undefined : loadMore}
              ListFooterComponent={products.isFetchingNextPage ? <LoadingBlock /> : products.isFetchNextPageError ? (
                <Button label={t('common.retry')} tone="quiet" onPress={loadMore} />
              ) : null}
              data={rows}
              keyExtractor={product => product.id}
              numColumns={metrics.columns}
              initialNumToRender={productTileInitialRows(metrics.columns)}
              maxToRenderPerBatch={2}
              windowSize={5}
              onLayout={onGridLayout}
              style={styles.list}
              onRefresh={reload}
              refreshing={products.isRefetching || arrivals.isRefetching}
              columnWrapperStyle={metrics.columns > 1
                ? [styles.grid, { flexDirection: rowDirectionFor(theme.isRTL) }]
                : undefined}
              renderItem={({ item }) => <ProductCard product={item} onOpen={open} onAdd={add} metrics={metrics} />}
            />
          </FullBleed>
        </SubScreen>
      </View>
      {filterOpen ? <View style={[StyleSheet.absoluteFill, styles.filterLayer]} accessibilityViewIsModal>
        <CatalogFilterSheet arrivalId={arrivalId} q={q} filters={filters} facets={firstPage?.facets}
          close={() => setFilterOpen(false)} apply={value => { updateFilters(value); setFilterOpen(false); }} />
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  filterLayer: { zIndex: 1 },
  // Bord à bord, filet de 4 entre colonnes, aucun écart entre rangées (vidéo de référence).
  grid: { gap: PRODUCT_TILE.columnGap, marginTop: PRODUCT_TILE.rowGap },
});
