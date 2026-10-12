/**
 * Lens — P4، الشريحة 1: صورة أو كلمة ⇒ نتائج من فيشات المتاجر الحقيقية.
 *
 * قواعد هذي الشاشة (نفس مبادئ المنتوج كلّو):
 *  • **الصورة ما تعطي سعراً**: كنبعثو الصورة، والخادم يجيب صفحات المتاجر،
 *    ويقرا السعر من الفيشة (JSON-LD/ميتا/دوم) ويحوّلو للدينار. الرقم اللي
 *    يظهر هو رقم الخادم — وإذا الخادم ما لقاش سعر منشور نقولو «ما فماش».
 *  • **التوفّر والثقة يتقالوا**: `VERIFIED` / `PENDING_MANUAL`، و`in_stock` /
 *    `limited` / `out_of_stock` / `unknown` — بلا تجميل.
 *  • **الفيشات الموقوفة ما تتخبّاش**: الخادم يقول كم فيشة تخبّتت وعلاش.
 *  • **الأدوات الناقصة تتقال**: QR/الباركود (القارئ في الشريحة الجاية) ومراقبة
 *    السعر (تستلزم حساب) مكتوبين بصراحة — ما فماش زرّ يدّعي الّي ما كاينش.
 *
 * الاختيار يفتح مسار AYWEBs: نفس المتجر، نفس الكابتشر، ونفس «Add to Cart» —
 * لأن الإضافة ما تتقرّرش هنا، تتقرّر في الخادم.
 */
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppScreen } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import { AppText, Button, Card, Field, KeyValue, SectionHeader, Segmented } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';
import { addExternalFavorite, fetchFavorites, removeFavorite } from '@/api/account';
import {
  LENS_MIN_TEXT, analyzeLensText, chooseLensEvent, createLensWatch,
  fetchLensHistory, lensUploadInputFrom, detectedItemRoi, type LensAnalysis, type LensCandidate,
  type LensDetectedItem,
} from '@/api/lens';
import { analyzeLensImageStream, type LensProgress } from '@/api/lensStream';
import { LensResultCard } from '@/features/lens/LensResultCard';
import { LensResultsSheet } from '@/features/lens/LensResultsSheet';
import { LensCamera, type LensCapturedImage } from '@/features/lens/LensCamera';

/** قصّ يطلبه الخادم بالنسب المائوية (0..100). */
type LensRoi = { x: number; y: number; w: number; h: number };

/** طريقة البحث: صورة، أو مسح مباشر (QR/باركود)، أو رابط/رمز نصّي. */
type LensMode = 'photo' | 'live' | 'code';

