/**
 * AYROVIX Lens — شاشة البحث (وظائف ونصوص الموقع، بمكونات التطبيق وأيقوناته).
 *
 * ثلاث قنوات: صورة (كاميرا أو معرض)، كود (باركود أو QR)، واسم منتوج.
 *  • الصورة والكود والاسم تُرسل للخادم كما هي؛ الخادم هو اللي يقرا المتاجر ويحسب السعر.
 *  • QR يحمل رابط ⇒ `analyze-url`، وغير ذلك ⇒ `analyze-code`. باركود ⇒ `analyze-barcode`.
 *  • الفيشة بلا سعر تعرض «السعر موش منشور»، وما نخمّنوش.
 *  • الأيقونات من Ionicons فقط (دليل التصميم، الفصل 10).
 */
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';

import { AppText, Button, Card, Field, Segmented } from '@/design/ui';
import { SubScreen } from '@/design/subScreen';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import { ApiError, isApiError } from '@/api/errors';
import { addExternalFavorite } from '@/api/account';
import {
  analyzeBarcode, analyzeCode, analyzeImage, analyzeText, analyzeUrl, fetchLensHistory, markChosen,
  type LensCandidate, type LensHistoryItem, type LensSearchResult,
} from '@/api/lens';
import { isOpenableSourceUrl, uniqueCandidates } from '@/features/lens/lensView';
import { LensResultsGrid } from '@/features/lens/LensResultsGrid';
import { OcerexFlow } from '@/features/lens/ocerex/OcerexFlow';
import { LensProductView } from '@/features/lens/LensProductView';
import { LensHelpView } from '@/features/lens/LensHelpView';

type Mode = 'camera' | 'code' | 'text';
type ResultsStage = { kind: 'results'; candidates: LensCandidate[]; eventId: string; excluded: number };

type Stage =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | ResultsStage
  | { kind: 'product'; candidate: LensCandidate; back: ResultsStage }
  | { kind: 'error'; error: unknown };

const CODE_TYPES = ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const;
/** هدف لمس 44 دائماً (دليل التصميم 10.2). */
const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;

