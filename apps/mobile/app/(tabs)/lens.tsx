/**
 * Lens — شاشة واحدة بطبقات. القاعدة (الكاميرا أو الرابط والرمز) لا تُغلق أبداً؛
 * كل ما يعلوها درج واحد داخل الشاشة: النتائج، OCEREX، المساعدة، السجل.
 *
 * انظر `docs/LENS_NAV_PLAN.md`: منطق الرجوع في `lensLayers.ts`.
 *
 * قواعد هذي الشاشة (نفس مبادئ المنتوج كلّو):
 *  • **الصورة ما تعطي سعراً**: الخادم يجيب صفحات المتاجر ويقرا السعر منها.
 *  • **التوفّر والثقة يتقالوا**: بلا تجميل.
 *  • **الفيشات الموقوفة ما تتخبّاش**: الخادم يقول كم فيشة تخبّتت وعلاش.
 *
 * الاختيار يفتح مسار AYWEBs: نفس المتجر، نفس الكابتشر، ونفس «Add to Cart».
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppHeader } from '@/features/shell/AppHeader';
import { useI18n } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';
import { addExternalFavorite, fetchFavorites, removeFavorite } from '@/api/account';
import {
  LENS_MIN_TEXT, analyzeLensBarcode, isLensAllowedMime, lensMimeOf, analyzeLensCode, analyzeLensUrl, chooseLensEvent, classifyLensScan,
  createLensWatch, fetchLensHistory, lensUploadInputFrom, detectedItemRoi, type LensAnalysis, type LensCandidate,
  type LensDetectedItem,
} from '@/api/lens';
import { analyzeLensImageStream, type LensProgress } from '@/api/lensStream';
import * as Layers from '@/features/lens/lensLayers';
import { LensBase, type LensCapturedImage } from '@/features/lens/LensBase';
import { LensResultsDrawer } from '@/features/lens/LensResultsDrawer';
import { LensHelp } from '@/features/lens/LensHelp';
import { LensOcerex } from '@/features/lens/LensOcerex';
import { LensHistory } from '@/features/lens/LensHistory';

/** مدة منع إعادة قراءة الرمز نفسه من الكاميرا الحيّة (ملّي ثانية). */
const LIVE_SCAN_REPEAT_MS = 4_000;

/** قصّ يطلبه الخادم بالنسب المائوية (0..100). */
type LensRoi = { x: number; y: number; w: number; h: number };

