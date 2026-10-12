/**
 * AYROVIX Lens — شاشة البحث (مطابقة للموقع: `ayrovix/components/LensLauncher`).
 *
 * ثلاث قنوات: صورة (كاميرا أو معرض)، كود (باركود أو QR)، واسم منتوج.
 *  • الصورة والكود والاسم تُرسل للخادم كما هي؛ الخادم هو اللي يقرا المتاجر ويحسب السعر.
 *  • QR يحمل رابط ⇒ `analyze-url`، وغير ذلك ⇒ `analyze-code`. باركود ⇒ `analyze-barcode`.
 *  • الفيشة بلا سعر تعرض «السعر موش منشور»، وما نخمّنوش.
 */
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';

import { AppText, Button, Card, Field, Segmented } from '@/design/ui';
import { SubScreen } from '@/design/subScreen';
import { AppImage } from '@/design/appImage';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import { mediaUrl } from '@/api/client';
import {
  analyzeBarcode, analyzeCode, analyzeImage, analyzeText, analyzeUrl, markChosen,
  type LensCandidate, type LensSearchResult,
} from '@/api/lens';
import {
  availabilityKey, isOpenableSourceUrl, priceView, uniqueCandidates,
} from '@/features/lens/lensView';

type Mode = 'camera' | 'code' | 'text';
type Stage =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'results'; candidates: LensCandidate[]; eventId: string; excluded: number }
  | { kind: 'error'; error: unknown };

const CODE_TYPES = ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const;

export default function LensScreen() {
  const theme = useTheme();
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('camera');
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [text, setText] = useState('');
  const cameraRef = useRef<CameraView>(null);
  const scanLock = useRef(false);

  const showSearch = useCallback((result: LensSearchResult | { candidates: LensCandidate[]; eventId: string; excluded?: number }) => {
    const candidates = uniqueCandidates(result.candidates);
    setStage({ kind: 'results', candidates, eventId: result.eventId, excluded: 'excluded' in result ? (result.excluded ?? 0) : 0 });
  }, []);

  const run = useCallback(async (job: () => Promise<void>) => {
    setStage({ kind: 'busy' });
    try {
      await job();
    } catch (error) {
      setStage({ kind: 'error', error });
    } finally {
      scanLock.current = false;
    }
  }, []);

  const onPhoto = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera) return;
    await run(async () => {
      const picture = await camera.takePictureAsync({ quality: 0.7, skipProcessing: true });
      if (!picture?.uri) throw new Error('no-photo');
      const result = await analyzeImage({ uri: picture.uri, name: 'capture.jpg', type: 'image/jpeg' });
      showSearch({ ...result, excluded: result.excluded?.count ?? 0 });
    });
  }, [run, showSearch]);

  const onGallery = useCallback(async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    await run(async () => {
      const result = await analyzeImage({
        uri: asset.uri,
        name: asset.fileName || 'capture.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
      showSearch({ ...result, excluded: result.excluded?.count ?? 0 });
    });
  }, [run, showSearch]);

  const onCodeScanned = useCallback((scan: BarcodeScanningResult) => {
    if (scanLock.current) return;
    scanLock.current = true;
    const value = scan.data?.trim();
    if (!value) { scanLock.current = false; return; }
    const isQr = scan.type === 'qr';
    void run(async () => {
      if (isQr && isOpenableSourceUrl(value)) {
        const result = await analyzeUrl(value, 'qr');
        showSearch({ candidates: [result.product, ...result.alternates], eventId: result.eventId });
        return;
      }
      const result = isQr ? await analyzeCode(value) : await analyzeBarcode(value);
      showSearch(result);
    });
  }, [run, showSearch]);

  const onSearchText = useCallback(() => {
    const query = text.trim();
    if (query.length < 2) return;
    void run(async () => {
      showSearch(await analyzeText(query));
    });
  }, [run, showSearch, text]);

  const onOpen = useCallback(async (candidate: LensCandidate) => {
    if (!isOpenableSourceUrl(candidate.sourceUrl)) return;
    markChosen(stage.kind === 'results' ? stage.eventId : '');
    await WebBrowser.openBrowserAsync(candidate.sourceUrl);
  }, [stage]);

  const reset = useCallback(() => {
    scanLock.current = false;
    setStage({ kind: 'idle' });
  }, []);

  const modeOptions: { value: Mode; label: string }[] = [
    { value: 'camera', label: t('lens.modeCamera') },
    { value: 'code', label: t('lens.modeCode') },
    { value: 'text', label: t('lens.modeText') },
  ];

  return (
    <SubScreen title={t('lens.title')} subtitle={t('lens.subtitle')} fallback="/">
      <View style={styles.wrap}>
        {stage.kind === 'results' || stage.kind === 'busy' || stage.kind === 'error' ? null : (
          <Segmented options={modeOptions} value={mode} onChange={(next) => { setMode(next); reset(); }} />
        )}

        {stage.kind === 'busy' ? <LoadingBlock labelKey="lens.analyzing" /> : null}

        {stage.kind === 'error' ? (
          <>
            <ErrorBlock error={stage.error} onRetry={reset} />
            <Button label={t('lens.newSearch')} onPress={reset} tone="quiet" block />
          </>
        ) : null}

        {stage.kind === 'results' ? (
          <Results
            candidates={stage.candidates}
            excluded={stage.excluded}
            onOpen={onOpen}
            onNewSearch={reset}
            t={t}
          />
        ) : null}

        {stage.kind === 'idle' && mode === 'camera' ? (
          permission?.granted ? (
            <View style={styles.cameraBlock}>
              <CameraView ref={cameraRef} style={styles.camera} facing="back" />
              <Button label={t('lens.capture')} onPress={onPhoto} block testID="lens-capture" />
              <Button label={t('lens.pickGallery')} onPress={onGallery} tone="quiet" block testID="lens-gallery" />
            </View>
          ) : (
            <Card>
              <AppText>{t('lens.permissionText')}</AppText>
              <Button label={t('lens.permissionButton')} onPress={() => { void requestPermission(); }} block />
              <Button label={t('lens.pickGallery')} onPress={onGallery} tone="quiet" block />
            </Card>
          )
        ) : null}

        {stage.kind === 'idle' && mode === 'code' ? (
          permission?.granted ? (
            <View style={styles.cameraBlock}>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: [...CODE_TYPES] }}
                onBarcodeScanned={onCodeScanned}
              />
              <AppText variant="caption" color={theme.colors.muted}>{t('lens.codeHint')}</AppText>
            </View>
          ) : (
            <Card>
              <AppText>{t('lens.permissionText')}</AppText>
              <Button label={t('lens.permissionButton')} onPress={() => { void requestPermission(); }} block />
            </Card>
          )
        ) : null}

        {stage.kind === 'idle' && mode === 'text' ? (
          <Card>
            <Field
              value={text}
              onChangeText={setText}
              placeholder={t('lens.textPlaceholder')}
              onSubmitEditing={onSearchText}
              returnKeyType="search"
              accessibilityLabel={t('lens.textPlaceholder')}
            />
            <Button label={t('lens.search')} onPress={onSearchText} disabled={text.trim().length < 2} block />
          </Card>
        ) : null}
      </View>
    </SubScreen>
  );
}

