/**
 * AYWEBs — contenu de la page Stores : recherche, « Browse by Category », « Store List »,
 * boutiques enregistrées et toutes les boutiques.
 *
 * Partagé par l'onglet AYWEBs et la page `/aywebs/stores` : une seule implémentation.
 * La requête du catalogue vit ici aussi (même clé de cache partout). Pas de marges
 * horizontales ici : le cadre qui l'accueille (onglet ou page) les fournit.
 */
/**
 * AYWEBs — page Stores.
 *
 *  • Recherche de MAGASINS (nom partiel, sans casse) sur les données du serveur.
 *    Distincte de la recherche de produits : elle ne touche ni au panier ni à la lecture.
 *  • « Browse by Category » : liste des catégories, puis les boutiques de la catégorie choisie.
 *  • « Store List » : toutes les boutiques du registre.
 *  • Saved Stores : les boutiques enregistrées par le cœur, gardées sur l'appareil.
 *
 * Rien n'est codé en dur ici : une boutique ou une catégorie ajoutée au serveur
 * apparaît automatiquement. Les textes marqués « figés » sont ceux du cahier des charges.
 */
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { MEDIA_RATIO } from '@/design/tokens.mobile';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { AppImage } from '@/design/appImage';
import { storeLogoSources } from '@/features/aywebs/storeLogos';
import { useI18n } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { fetchAyWebsStoreCatalog, type AyWebsCategory, type AyWebsStore } from '@/api/aywebs';
import { useSessionId } from '@/session/session';
import { storeEntryTarget } from '@/features/aywebs/storeEntry';
import { rememberAyWebsVisit } from '@/features/aywebs/lastVisitedStore';
import { useSavedStoreIds } from '@/features/aywebs/savedStores';
import {
  categoryEntries, categoryLabel, chunkRows, filterStoresByQuery, normalizeSearchText,
  savedStoresInOrder, storeDisplayName, storeDomain, storeSubtitle, storesInCategory, storeVisitUrl,
  type StoresLocale,
} from '@/features/aywebs/storesCatalog';

type StoresView =
  | { kind: 'home' }
  | { kind: 'categories' }
  | { kind: 'category'; id: string }
  | { kind: 'list' };

const GRID_GAP = 12;
const TWO_COLUMNS_MAX_WIDTH = 600;



export type StoresCatalogQuery = UseQueryResult<{ stores: AyWebsStore[]; categories: AyWebsCategory[] }, Error>;

/** Catalogue des boutiques — même clé de cache pour l'onglet et la page Stores. */
export function useStoresCatalogQuery(): StoresCatalogQuery {
  return useQuery({
    queryKey: ['aywebs', 'stores-catalog'],
    queryFn: ({ signal }) => fetchAyWebsStoreCatalog({ signal }),
  });
}

