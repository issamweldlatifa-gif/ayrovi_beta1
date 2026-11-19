import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { AppText, Button, Field } from '@/design/ui';
import { AppSheet } from '@/design/sheet/AppSheet';
import { RHYTHM } from '@/design/rhythm';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useT } from '@/i18n';
import { searchCatalog, type CatalogProduct } from '@/api/catalog';
import { foldCatalogSearch, type CatalogSearchFacets, type CatalogSearchFilters } from '../../../../../shared/catalogSearch';

const HISTORY_KEY = 'zayrovi.catalog.recent.v1';
const MAX_RECENTS = 6;
const clean = (value: string) => value.trim().slice(0, 100);
const enabled = (value: unknown) => value !== undefined && value !== false && value !== '';

export function CatalogSearchControls({ arrivalId, query, filters, onSearch, onFilters, onOpenFilters, onSuggestion, facets }: {
  arrivalId: string; query: string; filters: CatalogSearchFilters; onSearch: (q: string) => void; onFilters: (f: CatalogSearchFilters) => void;
  onOpenFilters: () => void; onSuggestion: (product: CatalogProduct) => void; facets?: CatalogSearchFacets | null;
}) {
  const t = useT(), theme = useTheme();
  const [draft, setDraft] = useState(query);
  const [hint, setHint] = useState('');
  const [editing, setEditing] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(HISTORY_KEY).then(raw => {
      const values: unknown = raw ? JSON.parse(raw) : [];
      if (live && Array.isArray(values)) setRecents(current => current.length ? current : values.filter(v => typeof v === 'string' && v.length <= 100 && foldCatalogSearch(v)).slice(0, MAX_RECENTS));
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!editing) { setHint(''); return; }
    const timer = setTimeout(() => setHint(clean(draft)), 280);
    return () => clearTimeout(timer);
  }, [draft, editing]);
  const suggestions = useQuery({
    queryKey: ['catalog', 'suggest', hint, arrivalId, filters],
    queryFn: ({ signal }) => searchCatalog({ ...filters, q: hint, arrivalId, suggest: true }, { signal }),
    enabled: editing && hint === clean(draft) && foldCatalogSearch(hint).length >= 2,
    staleTime: 60_000, retry: false,
  });
  const results = hint === clean(draft) && foldCatalogSearch(hint).length >= 2 ? suggestions.data?.items ?? [] : [];
  const submit = (text: string, product?: CatalogProduct) => {
    const q = clean(text);
    setDraft(q); setEditing(false); Keyboard.dismiss();
    if (foldCatalogSearch(q)) {
      const next = [q, ...recents.filter(item => foldCatalogSearch(item) !== foldCatalogSearch(q))].slice(0, MAX_RECENTS);
      setRecents(next); void AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
    }
    onSearch(q);
    if (product) onSuggestion(product);
  };
  const direction = rowDirectionFor(theme.isRTL);
  const labels = [
    { id: 'categoryId', text: facets?.categories.find(x => x.id === filters.categoryId)?.label ?? (filters.categoryId ? t('catalog.filter.category') : '') },
    { id: 'brandId', text: facets?.brands.find(x => x.id === filters.brandId)?.label ?? (filters.brandId ? t('catalog.filter.brand') : '') },
    { id: 'size', text: filters.size ? `${t('catalog.size')} ${filters.size}` : '' },
    { id: 'price', text: filters.min !== undefined || filters.max !== undefined ? t('catalog.filter.price') : '' },
    { id: 'available', text: filters.available ? t('catalog.filter.available') : '' },
  ] as const;
  const shown = labels.filter(item => item.text);
  return <View style={styles.group}>
    <View style={[styles.searchRow, { flexDirection: direction }]}>
      <View style={styles.input}><Field testID="catalog-search-input" accessibilityLabel={t('catalog.search')} placeholder={t('catalog.search')} returnKeyType="search" value={draft}
        maxLength={100} onFocus={() => setEditing(true)} onChangeText={value => { setDraft(value); setEditing(true); if (!value) onSearch(''); }} onSubmitEditing={() => submit(draft)} /></View>
      <Button tone="quiet" label={t('catalog.filter.title')} testID="catalog-filters" onPress={() => { Keyboard.dismiss(); setDraft(query); setEditing(false); onOpenFilters(); }} />
    </View>
    {editing ? <View style={[styles.suggestions, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.control }]}>
      {draft.trim() ? <SearchChoice label={t('catalog.search.submit', { query: clean(draft) })} onPress={() => submit(draft)} testID="catalog-search-submit" /> : null}
      {results.slice(0, 3).map(product => <SearchChoice key={product.id} label={product.name} onPress={() => submit(draft, product)} testID={`catalog-suggestion-${product.id}`} />)}
      {!draft.trim() && recents.length ? <>
        <AppText variant="captionStrong" style={styles.suggestionLabel}>{t('catalog.search.recent')}</AppText>
        {recents.slice(0, 3).map(value => <SearchChoice key={value} label={value} onPress={() => submit(value)} />)}
        <SearchChoice label={t('catalog.search.clearHistory')} onPress={() => { setRecents([]); void AsyncStorage.removeItem(HISTORY_KEY).catch(() => {}); }} />
      </> : null}
      <SearchChoice label={t('common.close')} onPress={() => { Keyboard.dismiss(); setDraft(query); setEditing(false); }} />
    </View> : null}
    {!editing && shown.length > 0 ? <View style={[styles.wrap, { flexDirection: direction }]}>
      {shown.map(item => <Choice key={item.id} label={`${item.text} ×`} selected onPress={() => {
        const next = { ...filters };
        if (item.id === 'price') { delete next.min; delete next.max; } else delete next[item.id];
        onFilters(next);
      }} />)}
    </View> : null}
  </View>;
}