function Results({
  candidates, excluded, onOpen, onNewSearch, t,
}: {
  candidates: LensCandidate[];
  excluded: number;
  onOpen: (candidate: LensCandidate) => void;
  onNewSearch: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const theme = useTheme();
  if (candidates.length === 0) {
    return (
      <Card>
        <AppText>{t('lens.empty')}</AppText>
        <Button label={t('lens.newSearch')} onPress={onNewSearch} block />
      </Card>
    );
  }
  return (
    <View style={styles.results}>
      <AppText variant="caption" color={theme.colors.muted}>{t('lens.resultsTitle')}</AppText>
      {excluded > 0 ? (
        <AppText variant="caption" color={theme.colors.muted}>{t('lens.excluded', { count: excluded })}</AppText>
      ) : null}
      {candidates.map((candidate) => {
        const price = priceView(candidate);
        const priceText = price.kind === 'tnd'
          ? `${price.amount.toFixed(2)} TND`
          : price.kind === 'original'
            ? `${price.amount.toFixed(2)} ${price.currency}`
            : t('lens.priceUnpublished');
        return (
          <Pressable
            key={candidate.id}
            onPress={() => onOpen(candidate)}
            accessibilityRole="button"
            accessibilityLabel={`${candidate.title} — ${priceText}`}
            testID={`lens-result-${candidate.id}`}
          >
            <Card>
              <View style={styles.row}>
                <AppImage
                  uri={mediaUrl(candidate.image)}
                  style={styles.thumb}
                  accessibilityLabel={candidate.title}
                />
                <View style={styles.rowText}>
                  <AppText>{candidate.title}</AppText>
                  {candidate.brand ? <AppText variant="caption" color={theme.colors.muted}>{candidate.brand}</AppText> : null}
                  <AppText>{priceText}</AppText>
                  <AppText variant="caption" color={theme.colors.muted}>{t(availabilityKey(candidate.availability) as TranslationKey)}</AppText>
                  <AppText variant="caption" color={theme.colors.muted}>{t('catalog.openSource')}</AppText>
                </View>
              </View>
            </Card>
          </Pressable>
        );
      })}
      <Button label={t('lens.newSearch')} onPress={onNewSearch} tone="quiet" block />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, padding: 16 },
  cameraBlock: { gap: 12 },
  camera: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, overflow: 'hidden' },
  results: { gap: 10 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  rowText: { flex: 1, gap: 4 },
  thumb: { width: 72, height: 72, borderRadius: 8 },
});

