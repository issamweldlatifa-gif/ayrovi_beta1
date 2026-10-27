/**
 * OCEREX داخل Lens — السبع شاشات (وظائف ونصوص الموقع، بمكونات التطبيق وأيقوناته).
 *
 * الخطوة تحكمها `ocerexFlow.ts`، والـAPI في `src/api/ocerex.ts`.
 *  • التهيئة تظهر مرة واحدة (تفضيل محفوظ).
 *  • السعر المرجعي والسعر Zayrovi من الخادم، والجهاز لا يحسب شيئاً.
 *  • الطلب يُثبَّت بـ`commit` ثم يُفتح الدفع، ولا تُعرض شاشة نجاح مصنوعة.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, Button, Card, Field, Segmented } from '@/design/ui';
import { LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import { usePrefs } from '@/state/prefs';
import { useSessionId } from '@/session/session';
import {
  analyzeOcerexImage, calculateOcerexPrice, commitOcerexOrder, ocerexErrorCode, resolveOcerexLink,
  trackOcerexEvent, type OcerexCode, type OcerexExtraction,
} from '@/api/ocerex';
import { eventsForExtraction } from './ocerexEvents';
import { ApiError } from '@/api/errors';
import {
  afterAnalyze, errorCopy, isHttpUrl, type OcerexStep,
} from './ocerexFlow';
import { formatAmount, formatMoney } from '@/format/money';
import { RADIUS } from '@/design/tokens.mobile';

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;

type CaptureMode = 'photo' | 'import';

interface PickedImage { uri: string; name: string; type: string }

export function OcerexFlow({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const t = useT();
  const prefs = usePrefs();
  const queryClient = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const captureLock = useRef(false);

  const [step, setStep] = useState<OcerexStep>(prefs.ocerexOnboarded ? 'home' : 'onboarding');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo');
  const [cameraReady, setCameraReady] = useState(false);
  const [extraction, setExtraction] = useState<OcerexExtraction | null>(null);
  const [currency, setCurrency] = useState('');
  const [errorCode, setErrorCode] = useState<OcerexCode>('PROCESSING_ERROR');
  const [linkUrl, setLinkUrl] = useState('');
  const [urlError, setUrlError] = useState(false);
  const [busy, setBusy] = useState(false);
  const sessionId = useSessionId();
  const track = useCallback((event: string, extra?: { type?: string; confidenceLevel?: string }) => {
    void trackOcerexEvent(event, sessionId, extra);
  }, [sessionId]);

  useEffect(() => { track('ocerex_opened'); }, [track]);

  const fail = useCallback((code: OcerexCode) => {
    setErrorCode(code);
    setStep('error');
    setBusy(false);
  }, []);

  const priceIt = useCallback(async (current: OcerexExtraction, confirmedCurrency?: string) => {
    setStep('processing');
    try {
      const priced = await calculateOcerexPrice(current.extractionId, confirmedCurrency);
      setExtraction(priced);
      setStep('result');
    } catch (error) {
      fail(ocerexErrorCode(error));
    } finally {
      setBusy(false);
    }
  }, [fail]);

  const analyze = useCallback(async (image: PickedImage, capture: boolean) => {
    setBusy(true);
    setUrlError(false);
    setStep('processing');
    track('ocerex_ocr_started');
    try {
      const analyzed = await analyzeOcerexImage(image, capture);
      setExtraction(analyzed);
      track('ocerex_ocr_success', { type: analyzed.type, confidenceLevel: analyzed.confidenceLevel });
      for (const event of eventsForExtraction(analyzed)) track(event, { type: analyzed.type, confidenceLevel: analyzed.confidenceLevel });
      const decision = afterAnalyze(analyzed);
      if (decision.next === 'error') { track('ocerex_ocr_failed'); fail(decision.code); return; }
      if (decision.next === 'currency') {
        setCurrency(decision.defaultCurrency);
        setStep('currency');
        setBusy(false);
        return;
      }
      await priceIt(analyzed);
    } catch (error) {
      track('ocerex_ocr_failed');
      fail(ocerexErrorCode(error));
    }
  }, [fail, priceIt, track]);

  const onCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || !cameraReady || captureLock.current) return;
    captureLock.current = true;
    try {
      const picture = await camera.takePictureAsync({ quality: 0.8 });
      if (!picture?.uri) {
        throw new ApiError('device', 'La caméra n’a produit aucun fichier.', { code: 'CAMERA_FILE_MISSING' });
      }
      track('ocerex_camera_used');
      await analyze({ uri: picture.uri, name: 'prix-ocerex.jpg', type: 'image/jpeg' }, true);
    } catch (error) {
      fail(ocerexErrorCode(error));
    } finally {
      captureLock.current = false;
    }
  }, [analyze, cameraReady, fail, track]);

  const onImport = useCallback(async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    track('ocerex_image_uploaded');
    await analyze({ uri: asset.uri, name: asset.fileName || 'prix-ocerex', type: asset.mimeType || 'image/jpeg' }, false);
  }, [analyze, track]);

  const onLink = useCallback(async (url: string, fromError = false) => {
    if (!extraction) return;
    if (!isHttpUrl(url)) { setUrlError(true); return; }
    track('ocerex_link_submitted');
    setBusy(true);
    setUrlError(false);
    setStep('processing');
    try {
      const resolved = await resolveOcerexLink(extraction.extractionId, url.trim());
      setExtraction({
        ...extraction,
        ...resolved,
        ayroviPrice: extraction.ayroviPrice,
        referencePrice: extraction.referencePrice,
      });
      setStep('summary');
    } catch (error) {
      const code = ocerexErrorCode(error);
      if (code === 'INVALID_URL') {
        setUrlError(true);
        setStep(fromError ? 'error' : 'result');
      } else {
        fail(code);
      }
    } finally {
      setBusy(false);
    }
  }, [extraction, fail, track]);

  const onConfirmCurrency = useCallback(() => {
    if (!extraction) return;
    setBusy(true);
    void priceIt(extraction, currency);
  }, [extraction, currency, priceIt]);

  const onConfirmOrder = useCallback(async () => {
    if (!extraction) return;
    setBusy(true);
    try {
      await commitOcerexOrder(extraction.extractionId);
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      onClose();
      router.push('/checkout');
    } catch (error) {
      fail(ocerexErrorCode(error));
    } finally {
      setBusy(false);
    }
  }, [extraction, fail, onClose, queryClient]);

  const retry = useCallback(() => {
    captureLock.current = false;
    setCameraReady(false);
    setExtraction(null);
    setUrlError(false);
    setStep('home');
  }, []);

  const completeOnboarding = useCallback(() => {
    track('ocerex_first_use_completed');
    prefs.setOcerexOnboarded(true);
    setStep('home');
  }, [prefs, track]);

  const modeOptions: { value: CaptureMode; label: string }[] = [
    { value: 'photo', label: t('ocerex.home.photo') },
    { value: 'import', label: t('ocerex.home.import') },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Ionicons name="camera-outline" size={theme.iconSize.md} color={theme.colors.ink} />
        <AppText>{t('ocerex.title')}</AppText>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('sheet.close')} hitSlop={HIT_SLOP} testID="ocerex-close">
          <AppText variant="caption" color={theme.colors.muted}>{t('sheet.close')}</AppText>
        </Pressable>
      </View>

      {step === 'onboarding' ? (
        <Card>
          <AppText variant="caption" color={theme.colors.muted}>{t('ocerex.onboarding.eyebrow')}</AppText>
          <AppText>{t('ocerex.onboarding.title')}</AppText>
          <AppText variant="caption" color={theme.colors.muted}>{t('ocerex.onboarding.lead')}</AppText>
          <AppText variant="caption" color={theme.colors.muted}>{t('ocerex.onboarding.linkNote')}</AppText>
          <Button label={t('ocerex.onboarding.start')} onPress={completeOnboarding} block testID="ocerex-start" />
        </Card>
      ) : null}

      {step === 'home' ? (
        <Card>
          <AppText>{t('ocerex.home.explain')}</AppText>
          <Segmented
            options={modeOptions}
            value={captureMode}
            onChange={(next) => { setCameraReady(false); setCaptureMode(next); }}
            label={t('ocerex.home.mode')}
          />
          {captureMode === 'photo' ? (
            permission?.granted ? (
              <>
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing="back"
                  onCameraReady={() => setCameraReady(true)}
                  onMountError={() => fail('PROCESSING_ERROR')}
                />
                <AppText variant="caption" color={theme.colors.muted}>{t('ocerex.home.frameHint')}</AppText>
                <Button label={t('ocerex.home.capture')} onPress={onCapture} block disabled={busy || !cameraReady} testID="ocerex-capture" />
              </>
            ) : (
              <Button label={t('ocerex.home.allowCamera')} onPress={() => { void requestPermission(); }} block />
            )
          ) : (
            <Button label={t('ocerex.home.import')} onPress={onImport} block disabled={busy} testID="ocerex-import" />
          )}
        </Card>
      ) : null}

      {step === 'processing' ? <LoadingBlock labelKey="ocerex.processing" /> : null}

      {step === 'currency' && extraction ? (
        <Card>
          <AppText>{t('ocerex.currency.title')}</AppText>
          <AppText variant="caption" color={theme.colors.muted}>{t('ocerex.currency.body')}</AppText>
          <Segmented
            options={extraction.supportedCurrencies.map((code) => ({ value: code, label: code }))}
            value={currency}
            onChange={setCurrency}
            label={t('ocerex.currency.label')}
          />
          <Button label={t('ocerex.currency.cta')} onPress={onConfirmCurrency} block disabled={busy || !currency} />
        </Card>
      ) : null}

      {step === 'result' && extraction ? (
        <ResultView
          extraction={extraction}
          linkUrl={linkUrl}
          onLinkUrlChange={setLinkUrl}
          urlError={urlError}
          busy={busy}
          onContinue={() => { void onLink(linkUrl); }}
          t={t}
        />
      ) : null}

      {step === 'summary' && extraction ? (
        <Card>
          <AppText>{t('ocerex.summary.title')}</AppText>
          <KeyRow label={t('ocerex.summary.product')} value={extraction.resolved?.title || extraction.productTitle || '—'} />
          <KeyRow label={t('ocerex.summary.source')} value={extraction.resolved?.platform || extraction.platform || '—'} />
          <KeyRow label={t('ocerex.summary.link')} value={extraction.resolved?.url || extraction.sourceUrl || '—'} />
          <KeyRow label={t('ocerex.summary.referencePrice')} value={formatReference(extraction)} />
          <KeyRow label={t('ocerex.summary.ayroviPrice')} value={formatMoney(extraction.ayroviPrice)} />
          <AppText variant="caption" color={theme.colors.muted}>{t('ocerex.summary.payNote')}</AppText>
          <Button label={t('ocerex.summary.confirm')} tone="main" onPress={onConfirmOrder} block disabled={busy} testID="ocerex-confirm" />
        </Card>
      ) : null}

      {step === 'error' ? (
        <ErrorView
          code={errorCode}
          linkUrl={linkUrl}
          onLinkUrlChange={setLinkUrl}
          urlError={urlError}
          busy={busy}
          onRetry={retry}
          onCorrectUrl={() => setStep('result')}
          onContinueLink={() => { void onLink(linkUrl, true); }}
          t={t}
        />
      ) : null}
    </View>
  );
}

function ResultView({
  extraction, linkUrl, onLinkUrlChange, urlError, busy, onContinue, t,
}: {
  extraction: OcerexExtraction;
  linkUrl: string;
  onLinkUrlChange: (value: string) => void;
  urlError: boolean;
  busy: boolean;
  onContinue: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const theme = useTheme();
  return (
    <Card>
      <AppText>{t('ocerex.result.title')}</AppText>
      <KeyRow label={t('ocerex.result.referencePrice')} value={formatReference(extraction)} />
      <KeyRow label={t('ocerex.result.ayroviPrice')} value={formatMoney(extraction.ayroviPrice)} />
      {extraction.productTitle ? <KeyRow label={t('ocerex.result.product')} value={extraction.productTitle} /> : null}
      <AppText variant="caption" color={theme.colors.muted}>{t('ocerex.result.linkPrompt')}</AppText>
      <Field
        value={linkUrl}
        onChangeText={onLinkUrlChange}
        placeholder="https://"
        autoCapitalize="none"
        keyboardType="url"
        accessibilityLabel={t('ocerex.result.linkLabel')}
      />
      {urlError ? <AppText variant="caption" color={theme.status.danger.fg}>{t('ocerex.error.INVALID_URL')}</AppText> : null}
      <Button label={t('ocerex.result.continue')} onPress={onContinue} block disabled={busy} testID="ocerex-continue" />
    </Card>
  );
}

function ErrorView({
  code, linkUrl, onLinkUrlChange, urlError, busy, onRetry, onCorrectUrl, onContinueLink, t,
}: {
  code: OcerexCode;
  linkUrl: string;
  onLinkUrlChange: (value: string) => void;
  urlError: boolean;
  busy: boolean;
  onRetry: () => void;
  onCorrectUrl: () => void;
  onContinueLink: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const theme = useTheme();
  const copy = errorCopy(code);
  return (
    <Card>
      <AppText>{t(copy.messageKey)}</AppText>
      {copy.primary === 'retry' ? (
        <Button label={t('ocerex.error.retry')} onPress={onRetry} block testID="ocerex-retry" />
      ) : null}
      {copy.primary === 'correctUrl' ? (
        <Button label={t('ocerex.error.correctUrl')} onPress={onCorrectUrl} block />
      ) : null}
      {copy.linkFallback ? (
        <>
          <AppText>{t('ocerex.error.linkTitle')}</AppText>
          <Field
            value={linkUrl}
            onChangeText={onLinkUrlChange}
            placeholder="https://"
            autoCapitalize="none"
            keyboardType="url"
            accessibilityLabel={t('ocerex.error.linkTitle')}
          />
          {urlError ? <AppText variant="caption" color={theme.status.danger.fg}>{t('ocerex.error.INVALID_URL')}</AppText> : null}
          <Button label={t('ocerex.error.linkCta')} onPress={onContinueLink} block disabled={busy} />
        </>
      ) : null}
    </Card>
  );
}

function KeyRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.keyRow}>
      <AppText variant="caption" color={theme.colors.muted}>{label}</AppText>
      <AppText>{value}</AppText>
    </View>
  );
}


function formatReference(extraction: OcerexExtraction): string {
  if (extraction.referenceTnd != null) return `${formatMoney(extraction.referenceTnd)}`;
  if (extraction.referencePrice != null && extraction.currency) {
    return `${formatAmount(extraction.referencePrice)} ${extraction.currency}`;
  }
  return '—';
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  header: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  camera: { width: '100%', aspectRatio: 3 / 4, borderRadius: RADIUS.md, overflow: 'hidden' },
  keyRow: { gap: 2 },
});