function SearchChoice({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return <Pressable accessibilityRole="button" onPress={onPress} testID={testID} style={styles.suggestion}>
    <AppText numberOfLines={1} variant="bodySmall">{label}</AppText>
  </Pressable>;
}

function Choice({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={[styles.choice, { borderRadius: theme.radius.full, borderColor: selected ? theme.colors.ink : theme.colors.lineControl, backgroundColor: selected ? theme.colors.ink : theme.colors.canvas }]}>
    <AppText variant="bodySmall" align="center" color={selected ? theme.colors.canvas : theme.colors.ink}>{label}</AppText>
  </Pressable>;
}

export function catalogPriceInput(value: string): number | undefined {
  const clean = value.trim().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0)).replace(/[،٫,]/g, '.');
  return clean ? /^\d{1,9}(?:\.\d{1,3})?$/.test(clean) ? Number(clean) : NaN : undefined;
}

export function CatalogFilterSheet({ arrivalId, q, filters, facets, close, apply }: { arrivalId: string; q: string; filters: CatalogSearchFilters; facets?: CatalogSearchFacets | null; close: () => void; apply: (value: CatalogSearchFilters) => void }) {
  const t = useT(), theme = useTheme();
  const [value, setValue] = useState(filters);
  const [min, setMin] = useState(filters.min?.toString() ?? '');
  const [max, setMax] = useState(filters.max?.toString() ?? '');
  const lo = catalogPriceInput(min), hi = catalogPriceInput(max);
  const invalid = Number.isNaN(lo) || Number.isNaN(hi) || (lo !== undefined && hi !== undefined && lo > hi);
  const dir = rowDirectionFor(theme.isRTL);
  const group = (key: 'categoryId' | 'brandId' | 'size', title: string, options: Array<{ id: string; label: string }> = []) => {
    const selected = value[key];
    const items = selected && !options.some(x => x.id === selected) ? [{ id: selected, label: key === 'size' ? selected : title }, ...options] : options;
    return items.length ? <View style={styles.group}>
      <AppText variant="label" accessibilityRole="header">{title}</AppText>
      <View style={[styles.wrap, { flexDirection: dir }]}>{items.map(item => <Choice key={item.id} label={item.label} selected={selected === item.id} onPress={() => setValue(previous => ({ ...previous,
        ...(key === 'categoryId' || key === 'brandId' ? { size: undefined } : {}), [key]: selected === item.id ? undefined : item.id,
      }))} />)}</View>
    </View> : null;
  };
  const sameScope = value.categoryId === filters.categoryId && value.brandId === filters.brandId;
  const scoped = useQuery({
    queryKey: ['catalog', 'size-facets', q, arrivalId, value.categoryId, value.brandId],
    queryFn: ({ signal }) => searchCatalog({ q, arrivalId, categoryId: value.categoryId, brandId: value.brandId }, { signal }),
    enabled: !sameScope, staleTime: 60_000,
  });
  const sizes = sameScope ? facets?.sizes : scoped.data?.facets?.sizes;
  return <AppSheet open presentation="bottom" heightRatio={0.83} onDismiss={close}
    header={<View style={[styles.sheetHeader, { flexDirection: dir }]}><AppText variant="h3" accessibilityRole="header" style={styles.input}>{t('catalog.filter.title')}</AppText><Button label={t('common.close')} tone="quiet" onPress={close} /></View>}
    footer={<View style={styles.group}>
      <Button label={t('catalog.filter.apply')} testID="catalog-filters-apply" disabled={invalid} onPress={() => apply(Object.fromEntries(Object.entries({ ...value, min: lo, max: hi }).filter(([, entry]) => enabled(entry))))} />
      <Button label={t('catalog.filter.reset')} tone="quiet" onPress={() => { setValue({}); setMin(''); setMax(''); }} />
    </View>}>
    {group('categoryId', t('catalog.filter.category'), facets?.categories)}
    {group('brandId', t('catalog.filter.brand'), facets?.brands)}
    {group('size', t('catalog.size'), sizes?.map(id => ({ id, label: id })))}
    {!sameScope && scoped.isPending ? <AppText variant="caption" color={theme.colors.muted}>{t('catalog.filter.sizeScope')}</AppText> : null}
    {!sameScope && scoped.isError ? <Button label={t('common.retry')} tone="quiet" onPress={() => void scoped.refetch()} /> : null}
    <AppText variant="label" accessibilityRole="header">{t('catalog.filter.price')}</AppText>
    <View style={[styles.searchRow, { flexDirection: dir }]}>
      <View style={styles.input}><Field label={t('catalog.filter.min')} value={min} onChangeText={setMin} keyboardType="decimal-pad" maxLength={14} /></View>
      <View style={styles.input}><Field label={t('catalog.filter.max')} value={max} onChangeText={setMax} keyboardType="decimal-pad" maxLength={14} /></View>
    </View>
    {invalid ? <AppText variant="caption" accessibilityRole="alert" color={theme.status.danger.fg}>{t('catalog.filter.invalid')}</AppText> : null}
    <View style={[styles.wrap, { flexDirection: dir }] }><Choice label={t('catalog.filter.available')} selected={value.available} onPress={() => setValue(previous => ({ ...previous, available: !previous.available }))} /></View>
  </AppSheet>;
}

const styles = StyleSheet.create({
  group: { gap: RHYTHM.tight }, searchRow: { alignItems: 'center', gap: RHYTHM.tight }, input: { flex: 1, minWidth: 0 },
  suggestions: { paddingHorizontal: RHYTHM.tight, flexShrink: 1 }, suggestion: { minHeight: 44, paddingHorizontal: RHYTHM.inline, justifyContent: 'center' },
  suggestionLabel: { paddingTop: RHYTHM.tight }, wrap: { flexWrap: 'wrap', gap: RHYTHM.tight },
  choice: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: RHYTHM.related, justifyContent: 'center', maxWidth: '100%' },
  sheetHeader: { gap: RHYTHM.tight, paddingHorizontal: RHYTHM.group, alignItems: 'center' },
});
