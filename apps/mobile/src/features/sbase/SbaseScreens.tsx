/**
 * S Base — شريط بحث واحد، نتائج من المتاجر، وفلتر.
 *
 * ── الشكل (المرجع: شريط بحث التطبيق) ────────────────────────────────────────
 *   [ 📷 ]  اكتب «mini traceur gps» …                    [ 🔍 ]
 *   تحته: [AliExpress] [Amazon] [eBay] [Google Shopping] [Bing] [Taobao] [1688]
 *   وتحته: «4 boutiques · 2,4 s · 87 résultats» ثمّ مجموعات، مجموعة لكل متجر.
 *
 * ── المبادئ اللي ما تبدّلتش ─────────────────────────────────────────────────
 *  • **ما فماش محرّك موحّد**: كل متجر نداء مستقلّ، بزمنو وخطئو وكاشو الخاص.
 *    «المجموعة» عرض للنتائج، موش دمج ولا ترتيب موحّد.
 *  • **الفلتر = اختيار المتاجر**: كي تبدّل الاختيار، ما نعاودوش نجريو بصمت —
 *    نقولو «relancez» باش ما تتضاعفش الكلفة بلا علم المستعمل.
 *  • **الصورة**: الكاميرا ترفع صورة → بحث بصري (Google Lens) → النتائج تحمل
 *    متجرها، والفلتر يتبنى من المتاجر اللي رجّعتها الصورة نفسها.
 *  • ما فماش mic ولا زرّ ما يخدمش: كل أيقونة في الشريط عندها فعل حقيقي.
 */
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import type {
  SbaseGroup,
  SbaseImagePayload,
  SbaseItem,
  SbaseSearchPayload,
  SbaseSource,
} from '@/api/sbase';
import { fetchSbaseSources, searchSbase, searchSbaseImage } from '@/api/sbase';
import { AppImage } from '@/design/appImage';
import { AppScreen } from '@/design/layout';
import { LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { BRAND } from '@/design/tokens.generated';
import { RADIUS } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { useT, type TranslationKey } from '@/i18n';
import {
  formatCallCost,
  formatDuration,
  formatItemPrice,
  formatTND,
  failureMessageKey,
  missingLabelKey,
  supportedCapabilities,
} from './sbaseLogic';

const SOURCES_KEY = ['sbase', 'sources'] as const;

type PickedPhoto = { uri: string; name: string; type: string };

function Chip({
  label, active, onPress, testID, disabled = false,
}: { label: string; active: boolean; onPress?: () => void; testID?: string; disabled?: boolean }) {
  const theme = useTheme();
  return <Pressable
    testID={testID}
    accessibilityRole="button"
    accessibilityState={{ selected: active, disabled }}
    disabled={disabled}
    onPress={onPress}
    style={[styles.chip, {
      borderColor: active ? theme.colors.ink : theme.colors.lineControl,
      backgroundColor: active ? theme.colors.accentSoft : 'transparent',
      opacity: disabled ? theme.opacity.subtle : 1,
    }]}>
    <AppText variant="caption" color={active ? theme.colors.ink : theme.colors.muted}>{label}</AppText>
  </Pressable>;
}

function ErrorCard({ code, message, onRetry }: { code: string; message: string; onRetry?: () => void }) {
  const theme = useTheme(); const t = useT();
  // Le serveur répond dans SA langue ; l'écran parle celle de l'utilisateur.
  // Le code choisit la phrase (sinon on retombe sur le texte du serveur).
  const key = failureMessageKey(code);
  const text = key ? t(key as TranslationKey) : message;
  return <View testID="sbase-error" style={[styles.card, { borderColor: theme.colors.lineControl, backgroundColor: theme.colors.surface }]}>
    <AppText variant="bodyStrong" accessibilityRole="alert" color={theme.status.danger.fg}>{t('sbase.errorTitle')}</AppText>
    <AppText testID="sbase-error-message" variant="bodySmall">{text}</AppText>
    <AppText variant="caption" color={theme.colors.muted}>{t('sbase.err.code')} · {code}</AppText>
    {onRetry ? <Button label={t('common.retry')} tone="quiet" onPress={onRetry} /> : null}
  </View>;
}

/**
 * بطاقة منتج S Base — **كل ما نعرفو، بلا زينة كاذبة**:
 *   صورة · عنوان · ثمن المصدر · **تقدير TND** (محرّك السعر) · مورّد · MOQ · توفّر.
 * التقدير إذا غاب (عملة بلا سعر صرف، ولا المحرّك غير مضبوط) يتكتب «غير متوفّر»
 * — عمرنا ما نعرضو رقم محسوب في التطبيق.
 */
function ResultRow({ item, index, onOpen }: { item: SbaseItem; index: number; onOpen: () => void }) {
  const theme = useTheme(); const t = useT();
  const estimate = item.priceEstimate ?? null;
  const totalTND = formatTND(estimate?.totalTND ?? null);
  return <Pressable
    testID={`sbase-item-${index}`}
    accessibilityRole="button"
    accessibilityLabel={`${t('sbase.details')} · ${item.title}`}
    onPress={onOpen}
    style={({ pressed }) => [styles.item, { borderColor: theme.colors.line, opacity: pressed ? theme.opacity.subtle : 1 }]}>
    <AppImage uri={item.image ?? undefined} decorative style={styles.itemImage} contentFit="cover" />
    <View style={styles.grow}>
      <AppText variant="bodyStrong" numberOfLines={2}>{item.title}</AppText>

      <View style={styles.priceLine}>
        <AppText variant="bodyStrong">{formatItemPrice(item, t('sbase.missing.price'))}</AppText>
        {totalTND ? <AppText testID={`sbase-estimate-${index}`} variant="bodyStrong" color={theme.colors.ink}>
          ≈ {totalTND}
        </AppText> : <AppText testID={`sbase-estimate-${index}`} variant="caption" color={theme.colors.muted}>
          {t('sbase.estimateUnavailable')}
        </AppText>}
      </View>

      <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>
        {[
          item.seller ?? item.store,
          // Achat en gros : le MOQ est la première chose qu'un pro regarde.
          item.moq ? `${t('sbase.moq')} ${item.moq}` : null,
          item.rating !== null ? `${item.rating}★` : null,
          item.shipping,
        ].filter(Boolean).join(' · ') || '—'}
      </AppText>

      {estimate ? <AppText testID={`sbase-estimate-basis-${index}`} variant="caption" color={theme.colors.muted} numberOfLines={1}>
        {t('sbase.estimateBasis', {
          category: estimate.categoryLabel,
          rate: estimate.rateTND.toFixed(4),
        })}
      </AppText> : null}

      {item.url ? <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${t('sbase.open')} · ${item.title}`}
        onPress={() => { void Linking.openURL(item.url as string); }}
        style={styles.openLink}>
        <AppText variant="captionStrong">{t('sbase.open')}</AppText>
      </Pressable> : null}
    </View>
  </Pressable>;
}

function GroupHeader({ group }: { group: SbaseGroup }) {
  const theme = useTheme(); const t = useT();
  const tone = group.status === 'error' ? theme.status.danger.fg : theme.colors.muted;
  return <View style={[styles.groupHead, { borderColor: theme.colors.line }]}>
    <AppText variant="bodyStrong" accessibilityRole="header">{group.source.label}</AppText>
    <AppText variant="caption" color={tone} testID={`sbase-group-${group.source.id}-meta`}>
      {group.status === 'error'
        ? `${group.error?.code ?? 'ERROR'} — ${group.error?.message ?? ''}`
        : `${t('sbase.results', { count: group.count })} · ${formatDuration(group.durationMs)}${group.cached ? ` · ${t('sbase.cachedNote')}` : ''}`}
    </AppText>
  </View>;
}

/**
 * نتيجة → فيش داخلية إذا المتجر ينشر endpoint تفاصيل، وإلا الرابط الأصلي.
 * ما نفتحوش فيش فارغة: هذا الفرق بين «ما عندناش» و«ما لقيناش».
 */
function openResult(supportsDetails: boolean, sourceId: string, item: SbaseItem): void {
  if (supportsDetails) {
    router.push({
      pathname: '/sbase/item',
      params: { source: sourceId, id: item.id ?? '', title: item.title, url: item.url ?? '' },
    } as never);
    return;
  }
  if (item.url) void Linking.openURL(item.url);
}

export function SbaseScreen() {
  const theme = useTheme(); const t = useT();
  const sourcesQuery = useQuery({
    queryKey: SOURCES_KEY,
    queryFn: ({ signal }) => fetchSbaseSources({ signal }),
    staleTime: 60_000,
  });
  const sources: SbaseSource[] = sourcesQuery.data?.sources ?? [];
  const imageChannel = sourcesQuery.data?.image ?? null;
  const configured = sourcesQuery.data?.configured ?? false;

  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [keywordResult, setKeywordResult] = useState<SbaseSearchPayload | null>(null);
  const [imageResult, setImageResult] = useState<SbaseImagePayload | null>(null);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  const [stale, setStale] = useState(false);
  /** المستعمل لمس الاختيار: ما نرجّعوش لافتراضي فوق راسو. */
  const [touchedSelection, setTouchedSelection] = useState(false);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Sélection par défaut = les boutiques grand public décidées côté serveur.
  useEffect(() => {
    if (touchedSelection || selected.length > 0 || sources.length === 0) return;
    setSelected(sources.filter((source) => source.defaultEnabled).map((source) => source.id));
  }, [sources, selected.length, touchedSelection]);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Date.now() - started), 100);
    return () => clearInterval(timer);
  }, [busy]);

  const capabilities = useMemo(() => {
    if (sources.length === 0) return [];
    const picked = sources.filter((source) => selected.includes(source.id));
    if (picked.length === 0) return [];
    // Intersection : on n'affiche que ce que TOUTES les boutiques interrogées savent faire.
    const shared = supportedCapabilities(picked[0].supports)
      .filter((capability) => picked.every((source) => source.supports[capability] === true));
    return shared;
  }, [sources, selected]);

  const runKeyword = async () => {
    const query = text.trim();
    if (query.length < 2 || selected.length === 0) return;
    setBusy(true); setFailure(null); setPhoto(null); setImageResult(null); setStoreFilter(null);
    try {
      const payload = await searchSbase({ q: query, sources: selected });
      setKeywordResult(payload);
      setStale(false);
    } catch (error) {
      const candidate = error as { code?: string; message?: string };
      setFailure({ code: candidate?.code ?? 'SBASE_ERROR', message: candidate?.message ?? '' });
      setKeywordResult(null);
    } finally {
      setBusy(false);
    }
  };

  const runImage = async (picked: PickedPhoto) => {
    setBusy(true); setFailure(null); setKeywordResult(null); setStoreFilter(null);
    try {
      const payload = await searchSbaseImage(picked);
      setImageResult(payload);
    } catch (error) {
      const candidate = error as { code?: string; message?: string };
      setFailure({ code: candidate?.code ?? 'SBASE_IMAGE_ERROR', message: candidate?.message ?? '' });
      setImageResult(null);
    } finally {
      setBusy(false);
    }
  };

  const pickPhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    const file: PickedPhoto = {
      uri: asset.uri,
      name: asset.fileName ?? 'photo.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    };
    setPhoto(file);
    await runImage(file);
  };

  const toggleSource = (id: string) => {
    // Décocher la dernière boutique est un choix légitime : on ne le réécrase pas.
    setTouchedSelection(true);
    setSelected((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      return next;
    });
    if (keywordResult) setStale(true);
  };

  const groups = keywordResult
    ? keywordResult.groups.filter((group) => selected.includes(group.source.id))
    : [];
  const imageItems = imageResult
    ? imageResult.items.filter((item) => (storeFilter ? item.store === storeFilter : true))
    : [];

  return <AppScreen testID="sbase-hub" hasBottomBar>
    <View style={styles.hero}>
      <AppText variant="h2" accessibilityRole="header">{t('sbase.heroTitle')}</AppText>
      <AppText variant="bodySmall" color={theme.colors.muted}>{t('sbase.heroBody')}</AppText>
      <AppText variant="caption" color={theme.colors.muted}>{t('sbase.isolated')}</AppText>
    </View>

    {/* ── الشريط: كاميرا · كلمة · زرّ بحث ─────────────────────────────── */}
    <View style={[styles.bar, { borderColor: theme.colors.ink, backgroundColor: theme.colors.surface }]}>
      <Pressable
        testID="sbase-photo"
        accessibilityRole="button"
        accessibilityLabel={t('sbase.photo')}
        onPress={() => { void pickPhoto(); }}
        disabled={busy || !imageChannel?.configured}
        style={[styles.barIcon, { opacity: busy || !imageChannel?.configured ? theme.opacity.subtle : 1 }]}>
        <Ionicons name="camera-outline" size={theme.iconSize.md} color={theme.colors.ink} />
      </Pressable>
      <TextInput
        testID="sbase-query"
        accessibilityLabel={t('sbase.placeholder')}
        placeholder={t('sbase.placeholder')}
        placeholderTextColor={theme.colors.muted}
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => { void runKeyword(); }}
        returnKeyType="search"
        editable={!busy}
        style={[styles.input, theme.text('body'), { color: theme.colors.ink }]}
      />
      <Pressable
        testID="sbase-submit"
        accessibilityRole="button"
        accessibilityLabel={t('sbase.search')}
        onPress={() => { void runKeyword(); }}
        disabled={busy || text.trim().length < 2 || selected.length === 0}
        style={[styles.submit, {
          backgroundColor: theme.colors.ink,
          opacity: busy || text.trim().length < 2 || selected.length === 0 ? theme.opacity.subtle : 1,
        }]}>
        <Ionicons name="search-outline" size={theme.iconSize.md} color={theme.mode === 'dark' ? BRAND.black : BRAND.white} />
      </Pressable>
    </View>

    {photo ? <View style={[styles.photoRow, { borderColor: theme.colors.lineControl }]}>
      <AppImage uri={photo.uri} decorative style={styles.photoThumb} contentFit="cover" />
      <AppText variant="caption" color={theme.colors.muted} style={styles.grow}>{t('sbase.photoNotice')}</AppText>
      <Pressable
        testID="sbase-photo-clear"
        accessibilityRole="button"
        accessibilityLabel={t('sbase.photoClear')}
        onPress={() => { setPhoto(null); setImageResult(null); setFailure(null); }}
        style={styles.barIcon}>
        <Ionicons name="close-outline" size={theme.iconSize.sm} color={theme.colors.ink} />
      </Pressable>
    </View> : null}

    {/* ── فلتر المتاجر (هو نفسه اختيار ما يُستجوب) ─────────────────────── */}
    <View style={styles.section}>
      <AppText variant="caption" color={theme.colors.muted}>{t('sbase.filters')}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {sources.map((source) => <Chip
          key={source.id}
          testID={`sbase-source-${source.id}`}
          label={source.label}
          active={selected.includes(source.id)}
          disabled={busy}
          onPress={() => toggleSource(source.id)} />)}
      </ScrollView>
      {capabilities.length > 0 ? <AppText variant="caption" color={theme.colors.muted}>
        {t('sbase.capabilitiesLabel')} · {capabilities.map((capability) => t(`sbase.cap.${capability}` as TranslationKey)).join(' · ')}
      </AppText> : null}
      {stale ? <AppText testID="sbase-stale" variant="caption" color={theme.colors.muted}>{t('sbase.stale')}</AppText> : null}
    </View>

    {sourcesQuery.isLoading ? <LoadingBlock /> : null}
    {sourcesQuery.isError ? <ErrorCard
      code="SBASE_SOURCES" message={(sourcesQuery.error as Error)?.message ?? ''}
      onRetry={() => { void sourcesQuery.refetch(); }} /> : null}

    {!sourcesQuery.isLoading && !configured ? <View
      testID="sbase-unconfigured"
      style={[styles.card, { borderColor: theme.colors.lineControl, backgroundColor: theme.colors.surface }]}>
      <AppText variant="bodySmall" accessibilityRole="alert">{t('sbase.notConfigured')}</AppText>
    </View> : null}

    {failure ? <ErrorCard
      code={failure.code} message={failure.message}
      onRetry={() => { if (photo) void runImage(photo); else void runKeyword(); }} /> : null}

    {busy ? <AppText testID="sbase-progress" variant="caption" color={theme.colors.muted}>
      {t('sbase.searching')} {formatDuration(elapsed)}
    </AppText> : null}

    {/* ── نتائج الكلمة: مجموعة لكل متجر ────────────────────────────────── */}
    {keywordResult ? <View style={styles.section}>
      <AppText testID="sbase-summary" variant="bodyStrong">
        {keywordResult.count > 0 ? t('sbase.results', { count: keywordResult.count }) : t('sbase.empty', { query: keywordResult.query })}
      </AppText>
      <AppText testID="sbase-response-time" variant="caption" color={theme.colors.muted}>
        {t('sbase.responseTime')} · {formatDuration(keywordResult.totalMs)} · {t('sbase.viaSandbase')}
      </AppText>
      {keywordResult.missingFields.length > 0 ? <View style={styles.chips}>
        {keywordResult.missingFields.map((field) => {
          const key = missingLabelKey(field);
          return <Chip key={field} label={`${t('sbase.missingTitle')} : ${key ? t(key as TranslationKey) : field}`} active={false} />;
        })}
      </View> : null}
    </View> : null}

    {groups.map((group) => <View key={group.source.id} testID={`sbase-group-${group.source.id}`} style={styles.group}>
      <GroupHeader group={group} />
      {group.status === 'empty' ? <AppText variant="caption" color={theme.colors.muted}>{t('sbase.empty', { query: keywordResult?.query ?? '' })}</AppText> : null}
      {group.items.map((item, index) => <ResultRow
        key={`${group.source.id}-${item.url ?? item.id ?? index}`}
        item={item}
        index={index}
        onOpen={() => openResult(group.source.supports.details, group.source.id, item)} />)}
      {formatCallCost(group.costUsd) ? <AppText variant="caption" color={theme.colors.muted}>
        {t('sbase.cost')} {formatCallCost(group.costUsd)}{group.billedPerResult ? ` ${t('sbase.costPerResult')}` : ''}
      </AppText> : null}
    </View>)}

    {/* ── نتائج الصورة: فلتر بالمتجر، والنتائج تحمل مصدرها ──────────────── */}
    {imageResult ? <View style={styles.section}>
      <AppText testID="sbase-image-summary" variant="bodyStrong">
        {imageResult.count > 0 ? t('sbase.results', { count: imageResult.count }) : t('sbase.empty', { query: '' })}
      </AppText>
      <AppText testID="sbase-image-spend" variant="caption" color={theme.colors.muted}>
        {t('sbase.responseTime')} · {formatDuration(imageResult.totalMs)} · {imageResult.channel.label}
        {formatCallCost(imageResult.costUsd) ? ` · ${t('sbase.cost')} ${formatCallCost(imageResult.costUsd)}` : ''}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip testID="sbase-store-all" label={t('sbase.allStores')} active={storeFilter === null} onPress={() => setStoreFilter(null)} />
        {[...new Set(imageResult.items.map((item) => item.store).filter((store): store is string => Boolean(store)))]
          .map((store) => <Chip
            key={store}
            testID={`sbase-store-${store}`}
            label={store}
            active={storeFilter === store}
            onPress={() => setStoreFilter(store)} />)}
      </ScrollView>
      {imageItems.map((item, index) => <ResultRow
        key={`img-${item.url ?? item.id ?? index}`}
        item={item}
        index={index}
        onOpen={() => openResult(false, 'google-lens', item)} />)}
    </View> : null}

    {!busy && !failure && !keywordResult && !imageResult && !sourcesQuery.isLoading ? <View
      style={[styles.card, { borderColor: theme.colors.lineControl, backgroundColor: theme.colors.surface }]}>
      <AppText variant="bodySmall" color={theme.colors.muted}>{t('sbase.idle')}</AppText>
    </View> : null}
  </AppScreen>;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  hero: { gap: 6, paddingBottom: 10 },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 2, borderRadius: RADIUS.xl, paddingHorizontal: 6, paddingVertical: 4,
  },
  barIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 40, paddingHorizontal: 4 },
  submit: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.lg },
  photoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
    padding: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.md,
  },
  photoThumb: { width: 40, height: 40, borderRadius: RADIUS.sm, overflow: 'hidden' },
  section: { gap: 6, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.xl,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  card: { gap: 8, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.md, marginTop: 12 },
  group: { marginTop: 16, gap: 4 },
  groupHead: { gap: 2, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  item: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  itemImage: { width: 72, height: 72, borderRadius: RADIUS.sm, overflow: 'hidden' },
  openLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
});
