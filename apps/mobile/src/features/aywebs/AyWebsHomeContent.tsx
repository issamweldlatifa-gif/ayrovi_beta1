/**
 * AYWEBs home: store search, category shortcuts, local resume card,
 * saved/popular store cards and the supplied campaign footer.
 * Catalog text/logos always come from the API; campaign/category art is static UI art.
 */
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, SectionHeader } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { AppImage } from '@/design/appImage';
import { mediaUrl } from '@/api/client';
import { useI18n } from '@/i18n';
import type { AyWebsCategory, AyWebsStore } from '@/api/aywebs';
import { useSessionId } from '@/session/session';
import { storeEntryTarget } from '@/features/aywebs/storeEntry';
import { useSavedStoreIds } from '@/features/aywebs/savedStores';
import { readAyWebsLastVisit, rememberAyWebsVisit, type AyWebsLastVisit } from '@/features/aywebs/lastVisitedStore';
import {
  categoryEntries, categoryLabel, filterStoresByQuery, savedStoresInOrder,
  storeDisplayName, storeSubtitle, storesInCategory,
} from '@/features/aywebs/storesCatalog';
import type { StoresCatalogQuery } from '@/features/aywebs/StoresContent';

const CATEGORY_ART = {
  electronics: require('../../../assets/aywebs/category-electronics.jpg'),
  fashion: require('../../../assets/aywebs/category-fashion.jpg'),
  beauty: require('../../../assets/aywebs/category-beauty.jpg'),
  audio: require('../../../assets/aywebs/category-audio.jpg'),
  shoes: require('../../../assets/aywebs/category-shoes.jpg'),
  home: require('../../../assets/aywebs/category-home.jpg'),
} as const;

type CategoryArtKey = keyof typeof CATEGORY_ART;
type IconName = keyof typeof Ionicons.glyphMap;
const CATEGORY_FALLBACK_ICON: IconName = 'pricetag-outline';