export default function LensScreen() {
  const theme = useTheme();
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('camera');
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [helpOpen, setHelpOpen] = useState(false);
  const [text, setText] = useState('');
  const [favorited, setFavorited] = useState<Record<string, true>>({});
  const [favoriteNote, setFavoriteNote] = useState<TranslationKey | null>(null);
  const [ocerexOpen, setOcerexOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const scanLock = useRef(false);
  const photoLock = useRef(false);
  const history = useQuery({ queryKey: ['lens', 'history'], queryFn: () => fetchLensHistory(), staleTime: 30_000 });

  const showSearch = useCallback((result: LensSearchResult | { candidates: LensCandidate[]; eventId: string; excluded?: number }) => {
    const candidates = uniqueCandidates(result.candidates);
    setFavoriteNote(null);
    setStage({
      kind: 'results',
      candidates,
      eventId: result.eventId,
      excluded: 'excluded' in result ? (result.excluded ?? 0) : 0,
    });
    void history.refetch();
  }, [history]);

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
    // Expo exige explicitement onCameraReady avant takePictureAsync. Le rendu
    // de la preview peut précéder ce signal sur Android de quelques centaines
    // de ms : sans garde, le clic échoue instantanément et aucun POST ne part.
    if (!camera || !cameraReady || photoLock.current) return;
    photoLock.current = true;
    try {
      await run(async () => {
        let picture;
        try {
          // Le traitement natif garantit un JPEG orienté et lisible. Le vieux
          // skipProcessing laissait certains appareils avec un fichier encore
          // indisponible au moment de l'upload.
          picture = await camera.takePictureAsync({ quality: 0.7 });
        } catch (cause) {
          throw new ApiError('device', 'La caméra n’a pas pu enregistrer la photo.', {
            code: 'CAMERA_CAPTURE_FAILED',
            cause,
          });
        }
        if (!picture?.uri) {
          throw new ApiError('device', 'La caméra n’a produit aucun fichier.', { code: 'CAMERA_FILE_MISSING' });
        }
        const result = await analyzeImage({ uri: picture.uri, name: 'capture.jpg', type: 'image/jpeg' });
        showSearch({ ...result, excluded: result.excluded?.count ?? 0 });
      });
    } finally {
      photoLock.current = false;
    }
  }, [cameraReady, run, showSearch]);

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

  const runTextSearch = useCallback((query: string) => {
    const clean = query.trim();
    if (clean.length < 2) return;
    void run(async () => {
      showSearch(await analyzeText(clean));
    });
  }, [run, showSearch]);

  // نتيجة Lens تفتح صفحة المنتج داخل التطبيق (السعر والمقاس والكمية والطلب).
  const onOpen = useCallback((candidate: LensCandidate) => {
    if (!isOpenableSourceUrl(candidate.sourceUrl)) return;
    if (stage.kind !== 'results') return;
    markChosen(stage.eventId).catch(() => undefined);
    setStage({ kind: 'product', candidate, back: stage });
  }, [stage]);

  const onFavorite = useCallback(async (candidate: LensCandidate) => {
    setFavoriteNote(null);
    try {
      await addExternalFavorite({
        sourceUrl: candidate.sourceUrl,
        title: candidate.title,
        imageUrl: candidate.image,
        priceTnd: candidate.priceTnd,
      });
      setFavorited((current) => ({ ...current, [candidate.sourceUrl]: true }));
    } catch (error) {
      // الإعجاب يحتاج حساباً: الخادم يرد 401 بلا تسجيل.
      const needsAccount = isApiError(error) && (error.status === 401 || error.code === 'AUTH_REQUIRED');
      setFavoriteNote(needsAccount ? 'lens.favoriteNeedsAccount' : 'lens.favoriteFailed');
    }
  }, []);

  const onHistoryItem = useCallback((item: LensHistoryItem) => {
    if (isOpenableSourceUrl(item.sourceUrl)) {
      void WebBrowser.openBrowserAsync(item.sourceUrl);
      return;
    }
    if (item.kind === 'text' && item.inputValue) {
      setMode('text');
      setText(item.inputValue);
      runTextSearch(item.inputValue);
    }
  }, [runTextSearch]);

  const reset = useCallback(() => {
    scanLock.current = false;
    photoLock.current = false;
    setCameraReady(false);
    setStage({ kind: 'idle' });
  }, []);

  if (stage.kind === 'product') {
    return (
      <SubScreen title={t('lens.title')} subtitle={t('lens.subtitle')} fallback="/">
        <View style={styles.wrap}>
          <LensProductView
            candidate={stage.candidate}
            eventId={stage.back.eventId}
            onBack={() => setStage(stage.back)}
          />
        </View>
      </SubScreen>
    );
  }

  if (helpOpen) {
    return (
      <SubScreen title={t('lens.title')} subtitle={t('lens.help.title')} fallback="/">
        <View style={styles.wrap}>
          <LensHelpView />
          <Button label={t('lens.help.back')} onPress={() => setHelpOpen(false)} tone="quiet" block />
        </View>
      </SubScreen>
    );
  }

  if (ocerexOpen) {
    return (
      <SubScreen title={t('lens.title')} subtitle={t('ocerex.subtitle')} fallback="/">
        <View style={styles.wrap}>
          <OcerexFlow onClose={() => setOcerexOpen(false)} />
        </View>
      </SubScreen>
    );
  }

  const modeOptions: { value: Mode; label: string }[] = [
    { value: 'camera', label: t('lens.modeCamera') },
    { value: 'code', label: t('lens.modeCode') },
    { value: 'text', label: t('lens.modeText') },
  ];

  return (
    <SubScreen title={t('lens.title')} subtitle={t('lens.subtitle')} fallback="/">
      <View style={styles.wrap}>
        {stage.kind === 'idle' ? (
          <Pressable
            onPress={() => setOcerexOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('ocerex.open')}
            hitSlop={HIT_SLOP}
            testID="lens-open-ocerex"
          >
            <Card>
              <View style={styles.row}>
                <Ionicons name="camera-outline" size={24} color={theme.colors.ink} />
                <View style={styles.rowText}>
                  <AppText>{t('ocerex.open')}</AppText>
                  <AppText variant="caption" color={theme.colors.muted}>{t('ocerex.openHint')}</AppText>
                </View>
              </View>
            </Card>
          </Pressable>
        ) : null}

        {stage.kind === 'idle' ? (
          <Pressable onPress={() => setHelpOpen(true)} accessibilityRole="button" hitSlop={HIT_SLOP} testID="lens-open-help">
            <AppText variant="caption" color={theme.colors.muted}>{t('lens.help.open')}</AppText>
          </Pressable>
        ) : null}

        {stage.kind === 'idle' ? (
          <Segmented options={modeOptions} value={mode} onChange={(next) => { setMode(next); reset(); }} />
        ) : null}

        {stage.kind === 'busy' ? <LoadingBlock labelKey="lens.analyzing" /> : null}

        {stage.kind === 'error' ? (
          <>
            <ErrorBlock error={stage.error} onRetry={reset} />
            {isApiError(stage.error) ? (
              <AppText variant="caption" color={theme.colors.muted} align="center">
                {`Diagnostic: ${stage.error.code || stage.error.kind}`}
              </AppText>
            ) : null}
            <Button label={t('lens.newSearch')} onPress={reset} tone="quiet" block />
          </>
        ) : null}

        {stage.kind === 'results' ? (
          <LensResultsGrid
            candidates={stage.candidates}
            excluded={stage.excluded}
            favorited={favorited}
            favoriteNote={favoriteNote}
            onOpen={onOpen}
            onFavorite={onFavorite}
            onNewSearch={reset}
          />
        ) : null}

        {stage.kind === 'idle' && mode === 'camera' ? (
          permission?.granted ? (
            <View style={styles.cameraBlock}>
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
                onCameraReady={() => setCameraReady(true)}
                onMountError={(event) => setStage({
                  kind: 'error',
                  error: new ApiError('device', event.message || 'Camera indisponible.', { code: 'CAMERA_MOUNT_FAILED' }),
                })}
              />
              <Button label={t('lens.capture')} onPress={onPhoto} disabled={!cameraReady} block testID="lens-capture" />
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
              onSubmitEditing={() => runTextSearch(text)}
              returnKeyType="search"
              accessibilityLabel={t('lens.textPlaceholder')}
            />
            <Button label={t('lens.search')} onPress={() => runTextSearch(text)} disabled={text.trim().length < 2} block />
          </Card>
        ) : null}

        {stage.kind === 'idle' && history.data && history.data.length > 0 ? (
          <View style={styles.history}>
            <View style={styles.sectionRow}>
              <Ionicons name="time-outline" size={20} color={theme.colors.muted} />
              <AppText variant="caption" color={theme.colors.muted}>{t('lens.historyTitle')}</AppText>
            </View>
            {history.data.slice(0, 10).map((item) => (
              <Pressable
                key={item.id}
                onPress={() => onHistoryItem(item)}
                accessibilityRole="button"
                accessibilityLabel={item.title || item.inputValue}
                hitSlop={HIT_SLOP}
                testID={`lens-history-${item.id}`}
              >
                <Card>
                  <AppText numberOfLines={1}>{item.title || item.inputValue}</AppText>
                  <AppText variant="caption" color={theme.colors.muted}>
                    {item.resultsCount > 0 ? `${item.resultsCount}` : ''}
                  </AppText>
                </Card>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, padding: 16 },
  cameraBlock: { gap: 12 },
  camera: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  rowText: { flex: 1, gap: 4 },
  history: { gap: 8 },
  sectionRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
