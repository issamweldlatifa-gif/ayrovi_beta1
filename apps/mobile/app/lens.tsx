/**
 * AYROVIX Lens — parcours caméra natif, direct et unique.
 *
 * Le bouton Lens arrive ici sans écran intermédiaire. Une photo déclenche une
 * seule recherche annulable ; l'image reste visible et une feuille de résultats
 * remplace progressivement ses squelettes. Les diagnostics restent côté serveur.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated, Linking, Modal, PanResponder, Pressable, StyleSheet, View, useWindowDimensions,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppImage } from '@/design/appImage';
import { AppText, Button, Field } from '@/design/ui';
import { SubScreen } from '@/design/subScreen';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { veil } from '@/design/tokens.mobile';
import { useT, type TranslationKey } from '@/i18n';
import { ApiError, isApiError } from '@/api/errors';
import { addExternalFavorite } from '@/api/account';
import {
  analyzeBarcode, analyzeCode, analyzeImage, analyzeText, analyzeUrl, markChosen,
  type LensCandidate, type LensSearchResult,
} from '@/api/lens';
import { isOpenableSourceUrl, uniqueCandidates } from '@/features/lens/lensView';
import { LensResultsGrid } from '@/features/lens/LensResultsGrid';
import { LensSearchSkeleton } from '@/features/lens/LensSearchSkeleton';
import { OcerexFlow } from '@/features/lens/ocerex/OcerexFlow';
import { LensProductView } from '@/features/lens/LensProductView';
import { LensHelpView } from '@/features/lens/LensHelpView';
import { LENS_COLORS } from '@/features/lens/lensPalette';
import { mergeLensProduct } from '@/features/lens/productEnrichment';

type Mode = 'camera' | 'code' | 'text';
type ResultsStage = { kind: 'results'; candidates: LensCandidate[]; eventId: string; excluded: number };
type Stage =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | ResultsStage
  | { kind: 'product'; candidate: LensCandidate; back: ResultsStage; enriching: boolean }
  | { kind: 'error'; error: unknown };
type SearchJob = (signal: AbortSignal) => Promise<void>;

const CODE_TYPES = ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const;
const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;

function removePrivateCapture(uri: string): void {
  void import('expo-file-system')
    .then(({ File }) => {
      const file = new File(uri);
      if (file.exists) file.delete();
    })
    .catch(() => {
      // Nettoyage best-effort : le cache du système garde sa propre limite.
    });
}

function SearchSheet({ children, top, expandedTop }: { children: ReactNode; top: number; expandedTop: number }) {
  const theme = useTheme();
  const t = useT();
  // La feuille est TOUJOURS mise en page dans son état complet. La translation
  // ne fait que choisir le cran visible : ainsi, la lever ne coupe jamais son
  // bas comme le faisait l’ancienne feuille dimensionnée depuis `top`.
  const restingOffset = Math.max(0, top - expandedTop);
  const collapsedOffset = restingOffset + Math.min(168, Math.max(88, top * 0.42));
  const sheetY = useRef(new Animated.Value(
    restingOffset + (theme.motion.reduced === 0 ? 0 : 44),
  )).current;
  const dragPosition = useRef(restingOffset);
  const dragStart = useRef(restingOffset);

  const clampPosition = useCallback(
    (value: number) => Math.max(0, Math.min(collapsedOffset, value)),
    [collapsedOffset],
  );

  const snapTo = useCallback((value: number, velocity = 0) => {
    const target = clampPosition(value);
    sheetY.stopAnimation();
    dragPosition.current = target;
    if (theme.motion.reduced === 0) {
      sheetY.setValue(target);
      return;
    }
    Animated.spring(sheetY, {
      toValue: target,
      velocity,
      damping: 25,
      stiffness: 330,
      mass: 0.68,
      overshootClamping: false,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) dragPosition.current = target;
    });
  }, [clampPosition, sheetY, theme.motion.reduced]);

  const beginDrag = useCallback(() => {
    sheetY.stopAnimation((value) => {
      const current = clampPosition(value);
      dragStart.current = current;
      dragPosition.current = current;
    });
  }, [clampPosition, sheetY]);

  const moveDrag = useCallback((_event: unknown, gesture: { dy: number }) => {
    const next = clampPosition(dragStart.current + gesture.dy);
    dragPosition.current = next;
    sheetY.setValue(next);
  }, [clampPosition, sheetY]);

  const finishDrag = useCallback((_event: unknown, gesture: { vy: number }) => {
    if (gesture.vy < -0.34) {
      snapTo(0, gesture.vy);
      return;
    }
    if (gesture.vy > 0.42) {
      const target = dragPosition.current < restingOffset * 0.55 ? restingOffset : collapsedOffset;
      snapTo(target, gesture.vy);
      return;
    }
    const projected = clampPosition(dragPosition.current + gesture.vy * 110);
    const stops = [0, restingOffset, collapsedOffset];
    const nearest = stops.reduce((best, stop) => (
      Math.abs(stop - projected) < Math.abs(best - projected) ? stop : best
    ));
    snapTo(nearest, gesture.vy);
  }, [clampPosition, collapsedOffset, restingOffset, snapTo]);

  const handleResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => (
      Math.abs(gesture.dy) > 3 && Math.abs(gesture.dy) > Math.abs(gesture.dx)
    ),
    onPanResponderGrant: beginDrag,
    onPanResponderMove: moveDrag,
    onPanResponderRelease: finishDrag,
    onPanResponderTerminate: finishDrag,
    onPanResponderTerminationRequest: () => false,
  }), [beginDrag, finishDrag, moveDrag]);

  // Un balayage vers le haut depuis n’importe quel point de la feuille la lève.
  // Une fois ouverte, on ne capture plus le geste : FlatList reprend la main et
  // peut défiler sans blocage. Le mouvement vers le bas reste sur la poignée.
  const liftResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => (
      dragPosition.current > 1
      && gesture.dy < -4
      && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2
    ),
    onMoveShouldSetPanResponderCapture: (_event, gesture) => (
      dragPosition.current > 1
      && gesture.dy < -4
      && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2
    ),
    onPanResponderGrant: beginDrag,
    onPanResponderMove: moveDrag,
    onPanResponderRelease: finishDrag,
    onPanResponderTerminate: finishDrag,
    onPanResponderTerminationRequest: () => false,
  }), [beginDrag, finishDrag, moveDrag]);

  useEffect(() => {
    dragStart.current = restingOffset;
    dragPosition.current = restingOffset;
    if (theme.motion.reduced === 0) {
      sheetY.setValue(restingOffset);
      return;
    }
    sheetY.setValue(restingOffset + 44);
    Animated.timing(sheetY, {
      toValue: restingOffset,
      duration: theme.duration.standard,
      useNativeDriver: true,
    }).start();
  }, [restingOffset, sheetY, theme.duration.standard, theme.motion.reduced]);

  return (
    <Animated.View
      {...liftResponder.panHandlers}
      style={[
        styles.searchSheet,
        {
          top: expandedTop,
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: theme.radius.sheet,
          borderTopRightRadius: theme.radius.sheet,
          transform: [{ translateY: sheetY }],
          ...theme.elevation.high,
        },
      ]}
      testID="lens-search-sheet"
    >
      <Pressable
        {...handleResponder.panHandlers}
        onPress={() => snapTo(dragPosition.current <= 1 ? restingOffset : 0)}
        accessibilityRole="adjustable"
        accessibilityLabel={t('lens.sheet.adjust')}
        accessibilityActions={[
          { name: 'increment', label: t('lens.sheet.expand') },
          { name: 'decrement', label: t('lens.sheet.collapse') },
        ]}
        onAccessibilityAction={(event) => snapTo(event.nativeEvent.actionName === 'increment' ? 0 : restingOffset)}
        style={styles.sheetGrabArea}
        testID="lens-search-sheet-handle"
      >
        <View style={[styles.sheetHandle, styles.sheetDragHandle, { backgroundColor: theme.colors.lineControl }]} />
      </Pressable>
      {children}
    </Animated.View>
  );
}

function errorCopyKey(error: unknown): { title: TranslationKey; body: TranslationKey } {
  if (isApiError(error)) {
    if (error.kind === 'network') return { title: 'lens.error.networkTitle', body: 'lens.error.networkBody' };
    if (error.kind === 'timeout') return { title: 'lens.error.timeoutTitle', body: 'lens.error.timeoutBody' };
    if (error.code === 'CAMERA_MOUNT_FAILED') return { title: 'lens.error.cameraTitle', body: 'lens.error.cameraBody' };
    if (error.kind === 'device') return { title: 'lens.error.photoTitle', body: 'lens.error.photoBody' };
    if (['BLURRY_IMAGE', 'IMAGE_TOO_BLURRY'].includes(error.code)) return { title: 'lens.error.blurryTitle', body: 'lens.error.blurryBody' };
    if (['LOW_LIGHT', 'IMAGE_TOO_DARK'].includes(error.code)) return { title: 'lens.error.darkTitle', body: 'lens.error.darkBody' };
    if (['PRODUCT_TOO_SMALL', 'NO_SUBJECT'].includes(error.code)) return { title: 'lens.error.subjectTitle', body: 'lens.error.subjectBody' };
  }
  return { title: 'lens.error.serviceTitle', body: 'lens.error.serviceBody' };
}

export default function LensScreen() {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('camera');
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [helpOpen, setHelpOpen] = useState(false);
  const [text, setText] = useState('');
  const [favorited, setFavorited] = useState<Record<string, true>>({});
  const [favoriteNote, setFavoriteNote] = useState<TranslationKey | null>(null);
  const [ocerexOpen, setOcerexOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const scanLock = useRef(false);
  const photoLock = useRef(false);
  const favoriteLocks = useRef(new Set<string>());
  const requestRef = useRef<AbortController | null>(null);
  const enrichmentRef = useRef<AbortController | null>(null);
  const lastJobRef = useRef<SearchJob | null>(null);
  const ownedPreviewRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const permissionPrompted = useRef(false);

  const discardOwnedPreview = useCallback(() => {
    const uri = ownedPreviewRef.current;
    ownedPreviewRef.current = null;
    if (uri) removePrivateCapture(uri);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      enrichmentRef.current?.abort();
      discardOwnedPreview();
    };
  }, [discardOwnedPreview]);

  useEffect(() => {
    if (!permission || permission.granted || permission.status !== 'undetermined' || permissionPrompted.current) return;
    permissionPrompted.current = true;
    void requestPermission().catch(() => {
      // Le panneau caméra/galerie reste visible si Android refuse d’ouvrir le dialogue.
    });
  }, [permission, requestPermission]);

  const showSearch = useCallback((result: LensSearchResult | { candidates: LensCandidate[]; eventId: string; excluded?: number }) => {
    const candidates = uniqueCandidates(result.candidates);
    setFavoriteNote(null);
    setStage({
      kind: 'results', candidates, eventId: result.eventId,
      excluded: 'excluded' in result ? (result.excluded ?? 0) : 0,
    });
  }, []);

  const run = useCallback(async (job: SearchJob, remember = true) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (remember) lastJobRef.current = job;
    setStage({ kind: 'busy' });
    try {
      await job(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted && !(isApiError(error) && error.isAborted)) setStage({ kind: 'error', error });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      scanLock.current = false;
    }
  }, []);

  const onPhoto = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || !cameraReady || photoLock.current) return;
    photoLock.current = true;
    try {
      let picture;
      try {
        picture = await camera.takePictureAsync({ quality: 0.7 });
      } catch (cause) {
        if (mountedRef.current) {
          setStage({ kind: 'error', error: new ApiError('device', 'La caméra n’a pas pu enregistrer la photo.', { code: 'CAMERA_CAPTURE_FAILED', cause }) });
        }
        return;
      }
      if (!mountedRef.current) {
        if (picture?.uri) removePrivateCapture(picture.uri);
        return;
      }
      if (!picture?.uri) {
        setStage({ kind: 'error', error: new ApiError('device', 'La caméra n’a produit aucun fichier.', { code: 'CAMERA_FILE_MISSING' }) });
        return;
      }
      discardOwnedPreview();
      ownedPreviewRef.current = picture.uri;
      setPreviewUri(picture.uri);
      const job: SearchJob = async (signal) => {
        const result = await analyzeImage({ uri: picture.uri, name: 'capture.jpg', type: 'image/jpeg' }, { signal });
        if (!signal.aborted) showSearch({ ...result, excluded: result.excluded?.count ?? 0 });
      };
      await run(job);
    } finally {
      photoLock.current = false;
    }
  }, [cameraReady, discardOwnedPreview, run, showSearch]);

  const onGallery = useCallback(async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!mountedRef.current || picked.canceled || !picked.assets[0]) return;
      const asset = picked.assets[0];
      discardOwnedPreview();
      setPreviewUri(asset.uri);
      const job: SearchJob = async (signal) => {
        const result = await analyzeImage({
          uri: asset.uri, name: asset.fileName || 'capture.jpg', type: asset.mimeType || 'image/jpeg',
        }, { signal });
        if (!signal.aborted) showSearch({ ...result, excluded: result.excluded?.count ?? 0 });
      };
      await run(job);
    } catch (cause) {
      if (mountedRef.current) {
        setStage({ kind: 'error', error: new ApiError('device', 'La galerie n’a pas pu ouvrir cette image.', { code: 'GALLERY_PICK_FAILED', cause }) });
      }
    }
  }, [discardOwnedPreview, run, showSearch]);

  const onCodeScanned = useCallback((scan: BarcodeScanningResult) => {
    if (scanLock.current) return;
    const value = scan.data?.trim();
    if (!value) return;
    scanLock.current = true;
    const isQr = scan.type === 'qr';
    const job: SearchJob = async (signal) => {
      if (isQr && isOpenableSourceUrl(value)) {
        const result = await analyzeUrl(value, 'qr', true, signal);
        if (!signal.aborted) showSearch({ candidates: [result.product, ...result.alternates], eventId: result.eventId });
        return;
      }
      const result = isQr ? await analyzeCode(value, signal) : await analyzeBarcode(value, signal);
      if (!signal.aborted) showSearch(result);
    };
    void run(job);
  }, [run, showSearch]);

  const runTextSearch = useCallback((query: string) => {
    const clean = query.trim();
    if (clean.length < 2) return;
    const job: SearchJob = async (signal) => {
      const result = await analyzeText(clean, signal);
      if (!signal.aborted) showSearch(result);
    };
    void run(job);
  }, [run, showSearch]);

  const onOpen = useCallback((candidate: LensCandidate) => {
    if (!isOpenableSourceUrl(candidate.sourceUrl) || stage.kind !== 'results') return;
    void markChosen(stage.eventId);
    enrichmentRef.current?.abort();
    const controller = new AbortController();
    enrichmentRef.current = controller;
    setStage({ kind: 'product', candidate, back: stage, enriching: true });

    // Affichage immédiat de la carte, puis surcouche progressive depuis la
    // page marchande + SerpApi. Un retour ou un autre produit annule la lecture.
    void analyzeUrl(candidate.sourceUrl, 'url', false, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || !mountedRef.current) return;
        setStage((current) => current.kind === 'product' && current.candidate.sourceUrl === candidate.sourceUrl
          ? {
              ...current,
              candidate: result.fallback ? current.candidate : mergeLensProduct(current.candidate, result.product),
              enriching: false,
            }
          : current);
      })
      .catch(() => {
        if (controller.signal.aborted || !mountedRef.current) return;
        setStage((current) => current.kind === 'product' && current.candidate.sourceUrl === candidate.sourceUrl
          ? { ...current, enriching: false }
          : current);
      })
      .finally(() => {
        if (enrichmentRef.current === controller) enrichmentRef.current = null;
      });
  }, [stage]);

  const onFavorite = useCallback(async (candidate: LensCandidate) => {
    const key = candidate.sourceUrl;
    if (favoriteLocks.current.has(key)) return;
    favoriteLocks.current.add(key);
    setFavoriteNote(null);
    try {
      await addExternalFavorite({
        sourceUrl: key, title: candidate.title,
        imageUrl: candidate.image, priceTnd: candidate.priceTnd,
      });
      if (mountedRef.current) setFavorited((current) => ({ ...current, [key]: true }));
    } catch (error) {
      if (!mountedRef.current) return;
      const needsAccount = isApiError(error) && (error.status === 401 || error.code === 'AUTH_REQUIRED');
      setFavoriteNote(needsAccount ? 'lens.favoriteNeedsAccount' : 'lens.favoriteFailed');
    } finally {
      favoriteLocks.current.delete(key);
    }
  }, []);

  const reset = useCallback(() => {
    requestRef.current?.abort();
    enrichmentRef.current?.abort();
    requestRef.current = null;
    enrichmentRef.current = null;
    lastJobRef.current = null;
    scanLock.current = false;
    photoLock.current = false;
    setCameraReady(false);
    discardOwnedPreview();
    setPreviewUri(null);
    setFavoriteNote(null);
    setStage({ kind: 'idle' });
  }, [discardOwnedPreview]);

  const cancelSearch = useCallback(() => {
    requestRef.current?.abort();
    enrichmentRef.current?.abort();
    requestRef.current = null;
    enrichmentRef.current = null;
    lastJobRef.current = null;
    scanLock.current = false;
    discardOwnedPreview();
    setPreviewUri(null);
    setStage({ kind: 'idle' });
    setCameraReady(false);
  }, [discardOwnedPreview]);

  const retry = useCallback(() => {
    const job = lastJobRef.current;
    if (job) void run(job, false);
    else reset();
  }, [reset, run]);

  if (stage.kind === 'product') {
    return (
      <LensProductView
        candidate={stage.candidate}
        enriching={stage.enriching}
        onBack={() => {
          enrichmentRef.current?.abort();
          enrichmentRef.current = null;
          setStage(stage.back);
        }}
        favorite={favorited[stage.candidate.sourceUrl] === true}
        favoriteNote={favoriteNote}
        onFavorite={onFavorite}
      />
    );
  }

  if (ocerexOpen) {
    return (
      <SubScreen title={t('ocerex.title')} subtitle={t('ocerex.subtitle')} fallback="/lens">
        <OcerexFlow onClose={() => setOcerexOpen(false)} />
      </SubScreen>
    );
  }

  const resultScene = stage.kind === 'busy' || stage.kind === 'results' || stage.kind === 'error';
  if (resultScene) {
    const errorCopy = stage.kind === 'error' ? errorCopyKey(stage.error) : null;
    const deviceError = stage.kind === 'error' && isApiError(stage.error) && stage.error.kind === 'device';
    const sheetTop = stage.kind === 'busy' ? Math.max(210, height * 0.34) : Math.max(150, height * 0.24);
    return (
      <View style={[styles.scene, { backgroundColor: theme.colors.infoSoft }]}>
        <StatusBar style="light" />
        {previewUri ? (
          <AppImage uri={previewUri} contentFit="cover" style={styles.preview} accessibilityLabel={t('lens.capturedPhoto')} testID="lens-captured-preview" />
        ) : (
          // Fond de « viseur » toujours sombre : l'en-tête et les contrôles posés dessus sont
          // blancs. `ink` devenait BLANC en mode sombre (titre blanc sur blanc).
          <View style={[styles.preview, styles.previewFallback, { backgroundColor: LENS_COLORS.black }]}>
            <Ionicons name="scan-outline" size={64} color={LENS_COLORS.white} accessibilityElementsHidden />
          </View>
        )}
        <View style={[styles.resultTop, { paddingTop: insets.top + 6, flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable onPress={reset} accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.overlayButton} hitSlop={HIT_SLOP}>
            <Ionicons name={theme.isRTL ? 'arrow-forward' : 'arrow-back'} size={theme.iconSize.lg} color={LENS_COLORS.white} accessibilityElementsHidden />
          </Pressable>
          <AppText variant="title" weight="bold" color={LENS_COLORS.white} style={styles.resultTitle}>AYROVIX Lens</AppText>
          <View style={styles.headerSpacer} />
        </View>

        <SearchSheet top={sheetTop} expandedTop={insets.top + 58}>
          {stage.kind === 'busy' ? <LensSearchSkeleton onCancel={cancelSearch} /> : null}
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
          {stage.kind === 'error' && errorCopy ? (
            <View style={styles.errorState} testID="lens-search-error">
              <View style={[styles.errorIcon, { backgroundColor: theme.colors.infoSoft }]}>
                <Ionicons name="camera-outline" size={theme.iconSize.lg} color={theme.colors.ink} accessibilityElementsHidden />
              </View>
              <AppText variant="title" weight="bold" align="center">{t(errorCopy.title)}</AppText>
              <AppText color={theme.colors.muted} align="center">{t(errorCopy.body)}</AppText>
              {lastJobRef.current ? <Button label={t('common.retry')} onPress={retry} block /> : null}
              {deviceError ? <Button label={t('lens.pickGallery')} onPress={onGallery} block /> : null}
              <Button label={t('lens.retake')} onPress={reset} tone="quiet" block />
            </View>
          ) : null}
        </SearchSheet>
      </View>
    );
  }

  const cameraMode = mode === 'camera' || mode === 'code';
  const cameraAllowed = permission?.granted === true;
  return (
    <View style={[styles.scene, { backgroundColor: LENS_COLORS.black }]} testID="lens-camera-experience">
      <StatusBar style="light" />
      {cameraMode && cameraAllowed ? (
        <CameraView
          ref={mode === 'camera' ? cameraRef : undefined}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={mode === 'code' ? { barcodeTypes: [...CODE_TYPES] } : undefined}
          onBarcodeScanned={mode === 'code' ? onCodeScanned : undefined}
          onCameraReady={() => setCameraReady(true)}
          onMountError={(event) => setStage({
            kind: 'error',
            error: new ApiError('device', event.message || 'Camera indisponible.', { code: 'CAMERA_MOUNT_FAILED' }),
          })}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: LENS_COLORS.black }]} />
      )}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={[styles.cameraTop, { paddingTop: insets.top + 6, flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable onPress={() => goBack('/')} accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.overlayButton} hitSlop={HIT_SLOP}>
            <Ionicons name={theme.isRTL ? 'arrow-forward' : 'arrow-back'} size={theme.iconSize.lg} color={LENS_COLORS.white} accessibilityElementsHidden />
          </Pressable>
          <AppText variant="title" weight="bold" color={LENS_COLORS.white} style={styles.cameraTitle}>AYROVIX Lens</AppText>
          <View style={[styles.cameraActions, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
            {cameraMode && cameraAllowed ? (
              <Pressable onPress={() => setTorch((value) => !value)} accessibilityRole="button" accessibilityLabel={t('lens.flash')} style={styles.overlayButton} hitSlop={HIT_SLOP}>
                <Ionicons name={torch ? 'flash' : 'flash-off'} size={theme.iconSize.md} color={LENS_COLORS.white} accessibilityElementsHidden />
              </Pressable>
            ) : null}
            <Pressable onPress={() => setHelpOpen(true)} accessibilityRole="button" accessibilityLabel={t('lens.help.open')} style={styles.overlayButton} hitSlop={HIT_SLOP} testID="lens-open-help">
              <Ionicons name="help-circle-outline" size={theme.iconSize.lg} color={LENS_COLORS.white} accessibilityElementsHidden />
            </Pressable>
          </View>
        </View>

        {cameraMode && cameraAllowed ? (
          <View style={styles.focusFrame} pointerEvents="none">
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        ) : null}

        {!cameraAllowed && cameraMode ? (
          <View style={styles.permissionCenter}>
            <View style={[styles.permissionCard, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card }]}>
              <Ionicons name="camera-outline" size={theme.iconSize.lg} color={theme.colors.ink} accessibilityElementsHidden />
              <AppText variant="title" weight="bold" align="center">{t('lens.permissionTitle')}</AppText>
              <AppText color={theme.colors.muted} align="center">{t('lens.permissionText')}</AppText>
              {permission?.canAskAgain !== false ? (
                <Button label={t('lens.permissionButton')} onPress={() => { void requestPermission().catch(() => {}); }} block />
              ) : (
                <Button label={t('lens.openSettings')} onPress={() => { void Linking.openSettings(); }} block />
              )}
              <Button label={t('lens.pickGallery')} onPress={onGallery} tone="quiet" block />
            </View>
          </View>
        ) : null}

        <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + 16 }]}>
          {cameraAllowed && cameraMode ? (
            <AppText color={LENS_COLORS.white} align="center" style={styles.cameraHint}>
              {mode === 'code' ? t('lens.codeHint') : t('lens.cameraHint')}
            </AppText>
          ) : null}

          <View style={[styles.modePicker, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
            {([
              ['camera', t('lens.modeCamera')],
              ['code', t('lens.modeCode')],
              ['text', t('lens.modeText')],
            ] as const).map(([value, label]) => {
              const active = value === mode;
              return (
                <Pressable
                  key={value}
                  onPress={() => { setMode(value); scanLock.current = false; setCameraReady(false); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.mode, active ? styles.modeActive : null]}
                >
                  <AppText variant="caption" weight="bold" color={active ? LENS_COLORS.black : LENS_COLORS.white} align="center">{label}</AppText>
                </Pressable>
              );
            })}
          </View>

          {mode === 'camera' && cameraAllowed ? (
            <View style={[styles.captureRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable onPress={onGallery} accessibilityRole="button" accessibilityLabel={t('lens.pickGallery')} style={styles.sideControl} testID="lens-gallery">
                <Ionicons name="images-outline" size={theme.iconSize.lg} color={LENS_COLORS.white} accessibilityElementsHidden />
              </Pressable>
              <Pressable
                onPress={() => { void onPhoto(); }}
                disabled={!cameraReady}
                accessibilityRole="button"
                accessibilityLabel={t('lens.capture')}
                accessibilityState={{ disabled: !cameraReady }}
                testID="lens-capture"
                style={[styles.shutterOuter, { opacity: cameraReady ? 1 : 0.5 }]}
              >
                <View style={styles.shutterInner} />
              </Pressable>
              <Pressable onPress={() => setOcerexOpen(true)} accessibilityRole="button" accessibilityLabel={t('ocerex.open')} style={styles.ocerexControl} testID="lens-open-ocerex">
                <AppText variant="caption" weight="bold" color={LENS_COLORS.white}>OCEREX</AppText>
              </Pressable>
            </View>
          ) : null}

          {mode === 'text' ? (
            <View style={[styles.textSearch, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card }]}>
              <Field
                value={text}
                onChangeText={setText}
                placeholder={t('lens.textPlaceholder')}
                onSubmitEditing={() => runTextSearch(text)}
                returnKeyType="search"
                accessibilityLabel={t('lens.textPlaceholder')}
              />
              <Button label={t('lens.search')} onPress={() => runTextSearch(text)} disabled={text.trim().length < 2} block />
            </View>
          ) : null}
        </View>
      </View>

      <Modal visible={helpOpen} transparent animationType="slide" onRequestClose={() => setHelpOpen(false)}>
        <View style={styles.helpRoot}>
          <Pressable style={styles.helpScrim} onPress={() => setHelpOpen(false)} accessibilityRole="button" accessibilityLabel={t('sheet.close')} />
          <View style={[styles.helpSheet, { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.sheet, borderTopRightRadius: theme.radius.sheet, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: theme.colors.lineControl }]} />
            <LensHelpView />
            <Button label={t('lens.help.back')} onPress={() => setHelpOpen(false)} tone="quiet" block />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1 },
  cameraTop: { position: 'absolute', left: 8, right: 8, top: 0, alignItems: 'center', zIndex: 5 },
  overlayButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: veil(0.34), alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 48, height: 48 },
  cameraTitle: { flex: 1, textShadowColor: veil(0.8), textShadowRadius: 5 },
  cameraActions: { alignItems: 'center' },
  focusFrame: { position: 'absolute', left: '12%', right: '12%', top: '22%', bottom: '27%' },
  corner: { position: 'absolute', width: 38, height: 38, borderColor: LENS_COLORS.white },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
  cameraBottom: { position: 'absolute', left: 20, right: 20, bottom: 0, gap: 16 },
  cameraHint: { textShadowColor: veil(0.7), textShadowRadius: 5 },
  modePicker: { minHeight: 54, borderRadius: 28, padding: 4, backgroundColor: LENS_COLORS.cameraControl },
  mode: { flex: 1, minHeight: 46, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  // Mode choisi = état actif : pastille violet clair, libellé noir (10,4:1).
  modeActive: { backgroundColor: LENS_COLORS.activeSoft },
  captureRow: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  sideControl: { width: 58, height: 58, borderRadius: 18, borderWidth: 1.5, borderColor: LENS_COLORS.white, backgroundColor: veil(0.25), alignItems: 'center', justifyContent: 'center' },
  shutterOuter: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: LENS_COLORS.white, backgroundColor: veil(0.35), alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: LENS_COLORS.white },
  ocerexControl: { width: 68, height: 58, borderRadius: 29, borderWidth: 1.5, borderColor: LENS_COLORS.white, backgroundColor: veil(0.25), alignItems: 'center', justifyContent: 'center' },
  permissionCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  permissionCard: { width: '100%', maxWidth: 420, gap: 16, alignItems: 'center', padding: 24 },
  textSearch: { gap: 10, padding: 16 },
  preview: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  previewFallback: { alignItems: 'center', justifyContent: 'center' },
  resultTop: { position: 'absolute', top: 0, left: 8, right: 8, alignItems: 'center', zIndex: 3 },
  resultTitle: { flex: 1, textShadowColor: veil(0.8), textShadowRadius: 5 },
  searchSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  sheetGrabArea: { height: 30, alignItems: 'center', justifyContent: 'center' },
  sheetHandle: { width: 48, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
  sheetDragHandle: { marginBottom: 0 },
  errorState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingBottom: 24 },
  errorIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  helpRoot: { flex: 1, justifyContent: 'flex-end' },
  helpScrim: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: LENS_COLORS.cameraScrim },
  helpSheet: { maxHeight: '82%', paddingHorizontal: 20, paddingTop: 12, gap: 12 },
});
