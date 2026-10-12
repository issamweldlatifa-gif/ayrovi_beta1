/**
 * سجل Lens والمراقبة في درج واحد: الآخر ما يصير صفحة منفصلة.
 *
 * «Mes surveillances» تفتح صفحة المراقبة الكاملة (قائمة طويلة تستحق صفحة)،
 * والشاشة تغلق الدرج قبل الانتقال حتى لا يبقى مفتوحاً عند العودة.
 */
import { StyleSheet, View } from 'react-native';

import type { LensHistoryEntry } from '@/api/lens';
import { AppText, Button, Card } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { LensDrawer } from '@/features/lens/LensDrawer';

export interface LensHistoryProps {
  entries: readonly LensHistoryEntry[];
  pending: boolean;
  error: unknown;
  failed: boolean;
  onRetry: () => void;
  onOpenWatches: () => void;
  onClose: () => void;
  onClosed: () => void;
  open: boolean;
}

export function LensHistory({
  entries, pending, error, failed, onRetry, onOpenWatches, onClose, onClosed, open,
}: LensHistoryProps) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <LensDrawer title={t('lens.historyTitle')} open={open} onClose={onClose} onClosed={onClosed}>
      {pending ? (
        <LoadingBlock labelKey="loading.generic" />
      ) : failed ? (
        <ErrorBlock error={error} onRetry={onRetry} />
      ) : entries.length === 0 ? (
        <EmptyBlock>{t('lens.historyEmpty')}</EmptyBlock>
      ) : (
        entries.map((entry) => (
          <View key={entry.id} style={[styles.row, { borderTopColor: theme.colors.line }]}>
            <AppText variant="label" numberOfLines={2}>{entry.title}</AppText>
            <AppText variant="caption" color={theme.colors.muted}>
              {entry.queryLabel || entry.source} · {entry.resultsCount}
            </AppText>
          </View>
        ))
      )}

      <Card title={t('lens.watchTitle')} hint={t('lens.watchHint')}>
        <Button label={t('lens.watchOpen')} tone="quiet" onPress={onOpenWatches} />
      </Card>
    </LensDrawer>
  );
}

const styles = StyleSheet.create({
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 2 },
});
