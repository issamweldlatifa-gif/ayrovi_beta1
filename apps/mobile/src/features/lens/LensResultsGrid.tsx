import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { LensCandidate } from '@/api/lens';
import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import { ProductDensityToggle, useProductDensity } from '@/design/ProductGridBar';
import { PRODUCT_TILE, productTileInitialRows, productTileMetrics } from '@/design/productTile';
import { LensResultCard } from './LensResultCard';
import { ProductSkeleton } from './LensSearchSkeleton';
import { LensTitleFilter } from './LensTitleFilter';
import { lensOpenDecision } from './lensOpen';
import { LENS_COLORS } from './lensPalette';
import { applyLensFilters } from './lensRanking';
import { useLensSheetScroll } from './lensSheetScroll';

export function LensResultsGrid({
  candidates,
  favorited,
  favoriteNote,
  onOpen,
  onFavorite,
  onNewSearch,
  title,
  loading = false,
}: {
  candidates: LensCandidate[];
  loading?: boolean;
  excluded?: number;
  favorited: Record<string, true>;
  favoriteNote: TranslationKey | null;
  onOpen: (candidate: LensCandidate) => void;
  onFavorite: (candidate: LensCandidate) => void;
  onNewSearch: () => void;
  /** Nom du produit choisi par le cadre de Z Lens (sinon « Produits similaires »). */
  title?: string;
}) {
  const theme = useTheme();
  const t = useT();
  // Position de défilement remontée à la feuille : tout en haut, un glissement
  // vers le bas baisse la feuille au lieu de faire défiler la liste.
  const onSheetScroll = useLensSheetScroll();
  /**
   * Le filtre (28/10/2026) : UN champ, sur le TITRE du produit. L'état vit
   * ICI, pas dans l'écran — une nouvelle recherche remonte une grille neuve
   * (clé différente en amont), donc le filtre repart de zéro avec les nouveaux
   * résultats, c'est voulu. L'ordre, lui, n'est pas un réglage : il applique
   * toujours la confiance marchande (`lensRanking.ts`).
   */
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  /**
   * Cotes de la grille (13/11/2026, `@/design/productTile.ts`) : calculées UNE
   * fois pour toutes les cartes — même hauteur, lignes alignées — à la largeur
   * réelle de la feuille, en petites (2 col.) ou grandes photos (1 col.).
   */
  const window = useWindowDimensions();
  const { density, toggle } = useProductDensity();
  const [gridWidth, setGridWidth] = useState(window.width);
  const onGridLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) setGridWidth((current) => (Math.abs(current - width) > 0.5 ? width : current));
  }, []);
  const metrics = useMemo(
    () => productTileMetrics({ width: gridWidth, density, fontScale: window.fontScale }),
    [gridWidth, density, window.fontScale],
  );

  /* Seules les cartes portant un vrai lien marchand ouvrable dans AYWEBs sont affichées. */
  const openable = useMemo(
    () => candidates.filter((candidate) => lensOpenDecision(candidate).screen === 'browser'),
    [candidates],
  );
  const shown = useMemo(() => applyLensFilters(openable, query), [openable, query]);
  const filteredOut = shown.length !== openable.length;

  if (openable.length === 0 && !loading) {
    return (
      <View style={styles.empty} testID="lens-empty-results">
        <View style={styles.emptyIcon}>
          <Ionicons name="search-outline" size={theme.iconSize.lg} color={theme.colors.ink} accessibilityElementsHidden />
        </View>
        <AppText variant="h3" align="center">{t('lens.emptyTitle')}</AppText>
        <AppText color={theme.colors.muted} align="center">{t('lens.empty')}</AppText>
        <Button label={t('lens.retake')} onPress={onNewSearch} block />
      </View>
    );
  }

  return (
    <FlatList
      // numColumns ne change pas sur une liste montée : nouvelle clé par nombre de colonnes.
      key={`lens-grid-${metrics.columns}`}
      testID="lens-results-grid"
      data={shown}
      style={styles.list}
      onLayout={onGridLayout}
      numColumns={metrics.columns}
      stickyHeaderIndices={[0]}
      keyExtractor={(candidate) => candidate.sourceUrl || candidate.id}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onScroll={onSheetScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.content}
      columnWrapperStyle={metrics.columns > 1 ? [styles.row, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }] : undefined}
      initialNumToRender={productTileInitialRows(metrics.columns)}
      maxToRenderPerBatch={6}
      windowSize={7}
      removeClippedSubviews
      ListHeaderComponent={(
        <View style={styles.header}>
          <View style={[styles.headerRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
            <View style={styles.headerCopy}>
              <AppText variant="h3" numberOfLines={2}>{title || t('lens.resultsTitle')}</AppText>
              <AppText variant="caption" color={theme.colors.muted}>
                {t(candidates.length === 1 ? 'lens.resultsCountOne' : 'lens.resultsCountMany', { count: openable.length })}
              </AppText>
            </View>
            <ProductDensityToggle density={density} onToggle={toggle} color={LENS_COLORS.black} testID="lens-density-toggle" />
            <Pressable accessibilityRole="button" accessibilityLabel={t('lens.filters.title')} accessibilityState={{ expanded: filterOpen }} testID="lens-toggle-filter" onPress={() => setFilterOpen(value => !value)} style={styles.newSearch}><Ionicons name="options-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden /></Pressable>
            <Pressable
              onPress={onNewSearch}
              accessibilityRole="button"
              accessibilityLabel={t('lens.newSearch')}
              style={({ pressed }) => [styles.newSearch, { borderColor: theme.colors.lineControl, opacity: pressed ? theme.opacity.subtle : 1 }]}
              testID="lens-new-search"
            >
              <Ionicons name="camera-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
            </Pressable>
          </View>
          {favoriteNote ? (
            <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{t(favoriteNote)}</AppText>
          ) : null}
          {filterOpen ? <LensTitleFilter value={query} onChange={setQuery} shown={shown.length} total={openable.length} /> : null}
          {shown.length === 0 ? (
            <View style={styles.filteredEmpty} testID="lens-filters-empty">
              <AppText color={theme.colors.muted} align="center">{t('lens.filters.empty')}</AppText>
              <Button label={t('lens.filters.clear')} tone="quiet" onPress={() => setQuery('')} block />
            </View>
          ) : null}
        </View>
      )}
      renderItem={({ item }) => (
        <LensResultCard
          candidate={item}
          favorite={favorited[item.sourceUrl] === true}
          onOpen={onOpen}
          onFavorite={onFavorite}
          metrics={metrics}
        />
      )}
      ListFooterComponent={loading ? <View style={styles.pending} testID="lens-stream-pending"><ProductSkeleton index={4} metrics={metrics} /><ProductSkeleton index={5} metrics={metrics} /></View> : filteredOut && shown.length > 0 ? (
        <AppText variant="caption" color={theme.colors.muted} align="center" style={styles.footer} testID="lens-filters-active">
          {t('lens.resultsCountMany', { count: shown.length })} / {openable.length}
        </AppText>
      ) : null}
    />
  );
}

const styles = StyleSheet.create({
  pending: { flexDirection: 'row', flexWrap: 'wrap', gap: PRODUCT_TILE.columnGap },
  list: { flex: 1 },
  // Bord à bord, filet de 4 entre colonnes, aucun écart entre rangées (vidéo de référence, 13/11).
  content: { paddingHorizontal: PRODUCT_TILE.gridPadding, paddingTop: 0, paddingBottom: 32, gap: PRODUCT_TILE.rowGap },
  row: { gap: PRODUCT_TILE.columnGap, backgroundColor: LENS_COLORS.white },
  header: { backgroundColor: LENS_COLORS.white, gap: 8, paddingHorizontal: 8, paddingTop: 2, paddingBottom: 12 },
  headerRow: { alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, gap: 2 },
  newSearch: { width: 48, height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  filteredEmpty: { gap: 8, paddingVertical: 24, paddingHorizontal: 16 },
  footer: { paddingVertical: 8 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 48 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
