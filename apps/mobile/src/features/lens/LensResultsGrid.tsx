import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { refreshLiveStock, type LensCandidate } from '@/api/lens';
import { ApiError } from '@/api/errors';
import { AppText, Button, Card } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import { mergeLiveStock } from './productHydration';
import { LensResultCard } from './LensResultCard';

function rowsOfTwo(candidates: LensCandidate[]): LensCandidate[][] {
  const rows: LensCandidate[][] = [];
  for (let index = 0; index < candidates.length; index += 2) rows.push(candidates.slice(index, index + 2));
  return rows;
}

export function LensResultsGrid({
  candidates,
  excluded,
  favorited,
  favoriteNote,
  onOpen,
  onFavorite,
  onNewSearch,
}: {
  candidates: LensCandidate[];
  excluded: number;
  favorited: Record<string, true>;
  favoriteNote: TranslationKey | null;
  onOpen: (candidate: LensCandidate) => void;
  onFavorite: (candidate: LensCandidate) => void;
  onNewSearch: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const [items, setItems] = useState(candidates);
  const [busy, setBusy] = useState<Record<string, true>>({});
  const [stockError, setStockError] = useState<string | null>(null);
  const controllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear();
    setItems(candidates);
    setBusy({});
    setStockError(null);
    return () => {
      for (const controller of controllers.current.values()) controller.abort();
      controllers.current.clear();
    };
  }, [candidates]);

  const checkStock = useCallback(async (candidate: LensCandidate) => {
    if (controllers.current.has(candidate.sourceUrl)) return;
    const controller = new AbortController();
    controllers.current.set(candidate.sourceUrl, controller);
    setBusy((current) => ({ ...current, [candidate.sourceUrl]: true }));
    setStockError(null);
    try {
      const [live] = await refreshLiveStock([candidate.sourceUrl], candidate.title, controller.signal);
      if (!live || controller.signal.aborted) return;
      setItems((current) => current.map((item) => item.sourceUrl === candidate.sourceUrl ? mergeLiveStock(item, live) : item));
    } catch (error) {
      if (controller.signal.aborted) return;
      setStockError(error instanceof ApiError && error.message ? error.message : t('lens.product.stockFailed'));
    } finally {
      if (controllers.current.get(candidate.sourceUrl) === controller) {
        controllers.current.delete(candidate.sourceUrl);
        setBusy((current) => {
          const next = { ...current };
          delete next[candidate.sourceUrl];
          return next;
        });
      }
    }
  }, [t]);

  if (items.length === 0) {
    return (
      <Card>
        <AppText>{t('lens.empty')}</AppText>
        <Button label={t('lens.newSearch')} onPress={onNewSearch} block />
      </Card>
    );
  }

  return (
    <View style={styles.results}>
      <AppText variant="label" weight="bold">{t('lens.resultsTitle')}</AppText>
      {excluded > 0 ? (
        <AppText variant="caption" color={theme.colors.muted}>{t('lens.excluded', { count: excluded })}</AppText>
      ) : null}
      {favoriteNote ? <AppText variant="caption" color={theme.status.danger.fg}>{t(favoriteNote)}</AppText> : null}
      {stockError ? <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{stockError}</AppText> : null}

      <View style={styles.grid}>
        {rowsOfTwo(items).map((row) => (
          <View
            key={row.map((candidate) => candidate.sourceUrl).join('|')}
            style={[styles.row, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}
          >
            {row.map((candidate) => (
              <View key={candidate.sourceUrl} style={styles.cell}>
                <LensResultCard
                  candidate={candidate}
                  favorite={favorited[candidate.sourceUrl] === true}
                  stockBusy={busy[candidate.sourceUrl] === true}
                  onOpen={onOpen}
                  onFavorite={onFavorite}
                  onCheckStock={checkStock}
                />
              </View>
            ))}
            {row.length === 1 ? <View style={styles.cell} /> : null}
          </View>
        ))}
      </View>

      <Button label={t('lens.newSearch')} onPress={onNewSearch} tone="quiet" block />
    </View>
  );
}

const styles = StyleSheet.create({
  results: { gap: 10 },
  grid: { gap: 10 },
  row: { gap: 10, alignItems: 'stretch' },
  cell: { flex: 1, minWidth: 0 },
});
