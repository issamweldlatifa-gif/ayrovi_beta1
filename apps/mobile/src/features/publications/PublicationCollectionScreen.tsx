import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';
import { fetchPublicationCollection } from '@/api/publicationBlocks';
import { AppImage } from '@/design/appImage';
import { SheetPortalHost } from '@/design/sheet/SheetPortal';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useResponsive } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { formatMoney } from '@/format/money';
import { useI18n, useT } from '@/i18n';
import { distinctPublicationSubtitle, editorialHeroHeight, EDITORIAL_FEED as E, EDITORIAL_COLLECTION as C } from '../../../../../shared/publicationEditorial';
import { PublicationFavoritesProvider } from './PublicationFavorites';
import { PublicationFollow } from './PublicationFollow';
import { PUBLICATION_PALETTE as P, PublicationSponsored, PublicationText } from './publicationDesign';
import { BlockHeart, BlockProductCard } from './templates/BlockProductCard';
import { PublicationVideo } from './templates/PublicationVideo';

const openProduct = (id: string) => router.push({ pathname: '/product/[id]', params: { id } });

export function PublicationCollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Collection key={id} id={id} />;
}

function Collection({ id }: { id?: string }) {
  const { width } = useWindowDimensions();
  const { gutter } = useResponsive();
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const [list, setList] = useState(false);
  const [filters, setFilters] = useState(false);
  const [brand, setBrand] = useState('');
  const [ascending, setAscending] = useState(false);
  const query = useQuery({ queryKey: ['publication-collection', id], queryFn: ({ signal }) => fetchPublicationCollection(id!, { signal }), enabled: !!id });
  const block = query.data;
  const brands = [...new Set(block?.products.map(product => product.brand).filter(Boolean) ?? [])] as string[];
  const filter = brands.includes(brand) ? brand : '';
  const selected = block?.products.filter(product => !filter || product.brand === filter) ?? [];
  if (ascending) selected.sort((a, b) => a.price - b.price);
  const numeric = new Intl.NumberFormat(locale);
  const date = block?.updatedAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(block.updatedAt)) : '';
  const innerWidth = Math.min(616, Math.max(1, width - gutter * 2));
  const tile = Math.max(1, (innerWidth - 2 * E.gap) / 3);
  const ink = theme.colors.ink, muted = theme.colors.muted;
  const direction = theme.isRTL ? 'row-reverse' : 'row';
  const openList = t('publication.collectionList');
  const openGrid = t('publication.collectionGrid');
  const heroHeight = editorialHeroHeight(innerWidth, block?.media?.type, block?.media?.format);
  const fullCopy = block && (distinctPublicationSubtitle(block.title, block.description || '') || distinctPublicationSubtitle(block.title, block.subtitle));
  const button = (label: string, selected: boolean, onPress: () => void, testID?: string) => (
    <Pressable key={label} testID={testID} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.control, { borderColor: selected ? ink : muted }]}>
      <PublicationText variant={selected ? 'captionStrong' : 'caption'} color={ink}>{label}</PublicationText>
    </Pressable>
  );
  return (
    <SheetPortalHost>
      <PublicationFavoritesProvider>
        <SubScreen title={t('publication.collection')} fallback="/publications" testID="publication-collection"
          onRefresh={id ? () => { void query.refetch(); } : undefined} refreshing={query.isRefetching}>
          {id && query.isPending ? <LoadingBlock /> : !block ? <ErrorBlock error={query.error} onRetry={id ? () => { void query.refetch(); } : undefined} /> : (
            <View style={[styles.content, { width: innerWidth }]}>
              {block.media ? (
                <View testID="collection-cover" style={[styles.cover, { height: heroHeight }]}>
                  {block.media.type === 'video' ? <PublicationVideo uri={block.media.url} poster={block.media.poster} active={focused} label={block.title} testID="collection-video" /> :
                    <AppImage uri={mediaUrl(block.media.url)} accessibilityLabel={block.title} contentFit="cover" style={styles.image} />}
                </View>
              ) : null}
              <View style={styles.identity}>
                <PublicationFollow look="inline" publisherId={block.publisher.id} publisherName={block.publisher.name} ink={ink} muted={muted} testID="collection-follow" />
                {block.sponsored ? <PublicationSponsored color={muted} /> : null}
                <View accessibilityRole="header"><PublicationText variant="h3" color={ink}>{block.title}</PublicationText></View>
                {fullCopy ? <PublicationText variant="body" color={muted} style={styles.copy}>{fullCopy}</PublicationText> : null}
              </View>
              <View style={styles.toolbar}>
                <PublicationText variant="captionStrong" color={ink} testID="collection-count">{t('publication.collectionCount', { count: numeric.format(selected.length) })}</PublicationText>
                {date ? <PublicationText variant="caption" color={muted}>{t('publication.collectionUpdated', { date })}</PublicationText> : null}
                <View style={[styles.controls, { flexDirection: direction }]}>
                  {button(openGrid, !list, () => setList(false), 'collection-grid')}
                  {button(openList, list, () => setList(true), 'collection-list')}
                  {button(t('publication.collectionFilters'), filters || !!filter || ascending, () => setFilters(!filters), 'collection-filters')}
                </View>
                {filters ? <View style={[styles.controls, { flexDirection: direction }]}
                  testID="collection-filter-panel">
                  {button(t('publication.collectionAllBrands'), !filter, () => setBrand(''))}
                  {brands.map(name => button(name, filter === name, () => setBrand(filter === name ? '' : name)))}
                  {button(t('publication.collectionPriceAsc'), ascending, () => setAscending(!ascending))}
                </View> : null}
              </View>
              {!selected.length ? <EmptyBlock>{t('publication.collectionEmpty')}</EmptyBlock> : list ? selected.map(product => <CollectionRow key={product.id} product={product} />) : (
                <View style={[styles.grid, { flexDirection: direction }]} testID="collection-products-grid">
                  {selected.map(product => <BlockProductCard key={product.id} product={product} width={tile} imageHeight={Math.round(tile * E.ratio)}
                    photoOnly sponsored={false} inks={{ ink, muted }} onOpen={openProduct} testID={`collection-product-${product.id}`} />)}
                </View>
              )}
            </View>
          )}
        </SubScreen>
      </PublicationFavoritesProvider>
    </SheetPortalHost>
  );
}