function categoryArt(category: AyWebsCategory): { source?: number; icon: IconName } {
  const key = `${category.id} ${category.labelFr} ${category.labelAr}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const matches: Array<[CategoryArtKey, RegExp, IconName]> = [
    ['electronics', /electr|tech|informat|الكترون|إلكترون/, 'phone-portrait-outline'],
    ['fashion', /fashion|mode|vetement|clothing|ملابس|موض/, 'shirt-outline'],
    ['beauty', /beaut|cosmet|soin|جمال|تجميل/, 'sparkles-outline'],
    ['audio', /audio|sound|son|headphone|صوت|سماعات/, 'headset-outline'],
    ['shoes', /shoe|chauss|footwear|حذاء|احذي|أحذي/, 'footsteps-outline'],
    ['home', /home|maison|deco|furniture|منزل|ديكور/, 'home-outline'],
  ];
  const match = matches.find(([, pattern]) => pattern.test(key));
  return match
    ? { source: CATEGORY_ART[match[0]], icon: match[2] }
    : { icon: CATEGORY_FALLBACK_ICON };
}

function storeTarget(store: AyWebsStore) {
  return storeEntryTarget(store);
}

function visitDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export function AyWebsHomeContent({ catalog }: { catalog: StoresCatalogQuery }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { width } = useWindowDimensions();
  const sessionId = useSessionId();
  const saved = useSavedStoreIds();
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [lastVisit, setLastVisit] = useState<AyWebsLastVisit | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    void readAyWebsLastVisit().then((visit) => { if (active) setLastVisit(visit); });
    return () => { active = false; };
  }, []));

  const stores = catalog.data?.stores ?? [];
  const categories = catalog.data?.categories ?? [];
  const savedStores = useMemo(() => savedStoresInOrder(stores, saved.ids), [saved.ids, stores]);
  const categoryTiles = useMemo(() => {
    const entries = categoryEntries(stores, categories).filter((entry) => entry.count > 0);
    return (entries.length ? entries : categoryEntries(stores, categories)).slice(0, 6);
  }, [categories, stores]);
  const matchingStores = useMemo(() => filterStoresByQuery(stores, search), [search, stores]);
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const sectionStores = selectedCategory
    ? storesInCategory(stores, selectedCategory.id)
    : savedStores.length > 0
      ? savedStores
      : stores.filter((store) => store.popular).slice(0, 8).length > 0
        ? stores.filter((store) => store.popular).slice(0, 8)
        : stores.slice(0, 8);
  const visibleStores = search.trim() ? matchingStores : sectionStores;
  const sectionTitle = search.trim()
    ? t('aywebs.home.searchResults')
    : selectedCategory
      ? categoryLabel(selectedCategory, locale === 'ar' ? 'ar' : 'fr')
      : savedStores.length > 0
        ? t('aywebs.home.savedStores')
        : t('aywebs.home.discoverStores');
  const cardWidth = Math.min(Math.max(width * 0.68, 230), 280);

  const openStore = (store: AyWebsStore) => {
    const target = storeTarget(store);
    if (!target || !sessionId) return;
    void rememberAyWebsVisit({
      storeId: target.params.storeId,
      storeName: target.params.storeName,
      url: target.params.url,
    });
    router.push(target);
  };

  const resume = () => {
    if (!lastVisit) {
      router.push('/aywebs/stores');
      return;
    }
    router.push({
      pathname: '/aywebs/browser',
      params: {
        url: lastVisit.url,
        storeId: lastVisit.storeId,
        storeName: lastVisit.storeName,
        capture: '0',
      },
    });
  };

  const clearSearch = () => {
    setSearch('');
    setSelectedCategoryId(null);
  };

  return (
    <View testID="aywebs-home-content" style={styles.content}>
      <View style={[styles.search, { backgroundColor: theme.colors.accent, flexDirection: rowDirectionFor(theme.isRTL) }]}>
        <Ionicons name="search-outline" size={20} color={theme.colors.onAccent} accessibilityElementsHidden />
        <TextInput
          value={search}
          onChangeText={(value) => { setSearch(value); setSelectedCategoryId(null); }}
          placeholder={t('aywebs.home.search')}
          placeholderTextColor={theme.colors.accentSoft}
          accessibilityLabel={t('aywebs.home.search')}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={[styles.searchInput, { color: theme.colors.onAccent, textAlign: theme.isRTL ? 'right' : 'left' }]}
          testID="aywebs-home-search"
        />
        {search ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('aywebs.stores.clear')}
            onPress={clearSearch}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={20} color={theme.colors.onAccent} accessibilityElementsHidden />
          </Pressable>
        ) : null}
      </View>

      {!search.trim() ? (
        <>
          <View style={styles.section}>
            <SectionHeader title={t('aywebs.home.categories')} />
            {catalog.isPending ? (
              <View style={styles.categoryGrid}>
                {Array.from({ length: 6 }, (_, index) => (
                  <View key={index} style={[styles.categorySkeleton, { backgroundColor: theme.colors.shimmer }]} />
                ))}
              </View>
            ) : catalog.isError ? (
              <AppText variant="caption" color={theme.status.danger.fg}>{t('aywebs.stores.loadFailed')}</AppText>
            ) : (
              <View style={styles.categoryGrid}>
                {categoryTiles.map(({ category }) => (
                  <CategoryTile
                    key={category.id}
                    category={category}
                    selected={selectedCategoryId === category.id}
                    onPress={() => setSelectedCategoryId(category.id)}
                  />
                ))}
              </View>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={lastVisit ? `${t('aywebs.home.resume')}: ${lastVisit.storeName}` : t('aywebs.home.resume')}
            onPress={resume}
            testID="aywebs-home-resume"
            style={({ pressed }) => [
              styles.resume,
              {
                backgroundColor: theme.status.warning.soft,
                borderColor: theme.status.warning.border,
                flexDirection: rowDirectionFor(theme.isRTL),
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <View style={[styles.resumeIcon, { backgroundColor: theme.colors.surface }]}>
              <Ionicons name="time-outline" size={25} color={theme.colors.ink} accessibilityElementsHidden />
            </View>
            <View style={styles.resumeCopy}>
              <AppText variant="label" weight="bold">{t('aywebs.home.resume')}</AppText>
              <AppText variant="caption" color={theme.colors.muted} numberOfLines={2}>
                {lastVisit
                  ? `${lastVisit.storeName} · ${visitDomain(lastVisit.url)}`
                  : t('aywebs.home.resumeEmpty')}
              </AppText>
            </View>
            <Ionicons
              name={theme.isRTL ? 'chevron-back' : 'chevron-forward'}
              size={20}
              color={theme.colors.ink}
              accessibilityElementsHidden
            />
          </Pressable>
        </>
      ) : null}

      <View style={styles.section}>
        <SectionHeader
          title={sectionTitle}
          action={(
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('aywebs.home.viewAll')}
              onPress={() => router.push('/aywebs/stores')}
              style={styles.viewAll}
              testID="aywebs-home-view-all"
            >
              <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.home.viewAll')}</AppText>
              <Ionicons
                name={theme.isRTL ? 'chevron-back' : 'chevron-forward'}
                size={14}
                color={theme.colors.muted}
                accessibilityElementsHidden
              />
            </Pressable>
          )}
        />
        {catalog.isPending ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('loading.stores')}</AppText>
        ) : catalog.isError ? (
          <AppText variant="caption" color={theme.status.danger.fg}>{t('aywebs.stores.loadFailed')}</AppText>
        ) : visibleStores.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.storeRail, { flexDirection: rowDirectionFor(theme.isRTL) }]}
            testID="aywebs-home-store-rail"
          >
            {visibleStores.map((store) => (
              <HomeStoreCard
                key={store.id}
                store={store}
                categories={categories}
                width={cardWidth}
                sessionId={sessionId}
                saved={saved.ids.includes(store.id)}
                onOpen={() => openStore(store)}
                onToggle={() => saved.toggle(store.id)}
              />
            ))}
          </ScrollView>
        ) : (
          <AppText variant="caption" color={theme.colors.muted}>
            {search.trim() ? t('aywebs.home.noSearchResults') : t('aywebs.stores.savedEmpty')}
          </AppText>
        )}
      </View>

    </View>
  );
}

function CategoryTile({ category, selected, onPress }: {
  category: AyWebsCategory;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { locale } = useI18n();
  const artwork = categoryArt(category);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={categoryLabel(category, locale === 'ar' ? 'ar' : 'fr')}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={`aywebs-home-category-${category.id}`}
      style={({ pressed }) => [styles.categoryTile, { opacity: pressed ? 0.84 : 1 }]}
    >
      <View style={[styles.categoryPhoto, { borderColor: theme.colors.line, backgroundColor: theme.colors.shimmer }]}>
        {artwork.source ? (
          <AppImage
            localSource={artwork.source}
            contentFit="cover"
            accessibilityLabel={categoryLabel(category, locale === 'ar' ? 'ar' : 'fr')}
            testID={`aywebs-home-category-image-${category.id}`}
            style={styles.categoryImage}
          />
        ) : (
          <Ionicons name={artwork.icon} size={30} color={theme.colors.muted} accessibilityElementsHidden />
        )}
      </View>
      <AppText variant="caption" weight="semibold" align="center" numberOfLines={1}>
        {categoryLabel(category, locale === 'ar' ? 'ar' : 'fr')}
      </AppText>
    </Pressable>
  );
}

function HomeStoreCard({ store, categories, width, sessionId, saved, onOpen, onToggle }: {
  store: AyWebsStore;
  categories: AyWebsCategory[];
  width: number;
  sessionId: string | null;
  saved: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const name = storeDisplayName(store);
  const subtitle = storeSubtitle(store, categories, locale === 'ar' ? 'ar' : 'fr');
  const logo = mediaUrl(store.logo);
  const enabled = Boolean(storeTarget(store) && sessionId);
  return (
    <View
      style={[
        styles.storeCard,
        {
          width,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.line,
          borderRadius: theme.radius.card,
        },
      ]}
      testID={`aywebs-home-store-card-${store.id}`}
    >
      <View style={[styles.storeCardTop, { backgroundColor: theme.colors.shimmer, flexDirection: rowDirectionFor(theme.isRTL) }]}>
        <View style={styles.storeLogoWrap} testID={`aywebs-home-store-media-${store.id}`}>
          {logo ? (
            <AppImage
              uri={logo}
              contentFit="contain"
              accessibilityLabel={name}
              style={styles.storeLogo}
              testID={`aywebs-home-store-logo-${store.id}`}
            />
          ) : (
            <AppText variant="display" weight="bold" color={theme.colors.muted}>{name.slice(0, 1)}</AppText>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? t('aywebs.stores.unsave') : t('aywebs.stores.save')}
          accessibilityState={{ selected: saved }}
          onPress={onToggle}
          hitSlop={8}
          style={[
            styles.storeHeart,
            { backgroundColor: theme.colors.surface },
          ]}
          testID={`aywebs-home-store-save-${store.id}`}
        >
          <Ionicons
            name={saved ? 'heart' : 'heart-outline'}
            size={18}
            color={saved ? theme.colors.accentText : theme.colors.muted}
            accessibilityElementsHidden
          />
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityHint={enabled ? undefined : t('aywebs.storeEnterUnavailable')}
        accessibilityState={{ disabled: !enabled }}
        disabled={!enabled}
        onPress={onOpen}
        testID={`aywebs-home-store-${store.id}`}
        style={({ pressed }) => [styles.storeCardBody, { opacity: pressed ? 0.86 : 1 }]}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="label" weight="bold" numberOfLines={1}>{name}</AppText>
          {subtitle ? <AppText variant="caption" color={theme.colors.muted} numberOfLines={2}>{subtitle}</AppText> : null}
        </View>
        <Ionicons
          name={theme.isRTL ? 'chevron-back' : 'chevron-forward'}
          size={19}
          color={theme.colors.ink}
          accessibilityElementsHidden
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingBottom: 20 },
  search: {
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    borderRadius: 999,
    paddingHorizontal: 16,
  },
  searchInput: { flex: 1, minHeight: 48, fontSize: 16 },
  section: { gap: 12 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  categoryTile: { width: '31.5%', alignItems: 'center', gap: 4 },
  categoryPhoto: {
    width: 82,
    height: 82,
    borderWidth: 1.5,
    borderRadius: 41,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryImage: { width: '100%', height: '100%' },
  categorySkeleton: { width: '31.5%', height: 104, borderRadius: 16 },
  resume: { minHeight: 84, alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 12 },
  resumeIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  resumeCopy: { flex: 1, gap: 4 },
  viewAll: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 2 },
  storeRail: { gap: 12, paddingEnd: 4 },
  storeCard: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  storeCardTop: { height: 112, flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: 8, padding: 8 },
  storeLogoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  storeLogo: { width: '100%', height: '100%' },
  storeHeart: { width: 36, height: 36, alignSelf: 'center', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  storeCardBody: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
});
