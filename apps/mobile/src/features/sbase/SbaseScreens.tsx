/**
 * S Base — البحث في المتاجر المدعومة عبر SandBase.
 *
 * ── شنوّة هذا ────────────────────────────────────────────────────────────────
 * مدخل جديد في شريط التنقّل: الحريف يختار متجراً (AliExpress، Amazon، eBay…)،
 * وبعدها البحث يمشي **على ذلك المتجر وحدو** عبر خادمنا. كل بطاقة تقول القدرات
 * الحقيقية فقط، وكل نتيجة تحمل مصدرها وزمن استجابتها.
 *
 * ── شنوّة ما هذا ────────────────────────────────────────────────────────────
 *  • موش AYWEBs: ما فماش سلة، ما فماش سعر TND محسوب، ما فماش التقاط.
 *  • موش Z Lens: ما نلمسوش لا `/api/zayrovix` لا كاميرا Lens.
 *  • موش نتائج تجريبية: إذا المفتاح غايب نقولوها، وإذا المصدر ما عطاش حقلاً
 *    نسمّيوه في «حقول ما عطاهاش المصدر».
 */
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { SbaseSearchPayload, SbaseSource } from '@/api/sbase';
import { fetchSbaseSources, searchSbase } from '@/api/sbase';
import { AppImage } from '@/design/appImage';
import { AppScreen } from '@/design/layout';
import { goBack } from '@/design/navigation';
import { LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { BRAND } from '@/design/tokens.generated';
import { RADIUS } from '@/design/tokens.mobile';
import { AppText, Button, Field } from '@/design/ui';
import { useT, type TranslationKey } from '@/i18n';
import {
  capabilitySummary,
  formatCallCost,
  formatDuration,
  formatItemPrice,
  missingLabelKey,
  searchPath,
  sourceStatus,
} from './sbaseLogic';

const SOURCES_KEY = ['sbase', 'sources'] as const;

function Chip({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'ink' }) {
  const theme = useTheme();
  return <View style={[styles.chip, { borderColor: theme.colors.lineControl }]}>
    <AppText variant="caption" color={tone === 'ink' ? theme.colors.ink : theme.colors.muted}>{label}</AppText>
  </View>;
}

function SourceMark({ label }: { label: string }) {
  const theme = useTheme();
  return <View style={[styles.mark, { backgroundColor: theme.colors.ink }]}>
    <AppText variant="subtitle" color={theme.mode === 'dark' ? theme.colors.canvas : BRAND.white}>
      {label.slice(0, 1).toUpperCase()}
    </AppText>
  </View>;
}

function FailureCard({ code, message, onRetry }: { code: string; message: string; onRetry?: () => void }) {
  const theme = useTheme(); const t = useT();
  return <View testID="sbase-error" style={[styles.card, { borderColor: theme.colors.lineControl, backgroundColor: theme.colors.surface }]}>
    <AppText variant="bodyStrong" accessibilityRole="alert" color={theme.status.danger.fg}>{t('sbase.errorTitle')}</AppText>
    <AppText variant="bodySmall">{message}</AppText>
    <AppText variant="caption" color={theme.colors.muted}>{code}</AppText>
    {onRetry ? <Button label={t('common.retry')} tone="quiet" onPress={onRetry} /> : null}
  </View>;
}

export function SbaseHub() {
  const theme = useTheme(); const t = useT();
  const sources = useQuery({
    queryKey: SOURCES_KEY,
    queryFn: ({ signal }) => fetchSbaseSources({ signal }),
    staleTime: 60_000,
  });
  const list: SbaseSource[] = sources.data?.sources ?? [];
  const configured = sources.data?.configured ?? false;

  return <AppScreen testID="sbase-hub" hasBottomBar>
    <View style={styles.hero}>
      <AppText variant="h2" accessibilityRole="header">{t('sbase.heroTitle')}</AppText>
      <AppText color={theme.colors.muted}>{t('sbase.heroBody')}</AppText>
      <AppText variant="caption" color={theme.colors.muted}>{t('sbase.isolated')}</AppText>
    </View>

    {sources.isLoading ? <LoadingBlock /> : null}

    {sources.isError ? <FailureCard
      code="SBASE_SOURCES" message={(sources.error as Error)?.message ?? ''}
      onRetry={() => { void sources.refetch(); }} /> : null}

    {!sources.isLoading && !sources.isError && !configured
      ? <View testID="sbase-unconfigured" style={[styles.card, { borderColor: theme.colors.lineControl, backgroundColor: theme.colors.surface }]}>
        <AppText variant="bodySmall" accessibilityRole="alert">{t('sbase.notConfigured')}</AppText>
      </View>
      : null}

    {list.length > 0 ? <View style={styles.section}>
      <AppText variant="subtitle" accessibilityRole="header">{t('sbase.chooseStore')}</AppText>
      <AppText variant="caption" color={theme.colors.muted}>{t('sbase.storeCount', { count: list.length })}</AppText>
    </View> : null}

    <View style={styles.grid}>
      {list.map((source) => {
        const status = sourceStatus(source);
        return <Pressable
          key={source.id}
          testID={`sbase-source-${source.id}`}
          accessibilityRole="link"
          accessibilityLabel={`${source.label} · ${t(status === 'ready' ? 'sbase.status.ready' : 'sbase.status.unconfigured')}`}
          onPress={() => router.push(searchPath(source.id) as never)}
          style={({ pressed }) => [styles.sourceCard, {
            borderColor: theme.colors.lineControl,
            backgroundColor: theme.colors.surface,
            opacity: pressed ? theme.opacity.subtle : 1,
          }]}>
          <View style={styles.sourceHead}>
            <SourceMark label={source.label} />
            <View style={styles.grow}>
              <AppText variant="bodyStrong" numberOfLines={1}>{source.label}</AppText>
              <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>{source.vendor}</AppText>
            </View>
          </View>
          <View style={styles.chips}>
            {capabilitySummary(source.supports).map((capability) => <Chip
              key={capability}
              label={t(`sbase.cap.${capability}` as TranslationKey)} tone="ink" />)}
          </View>
          <AppText variant="caption" color={status === 'ready' ? theme.colors.muted : theme.status.danger.fg}>
            {t(status === 'ready' ? 'sbase.status.ready' : 'sbase.status.unconfigured')}
          </AppText>
        </Pressable>;
      })}
    </View>
  </AppScreen>;
}

export function SbaseMerchantSearch({ merchant }: { merchant: string }) {
  const theme = useTheme(); const t = useT();
  const sources = useQuery({
    queryKey: SOURCES_KEY,
    queryFn: ({ signal }) => fetchSbaseSources({ signal }),
    staleTime: 60_000,
  });
  const source = (sources.data?.sources ?? []).find((entry) => entry.id === merchant) ?? null;

  const [text, setText] = useState('');
  const [market, setMarket] = useState<string | null>(null);
  const [result, setResult] = useState<SbaseSearchPayload | null>(null);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // مؤقّت حيّ أثناء النتظار: الحريف يشوف الزمن يمشي بدل شاشة جامدة.
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Date.now() - started), 100);
    return () => clearInterval(timer);
  }, [busy]);

  const run = async () => {
    const query = text.trim();
    if (query.length < 2) return;
    setBusy(true); setFailure(null);
    try {
      const payload = await searchSbase({ source: merchant, q: query, market });
      setResult(payload);
    } catch (error) {
      const candidate = error as { code?: string; message?: string };
      setFailure({ code: candidate?.code ?? 'SBASE_ERROR', message: candidate?.message ?? '' });
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return <AppScreen testID="sbase-merchant" chrome={false} hasBottomBar>
    <View style={styles.topBar}>
      <Pressable testID="sbase-back" accessibilityRole="button" accessibilityLabel={t('sbase.back')} onPress={() => goBack('/sbase')} style={styles.iconButton}>
        <Ionicons name={theme.isRTL ? 'chevron-forward' : 'chevron-back'} size={theme.iconSize.md} color={theme.colors.ink} />
      </Pressable>
      <View style={styles.grow}>
        <AppText variant="subtitle" accessibilityRole="header" numberOfLines={1}>{source?.label ?? merchant}</AppText>
        <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>{t('sbase.viaSandbase')}</AppText>
      </View>
    </View>

    <Field
      label={source ? `${t('sbase.search')} · ${source.label}` : t('sbase.search')}
      value={text}
      onChangeText={setText}
      placeholder={t('sbase.searchPlaceholder')}
      returnKeyType="search"
      onSubmitEditing={() => { void run(); }}
      editable={!busy}
      testID="sbase-query"
    />

    {source && source.markets.length > 1 ? <View style={styles.marketBlock}>
      <AppText variant="caption" color={theme.colors.muted}>{t('sbase.market')}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {source.markets.map((entry) => {
          const active = (market ?? source.defaultMarket) === entry.code;
          return <Pressable
            key={entry.code}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => setMarket(entry.code)}
            style={[styles.marketChip, {
              borderColor: active ? theme.colors.ink : theme.colors.lineControl,
              backgroundColor: active ? theme.colors.accentSoft : 'transparent',
            }]}>
            <AppText variant="caption" color={active ? theme.colors.ink : theme.colors.muted}>{entry.label}</AppText>
          </Pressable>;
        })}
      </ScrollView>
    </View> : null}

    <Button
      label={busy ? `${t('sbase.searching')} ${formatDuration(elapsed)}` : t('sbase.search')}
      onPress={() => { void run(); }}
      busy={busy}
      disabled={busy || text.trim().length < 2}
      block
      testID="sbase-submit"
    />

    {failure ? <FailureCard code={failure.code} message={failure.message} onRetry={() => { void run(); }} /> : null}

    {!failure && !result && !busy ? <View style={[styles.card, { borderColor: theme.colors.lineControl, backgroundColor: theme.colors.surface }]}>
      <AppText variant="bodySmall" color={theme.colors.muted}>{t('sbase.idle')}</AppText>
    </View> : null}

    {result ? <View style={styles.section}>
      <View style={styles.metaRow}>
        <AppText variant="bodyStrong">
          {result.status === 'empty' ? t('sbase.empty', { query: result.query }) : t('sbase.results', { count: result.count })}
        </AppText>
      </View>
      <AppText testID="sbase-response-time" variant="caption" color={theme.colors.muted}>
        {t('sbase.responseTime')} · {formatDuration(result.durationMs)}{result.cached ? ` · ${t('sbase.cachedNote')}` : ''}
        {formatCallCost(result.costUsd) ? ` · ${t('sbase.cost')} ${formatCallCost(result.costUsd)}` : ''}
      </AppText>
      {result.missingFields.length > 0 ? <View style={styles.missingBlock}>
        <AppText variant="caption" color={theme.colors.muted}>{t('sbase.missingTitle')}</AppText>
        <View style={styles.chips}>
          {result.missingFields.map((field) => {
            const key = missingLabelKey(field);
            return <Chip key={field} label={key ? t(key as TranslationKey) : field} />;
          })}
        </View>
      </View> : null}
    </View> : null}

    {result?.items.map((item, index) => <View
      key={`${item.url ?? item.id ?? item.title}-${index}`}
      testID={`sbase-item-${index}`}
      style={[styles.item, { borderColor: theme.colors.line }]}>
      <AppImage uri={item.image ?? undefined} decorative style={styles.itemImage} contentFit="cover" />
      <View style={styles.grow}>
        <AppText variant="bodyStrong" numberOfLines={2}>{item.title}</AppText>
        <AppText variant="bodyStrong">{formatItemPrice(item, t('sbase.missing.price'))}</AppText>
        <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>
          {[item.store, item.rating !== null ? `${item.rating}★` : null, item.shipping].filter(Boolean).join(' · ') || '—'}
        </AppText>
        {item.url ? <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${t('sbase.open')} · ${item.title}`}
          onPress={() => { void Linking.openURL(item.url as string); }}
          style={styles.openLink}>
          <AppText variant="captionStrong">{t('sbase.open')}</AppText>
          <Ionicons name="open-outline" size={theme.iconSize.sm} color={theme.colors.ink} />
        </Pressable> : null}
      </View>
    </View>)}
  </AppScreen>;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  hero: { gap: 8, paddingBottom: 8 },
  section: { gap: 6, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  sourceCard: { width: '47%', flexGrow: 1, gap: 10, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.md },
  sourceHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 36, height: 36, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.xl, paddingHorizontal: 8, paddingVertical: 2 },
  card: { gap: 8, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.md, marginTop: 12 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  marketBlock: { gap: 6 },
  marketChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.xl, paddingHorizontal: 10, paddingVertical: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  missingBlock: { gap: 4, marginTop: 4 },
  item: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  itemImage: { width: 72, height: 72, borderRadius: RADIUS.sm, overflow: 'hidden' },
  openLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
});
