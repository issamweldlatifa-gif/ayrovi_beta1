/**
 * Z Lens — « Historique » (menu ⋮) : les recherches Lens de ce compte.
 *
 * Source : `GET /api/ayrovix/history` (déjà servi au site). Sans compte, le
 * serveur renvoie une liste vide : l'écran le dit au lieu d'afficher un vide muet.
 * Toucher une ligne relance la recherche correspondante.
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { fetchLensHistory, type LensHistoryItem } from '@/api/lens';
import { AppImage } from '@/design/appImage';
import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; items: LensHistoryItem[] };

/** Date courte jj/mm/aaaa, sans dépendre d'Intl (Hermes). */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function LensHistoryView({ onOpen }: { onOpen: (item: LensHistoryItem) => void }) {
  const theme = useTheme();
  const t = useT();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    fetchLensHistory(30)
      .then((items) => { if (!cancelled) setState({ kind: 'ready', items }); })
      .catch(() => { if (!cancelled) setState({ kind: 'error' }); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => load(), [load]);

  return (
    <View style={styles.wrap} testID="lens-history">
      <AppText variant="title" align="center">{t('lens.menu.history')}</AppText>
      {state.kind === 'loading' ? (
        <AppText color={theme.colors.muted} align="center">{t('lens.history.loading')}</AppText>
      ) : null}
      {state.kind === 'error' ? (
        <View style={styles.center}>
          <AppText color={theme.colors.muted} align="center">{t('lens.history.error')}</AppText>
          <Button label={t('common.retry')} onPress={load} tone="quiet" />
        </View>
      ) : null}
      {state.kind === 'ready' && state.items.length === 0 ? (
        <View testID="lens-history-empty">
          <AppText color={theme.colors.muted} align="center">{t('lens.history.empty')}</AppText>
        </View>
      ) : null}
      {state.kind === 'ready' && state.items.length > 0 ? (
        <FlatList
          data={state.items}
          keyExtractor={(item) => item.id}
          style={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onOpen(item)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, { flexDirection: theme.isRTL ? 'row-reverse' : 'row', opacity: pressed ? theme.opacity.subtle : 1 }]}
              testID={`lens-history-${item.id}`}
            >
              {item.imageUrl ? (
                <AppImage uri={item.imageUrl} style={[styles.thumb, { borderRadius: theme.radius.sm, backgroundColor: theme.colors.infoSoft }]} decorative />
              ) : (
                <View style={[styles.thumb, styles.thumbIcon, { borderRadius: theme.radius.sm, backgroundColor: theme.colors.infoSoft }]}>
                  <Ionicons name="search-outline" size={theme.iconSize.sm} color={theme.colors.ink} accessibilityElementsHidden />
                </View>
              )}
              <View style={styles.copy}>
                <AppText weight="bold" numberOfLines={2}>{item.title || item.queryLabel}</AppText>
                <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>
                  {[item.queryLabel && item.queryLabel !== item.title ? item.queryLabel : '', shortDate(item.createdAt)].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              <Ionicons name={theme.isRTL ? 'chevron-back' : 'chevron-forward'} size={theme.iconSize.sm} color={theme.colors.muted} accessibilityElementsHidden />
            </Pressable>
          )}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, flexShrink: 1 },
  center: { gap: 12, alignItems: 'center' },
  list: { flexGrow: 0, flexShrink: 1 },
  row: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  thumb: { width: 48, height: 48 },
  thumbIcon: { alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
});