export default function LensScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();

  const [mode, setMode] = useState<LensMode>('photo');
  const [preview, setPreview] = useState('');
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<LensAnalysis | null>(null);
  const [textResults, setTextResults] = useState<LensCandidate[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  /** Étape en cours et fiches déjà reçues pendant l'analyse en flux. */
  const [progress, setProgress] = useState<LensProgress | null>(null);
  const [streamCards, setStreamCards] = useState<LensCandidate[]>([]);
  const [canRetry, setCanRetry] = useState(false);
  /** الورقة مفتوحة للتحليل الحالي (تبقى حتى يغلقها المستعمل). */
  const [sheetOpen, setSheetOpen] = useState(false);
  /** الكاميرا بملء الشاشة مفتوحة (وضع الصورة فقط). */
  const [cameraOpen, setCameraOpen] = useState(true);
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

  /**
   * نفس مسار الموقع: نبعثو الملف للخادم، وهو اللي يقرا ويحكم.
   * التحليل يجي في تدفق: كل خطوة وكل فيشة تظهر حين يرسلها الخادم.
   */
  const analyzeAsset = useCallback(async (asset: LensCapturedImage, roi?: LensRoi) => {
    lastAsset.current = asset;
    lastRoi.current = roi ?? null;
    setNote('');
    setCanRetry(false);
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
    setSheetOpen(true);
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
      setCanRetry(true);
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

  /** إغلاق الورقة: يلغي التحليل الجاري إن وُجد، ويرجع المستعمل إلى الكاميرا. */
  const closeSheet = useCallback(() => {
    streamController.current?.abort();
    setSheetOpen(false);
    // بعد إغلاق النتائج نرجع إلى الكاميرا (وضع الصورة).
    setCameraOpen(mode !== 'code');
  }, [mode]);

  /** تغيير الوضع من شريط الأوضاع (الصفحة أو الكاميرا): الكاميرا تفتح للصورة فقط. */
  const changeMode = useCallback((next: LensMode) => {
    setMode(next);
    setCameraOpen(next !== 'code');
  }, []);

  /** كل رجوع إلى Lens (من المساعدة أو OCEREX أو المسح) يعيد الكاميرا، إلا وضع الرابط/الرمز. */
  useFocusEffect(useCallback(() => {
    if (mode !== 'code') setCameraOpen(true);
  }, [mode]));

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

  const searchByText = useMutation({
    mutationFn: (query: string) => analyzeLensText(query),
    onSuccess: (result) => {
      setNote('');
      setAnalysis(null);
      setPreview('');
      setTextResults(result.candidates);
      if (!result.candidates.length) setNote(t('lens.noResults'));
    },
    onError: fail,
  });

  /** فتح نتائج الرابط: نمرّرو الرابط إلى شاشة المتجر (كابتشر + Add to Cart). */
  const openCandidate = useCallback((candidate: LensCandidate) => {
    if (analysis?.eventId) void chooseLensEvent(analysis.eventId).catch(() => {});
    router.push({
      pathname: '/aywebs/browser',
      params: { url: candidate.sourceUrl, storeId: '', capture: '1' },
    });
  }, [analysis?.eventId]);

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

  /** اختيار عنصر من الصورة: نعيد البحث بقصّ الخادم على كادره، في نفس الورقة. */
  const selectItem = useCallback((index: number) => {
    const item = detectedItems[index];
    if (!item || !lastAsset.current) return;
    setSelectedIndex(index);
    void analyzeAsset(lastAsset.current, detectedItemRoi(item));
  }, [analyzeAsset, detectedItems]);

  const candidates = analysis?.candidates ?? textResults ?? streamCards;
  /** الورقة تظهر في وضع الصورة فقط: أثناء البحث، أو حين تكون الفيشات جاهزة. */
  const sheetShown = mode !== 'code' && sheetOpen && (busy || candidates.length > 0);

  return (
    <AppScreen
      overlayHeader={({ scrolled }) => <AppHeader scrolled={scrolled} />}
      hasBottomBar
      chrome onRefresh={() => { history.refetch(); }}>

      {/*
        رسالة القسم — هاذا النصّ كان يعيش في هيدر `Screen` القديم.
        صار `SectionHeader` (§18.2-3): نفس المحتوى، بمكوّن موحّد.
      */}
      <SectionHeader title={t('screen.lens.subtitle')} hint={t('screen.lens.body')} />
      <Segmented<LensMode>
        label={t('lens.mode.label')}
        value={mode}
        onChange={changeMode}
        options={[
          { value: 'photo', label: t('lens.mode.photo') },
          { value: 'live', label: t('lens.mode.live') },
          { value: 'code', label: t('lens.mode.code') },
        ]}
      />
      <LensResultsSheet
        visible={sheetShown}
        busy={busy}
        imageUri={preview}
        imageSize={previewSize}
        progress={progress}
        results={candidates}
        items={detectedItems}
        selectedIndex={selectedIndex}
        note={note}
        onSelectItem={selectItem}
        onClose={closeSheet}
        onRetry={retryAnalysis}
        onOpenCandidate={(candidate) => { setSheetOpen(false); openCandidate(candidate); }}
        onWatch={(item) => watch.mutate(item)}
        watchBusy={watch.isPending}
        favoriteUrls={favoriteUrls}
        favoriteBusy={toggleFavorite.isPending}
        onToggleFavorite={(item) => toggleFavorite.mutate(item)}
      />

      <LensCamera
        visible={cameraOpen && mode !== 'code'}
        mode={mode}
        busy={busy}
        thumbnailUri={preview}
        onModeChange={changeMode}
        onClose={() => setCameraOpen(false)}
        onHelp={() => { setCameraOpen(false); router.push('/lens/help'); }}
        onOcerex={() => { setCameraOpen(false); router.push('/lens/ocerex'); }}
        onCapture={(image) => { setCameraOpen(false); void analyzeAsset(image); }}
        onOpenGallery={() => { setCameraOpen(false); void openGallery(); }}
        onCaptureFailed={() => setNote(t('lens.captureFailed'))}
      />

      {mode !== 'code' ? (
        <>
          {!cameraOpen ? (
            <Button label={t('lens.openCamera')} onPress={() => setCameraOpen(true)} />
          ) : null}
          {note || (canRetry && lastAsset.current) ? (
            <Card>
              {note ? (
                <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{note}</AppText>
              ) : null}
              {canRetry && !busy && lastAsset.current ? (
                <Button label={t('lens.progress.retry')} tone="quiet" onPress={retryAnalysis} />
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}

      {mode === 'code' ? (
      <Card title={t('lens.textTitle')} hint={t('lens.textHint')}>
        <Field
          label={t('lens.textLabel')}
          accessibilityLabel={t('lens.textLabel')}
          value={text}
          onChangeText={setText}
          placeholder={t('lens.textPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button
          label={t('lens.search')}
          tone="quiet"
          testID="lens-search"
          busy={searchByText.isPending}
          disabled={text.trim().length < LENS_MIN_TEXT || searchByText.isPending}
          onPress={() => searchByText.mutate(text.trim())}
        />
        {searchByText.isError ? (
          <ErrorBlock error={searchByText.error} onRetry={() => searchByText.mutate(text.trim())} />
        ) : null}
        <Button label={t('lens.close')} tone="quiet" onPress={() => changeMode('photo')} />
      </Card>

      ) : null}

      {analysis ? (
        <Card title={t('lens.analysisTitle')}>
          <KeyValue
            label={t('lens.identification')}
            value={[analysis.identification.brand, analysis.identification.model].filter(Boolean).join(' ')
              || analysis.identification.description
              || t('lens.identificationUnknown')}
          />
          {analysis.query ? <KeyValue label={t('lens.query')} value={analysis.query} /> : null}
          <KeyValue label={t('lens.resultsCount')} value={String(analysis.candidates.length)} />
          {analysis.excluded.count > 0 ? (
            <AppText variant="caption" color={theme.colors.muted}>
              {t('lens.excluded', { count: analysis.excluded.count })}
            </AppText>
          ) : null}
          <AppText variant="caption" color={theme.colors.muted}>
            {t('lens.liveStock', {
              fetched: analysis.liveStock.fetched,
              cached: analysis.liveStock.cacheHits,
            })}
          </AppText>
        </Card>
      ) : null}

      {candidates.length && !sheetShown ? (
        <Card title={t('lens.resultsTitle')} hint={t('lens.resultsHint')}>
          <View style={styles.grid}>
            {candidates.map((candidate, index) => (
              <View key={candidate.id || `${candidate.sourceUrl}-${index}`} style={styles.cell}>
                <LensResultCard
                  candidate={candidate}
                  onOpen={openCandidate}
                  onWatch={(item) => watch.mutate(item)}
                  watchBusy={watch.isPending}
                  favorite={favoriteUrls.has(candidate.sourceUrl)}
                  favoriteBusy={toggleFavorite.isPending}
                  onToggleFavorite={(item) => toggleFavorite.mutate(item)}
                />
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {mode === 'live' ? (
        <Card title={t('lens.scanTitle')} hint={t('lens.scanHint')}>
          <Button label={t('lens.scanOpen')} onPress={() => router.push('/lens/scan')} />
        </Card>
      ) : null}

      <Card title={t('lens.watchTitle')} hint={t('lens.watchHint')}>
        <Button label={t('lens.watchOpen')} tone="quiet" onPress={() => router.push('/lens/watches')} />
      </Card>

      {mode !== 'photo' ? (
        <Card title={t('ocerex.title')} hint={t('ocerex.hint')}>
          <Button label={t('ocerex.open')} onPress={() => router.push('/lens/ocerex')} />
        </Card>
      ) : null}

      <Card title={t('lens.historyTitle')}>
        {history.isPending ? (
          <LoadingBlock labelKey="loading.generic" />
        ) : history.isError ? (
          <ErrorBlock error={history.error} onRetry={() => { history.refetch(); }} />
        ) : (history.data ?? []).length === 0 ? (
          <EmptyBlock>{t('lens.historyEmpty')}</EmptyBlock>
        ) : (
          (history.data ?? []).map((entry) => (
            <View key={entry.id} style={[styles.historyRow, { borderTopColor: theme.colors.line }]}>
              <AppText variant="label" numberOfLines={2}>{entry.title}</AppText>
              <AppText variant="caption" color={theme.colors.muted}>
                {entry.queryLabel || entry.source} · {entry.resultsCount}
              </AppText>
            </View>
          ))
        )}
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  cell: { width: '48%' },
  historyRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8, gap: 2 },
});
