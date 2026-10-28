/**
 * AYWEBs — accueil : TROIS sections, dans cet ordre, et rien de plus.
 *
 *   1. « Explorer par catégorie » — six grandes cartes carrées, libellé SOUS
 *      la carte (jamais dans la photo, jamais tronqué) ;
 *   2. « Sponsorisé » — visuel éditorial, titre, sous-titre, bouton contour ;
 *   3. « Explorer les boutiques » — quatre grandes cartes carrées. Le titre de
 *      la section porte le chevron qui mène à la liste complète ; la barre
 *      « Toutes les boutiques » qui doublait cette entrée est supprimée
 *      (28/10/2026 : « احذف البار، مبقاش نحبو بان »).
 *
 * ── D'où viennent les formes ────────────────────────────────────────────────
 * Rien n'est réinventé ici : les tailles de texte viennent de `theme.text()`
 * (échelle officielle 12 · 14 · 16 · 18 · 28 · 40), les rayons de
 * `theme.radius` (8 · 12 · 16 · 24 · 999), les espacements de `theme.space`,
 * les icônes sont celles de l'application (Ionicons, même famille partout) et
 * le violet reste `theme.colors`. Le code ne contient aucun nombre magique de
 * couleur ou de typographie.
 *
 * ── Le visuel de campagne ───────────────────────────────────────────────────
 * `campaign-fetes.jpg` est un visuel éditorial STATIQUE, comme les photos de
 * catégories : il ne prétend pas décrire une boutique réelle. Le numéro de la
 * section (« 364 ») et les boutiques, eux, viennent tous du serveur.
 *
 * ── Recherche ───────────────────────────────────────────────────────────────
 * Le champ de recherche reste sur la page : dès qu'il contient du texte, les
 * trois sections laissent la place aux résultats (mêmes cartes, même grille).
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { MEDIA_RATIO, RADIUS } from '@/design/tokens.mobile';
import { AppImage } from '@/design/appImage';
import { mediaUrl } from '@/api/client';
import { useI18n } from '@/i18n';
import type { AyWebsCategory, AyWebsStore } from '@/api/aywebs';
import { useSessionId } from '@/session/session';
import { storeEntryTarget } from '@/features/aywebs/storeEntry';
import { useSavedStoreIds } from '@/features/aywebs/savedStores';
import { rememberAyWebsVisit } from '@/features/aywebs/lastVisitedStore';
import {
  categoryLabel, filterStoresByQuery,
  storeDisplayName, storeSubtitle, storesInCategory,
} from '@/features/aywebs/storesCatalog';
import type { StoresCatalogQuery } from '@/features/aywebs/StoresContent';
import { storeLogoSources } from '@/features/aywebs/storeLogos';
import { EDITORIAL_CATEGORIES, editorialCategory } from '@/features/aywebs/editorialCategories';

/**
 * Photos de catégories embarquées (art statique de l'application).
 *
 * Vignettes du studio pour la mode, la chaussure et le high-tech ; **photos
 * réelles** fournies par le client le 27/10/2026 pour beauté, maison, audio —
 * et pour trois familles que le catalogue ne publie pas encore (sport, plein
 * air, animalerie) : leurs visuels sont prêts, la tuile n'apparaît que si le
 * serveur publie la catégorie correspondante.
 */
const CATEGORY_ART = {
  electronics: require('../../../assets/aywebs/category-electronics.jpg'),
  fashion: require('../../../assets/aywebs/category-fashion.jpg'),
  beauty: require('../../../assets/aywebs/cat-beauty.jpg'),
  audio: require('../../../assets/aywebs/cat-audio.jpg'),
  shoes: require('../../../assets/aywebs/category-shoes.jpg'),
  home: require('../../../assets/aywebs/cat-home.jpg'),
  sports: require('../../../assets/aywebs/cat-sports.jpg'),
  outdoor: require('../../../assets/aywebs/cat-outdoor.jpg'),
  pets: require('../../../assets/aywebs/cat-pets.jpg'),
} as const;

/** Visuel éditorial du bloc « Sponsorisé » (art statique, sans marque tierce). */
const SPONSOR_ART = require('../../../assets/aywebs/campaign-fetes.jpg');

type CategoryArtKey = keyof typeof CATEGORY_ART;

