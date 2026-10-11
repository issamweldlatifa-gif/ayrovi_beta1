/**
 * Lens — P4، الشريحة 2: المسح بالكاميرا (QR / باركود).
 *
 * القارئ محلي على الجهاز (الكاميرا تفكّ الرمز)، أمّا **المعنى** فيجي من الخادم:
 *   • 6..14 رقم ⇒ `/analyze-barcode`
 *   • رابط (بلا بروتوكول زادة) ⇒ `/analyze-url` بقناة `qr`
 *   • نصّ آخر ⇒ `/analyze-code`
 *
 * هذا هو نفس مبدأ الموقع: الرمز يفكّ محلياً، والبحث والتسعير على الخادم. القيمة
 * المقروءة تتقصّ وتتنقّى، والقفل يمنع عشرات القراءات في الثانية الواحدة من نفس
 * الرمز (`onBarcodeScanned` يتصلّى بلا توقّف على الكاميرا الحيّة).
 *
 * إذن الكاميرا مرفوض = سبب صريح وحلّ مقترح (الإعدادات)، موش شاشة سوداء.
 */
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';

import { AppText, Button, Card, Field, KeyValue } from '@/design/ui';
import { SubScreen } from '@/design/subScreen';
import { ErrorBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';
import {
  LENS_BARCODE_TYPES, analyzeLensBarcode, analyzeLensCode, analyzeLensUrl,
  classifyLensScan, type LensCandidate, type LensUrlResult,
} from '@/api/lens';
import { CandidateCard } from '@/features/lens/CandidateCard';

export default function LensScanScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();

  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [readValue, setReadValue] = useState('');
  const [candidates, setCandidates] = useState<LensCandidate[] | null>(null);
  const [product, setProduct] = useState<LensUrlResult | null>(null);
  const handled = useRef('');

  const reset = useCallback(() => {
    handled.current = '';
    setLocked(false);
    setCandidates(null);
    setProduct(null);
    setReadValue('');
    setNote('');
    setError(null);
  }, []);

  const run = useCallback(async (raw: string) => {
    const target = classifyLensScan(raw);
    if (!target) {
      setNote(t('lens.scanEmpty'));
      setLocked(false);
      return;
    }
    // نفس القيمة مرّتين = نفس القراءة، بلا طلب ثاني.
    if (handled.current === `${target.kind}:${target.value}`) return;
    handled.current = `${target.kind}:${target.value}`;
    setReadValue(target.value);
    setBusy(true);
    setError(null);
    setNote('');
    try {
      if (target.kind === 'barcode') {
        const result = await analyzeLensBarcode(target.value);
        setCandidates(result.candidates);
        if (!result.candidates.length) setNote(t('lens.noResults'));
      } else if (target.kind === 'url') {
        const result = await analyzeLensUrl(target.value, { channel: 'qr' });
        setProduct(result);
        setCandidates(result.alternates);
        if (result.fallback) setNote(t('lens.urlFallback'));
        else if (!result.alternates.length && !result.product.title) setNote(t('lens.noResults'));
      } else {
        const result = await analyzeLensCode(target.value);
        setCandidates(result.candidates);
        if (!result.candidates.length) setNote(t('lens.noResults'));
      }
    } catch (caught) {
      setError(caught);
      setNote(isApiError(caught) ? userMessage(caught)[locale] : t('lens.failed'));
    } finally {
      setBusy(false);
    }
  }, [locale, t]);

  const onScanned = useCallback((result: BarcodeScanningResult) => {
    // الكاميرا الحيّة تتصلّى بلا توقّف: نقفل من أول قيمة، والباقي يتجاهل.
    if (locked || busy) return;
    setLocked(true);
    void run(String(result.data ?? ''));
  }, [busy, locked, run]);

  const openCandidate = useCallback((candidate: LensCandidate) => {
    router.push({
      pathname: '/aywebs/browser',
      params: { url: candidate.sourceUrl, storeId: '', capture: '1' },
    });
  }, []);

  const openProduct = useCallback(() => {
    const url = product?.product.sourceUrl;
    if (!url) return;
    router.push({ pathname: '/aywebs/browser', params: { url, storeId: '', capture: '1' } });
  }, [product]);

  const scanning = permission?.granted === true && !locked && !busy;

  /**
   * Coquille reprise à `SubScreen` : le bouton retour, la zone sûre et le
   * défilement viennent d'un seul endroit. Cette écran recalculait les siens
   * (`paddingTop: insets.top`, `paddingBottom: 32`) — le genre de choix qui,
   * répété, a produit 23 écrans sur 35 sans zone sûre.
   */
  return (
    <SubScreen title={t('lens.scanTitle')} fallback="/(tabs)/lens">
        {permission?.granted === false ? (
          <Card title={t('lens.cameraDeniedTitle')}>
            <AppText variant="caption" color={theme.colors.muted}>{t('lens.cameraDeniedBody')}</AppText>
            <Button label={t('lens.cameraAsk')} onPress={() => { void requestPermission(); }} />
          </Card>
        ) : (
          <View style={[styles.viewport, { borderColor: theme.colors.line, borderRadius: theme.radius.card }]}>
            {scanning ? (
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: [...LENS_BARCODE_TYPES] }}
                onBarcodeScanned={onScanned}
              />
            ) : (
              <View style={styles.cameraPlaceholder}>
                <AppText variant="caption" color={theme.colors.muted}>
                  {busy ? t('lens.scanBusy') : t('lens.scanPaused')}
                </AppText>
              </View>
            )}
          </View>
        )}

        {note ? (
          <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{note}</AppText>
        ) : null}
        {error ? <ErrorBlock error={error} /> : null}
        {readValue ? <KeyValue label={t('lens.scanValue')} value={readValue} /> : null}
        {locked || busy || candidates || product ? (
          <Button label={t('lens.scanAgain')} tone="quiet" disabled={busy} onPress={reset} />
        ) : null}

        {/* كي ما تخدمش الكاميرا (جهاز بلا كاميرا، محاكي، إذن): المسار اليدوي. */}
        <Card title={t('lens.manualTitle')}>
          <ManualEntry onSubmit={run} disabled={busy} />
        </Card>

        {product ? (
          <Card title={t('lens.resultsTitle')} hint={product.product.source}>
            <KeyValue label={t('aywebs.productTitle')} value={product.product.title || t('lens.identificationUnknown')} />
            {product.product.priceTnd != null ? (
              <KeyValue label={t('aywebs.totalTnd')} value={`${product.product.priceTnd.toFixed(2)} TND`} />
            ) : (
              <KeyValue label={t('aywebs.totalTnd')} value={t('lens.noQuote')} />
            )}
            <Button label={t('lens.openInAywebs')} tone="quiet" onPress={openProduct} />
          </Card>
        ) : null}

        {candidates?.length ? (
          <Card title={t('lens.resultsTitle')} hint={t('lens.resultsHint')}>
            {candidates.map((candidate, index) => (
              <CandidateCard
                key={candidate.id || `${candidate.sourceUrl}-${index}`}
                candidate={candidate}
                onOpen={openCandidate}
              />
            ))}
          </Card>
        ) : null}
    </SubScreen>
  );
}

/** إدخال يدوي للرمز/الباركود: نفس مسار الكاميرا، بلا كاميرا. */
function ManualEntry({ onSubmit, disabled }: { onSubmit: (value: string) => void; disabled: boolean }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  return (
    <>
      <Field
        label={t('lens.manualLabel')}
        value={value}
        onChangeText={setValue}
        placeholder={t('lens.manualPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        label={t('lens.manualSubmit')}
        tone="quiet"
        disabled={disabled || value.trim().length < 2}
        onPress={() => onSubmit(value.trim())}
      />
    </>
  );
}

const styles = StyleSheet.create({
  viewport: { height: 260, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  camera: { flex: 1 },
  cameraPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
