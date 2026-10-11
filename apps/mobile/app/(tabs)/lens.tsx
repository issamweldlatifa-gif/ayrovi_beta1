/**
 * Lens — l'onglet ouvre directement la caméra (maquette « AYROVIX Lens »).
 *
 *  • Caméra en plein écran dès l'ouverture de l'onglet. Elle se coupe quand l'onglet
 *    n'a plus le focus (batterie, et pas de caméra allumée dans les autres onglets).
 *  • Haut : retour, titre, flash, aide (recherche, surveillances, historique).
 *  • Bas : indication, sélecteur (Scan en direct · Photo · Lien / code), vignette
 *    galerie, déclencheur, et OCEREX.
 *  • Résultats : un panneau monte par-dessus la caméra. Les étapes et les fiches
 *    viennent du serveur, dans l'ordre d'arrivée.
 *
 * Règle de produit inchangée : la photo ne donne jamais un prix. Le serveur lit les
 * pages marchandes, et « pas de prix publié » se dit clairement.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Card, Field, KeyValue } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { VIDEO_BACKDROP } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';
import {
  LENS_MIN_TEXT, analyzeLensText, chooseLensEvent, createLensWatch,
  fetchLensHistory, lensUploadInputFrom, type LensAnalysis, type LensCandidate,
} from '@/api/lens';
import { analyzeLensImageStream, type LensProgress } from '@/api/lensStream';
import { LensResultCard } from '@/features/lens/LensResultCard';
import { LensProgressSheet } from '@/features/lens/LensProgressSheet';

/** Mode du sélecteur : scan en direct (écran QR), photo (cette caméra), lien / code (saisie). */
type LensMode = 'live' | 'photo' | 'code';

/** Panneau ouvert par-dessus la caméra. `null` = caméra seule. */
type LensPanel = 'results' | 'code' | 'info' | null;