/**
 * Photo de chaque catégorie de la section 1, par IDENTIFIANT.
 *
 * La reconnaissance par mots-clés plus bas sert de filet pour les catégories
 * que le client publierait un jour ; les six tuiles de l'accueil, elles, sont
 * nommées ici, sans deviner : « audio » ne doit jamais tomber sur le visuel de
 * la maison parce qu'un libellé arabe contient un mot proche.
 */
const EDITORIAL_ART: Readonly<Record<string, CategoryArtKey>> = {
  beauty: 'beauty',
  home: 'home',
  sports: 'sports',
  audio: 'audio',
  outdoor: 'outdoor',
  pets: 'pets',
};
type IconName = keyof typeof Ionicons.glyphMap;
const CATEGORY_FALLBACK_ICON: IconName = 'pricetag-outline';

/** Repli quand une photo ne peut pas s'afficher : une icône, jamais un trou. */
const CATEGORY_ICON: Readonly<Record<CategoryArtKey, IconName>> = {
  electronics: 'phone-portrait-outline',
  fashion: 'shirt-outline',
  beauty: 'sparkles-outline',
  audio: 'headset-outline',
  shoes: 'footsteps-outline',
  home: 'home-outline',
  sports: 'barbell-outline',
  outdoor: 'trail-sign-outline',
  pets: 'paw-outline',
};

