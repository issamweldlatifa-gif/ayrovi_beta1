import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, FlatList, Pressable, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { type CatalogProduct, fetchCatalogArrivals, normalizeStockStatus, searchCatalog } from '@/api/catalog';
import { mediaUrl } from '@/api/client';
import type { ReferencePublication } from '@/api/referencePublications';
import { DEEP_LINK_SCHEME } from '@/config/deepLinks';
import { AppImage } from '@/design/appImage';
import { BackButton } from '@/design/BackButton';
import { rowDirectionFor } from '@/design/layoutLogic';
import { goBack } from '@/design/navigation';
import { OfficialAvatar } from '@/design/OfficialAvatar';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { veil } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { CatalogFilterSheet } from '@/features/catalog/CatalogSearchControls';
import { useProductFavorites } from '@/features/reels/useProductFavorites';
import { formatMoney } from '@/format/money';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';
import type { CatalogSearchFilters } from '../../../../../shared/catalogSearch';
import { PublisherInfoSheet } from './PublisherInfoSheet';
import { PublicationAuthSheet } from './PublicationAuthSheet';
import { OFFICIAL_PUBLISHER_ID, OFFICIAL_PUBLISHER_NAME, OFFICIAL_PUBLISHER_ROUTE } from './officialPublisher';
import { usePublisherFollow } from './usePublisherFollow';

const COVER = require('../../../assets/hero/hero-mode.jpg');
const GAP = 2;
const GRID_COLUMNS = 3;
const LIST_IMAGE_WIDTH = 92;

type Icon = React.ComponentProps<typeof Ionicons>['name'];

function IconAction({ icon, label, color, onPress, selected }: {
  icon: Icon; label: string; color: string; onPress: () => void; selected?: boolean;
}) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={selected === undefined ? undefined : { selected }}
    onPress={onPress} style={[styles.touch, { borderRadius: theme.radius.full }, selected ? { backgroundColor: theme.colors.canvas } : null]}>
    <Ionicons name={icon} size={theme.iconSize.lg} color={color} />
  </Pressable>;
}

type PublisherProduct = Pick<CatalogProduct, 'id' | 'name' | 'image' | 'finalPrice' | 'stockStatus'>
  & Partial<Pick<CatalogProduct, 'additionalImages' | 'brandName' | 'category' | 'compareAtPrice'>>
  & { available?: boolean };

export function OfficialPublisherScreen() {
  const route = useLocalSearchParams<{ arrivalId?: string }>();
  return <PublisherShowcase arrivalId={typeof route.arrivalId === 'string' ? route.arrivalId : ''} />;
}

