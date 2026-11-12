import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { LensShimmer as Skeleton } from './LensShimmer';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import type { LensStreamProgress } from '@/api/lensStream';
import { useProductDensity } from '@/design/ProductGridBar';
import { PRODUCT_TILE, productTileMetrics, type ProductTileMetrics } from '@/design/productTile';
import { LENS_COLORS } from './lensPalette';
import { LensProgressLine } from './LensProgressLine';
import { useLensSheetScroll } from './lensSheetScroll';


/** Cotes du squelette : celles de la vraie carte, à la largeur de l'écran et à l'affichage choisi. */
function useSkeletonMetrics(): ProductTileMetrics {
  const window = useWindowDimensions();
  const { density } = useProductDensity();
  return productTileMetrics({ width: window.width, density, fontScale: window.fontScale });
}

/**
 * Carte d'attente : EXACTEMENT la boîte de la carte réelle (`ProductTile`,
 * 13/11/2026) — même largeur, même photo 2/3, mêmes lignes à la même hauteur —
 * pour que rien ne saute à l'arrivée des résultats. Une barre par ligne.
 */
export function ProductSkeleton({ index, metrics }: { index: number; metrics?: ProductTileMetrics }) {
  const fallback = useSkeletonMetrics();
  const tile = metrics ?? fallback;
  const bar = (key: string, line: number, height: number, width: `${number}%`) => (
    <View key={key} style={[styles.line, { height: line }]}>
      <Skeleton color={LENS_COLORS.skeleton} minOpacity={0.48} height={height} width={width} />
    </View>
  );
  return (
    <View testID={`lens-skeleton-card-${index}`} style={[styles.card, { width: tile.cardWidth, height: tile.height }]}>
      <Skeleton color={LENS_COLORS.skeleton} minOpacity={0.48} height={tile.mediaHeight} radius={0} />
      <View style={[styles.copy, { height: tile.textHeight, paddingHorizontal: tile.inset }]}>
        {bar('brand', tile.lines.brand, 12, '45%')}
        {bar('name', tile.lines.name, 10, '88%')}
        {bar('meta', tile.lines.meta, 10, '58%')}
        {bar('price', tile.lines.price, 14, '40%')}
      </View>
    </View>
  );
}

/** Structure exacte des résultats pendant la recherche — aucun faux contenu. */
export function LensSearchSkeleton({
  onCancel,
  title,
  progress,
}: {
  onCancel: () => void;
  title?: string;
  /** Étape d'avancement (flux du serveur) : « Produit identifié », « Lecture 4/8 »… */
  progress?: LensStreamProgress | null;
}) {
  const theme = useTheme();
  const t = useT();
  const onSheetScroll = useLensSheetScroll();
  const metrics = useSkeletonMetrics();
  return (
    <View style={styles.wrap} testID="lens-search-skeleton">
      <View style={[styles.header, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
        <AppText variant="h3" numberOfLines={2} style={styles.title}>{title || t('lens.resultsTitle')}</AppText>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          testID="lens-search-cancel"
          style={({ pressed }) => [styles.cancel, { opacity: pressed ? theme.opacity.subtle : 1 }]}
        >
          <AppText variant="label" align="center" color={theme.colors.ink} style={styles.cancelText}>
            {t('common.cancel')}
          </AppText>
        </Pressable>
      </View>
      <AppText color={theme.colors.muted}>{t('lens.searchingFriendly')}</AppText>
      {/* L'avancement : une phrase honnête, pas un pourcentage inventé. */}
      {progress ? (
        <View style={styles.progress} testID="lens-search-skeleton-progress">
          <LensProgressLine progress={progress} />
        </View>
      ) : null}
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={onSheetScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.grid, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
          {[0, 1, 2, 3].map((index) => <ProductSkeleton key={index} index={index} metrics={metrics} />)}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 8, paddingHorizontal: 0, paddingBottom: 24 },
  header: { minHeight: 48, alignItems: 'center', gap: 8 },
  title: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  // Même grille que les résultats : bord à bord, filet de 4 entre colonnes, rangées jointives.
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: PRODUCT_TILE.columnGap, rowGap: PRODUCT_TILE.rowGap, paddingTop: 8, backgroundColor: LENS_COLORS.white },
  card: { overflow: 'hidden', backgroundColor: LENS_COLORS.white },
  // La rangée des points reste vide (rien à compter avant les photos) mais garde sa place.
  copy: { paddingTop: PRODUCT_TILE.dotsTop + PRODUCT_TILE.dot + PRODUCT_TILE.dotsBottom, paddingBottom: PRODUCT_TILE.bottom },
  line: { justifyContent: 'center' },
  cancel: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  cancelText: { textDecorationLine: 'underline' },
  progress: { paddingHorizontal: 4, paddingBottom: 4 },
});