function categoryArt(category: AyWebsCategory): { source?: number; icon: IconName } {
  const named = EDITORIAL_ART[category.id];
  if (named) return { source: CATEGORY_ART[named], icon: CATEGORY_ICON[named] };
  const key = `${category.id} ${category.labelFr} ${category.labelAr}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  /* L'ordre compte : la première famille reconnue gagne. « Sports et loisirs »
     n'est pas « chaussures », et « Animalerie » ne tombe dans aucune autre. */
  const matches: Array<[CategoryArtKey, RegExp, IconName]> = [
    ['pets', /animal|animaux|pet\b|pets|حيوان|حيوانات/, 'paw-outline'],
    ['sports', /sport|fitness|loisir|gym|رياض|رياضة/, 'barbell-outline'],
    ['outdoor', /outdoor|plein.?air|randonn|nature|camping|خارج|هواء/, 'trail-sign-outline'],
    ['electronics', /electr|tech|informat|الكترون|إلكترون/, 'phone-portrait-outline'],
    ['fashion', /fashion|mode|vetement|clothing|ملابس|موض/, 'shirt-outline'],
    ['beauty', /beaut|cosmet|soin|parfum|جمال|تجميل|عطر/, 'sparkles-outline'],
    ['audio', /audio|sound|son|headphone|casque|ecouteur|صوت|سماعات/, 'headset-outline'],
    ['shoes', /shoe|chauss|footwear|حذاء|احذي|أحذي/, 'footsteps-outline'],
    ['home', /home|maison|meuble|deco|furniture|منزل|ديكور|أثاث/, 'home-outline'],
  ];
  const match = matches.find(([, pattern]) => pattern.test(key));
  return match
    ? { source: CATEGORY_ART[match[0]], icon: match[2] }
    : { icon: CATEGORY_FALLBACK_ICON };
}

function storeTarget(store: AyWebsStore) {
  return storeEntryTarget(store);
}

/** Deux colonnes : la carte occupe un peu moins de la moitié de la colonne utile. */
const HALF = '48%';
const GRID_GAP = 12;

export function AyWebsHomeContent({ catalog }: { catalog: StoresCatalogQuery }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const lang = locale === 'ar' ? 'ar' : 'fr';
  const sessionId = useSessionId();
  const saved = useSavedStoreIds();
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const stores = catalog.data?.stores ?? [];
  const categories = catalog.data?.categories ?? [];

  /**
   * Les six catégories de la section 1 — ORDRE ÉDITORIAL, pas un tri par
   * nombre de boutiques (décision du 27/10/2026, capture de référence + six
   * photos). Le libellé vient du serveur quand il le publie ; sinon du repli
   * local, jamais de l'identifiant technique.
   */
  const categoryTiles = useMemo(
    () => EDITORIAL_CATEGORIES.map((entry) => editorialCategory(entry, categories, lang)),
    [categories, lang],
  );

  const matchingStores = useMemo(() => filterStoresByQuery(stores, search), [search, stores]);
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const categoryStores = selectedCategory ? storesInCategory(stores, selectedCategory.id) : [];
  /** Les quatre grandes cartes de la section 3 : catégorie choisie, sinon les plus connues. */
  const popularStores = stores.filter((store) => store.popular);
  const featuredStores = (selectedCategoryId
    ? categoryStores
    : (popularStores.length >= 4 ? popularStores : stores)
  ).slice(0, 4);

  const searching = search.trim().length > 0;
  const sectionTitle = searching
    ? t('aywebs.home.searchResults')
    : selectedCategory
      ? categoryLabel(selectedCategory, lang)
      : t('aywebs.home.exploreStores');

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

  const openAllStores = () => router.push('/aywebs/stores');

  const toggleCategory = (categoryId: string) => {
    setSelectedCategoryId((current) => (current === categoryId ? null : categoryId));
  };

  const gridStores = searching ? matchingStores : featuredStores;

  return (
    <View testID="aywebs-home-content" style={styles.content}>
      {/* ── Recherche : pastille contour, jamais un aplat de couleur ──────── */}
      <View
        style={[
          styles.search,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.line,
            flexDirection: rowDirectionFor(theme.isRTL),
          },
        ]}
      >
        <Ionicons name="search-outline" size={theme.iconSize.sm} color={theme.colors.muted} accessibilityElementsHidden />
        <TextInput
          value={search}
          onChangeText={(value) => { setSearch(value); setSelectedCategoryId(null); }}
          placeholder={t('aywebs.home.search')}
          placeholderTextColor={theme.colors.muted}
          accessibilityLabel={t('aywebs.home.search')}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={[styles.searchInput, theme.text('body'), { color: theme.colors.ink, textAlign: theme.isRTL ? 'right' : 'left' }]}
          testID="aywebs-home-search"
        />
        {searching ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('aywebs.stores.clear')}
            onPress={() => { setSearch(''); setSelectedCategoryId(null); }}
            hitSlop={8}
            style={styles.searchClear}
            testID="aywebs-home-search-clear"
          >
            <Ionicons name="close-circle" size={theme.iconSize.sm} color={theme.colors.muted} accessibilityElementsHidden />
          </Pressable>
        ) : null}
      </View>

      {/* ── 1. Explorer par catégorie ─────────────────────────────────────── */}
      {!searching ? (
        <View style={styles.section} testID="aywebs-home-section-categories">
          {/* Pas de point d'entrée tant que l'écran des catégories n'existe pas. */}
          <SectionTitle
            title={t('aywebs.home.categories')}
            accessibilityLabel={t('aywebs.home.categories')}
          />
          {/* Les six photos sont EMBARQUÉES : la section n'attend pas le réseau,
              et elle affiche donc toujours les mêmes six cartes, dans le même
              ordre. Un squelette ici ne servirait qu'à faire clignoter l'écran. */}
          <View style={styles.grid}>
            {categoryTiles.map((category) => (
              <CategoryTile
                key={category.id}
                category={category}
                selected={selectedCategoryId === category.id}
                onPress={() => toggleCategory(category.id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* ── 2. Sponsorisé ─────────────────────────────────────────────────── */}
      {!searching ? (
        <View style={styles.section} testID="aywebs-home-section-sponsor">
          <View style={[styles.sponsorLabel, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
            <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.home.sponsor')}</AppText>
            <Ionicons
              name="information-circle-outline"
              size={theme.iconSize.xs}
              color={theme.colors.muted}
              accessibilityElementsHidden
            />
          </View>
          <AppImage
            localSource={SPONSOR_ART}
            contentFit="cover"
            accessibilityLabel={t('aywebs.home.sponsorTitle')}
            style={[styles.sponsorArt, { borderRadius: theme.radius.card }]}
            testID="aywebs-home-sponsor-art"
          />
          <AppText variant="title" weight="bold" style={styles.sponsorTitle}>
            {t('aywebs.home.sponsorTitle')}
          </AppText>
          <AppText variant="body" color={theme.colors.muted}>
            {t('aywebs.home.sponsorSubtitle')}
          </AppText>
          <Button
            tone="quiet"
            block
            label={t('aywebs.home.sponsorCta')}
            onPress={openAllStores}
            testID="aywebs-home-sponsor-cta"
          />
        </View>
      ) : null}

      {/* ── 3. Explorer les boutiques ─────────────────────────────────────── */}
      <View style={styles.section} testID="aywebs-home-section-stores">
        <SectionTitle title={sectionTitle} accessibilityLabel={sectionTitle} onPress={openAllStores} />
        {catalog.isPending ? (
          <View style={styles.grid}>
            {Array.from({ length: 4 }, (_, index) => (
              <View key={index} style={styles.tile}>
                <View style={[styles.tileMedia, { backgroundColor: theme.colors.shimmer, borderRadius: theme.radius.card }]} />
              </View>
            ))}
          </View>
        ) : catalog.isError ? (
          <AppText variant="caption" color={theme.status.danger.fg}>{t('aywebs.stores.loadFailed')}</AppText>
        ) : gridStores.length > 0 ? (
          <View style={styles.grid}>
            {gridStores.map((store) => (
              <StoreTile
                key={store.id}
                store={store}
                categories={categories}
                saved={saved.ids.includes(store.id)}
                onOpen={() => openStore(store)}
                onToggle={() => saved.toggle(store.id)}
              />
            ))}
          </View>
        ) : (
          <AppText variant="body" color={theme.colors.muted}>
            {searching ? t('aywebs.home.noSearchResults') : t('aywebs.stores.noStores')}
          </AppText>
        )}
      </View>
    </View>
  );
}

/**
 * Titre de section : échelle `title` (28) en gras — la taille mesurée sur la
 * référence du client (titre 561 px pour une tuile de 324 px ⇒ 310 pt à
 * l'échelle de l'application, soit exactement 28 dans Zalando Sans Bold).
 *
 * Le chevron n'apparaît QUE si la section mène quelque part (`onPress`).
 * « Explorer les catégories » n'a pas encore d'écran dédié : elle s'affiche
 * donc sans entrée, plutôt qu'avec une flèche qui ne mène nulle part — une
 * promesse non tenue se paie plus cher qu'une entrée manquante.
 */
function SectionTitle({ title, accessibilityLabel, onPress }: {
  title: string;
  accessibilityLabel: string;
  /** Absent = section sans point d'entrée (titre seul). */
  onPress?: () => void;
}) {
  const theme = useTheme();
  const content = (
    <>
      <AppText variant="title" weight="bold" style={styles.sectionTitleText}>{title}</AppText>
      {onPress ? (
        <Ionicons
          name={theme.isRTL ? 'chevron-back' : 'chevron-forward'}
          size={theme.iconSize.sm}
          color={theme.colors.ink}
          accessibilityElementsHidden
        />
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={[styles.sectionTitle, { flexDirection: rowDirectionFor(theme.isRTL) }]} testID="aywebs-section-title">
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sectionTitle,
        { flexDirection: rowDirectionFor(theme.isRTL), opacity: pressed ? theme.opacity.subtle : 1 },
      ]}
      testID="aywebs-section-title"
    >
      {content}
    </Pressable>
  );
}

/**
 * Carte de catégorie : PAYSAGE (ratio `categoryCard`), photo bord à bord,
 * libellé SOUS la carte — la forme de la référence du 27/10/2026.
 */
function CategoryTile({ category, selected, onPress }: {
  category: AyWebsCategory;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { locale } = useI18n();
  const label = categoryLabel(category, locale === 'ar' ? 'ar' : 'fr');
  const artwork = categoryArt(category);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={`aywebs-home-category-${category.id}`}
      style={({ pressed }) => [styles.tile, { opacity: pressed ? theme.opacity.dimmed : 1 }]}
    >
      <View
        testID={`aywebs-home-category-media-${category.id}`}
        style={[
          styles.categoryMedia,
          {
            backgroundColor: theme.colors.shimmer,
            borderRadius: theme.radius.md,
            borderColor: selected ? theme.colors.accent : 'transparent',
            borderWidth: selected ? 2 : 0,
          },
        ]}
      >
        {artwork.source ? (
          <AppImage
            localSource={artwork.source}
            contentFit="cover"
            accessibilityLabel={label}
            testID={`aywebs-home-category-image-${category.id}`}
            style={styles.imageFill}
          />
        ) : (
          <Ionicons name={artwork.icon} size={theme.iconSize.lg} color={theme.colors.muted} accessibilityElementsHidden />
        )}
      </View>
      {/* 16 pt régulier, comme la référence : un libellé, pas un titre. Pas de
          `numberOfLines` — un nom long passe à la ligne plutôt que d'être coupé. */}
      <AppText variant="body">{label}</AppText>
    </Pressable>
  );
}

/** Carte de boutique : carré, visuel de sa catégorie, cœur posé dessus, libellé dessous. */
function StoreTile({ store, categories, saved, onOpen, onToggle }: {
  store: AyWebsStore;
  categories: AyWebsCategory[];
  saved: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const name = storeDisplayName(store);
  const tagline = storeSubtitle(store, categories, locale === 'ar' ? 'ar' : 'fr');
  const logo = mediaUrl(store.logo);
  /* Logo OFFICIEL embarqué (27/10/2026) : il passe avant le fichier serveur,
     qui n'a jamais été servi. PNG transparent → il se pose sur la plaque du
     design system ; seule une marque en couleur impose sa plaque. */
  const brand = storeLogoSources(store, theme.mode);
  /* Le fichier `/stores/<id>.png` du serveur n'existe pas encore : s'il échoue,
     on montre l'initiale plutôt qu'un cadre d'image cassée. */
  const [remoteFailed, setRemoteFailed] = useState(false);
  const sessionId = useSessionId();
  const enabled = Boolean(storeTarget(store) && sessionId);
  return (
    <View style={styles.tile} testID={`aywebs-home-store-card-${store.id}`}>
      <View
        style={[
          styles.storeMedia,
          {
            backgroundColor: brand?.plate ?? theme.colors.shimmer,
            borderRadius: theme.radius.card,
          },
        ]}
        testID={`aywebs-home-store-media-${store.id}`}
      >
        {(brand || logo) && !remoteFailed ? (
          <AppImage
            uri={logo}
            localSource={brand?.source}
            onError={() => setRemoteFailed(true)}
            /* Les cartes-logo sont dessinées en 3:4 exactement comme la plaque :
               `cover` les fait toucher les quatre bords, sans bande grise ni
               blanche. Un logo serveur d'un autre format reste en `contain`. */
            contentFit={brand ? 'cover' : 'contain'}
            accessibilityLabel={name}
            style={styles.imageFill}
            testID={`aywebs-home-store-logo-${store.id}`}
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
          style={[
            styles.tileHeart,
            theme.isRTL ? { left: 8 } : { right: 8 },
            { backgroundColor: theme.colors.surface },
          ]}
          testID={`aywebs-home-store-save-${store.id}`}
        >
          <Ionicons
            name={saved ? 'heart' : 'heart-outline'}
            size={theme.iconSize.sm}
            color={saved ? theme.colors.accentText : theme.colors.ink}
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
        style={({ pressed }) => ({ opacity: pressed ? theme.opacity.dimmed : 1 })}
      >
        <AppText variant="label" weight="bold">{name}</AppText>
        {tagline ? <AppText variant="caption" color={theme.colors.muted}>{tagline}</AppText> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Les sections respirent : 32 entre elles, 12 à l'intérieur (échelle officielle).
  content: { gap: 32, paddingBottom: 24 },
  search: {
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.full,
    paddingHorizontal: 16,
  },
  searchInput: { flex: 1, minHeight: 46 },
  searchClear: { padding: 2 },
  section: { gap: 12 },
  sectionTitle: { alignItems: 'center', justifyContent: 'space-between', minHeight: 36, gap: 8 },
  sectionTitleText: { flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: GRID_GAP },
  tile: { width: HALF, gap: 8 },
  /**
   * Deux plaques différentes, et c'est volontaire :
   *  • `tileMedia` (CATÉGORIE) montre une PHOTO : elle remplit la plaque bord à
   *    bord. Y mettre une réserve laissait une photo de 128 pt au milieu d'un
   *    cadre de 176 — un cadre gris autour de rien (constaté le 27/10/2026).
   *  • `storeMedia` (BOUTIQUE) montre un LOGO : 24 pt de réserve, sinon un
   *    mot-symbole large touche le bord. Le logo reste en `contain`.
   */
  tileMedia: {
    width: '100%',
    aspectRatio: MEDIA_RATIO.square,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Carte de catégorie : paysage 2,72:1 (référence du 27/10/2026). */
  categoryMedia: {
    width: '100%',
    aspectRatio: MEDIA_RATIO.categoryCard,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeMedia: {
    width: '100%',
    aspectRatio: MEDIA_RATIO.storeCard,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFill: { width: '100%', height: '100%' },
  tileHeart: {
    position: 'absolute',
    top: 8,
    width: 36,
    height: 36,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sponsorLabel: { alignItems: 'center', gap: 4 },
  sponsorArt: { width: '100%', aspectRatio: 16 / 9 },
  sponsorTitle: { marginTop: 4 },
});
