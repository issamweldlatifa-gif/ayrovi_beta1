import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Skeleton } from '@/design/skeleton';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { LENS_COLORS } from './lensPalette';

const GRID_PADDING = 4;
const GRID_GAP = 4;

function ProductSkeleton({ index }: { index: number }) {
  const { width } = useWindowDimensions();
  const mediaHeight = Math.max(1, ((width - GRID_PADDING * 2 - GRID_GAP) / 2) * 5 / 4);
  return (
    <View testID={`lens-skeleton-card-${index}`} style={styles.card}>
      <Skeleton color={LENS_COLORS.skeleton} minOpacity={0.48} height={mediaHeight} radius={0} />
      <View style={styles.copy}>
        <Skeleton color={LENS_COLORS.skeleton} minOpacity={0.48} height={13} width="45%" />
        <Skeleton color={LENS_COLORS.skeleton} minOpacity={0.48} height={18} width="88%" />
        <Skeleton color={LENS_COLORS.skeleton} minOpacity={0.48} height={12} width="70%" />
        <Skeleton color={LENS_COLORS.skeleton} minOpacity={0.48} height={12} width="58%" />
        <Skeleton color={LENS_COLORS.skeleton} minOpacity={0.48} height={14} width="48%" />
      </View>
    </View>
  );
}

/** Structure exacte des résultats pendant la recherche — aucun faux contenu. */
export function LensSearchSkeleton({ onCancel }: { onCancel: () => void }) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={styles.wrap} testID="lens-search-skeleton">
      <View style={[styles.header, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
        <AppText variant="title" weight="bold" style={styles.title}>{t('lens.resultsTitle')}</AppText>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          testID="lens-search-cancel"
          style={({ pressed }) => [styles.cancel, { opacity: pressed ? theme.opacity.subtle : 1 }]}
        >
          <AppText variant="label" weight="bold" align="center" color={theme.colors.ink} style={styles.cancelText}>
            {t('common.cancel')}
          </AppText>
        </Pressable>
      </View>
      <AppText color={theme.colors.muted}>{t('lens.searchingFriendly')}</AppText>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.grid, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
          {[0, 1, 2, 3].map((index) => <ProductSkeleton key={index} index={index} />)}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 8, paddingHorizontal: GRID_PADDING, paddingBottom: 24 },
  header: { minHeight: 48, alignItems: 'center', gap: 8 },
  title: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, paddingTop: 8, backgroundColor: LENS_COLORS.white },
  card: { width: '49.3%', overflow: 'hidden', backgroundColor: LENS_COLORS.white },
  copy: { gap: 8, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 12 },
  cancel: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  cancelText: { textDecorationLine: 'underline' },
});
