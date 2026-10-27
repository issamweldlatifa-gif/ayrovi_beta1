/**
 * AYWEBs — page « Toutes les boutiques ».
 *
 * ── Décision du client (28/10/2026) ─────────────────────────────────────────
 * « وقت ندخلو لصفحة متاجر، الأفضل: زر رجوع، عنوان All Stores، شريط بحث — بركة.
 *   المربّعات وكتيبة أخرى نحيها. »
 *
 * Autrement dit : **retour + titre + recherche + la liste**, rien d'autre. Les
 * deux tuiles (« Browse by Category », « Store List ») et le bloc « Saved
 * Stores » ont été RETIRÉS — pas déplacés. Le cœur reste sur chaque carte
 * (les boutiques enregistrées restent enregistrées, et se retrouvent par la
 * recherche), mais la page n'ouvre plus de section pour les annoncer.
 *
 * La recherche porte sur le NOM et le domaine de la boutique, côté appareil,
 * sur le catalogue du serveur : aucune boutique codée en dur ici.
 */
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { MEDIA_RATIO, RADIUS } from '@/design/tokens.mobile';
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
  chunkRows, filterStoresByQuery, normalizeSearchText,
  storeDisplayName, storeDomain, storeSubtitle, storeVisitUrl,
  type StoresLocale,
} from '@/features/aywebs/storesCatalog';

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
  const searching = normalizeSearchText(query).length > 0;
  /** La page n'a qu'une liste : effacer la recherche ramène à tout le catalogue. */
  const changeQuery = (text: string) => setQuery(text);
  const found = searching ? filterStoresByQuery(stores, query) : stores;

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

  let body: ReactNode;
  if (catalog.isPending) {
    body = <LoadingBlock labelKey="loading.stores" />;
  } else if (catalog.isError) {
    body = <ErrorBlock error={catalog.error} onRetry={() => catalog.refetch()} />;
  } else if (found.length > 0) {
    body = <View style={styles.section} testID="aywebs-stores-grid">{renderGrid(found)}</View>;
  } else if (searching) {
    body = (
      <View style={styles.section}>
        <EmptyBlock>
          <AppText variant="body" align="center">{t('aywebs.stores.noneFound')}</AppText>
        </EmptyBlock>
        <Button label={t('aywebs.stores.clear')} tone="quiet" block onPress={() => changeQuery('')} />
      </View>
    );
  } else {
    body = (
      <EmptyBlock>
        <AppText variant="body" align="center">{t('aywebs.stores.noStores')}</AppText>
      </EmptyBlock>
    );
  }

  return (
    <>
      <View style={styles.controls}>
        <View style={[styles.search, { flexDirection: rowDirectionFor(theme.isRTL), borderColor: theme.colors.ink, backgroundColor: theme.colors.surface }]}>
          <Ionicons name="search-outline" size={theme.iconSize.sm} color={theme.colors.muted} accessibilityElementsHidden />
          <TextInput
            value={query}
            onChangeText={changeQuery}
            placeholder={t('aywebs.stores.search')}
            placeholderTextColor={theme.colors.muted}
            accessibilityLabel={t('aywebs.stores.search')}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={[styles.searchInput, theme.text('body'), { color: theme.colors.ink, textAlign: theme.isRTL ? 'right' : 'left' }]}
            testID="aywebs-stores-search"
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('aywebs.stores.clear')}
              onPress={() => changeQuery('')}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={theme.iconSize.sm} color={theme.colors.muted} accessibilityElementsHidden />
            </Pressable>
          ) : null}
        </View>

      </View>

      <View style={styles.body}>
        {body}
      </View>
    </>
  );
}

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
        { opacity: enabled ? (pressed ? theme.opacity.dimmed : 1) : theme.opacity.disabled },
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
            /* Même règle qu'à l'accueil : la carte-logo 3:4 remplit la plaque
               bord à bord ; un fichier serveur garde ses proportions. */
            contentFit={brand ? 'cover' : 'contain'}
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
            size={theme.iconSize.sm}
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
            <Ionicons name="open-outline" size={theme.iconSize.xs} color={theme.colors.accentText} accessibilityElementsHidden />
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
    borderRadius: RADIUS.full,
    paddingHorizontal: 16,
  },
  searchInput: { flex: 1, minHeight: 44 },
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
    borderRadius: RADIUS.lg,
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