export function StoresContent({ catalog }: { catalog: StoresCatalogQuery }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const storesLocale: StoresLocale = locale === 'ar' ? 'ar' : 'fr';
  const { width } = useWindowDimensions();
  const columns = width >= TWO_COLUMNS_MAX_WIDTH ? 3 : 2;
  const sessionId = useSessionId();
  const saved = useSavedStoreIds();

  const stores = catalog.data?.stores ?? [];
  const categories = catalog.data?.categories ?? [];

  const [query, setQuery] = useState('');
  const [view, setView] = useState<StoresView>({ kind: 'home' });
  const searching = normalizeSearchText(query).length > 0;

  /** Effacer la recherche revient à la liste complète (Saved + All). */
  const changeQuery = (text: string) => {
    setQuery(text);
    if (!text) setView({ kind: 'home' });
  };

  const openStore = (store: AyWebsStore) => {
    const target = storeEntryTarget(store);
    if (!target || !sessionId) return;
    void rememberAyWebsVisit({
      storeId: target.params.storeId,
      storeName: target.params.storeName,
      url: target.params.url,
    });
    router.push(target);
  };

  const renderCard = (store: AyWebsStore) => {
    const target = storeEntryTarget(store);
    const enabled = Boolean(target) && Boolean(sessionId);
    const isSaved = saved.ids.includes(store.id);
    return (
      <StoreCard
        key={store.id}
        store={store}
        subtitle={storeSubtitle(store, categories, storesLocale)}
        enabled={enabled}
        saved={isSaved}
        onOpen={() => openStore(store)}
        onToggle={() => saved.toggle(store.id)}
      />
    );
  };

  /** Grille de cartes : `columns` par rangée, les rangées incomplètes gardent la même largeur. */
  const renderGrid = (list: AyWebsStore[]) => chunkRows(list, columns).map((row, index) => (
    <View key={`row-${index}`} style={[styles.gridRow, { gap: GRID_GAP }]}>
      {row.map(renderCard)}
      {Array.from({ length: columns - row.length }, (_, pad) => (
        <View key={`pad-${pad}`} style={styles.gridPad} />
      ))}
    </View>
  ));

  const back = (label: string, to: StoresView) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => setView(to)}
      style={[styles.backRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}
    >
      <Ionicons
        name={theme.isRTL ? 'chevron-forward' : 'chevron-back'}
        size={20}
        color={theme.colors.ink}
        accessibilityElementsHidden
      />
      <AppText variant="label" weight="bold">{label}</AppText>
    </Pressable>
  );

  let body: ReactNode;
  if (catalog.isPending) {
    body = <LoadingBlock labelKey="loading.stores" />;
  } else if (catalog.isError) {
    body = <ErrorBlock error={catalog.error} onRetry={() => catalog.refetch()} />;
  } else if (searching) {
    const found = filterStoresByQuery(stores, query);
    body = found.length > 0 ? (
      <View style={styles.section}>{renderGrid(found)}</View>
    ) : (
      <View style={styles.section}>
        <EmptyBlock>
          <AppText variant="body" align="center">{t('aywebs.stores.noneFound')}</AppText>
        </EmptyBlock>
        <Button label={t('aywebs.stores.clear')} tone="quiet" block onPress={() => changeQuery('')} />
      </View>
    );
  } else if (view.kind === 'categories') {
    body = (
      <View style={styles.section}>
        {back(t('aywebs.stores.back'), { kind: 'home' })}
        <AppText variant="lead" weight="bold">{t('aywebs.stores.categoriesTitle')}</AppText>
        {categoryEntries(stores, categories).map(({ category, count }) => (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={categoryLabel(category, storesLocale)}
            onPress={() => setView({ kind: 'category', id: category.id })}
            testID={`aywebs-stores-category-${category.id}`}
            style={({ pressed }) => [
              styles.categoryRow,
              {
                flexDirection: rowDirectionFor(theme.isRTL),
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.line,
                borderRadius: theme.radius.card,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={styles.categoryText}>
              <AppText variant="label" weight="bold">{categoryLabel(category, storesLocale)}</AppText>
              <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.stores.count', { count })}</AppText>
            </View>
            <Ionicons
              name={theme.isRTL ? 'chevron-back' : 'chevron-forward'}
              size={20}
              color={theme.colors.muted}
              accessibilityElementsHidden
            />
          </Pressable>
        ))}
      </View>
    );
  } else if (view.kind === 'category') {
    const category = categories.find((candidate) => candidate.id === view.id);
    const list = storesInCategory(stores, view.id);
    body = (
      <View style={styles.section}>
        {back(t('aywebs.stores.back'), { kind: 'categories' })}
        <AppText variant="lead" weight="bold">
          {category ? categoryLabel(category, storesLocale) : view.id}
        </AppText>
        {list.length > 0 ? renderGrid(list) : (
          <EmptyBlock><AppText variant="body" align="center">{t('aywebs.stores.noStores')}</AppText></EmptyBlock>
        )}
      </View>
    );
  } else if (view.kind === 'list') {
    body = (
      <View style={styles.section}>
        {back(t('aywebs.stores.back'), { kind: 'home' })}
        <AppText variant="lead" weight="bold">{t('aywebs.stores.list')}</AppText>
        {stores.length > 0 ? renderGrid(stores) : (
          <EmptyBlock><AppText variant="body" align="center">{t('aywebs.stores.noStores')}</AppText></EmptyBlock>
        )}
      </View>
    );
  } else {
    const savedStores = savedStoresInOrder(stores, saved.ids);
    body = (
      <>
        <View style={styles.section}>
          <AppText variant="lead" weight="bold">{t('aywebs.stores.saved')}</AppText>
          {savedStores.length > 0 ? renderGrid(savedStores) : (
            <AppText variant="body" color={theme.colors.muted}>{t('aywebs.stores.savedEmpty')}</AppText>
          )}
        </View>
        <View style={styles.section}>
          <AppText variant="lead" weight="bold">{t('aywebs.stores.all')}</AppText>
          {stores.length > 0 ? renderGrid(stores) : (
            <EmptyBlock><AppText variant="body" align="center">{t('aywebs.stores.noStores')}</AppText></EmptyBlock>
          )}
        </View>
      </>
    );
  }

  return (
    <>
      <View style={styles.controls}>
        <View style={[styles.search, { flexDirection: rowDirectionFor(theme.isRTL), borderColor: theme.colors.ink, backgroundColor: theme.colors.surface }]}>
          <Ionicons name="search-outline" size={20} color={theme.colors.muted} accessibilityElementsHidden />
          <TextInput
            value={query}
            onChangeText={changeQuery}
            placeholder={t('aywebs.stores.search')}
            placeholderTextColor={theme.colors.muted}
            accessibilityLabel={t('aywebs.stores.search')}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.colors.ink, textAlign: theme.isRTL ? 'right' : 'left' }]}
            testID="aywebs-stores-search"
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('aywebs.stores.clear')}
              onPress={() => changeQuery('')}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={20} color={theme.colors.muted} accessibilityElementsHidden />
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.actions, { flexDirection: rowDirectionFor(theme.isRTL), gap: GRID_GAP }]}>
          <ActionTile
            label={t('aywebs.stores.browse')}
            icon="list-outline"
            active={view.kind === 'categories' || view.kind === 'category'}
            onPress={() => { setQuery(''); setView({ kind: 'categories' }); }}
            testID="aywebs-stores-browse"
          />
          <ActionTile
            label={t('aywebs.stores.list')}
            icon="storefront-outline"
            active={view.kind === 'list'}
            onPress={() => { setQuery(''); setView({ kind: 'list' }); }}
            testID="aywebs-stores-list"
          />
        </View>
      </View>

      <View style={styles.body}>
        {body}
      </View>
    </>
  );
}

