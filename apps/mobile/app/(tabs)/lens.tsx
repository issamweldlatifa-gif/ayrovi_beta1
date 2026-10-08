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
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery } from '@tanstack/react-query';

import { AppScreen } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import { AppText, Button, Card, Field, KeyValue, ResponsiveActionGroup, SectionHeader } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';
import {
  LENS_MIN_TEXT, analyzeLensImage, analyzeLensText, chooseLensEvent, createLensWatch,
  fetchLensHistory, lensUploadInputFrom, type LensAnalysis, type LensCandidate,
} from '@/api/lens';
import { CandidateCard } from '@/features/lens/CandidateCard';

export default function LensScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();

  const [preview, setPreview] = useState('');
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<LensAnalysis | null>(null);
  const [textResults, setTextResults] = useState<LensCandidate[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

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

  /** نفس مسار الموقع: نبعثو الملف للخادم، وهو اللي يقرا ويحكم. */
  const analyzeAsset = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    setNote('');
    setAnalysis(null);
    setTextResults(null);
    setPreview(asset.uri);
    setBusy(true);
    try {
      const result = await analyzeLensImage(lensUploadInputFrom(asset));
      setAnalysis(result);
      if (!result.candidates.length) setNote(t('lens.noResults'));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }, [fail, t]);

  const pickFrom = useCallback(async (source: 'camera' | 'library') => {
    setNote('');
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        // إذن مرفوض = السبب الصريح، موش شاشة ساكتة.
        setNote(t('lens.permissionDenied'));
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.9,
        allowsMultipleSelection: false,
      };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
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

  const candidates = analysis?.candidates ?? textResults ?? [];

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
      <Card title={t('lens.photoTitle')} hint={t('lens.photoHint')}>
        <ResponsiveActionGroup>
          <Button label={t('lens.camera')} onPress={() => pickFrom('camera')} busy={busy} disabled={busy} />
          <Button label={t('lens.gallery')} tone="quiet" onPress={() => pickFrom('library')} disabled={busy} />
        </ResponsiveActionGroup>
        {preview ? <Image source={{ uri: preview }} style={styles.preview} resizeMode="contain" /> : null}
        {busy ? (
          <View style={styles.row}>
            <ActivityIndicator />
            <AppText variant="caption" color={theme.colors.muted}>{t('lens.analyzing')}</AppText>
          </View>
        ) : null}
        {note ? (
          <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{note}</AppText>
        ) : null}
      </Card>

      <Card title={t('lens.textTitle')} hint={t('lens.textHint')}>
        <Field
          label={t('lens.textLabel')}
          value={text}
          onChangeText={setText}
          placeholder={t('lens.textPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button
          label={t('lens.search')}
          tone="quiet"
          busy={searchByText.isPending}
          disabled={text.trim().length < LENS_MIN_TEXT || searchByText.isPending}
          onPress={() => searchByText.mutate(text.trim())}
        />
        {searchByText.isError ? (
          <ErrorBlock error={searchByText.error} onRetry={() => searchByText.mutate(text.trim())} />
        ) : null}
      </Card>

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

      {candidates.length ? (
        <Card title={t('lens.resultsTitle')} hint={t('lens.resultsHint')}>
          {candidates.map((candidate, index) => (
            <CandidateCard
              key={candidate.id || `${candidate.sourceUrl}-${index}`}
              candidate={candidate}
              onOpen={openCandidate}
              onWatch={(item) => watch.mutate(item)}
              watchBusy={watch.isPending}
            />
          ))}
        </Card>
      ) : null}

      <Card title={t('lens.scanTitle')} hint={t('lens.scanHint')}>
        <Button label={t('lens.scanOpen')} onPress={() => router.push('/lens/scan')} />
      </Card>

      <Card title={t('lens.watchTitle')} hint={t('lens.watchHint')}>
        <Button label={t('lens.watchOpen')} tone="quiet" onPress={() => router.push('/lens/watches')} />
      </Card>

      <Card title={t('ocerex.title')} hint={t('ocerex.hint')}>
        <Button label={t('ocerex.open')} onPress={() => router.push('/lens/ocerex')} />
      </Card>

      <Card title={t('lens.historyTitle')}>
        {history.isPending ? (
          <LoadingBlock label={{ fr: 'Chargement…', ar: 'جارٍ التحميل…' }} />
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
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 },
  preview: { width: '100%', height: 200, marginTop: 8 },
  candidate: { borderWidth: StyleSheet.hairlineWidth, padding: 8, marginTop: 10, gap: 2 },
  candidateImage: { width: '100%', height: 160 },
  historyRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8, gap: 2 },
});