/** The same publisher shell, with an exact publication instead of a catalogue source. */
export function PublisherShowcase({ arrivalId = '', publication, refreshing, onRefresh, onSavePublication, publicationSaveError }: {
  arrivalId?: string; publication?: ReferencePublication; refreshing?: boolean;
  onRefresh?: () => void; onSavePublication?: () => void; publicationSaveError?: boolean;
}) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(width);
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const favorites = useProductFavorites(signedIn, session.account?.id);
  const [authOpen, setAuthOpen] = useState(false);
  const publisherId = publication ? publication.channelId : OFFICIAL_PUBLISHER_ID;
  const official = publisherId === OFFICIAL_PUBLISHER_ID;
  const publisherName = official ? OFFICIAL_PUBLISHER_NAME : publication?.channelName || '';
  const follow = usePublisherFollow(publisherId, () => setAuthOpen(true));
  const [display, setDisplay] = useState({ list: false, offset: { x: 0, y: 0 } });
  const listMode = display.list;
  const [compact, setCompact] = useState(false);
  const coverHeight = useRef(0);
  const scrollY = useRef(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [infoState, setInfoState] = useState<'closed' | 'open' | 'closing'>('closed');
  useEffect(() => {
    if (infoState === 'closed' && !filterOpen) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (infoState === 'open') setInfoState('closing');
      else if (filterOpen) setFilterOpen(false);
      return true;
    });
    return () => back.remove();
  }, [filterOpen, infoState]);
  const changeDisplay = (next: boolean) => {
    if (next === listMode) return;
    // RN requires a new list for numColumns; the cover/toolbar are the same in
    // both modes, so keep their current position instead of jumping to the top.
    setDisplay({ list: next, offset: { x: 0, y: Math.max(0, scrollY.current) } });
  };
  const [filters, setFilters] = useState<CatalogSearchFilters>({});
  const list = useRef<FlatList<PublisherProduct>>(null);
  const products = useInfiniteQuery({
    enabled: !publication,
    queryKey: ['publisher-products', OFFICIAL_PUBLISHER_ID, arrivalId, filters],
    queryFn: ({ signal, pageParam }) => searchCatalog({ ...filters, arrivalId, offset: pageParam }, { signal }),
    initialPageParam: 0,
    getNextPageParam: last => last.nextOffset ?? undefined,
    staleTime: 120_000,
  });
  const arrivals = useQuery({
    queryKey: ['catalog', 'arrivals'],
    queryFn: ({ signal }) => fetchCatalogArrivals({ signal }),
    enabled: !publication && Boolean(arrivalId),
    staleTime: 120_000,
  });
  const arrival = arrivals.data?.find(entry => entry.id === arrivalId);
  const publicationFacets = useMemo(() => publication ? {
    categories: [], sizes: [],
    brands: [...new Set(publication.products.map(product => product.brand).filter((brand): brand is string => Boolean(brand)))].map(brand => ({ id: brand, label: brand })),
  } : undefined, [publication]);
  const firstPage = publication ? undefined : products.data?.pages[0];
  const rows = useMemo<PublisherProduct[]>(() => {
    if (publication) return publication.products.filter(product => {
      const stock = normalizeStockStatus(product.stockStatus);
      return (!filters.brandId || filters.brandId === product.brand)
        && (filters.min === undefined || product.price >= filters.min)
        && (filters.max === undefined || product.price <= filters.max)
        && (!filters.available || (product.available && (stock === 'AVAILABLE' || stock === 'LIMITED')));
    }).map(product => ({ id: product.id, name: product.name, image: product.image, brandName: product.brand,
      finalPrice: product.price, compareAtPrice: product.compareAtPrice, stockStatus: product.stockStatus, available: product.available }));
    const unique = new Map<string, CatalogProduct>();
    for (const page of products.data?.pages ?? []) {
      for (const product of page.items) if (!unique.has(product.id)) unique.set(product.id, product);
    }
    return [...unique.values()];
  }, [products.data, publication, filters]);
  const columns = listMode ? 1 : GRID_COLUMNS;
  const itemWidth = Math.max(0, (gridWidth - (columns - 1) * GAP) / columns);
  const direction = rowDirectionFor(theme.isRTL);
  const ink = theme.colors.ink;
  const coverInk = theme.colors.onMedia;
  const followLabel = t(follow.state === 'following' ? 'publication.following' : follow.state === 'error' ? 'publication.followRetry' : 'publication.follow');
  const title = publication ? publication.detailTitle || publication.title || publication.subtitle || t('publication.lookTitle') : arrival?.name || t('publisher.title');
  const publisherSubtitle = t('publisher.subtitle');
  const description = publication ? [publication.subtitle, publication.description]
    .filter((value, index, values) => value && value !== title && values.indexOf(value) === index).join('\n\n') : publisherSubtitle;
  const total = publication ? rows.length : firstPage?.total;
  const count = total === undefined ? null : t(publication && total === 1 ? 'publication.photoOneProduct' : 'publisher.count', { count: total });
  const updatedRaw = publication ? publication.updatedAt : firstPage?.updatedAt;
  const updatedAt = updatedRaw ? new Date(updatedRaw) : null;
  const coverFocal = publication?.media && (publication.media.focalX !== undefined || publication.media.focalY !== undefined)
    ? { left: `${publication.media.focalX ?? 50}%` as const, top: `${publication.media.focalY ?? 50}%` as const } : undefined;
  const backTo = publication ? '/publications' : '/(tabs)';
  const updated = updatedAt && Number.isFinite(updatedAt.getTime()) ? t('publisher.updated', {
    date: new Intl.DateTimeFormat(locale === 'ar' ? 'ar-TN' : 'fr-TN', { dateStyle: 'medium' }).format(updatedAt),
  }) : null;
  const info = () => setInfoState('open');
  const share = () => {
    const path = publication ? `/publication-look/${publication.id}` : OFFICIAL_PUBLISHER_ROUTE;
    const url = `${DEEP_LINK_SCHEME}://${path.slice(1)}`;
    void Share.share({ message: `${publication ? title : publisherName}\n${url}` }).catch(() => Alert.alert(t('publisher.shareError')));
  };
  const loadMore = () => {
    if (!publication && products.hasNextPage && !products.isFetching) void products.fetchNextPage();
  };

  const followButton = (compactMode: boolean) => publisherId ? <Pressable testID={compactMode ? 'publisher-compact-follow' : 'publisher-follow'}
    accessibilityRole="button" accessibilityLabel={followLabel}
    accessibilityState={{ disabled: follow.disabled, selected: follow.state === 'following' }}
    disabled={follow.disabled} onPress={follow.press} style={[styles.follow, { flexDirection: direction }, compactMode
      ? { borderColor: ink, borderWidth: StyleSheet.hairlineWidth, borderRadius: theme.radius.sm }
      : { backgroundColor: coverInk }] }>
    <Ionicons name={follow.state === 'following' ? 'checkmark-outline' : 'add-outline'} color={compactMode ? ink : theme.colors.scrim} size={theme.iconSize.md} />
    <AppText variant="label" numberOfLines={1} color={compactMode ? ink : theme.colors.scrim}>{follow.state === 'pending' ? '…' : followLabel}</AppText>
  </Pressable> : null;
  const openProduct = (id: string, add = false) => router.push({ pathname: '/product/[id]', params: add ? { id, add: '1' } : { id } });

  const header = <>
    <View testID="publisher-cover" style={[styles.cover, { backgroundColor: theme.colors.scrim }]}
      onLayout={event => {
        coverHeight.current = event.nativeEvent.layout.height;
        setCompact(coverHeight.current > 0 && scrollY.current >= coverHeight.current);
      }}>
      {publication ? <AppImage uri={mediaUrl(publication.media?.url)} contentPosition={coverFocal} decorative contentFit="cover" style={StyleSheet.absoluteFill} /> :
        <AppImage localSource={COVER} decorative contentFit="cover" style={StyleSheet.absoluteFill} />}
      <LinearGradient colors={[veil(0.48), 'transparent', veil(0.12), veil(0.9)]} locations={[0, 0.25, 0.49, 1]} style={StyleSheet.absoluteFill} />
      <View style={[styles.coverInner, { minHeight: Math.max(288, Math.min(gridWidth, 560) * 0.96) }]}>
        <View style={[styles.toolbar, { flexDirection: direction }]}>
          <BackButton label={t('common.back')} color={coverInk} onPress={() => goBack(backTo)} />
          <View style={[styles.actions, { flexDirection: direction }]}>
            <IconAction icon="share-social-outline" label={t(publication ? 'social.share' : 'publisher.share')} color={coverInk} onPress={share} />
            <IconAction icon="ellipsis-horizontal" label={t('publisher.options')} color={coverInk} onPress={() => Alert.alert(publication ? title : publisherName, undefined, [
              { text: t(publication ? 'social.share' : 'publisher.share'), onPress: share }, { text: t('publisher.about'), onPress: info },
              ...(onSavePublication ? [{ text: t(publication?.saved ? 'publication.lookUnsave' : 'publication.lookSave'), onPress: onSavePublication }] : []),
              { text: t('common.close'), style: 'cancel' },
            ])} />
          </View>
        </View>
        <View style={styles.coverCopy}>
          <View style={[styles.identity, { flexDirection: direction }]}>
            {official ? <OfficialAvatar size={theme.iconSize.lg} testID="publisher-avatar" /> : publication?.channelAvatar ?
              <AppImage uri={mediaUrl(publication.channelAvatar)} decorative style={{ width: theme.iconSize.lg, height: theme.iconSize.lg, borderRadius: theme.radius.full }} /> : null}
            {publisherName ? <AppText variant="bodyStrong" color={coverInk}>{publisherName}</AppText> : null}
          </View>
          <View style={[styles.coverTitle, { flexDirection: direction }]}>
            <AppText accessibilityRole="header" variant="h1" color={coverInk} style={styles.fill}>{title}</AppText>
            {followButton(false)}
          </View>
          {publicationSaveError ? <AppText accessibilityRole="alert" variant="caption" color={coverInk}>{t('publication.lookSaveError')}</AppText> : null}
          {description ? <AppText variant="body" color={coverInk}>{description}</AppText> : null}
          {follow.writeFailed ? <AppText variant="caption" accessibilityRole="alert" color={coverInk}>{t('publication.followError')}</AppText> : null}
        </View>
      </View>
    </View>
    <View style={[styles.meta, { flexDirection: direction }]}>
      {count ? <View style={[styles.count, { backgroundColor: theme.colors.skeleton, borderRadius: theme.radius.full }]}>
        <AppText variant="caption" color={theme.colors.muted}>{count}</AppText>
      </View> : null}
      <View style={styles.fill}>{updated ? <AppText variant="caption" color={theme.colors.muted}>{updated}</AppText> : null}</View>
      <IconAction icon="information-circle-outline" label={t('publisher.about')} color={ink} onPress={info} />
      <View style={[styles.toggle, { flexDirection: direction, backgroundColor: theme.colors.skeleton, borderRadius: theme.radius.full }]}>
        <IconAction icon="grid-outline" label={t('publisher.grid')} color={ink} selected={!listMode} onPress={() => changeDisplay(false)} />
        <IconAction icon="list-outline" label={t('publisher.list')} color={ink} selected={listMode} onPress={() => changeDisplay(true)} />
      </View>
    </View>
  </>;

  return <View testID={publication ? "publication-photo-collection" : "official-publisher"} style={[styles.fill, { paddingTop: insets.top, backgroundColor: theme.colors.canvas }]}
    onLayout={event => { if (event.nativeEvent.layout.width > 0) setGridWidth(event.nativeEvent.layout.width); }}>
    <View style={styles.fill} accessibilityElementsHidden={infoState !== 'closed' || filterOpen}
      importantForAccessibility={infoState !== 'closed' || filterOpen ? 'no-hide-descendants' : 'auto'}>
    <FlatList key={columns} ref={list} testID="publisher-products" contentOffset={display.offset}
      onScroll={event => {
        scrollY.current = event.nativeEvent.contentOffset.y;
        const pinned = coverHeight.current > 0 && scrollY.current >= coverHeight.current;
        if (pinned !== compact) setCompact(pinned);
      }} scrollEventThrottle={32}
      data={rows} numColumns={columns} keyExtractor={product => product.id}
      initialNumToRender={listMode ? 6 : 2} maxToRenderPerBatch={listMode ? 6 : 2} windowSize={5}
      columnWrapperStyle={listMode ? undefined : [styles.gridRow, { flexDirection: direction }]}
      ListHeaderComponent={header} contentContainerStyle={{ paddingBottom: insets.bottom + 72 }}
      refreshing={publication ? Boolean(refreshing) : products.isRefetching} onRefresh={publication ? onRefresh : () => void products.refetch()}
      onEndReachedThreshold={0.45} onEndReached={publication || products.isFetchNextPageError ? undefined : loadMore}
      ListEmptyComponent={publication ? <EmptyBlock>{t(publication.products.length ? 'publication.photoFilteredEmpty' : 'publication.lookNoProducts')}</EmptyBlock> : products.isPending ? <LoadingBlock /> : products.isError ?
        <ErrorBlock error={products.error} onRetry={() => void products.refetch()} /> : <EmptyBlock>{t('catalog.search.empty')}</EmptyBlock>}
      ListFooterComponent={publication ? null : products.isFetchingNextPage ? <LoadingBlock /> : products.isFetchNextPageError ?
        <Button label={t('common.retry')} tone="quiet" onPress={loadMore} /> : null}
      renderItem={({ item }) => {
        const saved = signedIn && favorites.isFavorite(item.id);
        const tileWidth = listMode ? LIST_IMAGE_WIDTH : itemWidth;
        const discount = item.finalPrice > 0 && item.compareAtPrice != null && item.compareAtPrice > item.finalPrice;
        const thumb = <View style={[styles.tileImage, { width: tileWidth, backgroundColor: theme.colors.skeleton, borderRadius: theme.radius.lg }]}>
          <AppImage uri={mediaUrl(item.image || item.additionalImages?.[0])} contentFit="contain" decorative style={StyleSheet.absoluteFill} />
        </View>;
        const favorite = <Pressable accessibilityRole="button" accessibilityState={{ selected: saved }}
          accessibilityLabel={t(saved ? 'publisher.unsave' : 'publisher.save', { name: item.name })}
          onPress={() => signedIn ? favorites.toggle(item.id) : setAuthOpen(true)}
          style={[styles.touch, listMode ? null : styles.heart, { backgroundColor: theme.colors.canvas, borderRadius: theme.radius.full }]}>
          <Ionicons name={saved ? 'heart' : 'heart-outline'} size={theme.iconSize.lg} color={ink} />
        </Pressable>;
        if (!listMode) return <View testID={`publisher-product-${item.id}`} style={[styles.tile, { width: itemWidth }]}>
          <Pressable accessibilityRole="link" accessibilityLabel={item.name} onPress={() => openProduct(item.id)}>{thumb}</Pressable>
          {favorite}
        </View>;
        return <View testID={`publisher-product-${item.id}`} style={[styles.listRow, { flexDirection: direction }]}>
          <Pressable accessibilityRole="link" accessibilityLabel={item.name} onPress={() => openProduct(item.id)}
            style={[styles.productLink, { flexDirection: direction }]}>
            {thumb}
            <View style={styles.listCopy}>
              {item.brandName ? <AppText variant="body" numberOfLines={1}>{item.brandName}</AppText> : null}
              <AppText variant="bodyStrong" numberOfLines={2}>{item.name}</AppText>
              {item.category || discount ? <View style={[styles.tags, { flexDirection: direction }]}>
                {item.category ? <AppText variant="captionStrong" style={[styles.tag, { backgroundColor: theme.colors.skeleton, borderRadius: theme.radius.sm }]}
                  numberOfLines={1}>{item.category}</AppText> : null}
                {discount ? <AppText variant="captionStrong" color={theme.status.danger.fg} style={[styles.tag, { backgroundColor: theme.status.danger.soft, borderRadius: theme.radius.sm }]}>{t('publisher.promo')}</AppText> : null}
              </View> : null}
              {item.finalPrice > 0 ? <View style={styles.prices}>
                <AppText variant="bodyStrong" color={discount ? theme.status.danger.fg : ink}>{formatMoney(item.finalPrice)}</AppText>
                {discount && item.compareAtPrice != null ? <AppText variant="bodySmall" color={theme.colors.muted} style={styles.compare}>{formatMoney(item.compareAtPrice)}</AppText> : null}
              </View> : null}
            </View>
          </Pressable>
          <View style={styles.rowActions}>
            <IconAction icon="ellipsis-horizontal-outline" label={t('publisher.itemOptions', { name: item.name })} color={ink}
              onPress={() => Alert.alert(item.name, undefined, [{ text: t('publisher.itemOpen'), onPress: () => openProduct(item.id) }, { text: t('common.close'), style: 'cancel' }])} />
            <View style={styles.fill} />
            {favorite}
            {item.finalPrice > 0 && item.available !== false && normalizeStockStatus(item.stockStatus) !== 'OUT_OF_STOCK' ? <Pressable accessibilityRole="button"
              accessibilityLabel={t('publisher.itemAdd', { name: item.name })} onPress={() => openProduct(item.id, true)}
              style={[styles.touch, { backgroundColor: ink, borderRadius: theme.radius.full }]}>
              <Ionicons name="bag-outline" size={theme.iconSize.lg} color={theme.colors.canvas} />
            </Pressable> : null}
          </View>
        </View>;
      }} />
    {compact ? <View testID="publisher-compact-header" style={[styles.compactHeader, { flexDirection: direction, backgroundColor: theme.colors.canvas, borderColor: theme.colors.line }]}>
      <BackButton label={t('common.back')} color={ink} onPress={() => goBack(backTo)} />
      <AppText accessibilityRole="header" variant="bodyStrong" numberOfLines={1} style={styles.fill}>{title}</AppText>
      {followButton(true)}
      <IconAction icon="share-social-outline" label={t(publication ? 'social.share' : 'publisher.share')} color={ink} onPress={share} />
    </View> : null}
    {(firstPage || Boolean(publication?.products.length)) ? <View pointerEvents="box-none" style={[styles.floating, { bottom: insets.bottom + 8 }]}>
      <Pressable testID="publisher-filter" accessibilityRole="button" accessibilityState={{ selected: Object.keys(filters).length > 0 }} onPress={() => setFilterOpen(true)}
        style={[styles.filter, { flexDirection: direction, backgroundColor: theme.colors.canvas, shadowColor: ink, borderRadius: theme.radius.full }]}>
        <Ionicons name="options-outline" size={theme.iconSize.lg} color={ink} />
        <AppText variant="bodyStrong">{t('publisher.filter')}</AppText>
      </Pressable>
    </View> : null}
    </View>
    {infoState !== 'closed' ? <PublisherInfoSheet scoped={Boolean(publication)} open={infoState === 'open'} close={() => setInfoState('closing')} onClosed={() => setInfoState('closed')} /> : null}
    {filterOpen ? <CatalogFilterSheet localFacetsOnly={Boolean(publication)} arrivalId={arrivalId} q="" filters={filters} facets={publicationFacets ?? firstPage?.facets}
      close={() => setFilterOpen(false)} apply={next => {
        setFilters(next); setFilterOpen(false); list.current?.scrollToOffset({ offset: 0, animated: false });
      }} /> : null}
    {authOpen ? <PublicationAuthSheet visible onClose={() => setAuthOpen(false)} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: { overflow: 'hidden' },
  coverInner: { padding: 16, justifyContent: 'space-between' },
  toolbar: { alignItems: 'center', justifyContent: 'space-between' },
  actions: { alignItems: 'center' },
  coverCopy: { gap: 12, paddingBottom: 8 },
  identity: { alignItems: 'center', gap: 8 },
  coverTitle: { alignItems: 'center', gap: 12 },
  follow: { paddingHorizontal: 12, minHeight: 44, alignItems: 'center', gap: 4 },
  meta: { alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  count: { paddingHorizontal: 12, paddingVertical: 4 },
  toggle: { padding: 2 },
  touch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  gridRow: { gap: GAP },
  tile: { marginBottom: GAP },
  productLink: { flex: 1, alignItems: 'flex-start', gap: 8 },
  listRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 4, minHeight: 180 },
  tileImage: { aspectRatio: 7 / 10, overflow: 'hidden' },
  listCopy: { flex: 1, gap: 4, paddingTop: 8 },
  tags: { flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tag: { paddingHorizontal: 8, paddingVertical: 4, maxWidth: '100%' },
  rowActions: { alignItems: 'center', gap: 4 },
  prices: { gap: 2, marginTop: 8 },
  compare: { textDecorationLine: 'line-through' },
  compactHeader: { position: 'absolute', top: 0, left: 0, right: 0, minHeight: 56, paddingHorizontal: 8, alignItems: 'center', gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  heart: { position: 'absolute', top: 8, end: 8 },
  floating: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  filter: { alignItems: 'center', gap: 8, paddingHorizontal: 24, minHeight: 48, elevation: 5,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, shadowOpacity: 0.15 },
});