/** Ce qu'il faut pour envoyer une image : une photo prise ou une image de la galerie. */
interface LensSource {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
}

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function LensScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [flash, setFlash] = useState(false);
  const [panel, setPanel] = useState<LensPanel>(null);
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
  const streamController = useRef<AbortController | null>(null);
  const lastAsset = useRef<LensSource | null>(null);
  const cameraRef = useRef<CameraView>(null);

  // La caméra n'est allumée que quand cet onglet est affiché.
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  // Ouvrir Lens = la caméra. Si le téléphone n'a jamais demandé l'accès, on le demande
  // une seule fois ici ; après un refus, c'est le bouton qui le redemande.
  const autoAsked = useRef(false);
  useEffect(() => {
    if (!focused || autoAsked.current || !permission) return;
    if (!permission.granted && permission.canAskAgain) {
      autoAsked.current = true;
      void requestPermission();
    }
  }, [focused, permission, requestPermission]);

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
  const analyzeAsset = useCallback(async (asset: LensSource) => {
    lastAsset.current = asset;
    setNote('');
    setCanRetry(false);
    setAnalysis(null);
    setTextResults(null);
    setStreamCards([]);
    setProgress(null);
    setPreview(asset.uri);
    setPanel('results');
    streamController.current?.abort();
    const controller = new AbortController();
    streamController.current = controller;
    setBusy(true);
    try {
      const result = await analyzeLensImageStream(
        lensUploadInputFrom({
          uri: asset.uri,
          mimeType: asset.mimeType ?? undefined,
          fileName: asset.fileName,
        }),
        {
          onProgress: setProgress,
          onCard: (candidate) => setStreamCards((prev) => (
            prev.some((item) => item.sourceUrl === candidate.sourceUrl) ? prev : [...prev, candidate]
          )),
        },
        { signal: controller.signal },
      );
      setAnalysis(result);
      setStreamCards([]);
      if (!result.candidates.length) setNote(t('lens.noResults'));
    } catch (error) {
      setStreamCards([]);
      // إلغاء المستخدم ما يستحقّش رسالة خطأ.
      if (isApiError(error) && error.isAborted) return;
      setCanRetry(true);
      fail(error);
    } finally {
      setBusy(false);
      setProgress(null);
      if (streamController.current === controller) streamController.current = null;
    }
  }, [fail, t]);

  const cancelAnalysis = useCallback(() => {
    streamController.current?.abort();
  }, []);

  const retryAnalysis = useCallback(() => {
    if (lastAsset.current) void analyzeAsset(lastAsset.current);
  }, [analyzeAsset]);

  /** Déclencheur : la photo part directement, sans passer par l'application caméra du téléphone. */
  const shoot = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || busy) return;
    try {
      const photo = await camera.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) await analyzeAsset({ uri: photo.uri, mimeType: 'image/jpeg' });
    } catch (error) {
      fail(error);
    }
  }, [analyzeAsset, busy, fail]);

  const askCamera = useCallback(async () => {
    setNote('');
    const result = await requestPermission();
    // إذن مرفوض = السبب الصريح، موش شاشة ساكتة.
    if (!result.granted) setNote(t('lens.permissionDenied'));
  }, [requestPermission, t]);

  const pickLibrary = useCallback(async () => {
    setNote('');
    try {
      const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!libraryPermission.granted) {
        setNote(t('lens.permissionDenied'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsMultipleSelection: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      await analyzeAsset({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
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
      setPanel('results');
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

  const candidates = analysis?.candidates ?? textResults ?? streamCards;
  const hasResults = busy || analysis !== null || textResults !== null || streamCards.length > 0 || canRetry;
  const cameraOn = focused && permission?.granted === true;
  const selectedMode: LensMode = panel === 'code' ? 'code' : 'photo';

  const panelTitle = panel === 'results' ? t('lens.resultsTitle')
    : panel === 'code' ? t('lens.textTitle')
      : t('lens.help');

  return (
    <View style={[styles.root, { backgroundColor: VIDEO_BACKDROP }]}>
      {/* Barre du haut : retour · titre · flash · aide */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <IconButton
          icon="arrow-back"
          label={t('common.back')}
          color={theme.colors.onMedia}
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
        />
        <AppText variant="label" color={theme.colors.onMedia}>{t('lens.topTitle')}</AppText>
        <View style={styles.topRight}>
          <IconButton
            icon={flash ? 'flash' : 'flash-off'}
            label={flash ? t('lens.flashOff') : t('lens.flashOn')}
            color={theme.colors.onMedia}
            onPress={() => setFlash((value) => !value)}
          />
          <IconButton
            icon="help-circle-outline"
            label={t('lens.help')}
            color={theme.colors.onMedia}
            onPress={() => setPanel('info')}
          />
        </View>
      </View>

      <View style={styles.viewfinder}>
        {cameraOn ? (
          <CameraView ref={cameraRef} style={styles.camera} facing="back" flash={flash ? 'on' : 'off'} />
        ) : null}
        {/* Pas de caméra : la cause et les deux sorties, pas un écran noir. */}
        {permission && !permission.granted ? (
          <View style={styles.center}>
            <AppText variant="body" color={theme.colors.onMedia} style={styles.centerText}>
              {t('lens.cameraNeeded')}
            </AppText>
            {permission.canAskAgain ? (
              <Button label={t('lens.cameraAsk')} onPress={() => void askCamera()} />
            ) : null}
            <Button label={t('lens.gallery')} tone="quiet" testID="lens-gallery" onPress={() => void pickLibrary()} />
            {note ? (
              <AppText variant="caption" color={theme.colors.onMedia} style={styles.centerText} accessibilityRole="alert">{note}</AppText>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Bas : indication, sélecteur, commandes */}
      {panel === null ? (
        <View style={styles.bottom}>
          {note ? (
            <AppText variant="caption" color={theme.colors.onMedia} style={styles.centerText} accessibilityRole="alert">{note}</AppText>
          ) : null}
          {hasResults ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setPanel('results')}
              style={[styles.chip, { backgroundColor: theme.colors.onMedia }]}
            >
              <AppText variant="caption" color={theme.colors.onAdaptiveLight}>
                {busy ? t('lens.progress.title') : `${t('lens.resultsTitle')} · ${candidates.length}`}
              </AppText>
            </Pressable>
          ) : null}
          <AppText variant="body" color={theme.colors.onMedia} style={styles.centerText}>
            {t('lens.cameraHint')}
          </AppText>
          <ModePill
            value={selectedMode}
            options={[
              { value: 'live', label: t('lens.mode.live') },
              { value: 'photo', label: t('lens.mode.photo') },
              { value: 'code', label: t('lens.mode.code') },
            ]}
            onSelect={(value) => {
              if (value === 'live') router.push('/lens/scan');
              else if (value === 'code') setPanel('code');
            }}
          />
          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('lens.gallery')}
              disabled={busy}
              testID="lens-gallery-thumb"
              onPress={() => void pickLibrary()}
              style={[styles.thumb, { borderColor: theme.colors.onMedia }]}
            >
              {preview ? (
                <AppImage uri={preview} style={styles.thumbImage} contentFit="cover" accessibilityLabel={t('lens.previewAlt')} />
              ) : (
                <Ionicons name="images-outline" size={24} color={theme.colors.onMedia} />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('lens.shutter')}
              accessibilityState={{ disabled: busy || !cameraOn }}
              disabled={busy || !cameraOn}
              testID="lens-camera"
              onPress={() => void shoot()}
              style={[styles.shutter, { borderColor: theme.colors.onMedia }]}
            >
              <View style={[styles.shutterInner, { backgroundColor: theme.colors.onMedia }]} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ocerex.title')}
              onPress={() => router.push('/lens/ocerex')}
              style={[styles.side, { backgroundColor: theme.colors.mediaScrim }]}
            >
              <AppText variant="caption" color={theme.colors.onMedia}>{t('lens.ocerexShort')}</AppText>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Panneau : résultats, recherche par lien / code, ou aide */}
      {panel !== null ? (
        <View style={[styles.panel, { backgroundColor: theme.colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.panelHeader}>
            <AppText variant="label">{panelTitle}</AppText>
            <IconButton
              icon="close"
              label={t('common.close')}
              color={theme.colors.ink}
              onPress={() => setPanel(null)}
            />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelBody}>
            {panel === 'results' ? (
              <>
                {busy ? (
                  <LensProgressSheet progress={progress} cardCount={streamCards.length} onCancel={cancelAnalysis} />
                ) : null}
                {note ? (
                  <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{note}</AppText>
                ) : null}
                {canRetry && !busy && lastAsset.current ? (
                  <Button label={t('lens.progress.retry')} tone="quiet" onPress={retryAnalysis} />
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
                {candidates.length ? (
                  <Card title={t('lens.resultsTitle')} hint={t('lens.resultsHint')}>
                    {candidates.map((candidate, index) => (
                      <LensResultCard
                        key={candidate.id || `${candidate.sourceUrl}-${index}`}
                        candidate={candidate}
                        onOpen={openCandidate}
                        onWatch={(item) => watch.mutate(item)}
                        watchBusy={watch.isPending}
                      />
                    ))}
                  </Card>
                ) : null}
              </>
            ) : null}

            {panel === 'code' ? (
              <>
                <AppText variant="caption" color={theme.colors.muted}>{t('lens.textHint')}</AppText>
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
                {note ? (
                  <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{note}</AppText>
                ) : null}
              </>
            ) : null}

            {panel === 'info' ? (
              <>
                <AppText variant="caption" color={theme.colors.muted}>{t('screen.lens.body')}</AppText>
                <Card title={t('lens.photoTitle')} hint={t('lens.photoHint')} />
                <Card title={t('lens.scanTitle')} hint={t('lens.scanHint')}>
                  <Button label={t('lens.scanOpen')} onPress={() => router.push('/lens/scan')} />
                </Card>
                <Card title={t('lens.watchTitle')} hint={t('lens.watchHint')}>
                  <Button label={t('lens.watchOpen')} tone="quiet" onPress={() => router.push('/lens/watches')} />
                </Card>
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
              </>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

/** Sélecteur de mode sur fond sombre : le choix actif est une pastille claire. */
function ModePill({
  value, options, onSelect,
}: {
  value: LensMode;
  options: { value: LensMode; label: string }[];
  onSelect: (value: LensMode) => void;
}) {
  const theme = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.pill, { backgroundColor: theme.colors.mediaScrim }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(option.value)}
            style={[styles.pillItem, selected && { backgroundColor: theme.colors.onMedia }]}
          >
            <AppText
              variant="label"
              numberOfLines={1}
              color={selected ? theme.colors.onAdaptiveLight : theme.colors.onMedia}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bouton icône carré (zone de toucher 44 pt) avec libellé d'accessibilité. */
function IconButton({
  icon, label, color, onPress,
}: {
  icon: IoniconName;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconButton}>
      <Ionicons name={icon} size={24} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingBottom: 8,
  },
  topRight: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  viewfinder: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
  camera: { flex: 1 },
  bottom: {
    alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 16, paddingHorizontal: 12,
  },
  centerText: { textAlign: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  pill: { flexDirection: 'row', borderRadius: 999, padding: 4, maxWidth: '96%' },
  pillItem: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  controls: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginTop: 4,
  },
  thumb: {
    width: 56, height: 56, borderRadius: 12, borderWidth: 2, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  thumbImage: { width: '100%', height: '100%' },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29 },
  side: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  panel: {
    maxHeight: '62%', borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingTop: 12, paddingHorizontal: 16,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  panelBody: { gap: 12, paddingBottom: 8 },
  historyRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8, gap: 2 },
});
