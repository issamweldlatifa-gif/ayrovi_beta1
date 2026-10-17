import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { LensCandidate } from '@/api/lens';
import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import { LensResultCard } from './LensResultCard';
import { LENS_COLORS } from './lensPalette';
import { useLensSheetScroll } from './lensSheetScroll';

export function LensResultsGrid({
  candidates,
  favorited,
  favoriteNote,
  onOpen,
  onFavorite,
  onNewSearch,
  title,
}: {
  candidates: LensCandidate[];
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

  if (candidates.length === 0) {
    return (
      <View style={styles.empty} testID="lens-empty-results">
        <View style={styles.emptyIcon}>
          <Ionicons name="search-outline" size={theme.iconSize.lg} color={theme.colors.ink} accessibilityElementsHidden />
        </View>
        <AppText variant="title" align="center">{t('lens.emptyTitle')}</AppText>
        <AppText color={theme.colors.muted} align="center">{t('lens.empty')}</AppText>
        <Button label={t('lens.retake')} onPress={onNewSearch} block />
      </View>
    );
  }

  return (
    <FlatList
      testID="lens-results-grid"
      data={candidates}
      style={styles.list}
      numColumns={2}
      keyExtractor={(candidate) => candidate.sourceUrl || candidate.id}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onScroll={onSheetScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.content}
      columnWrapperStyle={[styles.row, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}
      initialNumToRender={6}
      maxToRenderPerBatch={6}
      windowSize={7}
      removeClippedSubviews
      ListHeaderComponent={(
        <View style={styles.header}>
          <View style={[styles.headerRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
            <View style={styles.headerCopy}>
              <AppText variant="title" weight="bold" numberOfLines={2}>{title || t('lens.resultsTitle')}</AppText>
              <AppText variant="caption" color={theme.colors.muted}>
                {t(candidates.length === 1 ? 'lens.resultsCountOne' : 'lens.resultsCountMany', { count: candidates.length })}
              </AppText>
            </View>
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
        </View>
      )}
      renderItem={({ item }) => (
        <View style={styles.cell}>
          <LensResultCard
            candidate={item}
            favorite={favorited[item.sourceUrl] === true}
            onOpen={onOpen}
            onFavorite={onFavorite}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 32, gap: 4 },
  row: { gap: 4, alignItems: 'stretch', backgroundColor: LENS_COLORS.white },
  cell: { flex: 1, minWidth: 0, marginBottom: 4 },
  header: { gap: 8, paddingHorizontal: 8, paddingTop: 2, paddingBottom: 12 },
  headerRow: { alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, gap: 2 },
  newSearch: { width: 48, height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 48 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