function ActionTile({ label, icon, active, onPress, testID }: {
  label: string;
  icon: IconName;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const tint = active ? theme.colors.action : theme.colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.tile,
        {
          borderColor: tint,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.card,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={24} color={tint} accessibilityElementsHidden />
      <AppText variant="label" weight="bold" color={tint} align="center">{label}</AppText>
    </Pressable>
  );
}

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Grande carte boutique — le gabarit de la référence (Zalando, 27/10/2026) :
 * un visuel 3:4 qui occupe la carte, puis le nom, la description et le domaine.
 *
 * ── Le logo n'est JAMAIS rogné ─────────────────────────────────────────────
 * `contentFit="contain"` + une réserve de 24 pt sur les quatre côtés : le logo
 * garde ses proportions et ne touche jamais le bord, qu'il soit un mot-symbole
 * large ou un carré. `cover` couperait le nom de la marque — inacceptable dans
 * un annuaire de boutiques, et c'est précisément le défaut signalé.
 *
 * Le cœur est posé SUR le visuel, dans une pastille : il reste lisible quelle
 * que soit la couleur du logo derrière.
 */
function StoreCard({ store, subtitle, enabled, saved, onOpen, onToggle }: {
  store: AyWebsStore;
  subtitle: string;
  enabled: boolean;
  saved: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const name = storeDisplayName(store);
  const logo = mediaUrl(store.logo);
  /* Même règle que l'accueil : le logo officiel embarqué gagne. Il est
     transparent, donc la plaque reste celle du design system. */
  const brand = storeLogoSources(store, theme.mode);
  /* Même repli qu'à l'accueil : un logo serveur introuvable affiche l'initiale,
     jamais un cadre cassé. */
  const [remoteFailed, setRemoteFailed] = useState(false);
  const domain = storeDomain(store);
  const visitUrl = storeVisitUrl(store);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityHint={enabled ? undefined : t('aywebs.storeEnterUnavailable')}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onOpen}
      testID={`aywebs-store-${store.id}`}
      style={({ pressed }) => [
        styles.card,
        { opacity: enabled ? (pressed ? 0.85 : 1) : 0.6 },
      ]}
    >
      <View
        style={[
          styles.cardMedia,
          {
            backgroundColor: brand?.plate ?? theme.colors.shimmer,
            borderRadius: theme.radius.card,
          },
        ]}
        testID={`aywebs-store-media-${store.id}`}
      >
        {(brand || logo) && !remoteFailed ? (
          <AppImage
            uri={logo}
            localSource={brand?.source}
            onError={() => setRemoteFailed(true)}
            style={styles.cardLogo}
            contentFit="contain"
            accessibilityLabel={name}
            testID={`aywebs-store-logo-${store.id}`}
          />
        ) : (
          <AppText variant="display" weight="bold" color={theme.colors.muted}>{name.slice(0, 1)}</AppText>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? t('aywebs.stores.unsave') : t('aywebs.stores.save')}
          accessibilityState={{ selected: saved }}
          onPress={onToggle}
          hitSlop={8}
          testID={`aywebs-store-save-${store.id}`}
          style={[
            styles.heart,
            theme.isRTL ? { left: 8 } : { right: 8 },
            { backgroundColor: theme.colors.canvas },
          ]}
        >
          <Ionicons
            name={saved ? 'heart' : 'heart-outline'}
            size={18}
            color={saved ? theme.colors.accentText : theme.colors.ink}
            accessibilityElementsHidden
          />
        </Pressable>
      </View>

      <View style={styles.cardBody}>
        <AppText variant="label" weight="bold" numberOfLines={2}>{name}</AppText>
        {subtitle ? (
          <AppText variant="body" numberOfLines={3}>{subtitle}</AppText>
        ) : null}
        {domain ? (
          <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>{domain}</AppText>
        ) : null}
        {visitUrl ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${t('aywebs.stores.visit')} — ${name}`}
            onPress={() => { Linking.openURL(visitUrl).catch(() => undefined); }}
            hitSlop={8}
            testID={`aywebs-store-visit-${store.id}`}
            style={[styles.visit, { flexDirection: rowDirectionFor(theme.isRTL) }]}
          >
            <Ionicons name="open-outline" size={16} color={theme.colors.accentText} accessibilityElementsHidden />
            <AppText variant="caption" weight="bold" color={theme.colors.accentText}>{t('aywebs.stores.visit')}</AppText>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  controls: { gap: 12, paddingTop: 12 },
  search: {
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
  },
  searchInput: { flex: 1, minHeight: 44, fontSize: 16 },
  actions: { alignItems: 'stretch' },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    minHeight: 96,
  },
  body: { gap: 24, paddingTop: 24, paddingBottom: 24 },
  section: { gap: 12 },
  gridRow: { flexDirection: 'row', alignItems: 'stretch' },
  gridPad: { flex: 1 },
  card: { flex: 1, gap: 8 },
  /** Réserve de 24 pt : le logo ne touche jamais le bord (aucune coupe). */
  cardMedia: {
    width: '100%',
    aspectRatio: MEDIA_RATIO.storeCard,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    overflow: 'hidden',
  },
  cardLogo: { width: '100%', height: '100%' },
  cardBody: { gap: 4 },
  visit: { alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 36, paddingVertical: 4 },
  heart: {
    position: 'absolute',
    top: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  categoryText: { flex: 1, gap: 2 },
  backRow: { alignItems: 'center', gap: 6, minHeight: 40 },
});