export default function LensScreen() {
  const { t, locale } = useI18n();
  const params = useLocalSearchParams<{ mode?: string; layer?: string }>();

  /** الوضع + الدرج المفتوح: مصدر الحقيقة الوحيد للتنقل داخل Lens. */
  const [stack, setStack] = useState<Layers.LensStack>(Layers.LENS_START);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  /** Lens هي الشاشة المعروضة الآن (الكاميرا تعمل فقط في هذه الحالة). */
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  const [preview, setPreview] = useState('');
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<LensAnalysis | null>(null);
  const [textResults, setTextResults] = useState<LensCandidate[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  /** Étape en cours et fiches déjà reçues pendant l'analyse en flux. */
  const [progress, setProgress] = useState<LensProgress | null>(null);
  const [streamCards, setStreamCards] = useState<LensCandidate[]>([]);
  const streamController = useRef<AbortController | null>(null);
  const lastAsset = useRef<LensCapturedImage | null>(null);
  /** `roi` du dernier appel (null = la photo entière). Sert à « Réessayer ». */
  const lastRoi = useRef<LensRoi | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  /** Éléments de la photo entière (ne changent pas quand on cherche un élément précis). */
  const [detectedItems, setDetectedItems] = useState<LensDetectedItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const queryClient = useQueryClient();
  const favorites = useQuery({
    queryKey: ['account', 'favorites'],
    queryFn: ({ signal }) => fetchFavorites({ signal }),
    // بلا حساب ⇒ الخادم يرفض، والقلب يبقى فارغاً ويطلب الدخول عند الضغط.
    retry: 0,
  });
  const favoriteList = favorites.data ?? [];
  /** روابط المصدر المحفوظة: الخادم يطابق المفضّلة بـ `sourceUrl`. */
  const favoriteUrls = new Set(favoriteList.map((favorite) => favorite.sourceUrl));

  const history = useQuery({
    queryKey: ['lens', 'history'],
    queryFn: ({ signal }) => fetchLensHistory({ signal }),
    staleTime: 60_000,
    // ما فماش حساب ⇒ الخادم يرجّع [] — العرض يقول «ما فماش» بلا ما يفشل.
    retry: 0,
  });

  const fail = useCallback((error: unknown) => {
    setNote(isApiError(error) ? userMessage(error)[locale] : t('lens.failed'));
  }, [locale, t]);

  /** إيقاف التحليل الجاري (إغلاق الدرج أو تغيير الوضع). */
  const cancelStream = useCallback(() => {
    streamController.current?.abort();
  }, []);

  /** إغلاق الدرج المفتوح؛ الوضع يبقى كما هو. */
  const dismissLayer = useCallback(() => {
    if (stackRef.current.layer === 'results') cancelStream();
    setStack((current) => Layers.closeLayer(current));
  }, [cancelStream]);

  /** تغيير الوضع: يغلق أي درج ويوقف التحليل الجاري. */
  const switchMode = useCallback((next: Layers.LensMode) => {
    cancelStream();
    setNote('');
    setStack((current) => Layers.changeMode(current, next));
  }, [cancelStream]);

  /** زر الرجوع في الجهاز: يتبع منطق الطبقات، وإن لم يبقَ شيء يترك التبويبات تتولّى الباقي. */
  const onHardwareBack = useCallback(() => {
    if (Layers.backAction(stackRef.current) === 'leave') return false;
    if (stackRef.current.layer === 'results') cancelStream();
    setStack((current) => Layers.applyBack(current));
    return true;
  }, [cancelStream]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => subscription.remove();
  }, [onHardwareBack]));

  /** روابط الدخول: `?mode=live` و`?layer=ocerex` (بديل الصفحات القديمة). */
  useEffect(() => {
    if (params.mode === 'photo' || params.mode === 'live' || params.mode === 'code') switchMode(params.mode);
    if (params.layer === 'ocerex') setStack((current) => Layers.openLayer(current, 'ocerex'));
  }, [params.mode, params.layer, switchMode]);

  /**
   * نفس مسار الموقع: نبعثو الملف للخادم، وهو اللي يقرا ويحكم.
   * التحليل يجي في تدفق: كل خطوة وكل فيشة تظهر حين يرسلها الخادم.
   */
  const analyzeAsset = useCallback(async (asset: LensCapturedImage, roi?: LensRoi) => {
    // صيغة مرفوضة تُقال قبل أي رفع: لا 6 ميغا تُرسل لتُرفض، ولا نتائج قديمة تُمسح.
    if (!isLensAllowedMime(lensMimeOf(asset))) {
      setNote(t('lens.unsupportedImage'));
      return;
    }
    lastAsset.current = asset;
    lastRoi.current = roi ?? null;
    setNote('');
    setAnalysis(null);
    setTextResults(null);
    setStreamCards([]);
    setProgress(null);
    setPreview(asset.uri);
    setPreviewSize(asset.width && asset.height ? { width: asset.width, height: asset.height } : null);
    if (!roi) {
      // photo جديدة (ما هيش بحث عن عنصر): نبدّلو العناصر والاختيار.
      setDetectedItems([]);
      setSelectedIndex(-1);
    }
    setStack((current) => Layers.openLayer(current, 'results'));
    streamController.current?.abort();
    const controller = new AbortController();
    streamController.current = controller;
    setBusy(true);
    try {
      const result = await analyzeLensImageStream(
        roi ? { ...lensUploadInputFrom(asset), roi } : lensUploadInputFrom(asset),
        {
          onProgress: setProgress,
          onCard: (candidate) => setStreamCards((prev) => (
            prev.some((item) => item.sourceUrl === candidate.sourceUrl) ? prev : [...prev, candidate]
          )),
        },
        { signal: controller.signal },
      );
      setAnalysis(result);
      if (!roi) setDetectedItems(result.items);
      setStreamCards([]);
      if (!result.candidates.length) setNote(t('lens.noResults'));
    } catch (error) {
      // تحليل أُلغي لأن تحليلاً جديداً بدأ (إعادة المحاولة) أو لأن المستعمل ألغى: ما يلمس الحالة.
      if (isApiError(error) && error.isAborted) return;
      if (streamController.current !== controller) return;
      setStreamCards([]);
      fail(error);
    } finally {
      // الحالة تُصفَّر فقط إذا كان هذا التحليل هو الحالي؛ القديم لا يُسكت الجديد.
      if (streamController.current === controller) {
        streamController.current = null;
        setBusy(false);
        setProgress(null);
      }
    }
  }, [fail, t]);

  /**
   * قراءة نصّ أو رمز (QR / باركود / رابط): الخادم يعطي المعنى، والنتائج تظهر في الدرج.
   * القفل يمنع تكرار قراءة واحدة من الكاميرا الحيّة.
   */
  const scanLock = useRef(false);
  /** آخر رمز قُرئ من الكاميرا الحيّة ووقته (انظر `onBarcode`). */
  const lastScan = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const runCode = useCallback(async (raw: string) => {
    const target = classifyLensScan(raw);
    if (!target) {
      setNote(t('lens.scanEmpty'));
      return;
    }
    lastAsset.current = null;
    lastRoi.current = null;
    setNote('');
    setAnalysis(null);
    setPreview('');
    setStreamCards([]);
    setProgress(null);
    setTextResults(null);
    setStack((current) => Layers.openLayer(current, 'results'));
    setBusy(true);
    try {
      let found: LensCandidate[];
      if (target.kind === 'barcode') {
        found = (await analyzeLensBarcode(target.value)).candidates;
      } else if (target.kind === 'url') {
        const result = await analyzeLensUrl(target.value, { channel: 'qr' });
        found = result.alternates;
        if (result.fallback) setNote(t('lens.urlFallback'));
      } else {
        found = (await analyzeLensCode(target.value)).candidates;
      }
      setTextResults(found);
      if (!found.length) setNote(t('lens.noResults'));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }, [fail, t]);

  /** قراءة الكاميرا الحيّة: تُتجاهل إذا كان درج مفتوح أو قراءة جارية. */
  const onBarcode = useCallback((value: string) => {
    if (!Layers.scanAllowed(stackRef.current) || scanLock.current) return;
    // الكاميرا تعيد قراءة الرمز نفسه ما دام في الإطار: بدون هذا، إغلاق الدرج يفتحه من جديد فوراً.
    const now = Date.now();
    if (value === lastScan.current.value && now - lastScan.current.at < LIVE_SCAN_REPEAT_MS) return;
    lastScan.current = { value, at: now };
    scanLock.current = true;
    void runCode(value).finally(() => { scanLock.current = false; });
  }, [runCode]);

  const retryAnalysis = useCallback(() => {
    if (lastAsset.current) void analyzeAsset(lastAsset.current, lastRoi.current ?? undefined);
  }, [analyzeAsset]);

  /** المعرض فقط: التصوير صار داخل معاينة الكاميرا نفسها. */
  const openGallery = useCallback(async () => {
    setNote('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        // إذن مرفوض = السبب الصريح، موش شاشة ساكتة.
        setNote(t('lens.permissionDenied'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsMultipleSelection: false,
      });
      if (result.canceled || !result.assets?.length) return;
      await analyzeAsset(result.assets[0]);
    } catch (error) {
      fail(error);
    }
  }, [analyzeAsset, fail, t]);

  /** فتح نتائج الرابط: نمرّرو الرابط إلى شاشة المتجر. الدرج يُغلق أولاً. */
  const openCandidate = useCallback((candidate: LensCandidate) => {
    if (analysis?.eventId) void chooseLensEvent(analysis.eventId).catch(() => {});
    setStack((current) => Layers.closeLayer(current));
    router.push({
      pathname: '/aywebs/browser',
      params: { url: candidate.sourceUrl, storeId: '', capture: '1' },
    });
  }, [analysis?.eventId]);

  /** OCEREX → السلة: الدروج تُغلق قبل الانتقال حتى لا تبقى حالة قديمة عند العودة. */
  const goToCart = useCallback(() => {
    setStack((current) => Layers.closeLayer(current));
    router.push('/cart');
  }, []);

  /** السجل → المراقبة: الصفحة الكاملة، والدرج يُغلق قبلها. */
  const openWatches = useCallback(() => {
    setStack((current) => Layers.closeLayer(current));
    router.push('/lens/watches');
  }, []);

  /** قلب فيشة Lens: يحفظها في مفضّلات الحساب، أو يحذفها إذا كانت محفوظة. */
  const toggleFavorite = useMutation({
    mutationFn: async (candidate: LensCandidate) => {
      const saved = favoriteList.find((favorite) => favorite.sourceUrl === candidate.sourceUrl);
      if (saved) {
        await removeFavorite(saved.id);
        return;
      }
      await addExternalFavorite({
        sourceUrl: candidate.sourceUrl,
        title: candidate.title,
        imageUrl: candidate.image,
        priceTnd: candidate.priceTnd,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['account', 'favorites'] });
    },
    onError: (error) => {
      if (isApiError(error) && (error.status === 401 || error.status === 403)) {
        setNote(t('lens.favoriteSignIn'));
        return;
      }
      setNote(isApiError(error) ? userMessage(error)[locale] : t('lens.failed'));
    },
  });

  /** مراقبة سعر: تستلزم حساباً — 401 تُقال بصراحة مع باب للدخول. */
  const watch = useMutation({
    mutationFn: (candidate: LensCandidate) => createLensWatch({
      url: candidate.sourceUrl,
      title: candidate.title,
      imageUrl: candidate.image,
      source: candidate.source,
    }),
    onSuccess: () => setNote(t('lens.watchAdded')),
    onError: (error) => {
      if (isApiError(error) && (error.status === 401 || error.status === 403)) {
        setNote(t('lens.watchSignIn'));
        return;
      }
      setNote(isApiError(error) ? userMessage(error)[locale] : t('lens.failed'));
    },
  });

  /** اختيار عنصر من الصورة: نعيد البحث بقصّ الخادم على كادره، في نفس الدرج. */
  const selectItem = useCallback((index: number) => {
    const item = detectedItems[index];
    if (!item || !lastAsset.current) return;
    setSelectedIndex(index);
    void analyzeAsset(lastAsset.current, detectedItemRoi(item));
  }, [analyzeAsset, detectedItems]);

  const candidates = analysis?.candidates ?? textResults ?? streamCards;
  const layer = stack.layer;

  /**
   * الدرج المعروض يبقى مركّباً بعد أن يطلب المستعمل إغلاقه، حتى تنتهي حركة الخروج
   * (`onDrawerClosed`). يُحدَّث أثناء الرسم نفسه، فلا يظهر إطار فارغ عند الفتح.
   */
  const [rendered, setRendered] = useState<Layers.LensLayer | null>(null);
  if (layer !== null && rendered !== layer) setRendered(layer);
  const onDrawerClosed = useCallback(() => {
    setRendered((current) => (stackRef.current.layer === null ? null : current));
  }, []);

  /** الكاميرا تعمل حين تكون Lens معروضة وليس وضع الرابط. */
  const cameraActive = focused && stack.mode !== 'code';

  return (
    /**
     * ملء الشاشة: الكاميرا تبدأ من الحافة العليا وتحت الترويسة الشفافة، بلا هوامش
     * ولا إطار مستدير. التبويبات بقيت في التدفق أسفل الشاشة، فالمعاينة تنتهي فوقها.
     */
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <LensBase
          mode={stack.mode}
          active={cameraActive}
          busy={busy}
          thumbnailUri={preview}
          note={layer === null ? note : ''}
          code={text}
          codeReady={text.trim().length >= LENS_MIN_TEXT}
          onCodeChange={setText}
          onSearchCode={() => { void runCode(text.trim()); }}
          onModeChange={switchMode}
          onHelp={() => setStack((current) => Layers.openLayer(current, 'help'))}
          onHistory={() => setStack((current) => Layers.openLayer(current, 'history'))}
          onOcerex={() => setStack((current) => Layers.openLayer(current, 'ocerex'))}
          onBarcode={onBarcode}
          onCapture={(image) => { void analyzeAsset(image); }}
          onOpenGallery={() => { void openGallery(); }}
          onCaptureFailed={() => setNote(t('lens.captureFailed'))}
        />

        {rendered === 'results' ? (
          <LensResultsDrawer
            open={layer === 'results'}
            onClosed={onDrawerClosed}
            busy={busy}
            imageUri={preview}
            imageSize={previewSize}
            progress={progress}
            results={candidates}
            items={detectedItems}
            selectedIndex={selectedIndex}
            note={note}
            analysis={analysis}
            onClose={dismissLayer}
            onRetry={retryAnalysis}
            onSelectItem={selectItem}
            onOpenCandidate={openCandidate}
            onWatch={(item) => watch.mutate(item)}
            watchBusy={watch.isPending}
            favoriteUrls={favoriteUrls}
            favoriteBusy={toggleFavorite.isPending}
            onToggleFavorite={(item) => toggleFavorite.mutate(item)}
          />
        ) : null}

        {rendered === 'help' ? (
          <LensHelp open={layer === 'help'} onClose={dismissLayer} onClosed={onDrawerClosed} />
        ) : null}
        {rendered === 'ocerex' ? (
          <LensOcerex
            open={layer === 'ocerex'}
            onClose={dismissLayer}
            onClosed={onDrawerClosed}
            onGoToCart={goToCart}
          />
        ) : null}
        {rendered === 'history' ? (
          <LensHistory
            open={layer === 'history'}
            onClosed={onDrawerClosed}
            entries={history.data ?? []}
            pending={history.isPending}
            failed={history.isError}
            error={history.error}
            onRetry={() => { void history.refetch(); }}
            onOpenWatches={openWatches}
            onClose={dismissLayer}
          />
        ) : null}
      </View>
      <AppHeader scrolled={false} />
    </View>
  );
}