function CollectionRow({ product }: { product: LinkedProduct }) {
  const theme = useTheme();
  const direction = theme.isRTL ? 'row-reverse' : 'row';
  return (
    <View style={[styles.listRow, { flexDirection: direction }]}>
      <Pressable testID={`collection-product-${product.id}`} accessibilityRole="link" accessibilityLabel={[product.brand, product.name, formatMoney(product.price)].filter(Boolean).join(', ')} onPress={() => openProduct(product.id)}
        style={[styles.listLink, { flexDirection: direction }]}>
        <AppImage uri={mediaUrl(product.image)} decorative contentFit="contain" background={P.neutral} style={styles.thumb} />
        <View style={styles.listCopy}>
          {product.brand ? <PublicationText variant="captionStrong" color={theme.colors.muted}>{product.brand}</PublicationText> : null}
          <PublicationText variant="bodyStrong" color={theme.colors.ink} numberOfLines={2}>{product.name}</PublicationText>
          <PublicationText variant="caption" color={theme.colors.ink}>{formatMoney(product.price)}</PublicationText>
        </View>
      </Pressable>
      <View style={styles.listFavorite}><BlockHeart product={product} testID={`collection-product-${product.id}-heart`} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: 'center', gap: 12 },
  cover: { borderRadius: E.radius, overflow: 'hidden', backgroundColor: P.neutral },
  image: { width: '100%', height: '100%' },
  identity: { gap: 4 },
  copy: { fontSize: C.copy, lineHeight: C.copyLine },
  toolbar: { gap: 4 },
  controls: { flexWrap: 'wrap', gap: 6 },
  control: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: C.controlRadius, paddingHorizontal: 12, justifyContent: 'center' },
  grid: { flexWrap: 'wrap', gap: E.gap },
  listRow: { gap: 6, alignItems: 'center' },
  listLink: { flex: 1, gap: 12, alignItems: 'center' },
  listCopy: { flex: 1, gap: 2 },
  thumb: { width: 70, height: 88, borderRadius: E.radius },
  listFavorite: { width: 48, height: 48 },
});
