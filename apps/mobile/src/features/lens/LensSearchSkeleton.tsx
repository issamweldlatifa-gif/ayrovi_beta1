import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Skeleton } from '@/design/skeleton';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';

const GRID_PADDING = 12;
const GRID_GAP = 10;

function ProductSkeleton({ index }: { index: number }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const mediaHeight = Math.max(1, ((width - GRID_PADDING * 2 - GRID_GAP) / 2) * 5 / 4);
  return (
    <View
      testID={`lens-skeleton-card-${index}`}
      style={[styles.card, { borderColor: theme.colors.line, borderRadius: theme.radius.card }]}
    >
      <Skeleton height={mediaHeight} radius={0} />
      <View style={styles.copy}>
        <Skeleton height={13} width="45%" />
        <Skeleton height={18} width="88%" />
        <Skeleton height={12} width="70%" />
        <Skeleton height={12} width="58%" />
        <Skeleton height={14} width="48%" />
        <View style={[styles.optionRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
          <Skeleton height={28} width={38} radius={theme.radius.xs} />
          <Skeleton height={28} width={38} radius={theme.radius.xs} />
          <Skeleton height={28} width={38} radius={theme.radius.xs} />
        </View>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, paddingTop: 8 },
  card: { width: '48.4%', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  copy: { gap: 8, padding: 10 },
  optionRow: { flexDirection: 'row', gap: 6 },
  cancel: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  cancelText: { textDecorationLine: 'underline' },
});
