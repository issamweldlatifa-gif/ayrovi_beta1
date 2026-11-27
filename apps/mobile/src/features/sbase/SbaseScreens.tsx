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
 *  • **الصورة**: الكاميرا ترفع صورة → نتائج 1688 المتشابهة → النتائج تحمل
 *    متجرها، والفلتر يتبنى من المتاجر اللي رجّعتها الصورة نفسها.
 *  • ما فماش mic ولا زرّ ما يخدمش: كل أيقونة في الشريط عندها فعل حقيقي.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import type {
  SbaseGroup,
  SbaseImageStoreGroup,
  SbaseItem,
  SbaseSource,
} from '@/api/sbase';
import { fetchSbaseItem, fetchSbaseSources, searchSbase, searchSbaseImage } from '@/api/sbase';
import { addSbaseToCart } from '@/api/cart';
import { useSessionId } from '@/session/session';
import { AppImage } from '@/design/appImage';
import { AppScreen } from '@/design/layout';
import { LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { BRAND } from '@/design/tokens.generated';
import { RADIUS } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { useT, type TranslationKey } from '@/i18n';
import { SkeletonGroup } from './Skeleton';
import {
  buildSbaseCartPayload,
  formatCallCost,
  formatDuration,
  formatItemPriceWithCurrency,
  parseMoq,
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
export function ResultRow({ item, index, onOpen }: { item: SbaseItem; index: number; onOpen: () => void }) {
  const theme = useTheme(); const t = useT();
  const sessionId = useSessionId();
  const [cartState, setCartState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [cartCode, setCartCode] = useState('');
  const [qty, setQty] = useState(() => parseMoq(item.moq));
  const estimate = item.priceEstimate ?? null;
  const totalTND = formatTND(estimate?.totalTND ?? null);
  const cartPayload = useMemo(() => buildSbaseCartPayload(item, { quantity: qty }), [item, qty]);
  const addToCart = () => {
    if (!cartPayload || !sessionId || cartState === 'busy') return;
    setCartState('busy'); setCartCode('');
    addSbaseToCart({ payload: cartPayload, sessionId })
      .then(() => setCartState('done'))
      .catch((error: unknown) => {
        setCartCode(typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code ?? 'ERROR')
          : 'ERROR');
        setCartState('error');
      });
  };
  return <Pressable
    testID={`sbase-item-${index}`}
    accessibilityRole="button"
    accessibilityLabel={`${t('sbase.details')} · ${item.title}`}
    onPress={onOpen}
    style={({ pressed }) => [styles.itemCard, { borderColor: theme.colors.line, opacity: pressed ? theme.opacity.subtle : 1 }]}>
    <AppImage uri={item.image ?? undefined} decorative style={styles.itemImage} contentFit="cover" />
    <View style={styles.itemBody}>
      <AppText variant="bodyStrong" numberOfLines={2}>{item.title}</AppText>

      <AppText testID={`sbase-item-price-${index}`} variant="bodyStrong">
        {formatItemPriceWithCurrency(item, t('sbase.missing.price'))}
      </AppText>
      {totalTND ? <AppText testID={`sbase-estimate-${index}`} variant="bodyStrong" color={theme.colors.ink}>
        ≈ {totalTND}
      </AppText> : <AppText testID={`sbase-estimate-${index}`} variant="caption" color={theme.colors.muted}>
        {t('sbase.estimateUnavailable')}
      </AppText>}

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

      {/* عدّاد الكمية: أدنى حدّه MOQ المعلَن (تحقق الكمية الصادق — لا مخزون حيّ مُختلق) */}
      <View style={styles.qtyRow} testID={`sbase-qty-${index}`}>
        <Pressable
          testID={`sbase-qty-minus-${index}`}
          accessibilityRole="button"
          accessibilityLabel={t('sbase.cart.qtyMinus')}
          onPress={() => setQty((current) => Math.max(parseMoq(item.moq), current - 1))}
          style={styles.qtyBtn}>
          <AppText variant="bodyStrong">−</AppText>
        </Pressable>
        <AppText testID={`sbase-qty-value-${index}`} variant="bodyStrong">{qty}</AppText>
        <Pressable
          testID={`sbase-qty-plus-${index}`}
          accessibilityRole="button"
          accessibilityLabel={t('sbase.cart.qtyPlus')}
          onPress={() => setQty((current) => Math.min(99, current + 1))}
          style={styles.qtyBtn}>
          <AppText variant="bodyStrong">+</AppText>
        </Pressable>
        {parseMoq(item.moq) > 1 ? <AppText variant="caption" color={theme.colors.muted}>{t('sbase.moq')} {parseMoq(item.moq)}</AppText> : null}
      </View>
      <View style={styles.itemActions}>
        {/* سلة Zayrovi: بلا quote موقّعة ⇒ الخادم يضعها مراجعة يدوية (PENDING_MANUAL).
           بلا رابط/ثمن/عملة لا زرّ أصلاً — لا نعرض زراً نعرف أن الخادم سيرفضه. */}
        {cartPayload ? <Pressable
          testID={`sbase-cart-${index}`}
          accessibilityRole="button"
          accessibilityLabel={t('sbase.cart.add')}
          onPress={addToCart}
          disabled={cartState === 'busy' || !sessionId}
          style={[styles.cartButton, {
            borderColor: theme.colors.line,
            opacity: cartState === 'busy' || !sessionId ? theme.opacity.subtle : 1,
          }]}>
          <Ionicons
            name={cartState === 'done' ? 'checkmark' : 'cart-outline'}
            size={theme.iconSize.sm}
            color={theme.colors.ink}
          />
          <AppText variant="captionStrong" color={theme.colors.ink}>
            {cartState === 'done' ? t('sbase.cart.added') : cartState === 'error' ? t('sbase.cart.failed') : t('sbase.cart.add')}
          </AppText>
        </Pressable> : null}
        {cartState === 'error' ? <AppText testID={`sbase-cart-error-${index}`} variant="caption" color={theme.status.danger.fg} numberOfLines={1}>
          {cartCode}
        </AppText> : null}
        {item.url ? <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${t('sbase.open')} · ${item.title}`}
          onPress={() => { void Linking.openURL(item.url as string); }}
          style={styles.openLink}>
          <AppText variant="captionStrong">{t('sbase.open')}</AppText>
        </Pressable> : null}
      </View>
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
export function openResult(supportsDetails: boolean, sourceId: string, item: SbaseItem): void {
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
  /**
   * التعمير التدريجي (قرار المالك 26/11 عصراً): **نداء لكل متجر على حدة** —
   * كل مجموعة تعمّر قالبها عند وصولها، ما فماش انتظار دفعة واحدة. الحالة:
   * `busy` = ما زال في الطريق (قوالب Skeleton)، و`groups` = ما وصل فعلاً.
   */
  const [keywordQuery, setKeywordQuery] = useState('');
  const [keywordBusy, setKeywordBusy] = useState<string[]>([]);
  const [keywordGroups, setKeywordGroups] = useState<SbaseGroup[]>([]);
  const [imageBusy, setImageBusy] = useState<string[]>([]);
  const [imageGroups, setImageGroups] = useState<SbaseImageStoreGroup[]>([]);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  const [stale, setStale] = useState(false);
  /** المستعمل لمس الاختيار: ما نرجّعوش لافتراضي فوق راسو. */
  const [touchedSelection, setTouchedSelection] = useState(false);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const busy = keywordBusy.length > 0 || imageBusy.length > 0;
  const queryClient = useQueryClient();
  /** مفاتيح التحميل المسبق المنجزة — ما نعاوووش ندفعو لنفس البطاقة مرّتين. */
  const prefetched = useRef<Set<string>>(new Set());

  // مخازن الصورة المعلنة من الخادم؛ غايبين ⇒ 1688 (الوحيدة التاريخية).
  const imageStoreIds = useMemo(() => {
    const advertised = sourcesQuery.data?.image?.stores?.map((store) => store.id) ?? [];
    return advertised.length > 0 ? advertised : ['1688'];
  }, [sourcesQuery.data]);
  // تسميات المخازن كما يعلنها الخادم — صفوف الخطأ تحمل الاسم الرسمي لا الـid.
  const imageStoreLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const store of sourcesQuery.data?.image?.stores ?? []) map.set(store.id, store.label);
    return map;
  }, [sourcesQuery.data]);

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
    setFailure(null); setPhoto(null); setImageGroups([]); setImageBusy([]); setStoreFilter(null);
    setStale(false);
    setKeywordQuery(query);
    setKeywordGroups([]);
    setKeywordBusy([...selected]);
    /** أخطاء النداءات المرمية — إن فشل **كل** المخازن نرفع بطاقة خطأ بإعادة محاولة. */
    const thrown: Array<{ code: string; message: string }> = [];
    await Promise.all(selected.map(async (sourceId) => {
      const source = sources.find((entry) => entry.id === sourceId);
      try {
        const payload = await searchSbase({ q: query, sources: [sourceId] });
        for (const group of payload.groups) {
          setKeywordGroups((current) => [...current, {
            ...group,
            // المجموعة تُنسب لمتجر ندائها — حتى لو غيّر الخادم الاسم.
            source: { ...group.source, id: sourceId, label: source?.label ?? group.source.label, vendor: source?.vendor ?? group.source.vendor },
          }]);
        }
      } catch (error) {
        const candidate = error as { code?: string; message?: string };
        const failure = { code: candidate?.code ?? 'SBASE_ERROR', message: candidate?.message ?? '' };
        thrown.push(failure);
        setKeywordGroups((current) => [...current, {
          source: {
            id: sourceId, label: source?.label ?? sourceId, vendor: source?.vendor ?? '',
            supports: source?.supports ?? { keyword: true, url: false, image: false, details: false, price: false, variants: false, barcode: false },
          },
          status: 'error', items: [], count: 0, durationMs: 0, cached: false, async: false,
          error: failure,
          costUsd: null, billedPerResult: false,
        }]);
      } finally {
        setKeywordBusy((current) => current.filter((id) => id !== sourceId));
      }
    }));
    if (thrown.length > 0 && thrown.length === selected.length) setFailure(thrown[0]);
  };

  const runImage = async (picked: PickedPhoto) => {
    setFailure(null); setKeywordGroups([]); setKeywordBusy([]); setStoreFilter(null);
    setImageGroups([]);
    setImageBusy([...imageStoreIds]);
    const thrown: Array<{ code: string; message: string }> = [];
    await Promise.all(imageStoreIds.map(async (storeId) => {
      try {
        const payload = await searchSbaseImage(picked, { stores: [storeId] });
        // نداء هذا النداء = مجموعة واحدة؛ غايبة الشكل ⇒ نبنيها من الحقول الموثّقة.
        const group: SbaseImageStoreGroup = payload.groups?.[0] ?? {
          source: { id: storeId, label: payload.channel.label, vendor: payload.channel.vendor },
          status: payload.status === 'ok' ? 'ok' : 'empty',
          count: payload.count,
          items: payload.items,
          durationMs: payload.durationMs,
          error: null,
          costUsd: payload.costUsd ?? 0,
        };
        setImageGroups((current) => [...current, { ...group, source: { ...group.source, id: storeId } }]);
      } catch (error) {
        const candidate = error as { code?: string; message?: string };
        const failure = { code: candidate?.code ?? 'SBASE_IMAGE_ERROR', message: candidate?.message ?? '' };
        thrown.push(failure);
        setImageGroups((current) => [...current, {
          source: { id: storeId, label: imageStoreLabels.get(storeId) ?? storeId, vendor: '' },
          status: 'error', count: 0, items: [], durationMs: 0,
          error: failure,
          costUsd: 0,
        }]);
      } finally {
        setImageBusy((current) => current.filter((id) => id !== storeId));
      }
    }));
    if (thrown.length > 0 && thrown.length === imageStoreIds.length) setFailure(thrown[0]);
  };

  /** الكاميرا هي المدخل الأساسي (قرار المالك، مرجع Alibaba): فتح مباشر + صلاحية صادقة. */
  const pickPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setFailure({ code: 'SBASE_CAMERA_DENIED', message: '' });
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
      cameraType: ImagePicker.CameraType.back,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    const file: PickedPhoto = {
      uri: asset.uri,
      name: asset.fileName ?? 'camera.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    };
    setPhoto(file);
    await runImage(file);
  };

  /** الألبوم يبقى متاحاً كمدخل ثانوي بجانب الكاميرا. */
  const pickAlbum = async () => {
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

  /**
   * تحميل مسبق بالتوازي (قرار المالك: «الوصف والبطاقات على نفس المسار»):
   * أول بطاقتين من كل دفعة تُجلب تفاصيلها في الخلفية فتُفتح الفيشة فوراً.
   * ما نعرضش فشل التحميل المسبق — الفتح الفعلي هو اللي يقول حقيقته.
   */
  useEffect(() => {
    const candidates: Array<{ source: string; item: SbaseItem }> = [
      ...keywordGroups
        .filter((group) => group.status === 'ok' && group.source.supports.details)
        .flatMap((group) => group.items.slice(0, 2).map((item) => ({ source: group.source.id, item }))),
      ...imageGroups
        .filter((group) => group.status === 'ok' && group.source.id === '1688')
        .flatMap((group) => group.items.slice(0, 2).map((item) => ({ source: '1688', item }))),
    ];
    for (const { source, item } of candidates) {
      if (!item.id) continue;
      const key = `${source}|${item.id}|${item.title}`;
      if (prefetched.current.has(key)) continue;
      prefetched.current.add(key);
      // Promise.resolve: النداء قد لا يعد بشيء في بيئة الاختبار — لا انهيار أبداً.
      void Promise.resolve(fetchSbaseItem({ source, id: item.id, title: item.title, url: item.url }))
        .then((payload) => {
          if (payload?.detail) {
            queryClient.setQueryData(['sbase', 'item', source, item.id ?? '', item.title ?? ''], payload);
          }
        })
        .catch(() => { /* الفتح الفعلي يعيد النداء ويقول الحقيقة إن فشلت */ });
    }
  }, [keywordGroups, imageGroups, queryClient]);

  const toggleSource = (id: string) => {
    // Décocher la dernière boutique est un choix légitime : on ne le réécrase pas.
    setTouchedSelection(true);
    setSelected((current) => {
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      return next;
    });
    if (keywordGroups.length > 0 || keywordBusy.length > 0) setStale(true);
  };

  /** ما وصل فعلاً من المخازن المختارة — وما في الطريق يُعرض كقوالب Skeleton. */
  const groups = keywordGroups.filter((group) => selected.includes(group.source.id));
  const imageLanded = imageGroups;
  const imageItems = imageLanded
    .flatMap((group) => group.items)
    .filter((item) => (storeFilter ? item.store === storeFilter : true));
  const imageCount = imageLanded.reduce((sum, group) => sum + group.count, 0);
  const imageTotalMs = imageLanded.reduce((max, group) => Math.max(max, group.durationMs), 0);
  const imageCost = imageLanded.reduce((sum, group) => sum + (group.costUsd ?? 0), 0);
  const keywordCount = groups.reduce((sum, group) => sum + group.count, 0);
  const keywordTotalMs = groups.reduce((max, group) => Math.max(max, group.durationMs), 0);
  const keywordMissing = [...new Set(groups.flatMap((group) => group.items.flatMap((item) => item.missing)))];

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
      {/* الألبوم مدخل ثانوي بجانب الكاميرا (مرجع Alibaba: كاميرا + ألبوم). */}
      <Pressable
        testID="sbase-album"
        accessibilityRole="button"
        accessibilityLabel={t('sbase.album')}
        onPress={() => { void pickAlbum(); }}
        disabled={busy || !imageChannel?.configured}
        style={[styles.barIcon, { opacity: busy || !imageChannel?.configured ? theme.opacity.subtle : 1 }]}>
        <Ionicons name="images-outline" size={theme.iconSize.sm} color={theme.colors.ink} />
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
      <AppText variant="caption" color={theme.colors.muted} style={styles.grow}>
        {imageStoreIds.length > 1 ? t('sbase.photoNoticeMulti') : t('sbase.photoNotice')}
      </AppText>
      <Pressable
        testID="sbase-photo-clear"
        accessibilityRole="button"
        accessibilityLabel={t('sbase.photoClear')}
        onPress={() => { setPhoto(null); setImageGroups([]); setImageBusy([]); setFailure(null); }}
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

    {/* ── نتائج الكلمة: نداء لكل متجر، وكل مجموعة تعمّر عند وصولها ──────── */}
    {keywordQuery ? <View style={styles.section}>
      <AppText testID="sbase-summary" variant="bodyStrong">
        {/* « Aucun résultat » pour un échec, c'est mentir sur ce qui s'est passé. */}
        {keywordCount > 0
          ? t('sbase.results', { count: keywordCount })
          : groups.length > 0 && groups.every((group) => group.status === 'error') && keywordBusy.length === 0
            ? t('sbase.allFailed')
            : keywordBusy.length > 0
              ? t('sbase.searching')
              : groups.length > 0
                ? t('sbase.empty', { query: keywordQuery })
                : t('sbase.searching')}
      </AppText>
      {groups.length > 0 ? <AppText testID="sbase-response-time" variant="caption" color={theme.colors.muted}>
        {/* المزوّد اللي جاوب فعلاً يظهر باسمه — ما ننسبش النتيجة لمزوّد ما جاوبش. */}
        {t('sbase.responseTime')} · {formatDuration(keywordTotalMs)} · {t('sbase.viaProvider', { provider: 'apify' })}
      </AppText> : null}
      {keywordMissing.length > 0 ? <View style={styles.chips}>
        {keywordMissing.map((field) => {
          const key = missingLabelKey(field);
          return <Chip key={field} label={`${t('sbase.missingTitle')} : ${key ? t(key as TranslationKey) : field}`} active={false} />;
        })}
      </View> : null}
    </View> : null}

    {/* قوالب Skeleton للمخازن ما زالت في الطريق — نفس قرار المالك. */}
    {keywordBusy.map((sourceId) => <SkeletonGroup key={`kw-${sourceId}`} sourceId={sourceId} />)}

    {groups.map((group) => <View key={group.source.id} testID={`sbase-group-${group.source.id}`} style={styles.group}>
      <GroupHeader group={group} />
      {group.status === 'empty' ? <AppText variant="caption" color={theme.colors.muted}>{t('sbase.empty', { query: keywordQuery })}</AppText> : null}
      <View style={styles.grid}>
        {group.items.map((item, index) => <ResultRow
          key={`${group.source.id}-${item.url ?? item.id ?? index}`}
          item={item}
          index={index}
          onOpen={() => openResult(group.source.supports.details, group.source.id, item)} />)}
      </View>
      {group.status === 'error' ? <AppText variant="caption" color={theme.colors.muted}>
        {/* Le fournisseur ne facture pas un appel échoué : afficher un prix serait faux. */}
        {t('sbase.groupUnbilled')}
      </AppText> : formatCallCost(group.costUsd) ? <AppText variant="caption" color={theme.colors.muted}>
        {t('sbase.cost')} {formatCallCost(group.costUsd)}{group.billedPerResult ? ` ${t('sbase.costPerResult')}` : ''}
      </AppText> : null}
    </View>)}

    {/* ── نتائج الصورة: نداء لكل مخزن، قوالب ثم تعمير عند الوصول ────────── */}
    {imageBusy.length > 0 || imageGroups.length > 0 ? <View style={styles.section}>
      <AppText testID="sbase-image-summary" variant="bodyStrong">
        {imageCount > 0
          ? t('sbase.results', { count: imageCount })
          : imageBusy.length > 0
            ? t('sbase.searching')
            : imageGroups.every((group) => group.status === 'error') && imageGroups.length > 0
              ? t('sbase.allFailed')
              : t('sbase.photoEmpty')}
      </AppText>
      {imageGroups.length > 0 ? <AppText testID="sbase-image-spend" variant="caption" color={theme.colors.muted}>
        {t('sbase.responseTime')} · {formatDuration(imageTotalMs)}
        {formatCallCost(imageCost) ? ` · ${t('sbase.cost')} ${formatCallCost(imageCost)}` : ''}
      </AppText> : null}
      {/* الحقيقة لكل متجر صورة: زمنو ونتائجه أو خطؤه — ومتجر فاشل غير مفوتر. */}
      {imageGroups.map((group) => <AppText
        key={group.source.id}
        testID={`sbase-image-store-${group.source.id}`}
        variant="caption"
        color={group.status === 'error' ? theme.status.danger.fg : theme.colors.muted}>
        {group.status === 'error'
          ? `${group.source.label} · ${group.error?.code ?? 'ERROR'} · ${t('sbase.groupUnbilled')}`
          : `${group.source.label} · ${group.count} · ${formatDuration(group.durationMs)}`}
      </AppText>)}
      {/* قوالب المخازن ما زالت في الطريق. */}
      {imageBusy.map((storeId) => <SkeletonGroup key={`img-${storeId}`} sourceId={storeId} />)}
      {imageGroups.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip testID="sbase-store-all" label={t('sbase.allStores')} active={storeFilter === null} onPress={() => setStoreFilter(null)} />
        {[...new Set(imageItems.map((item) => item.store).filter((store): store is string => Boolean(store)))]
          .map((store) => <Chip
            key={store}
            testID={`sbase-store-${store}`}
            label={store}
            active={storeFilter === store}
            onPress={() => setStoreFilter(store)} />)}
      </ScrollView> : null}
      <View style={styles.grid}>
        {imageItems.map((item, index) => <ResultRow
          key={`img-${item.url ?? item.id ?? index}`}
          item={item}
          index={index}
          /* نتائج الصورة تحمل متجرها: 1688 تفتح الفيشة (`item/detail`)، ومتجر
             بلا تفاصيل منشورة (AliExpress) يفتح الرابط الأصلي — لا فيش فارغة. */
          onOpen={() => openResult(item.store === '1688', item.store ?? '1688', item)} />)}
      </View>
    </View> : null}

    {!busy && !failure && keywordGroups.length === 0 && imageGroups.length === 0 && !sourcesQuery.isLoading ? <View
      style={[styles.card, { borderColor: theme.colors.lineControl, backgroundColor: theme.colors.surface }]}>
      <AppText variant="bodySmall" color={theme.colors.muted}>{t('sbase.idle')}</AppText>
    </View> : null}
  </AppScreen>;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  hero: { gap: 6, paddingBottom: 10 },
  /* الشريط: كاميرا + ألبوم + حقل + بحث — الكاميرا هي المدخل الأساسي. */
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
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
  /*
   * شبكة القوالب (مرجع المالك 26/11: Alibaba — عمودان): بطاقة مستقلة بصورة
   * علوية عريضة؛ 48.5% + space-between ⇒ عمودان متساويان على كل حجم شاشة.
   */
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  itemCard: {
    width: '48.5%', borderWidth: 1, borderRadius: RADIUS.md, overflow: 'hidden',
  },
  itemImage: { width: '100%', height: 150 },
  itemBody: { gap: 4, padding: 10 },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  qtyBtn: {
    borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  cartButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 6,
  },
  openLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
