/**
 * Z Lens — parcours caméra natif (option 3 choisie par le client, 16/10/2026).
 *
 *  • En-tête : retour, lampe, « Z Lens » écrit en texte, menu ⋮ (Informations,
 *    Historique, Politique de confidentialité, Conditions d'utilisation,
 *    Produits interdits).
 *  • Panneau du bas : Galerie · déclencheur (plus grand) · OCEREX AU-DESSUS ;
 *    la barre Live · QR code · Lien · Mot clé TOUT EN BAS, sous les boutons.
 *  • Live = recherche visuelle SerpApi : à l'arrêt du téléphone, `/detect`
 *    renvoie des fiches ressemblantes (jamais des boîtes). Le cadre reste
 *    manuel ; le client peut ouvrir un match dans la liste.
 *  • Photo prise ou importée (une ou plusieurs) : le cadre commence sur toute
 *    la photo et reste MANUEL (déplaçable/étirable) ; la recherche se relance
 *    sur la zone choisie (`roi`).
 *
 * Une action = une seule recherche annulable ; l'image reste visible sous une
 * feuille de résultats ajustable. Les diagnostics restent côté serveur.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated, AppState, Keyboard, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent, type PanResponderGestureState,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppImage } from '@/design/appImage';
import { AppText, Button, Field } from '@/design/ui';
import { SubScreen } from '@/design/subScreen';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { RADIUS, frost, veil } from '@/design/tokens.mobile';
import { useT, type TranslationKey } from '@/i18n';
import { ApiError, isApiError } from '@/api/errors';
import { addExternalFavorite } from '@/api/account';
import {
  analyzeBarcode, analyzeCode, analyzeText, analyzeUrl, searchVisualMatches, markChosen,
  type LensBox, type LensCandidate, type LensDetectedProduct, type LensHistoryItem, type LensIdentification,
  type LensVisualMatch,
  type LensSearchResult,
} from '@/api/lens';
import { analyzeImageStream, type LensStreamProgress } from '@/api/lensStream';
import { isOpenableSourceUrl, uniqueCandidates } from '@/features/lens/lensView';
import { LensResultsGrid } from '@/features/lens/LensResultsGrid';
import { LensSearchSkeleton } from '@/features/lens/LensSearchSkeleton';
import { LensProgressLine, lensProgressLabel } from '@/features/lens/LensProgressLine';
import { LensOverviewCard } from '@/features/lens/LensOverviewCard';
import { LensSearchBar } from '@/features/lens/LensSearchBar';
import { OcerexFlow } from '@/features/lens/ocerex/OcerexFlow';
import { lensOpenDecision } from '@/features/lens/lensOpen';
import { useKeyboardInset } from '@/design/useKeyboardInset';
import { LensHelpView } from '@/features/lens/LensHelpView';
import { LensHistoryView } from '@/features/lens/LensHistoryView';
import { LensRulesView } from '@/features/lens/LensRulesView';
import { LensMenu, type LensMenuItem } from '@/features/lens/LensMenu';
import { LensLiveOverlay } from '@/features/lens/LensLiveOverlay';
import { LensSelectionView, type SelectionCommit } from '@/features/lens/LensSelectionView';
import { LENS_COLORS } from '@/features/lens/lensPalette';
import { shrinkImage } from '@/features/lens/lensImage';
import { FULL_BOX, isFullFrame, padBox, selectionKey, toRoi } from '@/features/lens/lensSelection';
import { initialMotion, isSteady, nextMotion, shouldDetect, type MotionState } from '@/features/lens/lensLive';
import {
  clampLensSheet, lensSheetGeometry, lensSheetOwnsPan, snapLensSheet, toggleLensSheet, type LensSheetGeometry,
} from '@/features/lens/lensSheet';
import { LensSheetScrollContext } from '@/features/lens/lensSheetScroll';
import { SHEET_SPRING } from '@/design/sheet/sheetPhysics';

type Mode = 'live' | 'code' | 'link' | 'text';
type ResultsStage = { kind: 'results'; candidates: LensCandidate[]; eventId: string; excluded: number };
/**
 * Attente PROGRESSIVE : le serveur parle en flux (`progress`, `card`, `done`).
 * On garde l'étape d'avancement, l'identification (dès qu'elle est connue) et
 * les fiches déjà lues — l'écran n'est donc jamais un mur de squelettes.
 */
type BusyStage = {
  kind: 'busy';
  progress: LensStreamProgress | null;
  identification: LensIdentification | null;
  cards: LensCandidate[];
};
type Stage =
  | { kind: 'idle' }
  | BusyStage
  | ResultsStage
  | { kind: 'error'; error: unknown };
type SearchJob = (signal: AbortSignal) => Promise<void>;
type InfoPanel = 'help' | 'history' | 'rules';

/** Live : ce que montre le cadre sur l'aperçu caméra. */
interface LiveView {
  status: 'scanning' | 'detected' | 'empty' | 'unavailable';
  products: LensDetectedProduct[];
  /** Correspondances visuelles (SerpApi) : des PAGES ressemblantes, pas des boîtes. */
  matches: LensVisualMatch[];
  selected: number;
  /** Taille de l'image analysée (les boîtes lui sont relatives). */
  photo: { width: number; height: number } | null;
}

/** Une photo de la séance de sélection (prise, ou importée de la galerie). */
interface SessionPhoto {
  key: string;
  /** Copie réduite affichée ET envoyée (ou l'original si la réduction a échoué). */
  uri: string;
  width: number;
  height: number;
  /** Fichiers privés à supprimer en fin de séance. */
  cleanup: string[];
  detection: 'pending' | 'done' | 'failed';
  products: LensDetectedProduct[];
  /** Produit sélectionné (index), ou -1 pour une zone tracée à la main. */
  selected: number;
  selection: LensBox;
}
interface PhotoSession { photos: SessionPhoto[]; index: number }

const CODE_TYPES = ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const;
const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;
/** Barre du bas : icône au-dessus du libellé, comme Search · Translate · Talk · Create de Google Lens. */
const MODES: ReadonlyArray<[Mode, TranslationKey, keyof typeof Ionicons.glyphMap]> = [
  ['live', 'lens.modeLive', 'scan-outline'],
  ['code', 'lens.modeCode', 'qr-code-outline'],
  ['link', 'lens.modeLink', 'link-outline'],
  ['text', 'lens.modeText', 'text-outline'],
];
/** Bords maximaux des copies envoyées : recherche, repérage d'une photo, image Live. */
const SEARCH_EDGE = 1600;
const LIVE_EDGE = 640;
/** Galerie : plusieurs photos d'un coup, bornées (chaque photo coûte une recherche). */
const GALLERY_LIMIT = 5;
/** Une détection Live sert encore au déclencheur si elle est récente et que rien n'a bougé. */
const LIVE_REUSE_MS = 6_000;

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

/**
 * Feuille des résultats, fluide comme celle de Google Lens :
 *  • au repos, elle reste basse (69 % de l'écran) : la photo et son cadre se voient ;
 *  • levée, elle devient plein écran ; baissée, seul son titre dépasse ;
 *  • on la saisit de N'IMPORTE OÙ (pas seulement la poignée) : tant qu'elle n'est
 *    pas plein écran, tout glissement vertical la déplace ; plein écran, la liste
 *    défile et un glissement vers le bas, liste tout en haut, la redescend.
 *
 * Même mécanique que le tiroir unifié (`AppSheet`) : `PanResponder` en phase de
 * capture + `Animated` sur le fil natif, sans module natif supplémentaire.
 */
function SearchSheet({ children, geometry }: { children: ReactNode; geometry: LensSheetGeometry }) {
  const theme = useTheme();
  const t = useT();
  const reduced = theme.motion.reduced === 0;
  const { expandedTop, stops, rest } = geometry;
  // La feuille est TOUJOURS mise en page pleine page : la translation ne fait
  // que choisir le cran visible — la lever ne coupe jamais son bas.
  const translate = useRef(new Animated.Value(rest + (reduced ? 0 : 44))).current;
  /** Copie lisible du décalage courant (mise à jour par l'écouteur), lue par les gestes. */
  const position = useRef(rest);
  const dragStart = useRef(rest);
  const grantDy = useRef(0);
  /** Défilement de la liste contenue (remonté par `LensSheetScrollContext`). */
  const scrollY = useRef(0);
  const mounted = useRef(false);
  const live = useRef({ stops, rest });
  live.current = { stops, rest };

  useEffect(() => {
    const id = translate.addListener(({ value }) => {
      position.current = value;
    });
    return () => translate.removeListener(id);
  }, [translate]);

  const snapTo = useCallback((target: number, velocity = 0) => {
    translate.stopAnimation();
    if (reduced) {
      translate.setValue(target);
      position.current = target;
      return;
    }
    // `velocity` en px/s : la feuille garde l'élan du doigt jusqu'au cran.
    Animated.spring(translate, { toValue: target, velocity, useNativeDriver: true, ...SHEET_SPRING }).start();
  }, [reduced, translate]);

  // Entrée : la feuille monte jusqu'au repos. Ensuite, si le repos change
  // (attente → résultats sans photo), elle y glisse depuis sa position actuelle.
  useEffect(() => {
    scrollY.current = 0;
    if (!mounted.current) {
      mounted.current = true;
      if (reduced) {
        translate.setValue(rest);
        position.current = rest;
        return;
      }
      translate.setValue(rest + 44);
    }
    snapTo(rest);
  }, [reduced, rest, snapTo, translate]);

  const responder = useMemo(() => {
    const owns = (gesture: PanResponderGestureState) => (
      lensSheetOwnsPan(position.current, scrollY.current, gesture.dx, gesture.dy)
    );
    const follow = (gesture: PanResponderGestureState) => (
      clampLensSheet(dragStart.current + gesture.dy - grantDy.current, live.current.stops)
    );
    const release = (gesture: PanResponderGestureState) => {
      const at = follow(gesture);
      snapTo(snapLensSheet(at, gesture.vy, live.current.stops), gesture.vy * 1000);
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) => owns(gesture),
      onMoveShouldSetPanResponder: (_event, gesture) => owns(gesture),
      onPanResponderGrant: (_event, gesture) => {
        translate.stopAnimation();
        dragStart.current = position.current;
        // Le geste n'est pris qu'après quelques points : on part d'ici, sans saut.
        grantDy.current = gesture.dy;
      },
      onPanResponderMove: (_event, gesture) => {
        translate.setValue(follow(gesture));
      },
      onPanResponderRelease: (_event, gesture) => release(gesture),
      onPanResponderTerminate: (_event, gesture) => release(gesture),
      onPanResponderTerminationRequest: () => false,
    });
  }, [snapTo, translate]);

  const onListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  }, []);

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.searchSheet,
        {
          top: expandedTop,
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: theme.radius.sheet,
          borderTopRightRadius: theme.radius.sheet,
          transform: [{ translateY: translate }],
          ...theme.elevation.high,
        },
      ]}
      testID="lens-search-sheet"
    >
      <Pressable
        onPress={() => snapTo(toggleLensSheet(position.current, live.current.rest))}
        accessibilityRole="adjustable"
        accessibilityLabel={t('lens.sheet.adjust')}
        accessibilityActions={[
          { name: 'increment', label: t('lens.sheet.expand') },
          { name: 'decrement', label: t('lens.sheet.collapse') },
        ]}
        onAccessibilityAction={(event) => snapTo(event.nativeEvent.actionName === 'increment' ? 0 : live.current.rest)}
        style={styles.sheetGrabArea}
        testID="lens-search-sheet-handle"
      />
      <LensSheetScrollContext.Provider value={onListScroll}>
        {children}
      </LensSheetScrollContext.Provider>
    </Animated.View>
  );
}

function errorCopyKey(error: unknown): { title: TranslationKey; body: TranslationKey } {
  if (isApiError(error)) {
    if (error.kind === 'network') return { title: 'lens.error.networkTitle', body: 'lens.error.networkBody' };
    if (error.kind === 'timeout') return { title: 'lens.error.timeoutTitle', body: 'lens.error.timeoutBody' };
    if (error.status === 429 || error.code === 'RATE_LIMITED') return { title: 'lens.error.rateTitle', body: 'lens.error.rateBody' };
    if (error.code === 'CAMERA_MOUNT_FAILED') return { title: 'lens.error.cameraTitle', body: 'lens.error.cameraBody' };
    if (error.kind === 'device') return { title: 'lens.error.photoTitle', body: 'lens.error.photoBody' };
    if (['BLURRY_IMAGE', 'IMAGE_TOO_BLURRY'].includes(error.code)) return { title: 'lens.error.blurryTitle', body: 'lens.error.blurryBody' };
    if (['LOW_LIGHT', 'IMAGE_TOO_DARK'].includes(error.code)) return { title: 'lens.error.darkTitle', body: 'lens.error.darkBody' };
    if (['PRODUCT_TOO_SMALL', 'NO_SUBJECT'].includes(error.code)) return { title: 'lens.error.subjectTitle', body: 'lens.error.subjectBody' };
    // SerpApi est l'entrée de la recherche : quand elle ne répond pas, on le
    // dit — pas « la recherche n'a pas abouti ».
    if (error.code === 'VISUAL_SEARCH_FAILED') return { title: 'lens.error.visualTitle', body: 'lens.error.visualBody' };
  }
  return { title: 'lens.error.serviceTitle', body: 'lens.error.serviceBody' };
}

const IDLE_LIVE: LiveView = { status: 'scanning', products: [], matches: [], selected: -1, photo: null };

/**
 * Filet de sécurité de l'écran : si le rendu de Z Lens (caméra) lève, expo-router
 * affiche le repli (arabe + français, bouton « عاود ») à la place de l'écran —
 * l'application reste ouverte, l'utilisateur peut revenir. Voir
 * `src/design/AppErrorBoundary.tsx` et la cause du 25/10/2026 (ordre des hooks).
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function LensScreen() {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  /**
   * Clavier (28/10/2026) : en mode « mots-clés » ou « adresse », le champ vit
   * dans le panneau du bas — sans ce décalage, le clavier le recouvrait et on
   * tapait à l'aveugle. Déclaré ICI, avec les autres hooks : les deux vues
   * (résultats / viseur) sont rendues par le même composant, un hook après un
   * `return` changerait le nombre de hooks entre deux rendus.
   * iOS seulement — Android réduit déjà la fenêtre (voir `useKeyboardInset`).
   */
  const keyboardInset = useKeyboardInset(Platform.OS === 'ios');
  const { width, height } = useWindowDimensions();
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('live');
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [panel, setPanel] = useState<InfoPanel | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [favorited, setFavorited] = useState<Record<string, true>>({});
  const [favoriteNote, setFavoriteNote] = useState<TranslationKey | null>(null);
  const [ocerexOpen, setOcerexOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [session, setSession] = useState<PhotoSession | null>(null);
  const [tip, setTip] = useState<{ key: TranslationKey; count?: number } | null>(null);
  const [live, setLive] = useState<LiveView>(IDLE_LIVE);
  const [panelHeight, setPanelHeight] = useState(220);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const cameraRef = useRef<CameraView>(null);
  const scanLock = useRef(false);
  const photoLock = useRef(false);
  const favoriteLocks = useRef(new Set<string>());
  const requestRef = useRef<AbortController | null>(null);
  const lastJobRef = useRef<SearchJob | null>(null);
  const ownedPreviewRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const permissionPrompted = useRef(false);
  const sessionRef = useRef<PhotoSession | null>(null);
  const resultsCache = useRef(new Map<string, ResultsStage>());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useRef(new Animated.Value(0)).current;
  // Live : capteur de mouvement + état du dernier repérage (lus hors rendu).
  const motionRef = useRef<MotionState>(initialMotion(Date.now()));
  const sensorRef = useRef(false);
  const liveCaptureRef = useRef<Promise<unknown> | null>(null);
  const liveRef = useRef({ lastAt: 0, doneAt: 0, count: 0, failures: 0, view: IDLE_LIVE });

  const discardOwnedPreview = useCallback(() => {
    const uri = ownedPreviewRef.current;
    ownedPreviewRef.current = null;
    if (uri) removePrivateCapture(uri);
  }, []);

  /** Fin de séance : fichiers privés supprimés, cache des sélections vidé. */
  const discardSession = useCallback(() => {
    const current = sessionRef.current;
    sessionRef.current = null;
    resultsCache.current.clear();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    current?.photos.forEach((photo) => photo.cleanup.forEach(removePrivateCapture));
    setSession(null);
    setTip(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const subscription = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => {
      mountedRef.current = false;
      subscription.remove();
      requestRef.current?.abort();
        if (searchTimer.current) clearTimeout(searchTimer.current);
      if (tipTimer.current) clearTimeout(tipTimer.current);
      discardOwnedPreview();
      sessionRef.current?.photos.forEach((photo) => photo.cleanup.forEach(removePrivateCapture));
    };
  }, [discardOwnedPreview]);

  // Écran quitté (pages légales, autre onglet) : la caméra est démontée, elle devra se réarmer.
  useEffect(() => {
    if (!focused) setCameraReady(false);
  }, [focused]);

  useEffect(() => {
    if (!permission || permission.granted || permission.status !== 'undetermined' || permissionPrompted.current) return;
    permissionPrompted.current = true;
    void requestPermission().catch(() => {
      // Le panneau caméra/galerie reste visible si Android refuse d’ouvrir le dialogue.
    });
  }, [permission, requestPermission]);

  const showSearch = useCallback((
    result: LensSearchResult | { candidates: LensCandidate[]; eventId: string; excluded?: number },
    cacheKey?: string,
    /** Le résultat n'écrase que l'attente : l'utilisateur a pu ouvrir une fiche entre-temps. */
    onlyIfBusy = false,
  ) => {
    const candidates = uniqueCandidates(result.candidates);
    const next: ResultsStage = {
      kind: 'results', candidates, eventId: result.eventId,
      excluded: 'excluded' in result ? (result.excluded ?? 0) : 0,
    };
    if (cacheKey) resultsCache.current.set(cacheKey, next);
    setFavoriteNote(null);
    setStage((current) => {
      if (!onlyIfBusy) return next;
      if (current.kind === 'busy') return next;
      // L'utilisateur a ouvert une fiche pendant la recherche : on ne casse
      // pas sa lecture. Mais si la grille affichée vient encore de l'attente
      // (pas de `eventId`), elle est remplacée par le résultat complet.
      if (current.kind === 'results' && !current.eventId) return next;
      return current;
    });
  }, []);

  const run = useCallback(async (job: SearchJob, remember = true) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (remember) lastJobRef.current = job;
    setStage({ kind: 'busy', progress: null, identification: null, cards: [] });
    try {
      await job(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted && !(isApiError(error) && error.isAborted)) setStage({ kind: 'error', error });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      scanLock.current = false;
    }
  }, []);

  /* ── Séance photo : cadre de sélection + recherche relancée ───────────── */

  const showTip = useCallback((key: TranslationKey, count?: number, ms = 3_500) => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
    setTip({ key, count });
    if (ms > 0) tipTimer.current = setTimeout(() => setTip(null), ms);
  }, []);

  const writeSession = useCallback((next: PhotoSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const patchPhoto = useCallback((key: string, patch: Partial<SessionPhoto>): SessionPhoto | null => {
    const current = sessionRef.current;
    if (!current) return null;
    let updated: SessionPhoto | null = null;
    const photos = current.photos.map((photo) => {
      if (photo.key !== key) return photo;
      updated = { ...photo, ...patch };
      return updated;
    });
    writeSession({ ...current, photos });
    return updated;
  }, [writeSession]);

  /** Recherche sur la zone du cadre ; une zone déjà cherchée revient du cache. */
  const searchSelection = useCallback((photo: SessionPhoto) => {
    const key = selectionKey(photo.key, photo.selection);
    const cached = resultsCache.current.get(key);
    if (cached) {
      requestRef.current?.abort();
      setFavoriteNote(null);
      setStage(cached);
      return;
    }
    const roi = toRoi(photo.selection);
    const job: SearchJob = async (signal) => {
      // FLUX : le serveur émet `progress`, `card`, `done`. Les fiches arrivent
      // au fil de l'eau et l'identification dès la première étape — au lieu
      // d'un écran de squelettes jusqu'à la fin.
      const result = await analyzeImageStream(
        { uri: photo.uri, name: 'capture.jpg', type: 'image/jpeg' },
        {
          roi,
          signal,
          onProgress: (progress) => {
            if (signal.aborted) return;
            setStage((current) => (current.kind === 'busy'
              ? { ...current, progress, identification: progress.identification ?? current.identification }
              : current));
          },
          onCard: (candidate) => {
            if (signal.aborted) return;
            setStage((current) => {
              if (current.kind !== 'busy') return current;
              const index = current.cards.findIndex((item) => item.sourceUrl === candidate.sourceUrl);
              const cards = [...current.cards];
              if (index < 0) cards.push(candidate);
              else cards[index] = candidate;
              return { ...current, cards };
            });
          },
        },
      );
      if (!signal.aborted) showSearch({ ...result, excluded: result.excluded?.count ?? 0 }, key, true);
    };
    void run(job);
  }, [run, showSearch]);

  /** Garde le cadre manuel de la photo, puis lance la recherche SerpApi. */
  /*
   * PAS DE DÉTECTION SÉPARÉE (17/10/2026) : SerpApi EST l'entrée de la
   * recherche visuelle, et la recherche le fait UNE seule fois. Un appel de
   * détection en plus, c'est une requête SerpApi de plus pour la même photo.
   * SerpApi ne rend pas de boîtes de toute façon : le cadre reste MANUEL
   * (toute la photo), et ce sont les résultats qui disent ce qu'on a trouvé.
   */
  const preparePhoto = useCallback(async (photoKey: string) => {
    const photo = sessionRef.current?.photos.find((item) => item.key === photoKey);
    if (!photo) return;
    if (photo.detection !== 'pending') {
      searchSelection(photo);
      return;
    }
    requestRef.current?.abort();
    setStage({ kind: 'busy', progress: null, identification: null, cards: [] });
    const updated = patchPhoto(photoKey, {
      detection: 'done',
      products: [],
      selected: -1,
      selection: FULL_BOX,
    });
    if (!updated) return;
    showTip('lens.select.frame');
    if (sessionRef.current?.photos[sessionRef.current.index]?.key === photoKey) searchSelection(updated);
  }, [patchPhoto, searchSelection, showTip]);

  const openSession = useCallback((photos: SessionPhoto[]) => {
    const previous = sessionRef.current;
    previous?.photos.forEach((photo) => photo.cleanup.forEach(removePrivateCapture));
    resultsCache.current.clear();
    writeSession({ photos, index: 0 });
    void preparePhoto(photos[0].key);
  }, [preparePhoto, writeSession]);

  const onSelectionCommit = useCallback((commit: SelectionCommit) => {
    const current = sessionRef.current;
    const photo = current?.photos[current.index];
    if (!photo) return;
    const patch: Partial<SessionPhoto> = commit.kind === 'product'
      ? { selected: commit.index, selection: padBox(photo.products[commit.index]?.box ?? FULL_BOX) }
      : { selected: -1, selection: commit.box };
    const updated = patchPhoto(photo.key, patch);
    if (!updated) return;
    setTip(null);
    // Petit délai : enchaîner deux gestes ne lance qu'une recherche.
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const latest = sessionRef.current?.photos.find((item) => item.key === updated.key);
      if (latest) searchSelection(latest);
    }, commit.kind === 'product' ? 120 : 350);
  }, [patchPhoto, searchSelection]);

  const showPhotoAt = useCallback((index: number) => {
    const current = sessionRef.current;
    if (!current || index === current.index || !current.photos[index]) return;
    writeSession({ ...current, index });
    void preparePhoto(current.photos[index].key);
  }, [preparePhoto, writeSession]);

  /* ── Live : repérage des produits sur l'aperçu caméra ──────────────────── */

  const liveActive = mode === 'live' && permission?.granted === true && cameraReady && focused && appActive
    && !session && stage.kind === 'idle' && !menuOpen && panel === null && !ocerexOpen;

  const writeLive = useCallback((next: LiveView) => {
    liveRef.current.view = next;
    setLive(next);
  }, []);

  // Capteur de mouvement : le téléphone bouge → les correspondances périmées s'effacent ;
  // il se stabilise → une nouvelle recherche visuelle peut partir.
  useEffect(() => {
    if (!liveActive) return undefined;
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    void import('expo-sensors')
      .then(async ({ Accelerometer }) => {
        const available = await Accelerometer.isAvailableAsync().catch(() => false);
        if (!available || cancelled) return;
        sensorRef.current = true;
        Accelerometer.setUpdateInterval(120);
        subscription = Accelerometer.addListener((sample) => {
          const before = motionRef.current;
          const next = nextMotion(before, sample, Date.now());
          motionRef.current = next;
          if (before.steadySince !== null && next.steadySince === null) {
            const view = liveRef.current.view;
            if (view.status === 'detected' || view.status === 'empty') writeLive({ ...view, status: 'scanning' });
          }
        });
      })
      .catch(() => {
        // Pas de capteur (ou module absent) : rythme lent et borné, voir `shouldDetect`.
      });
    return () => {
      cancelled = true;
      subscription?.remove();
      sensorRef.current = false;
    };
  }, [liveActive, writeLive]);

  // Boucle Live SerpApi (chaîne de minuteries, jamais d'intervalle fixe).
  useEffect(() => {
    if (!liveActive) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    const detectOnce = async () => {
      const camera = cameraRef.current;
      if (!camera) return;
      const startedAt = Date.now();
      const state = liveRef.current;
      state.lastAt = startedAt;
      state.count += 1;
      let snapshot: { uri: string; width: number; height: number } | null = null;
      try {
        const capture = camera.takePictureAsync({ quality: 0.5, shutterSound: false });
        liveCaptureRef.current = capture;
        snapshot = await capture;
      } catch {
        state.failures += 1;
        return;
      } finally {
        liveCaptureRef.current = null;
      }
      if (!snapshot?.uri) return;
      if (stopped) {
        removePrivateCapture(snapshot.uri);
        return;
      }
      const small = await shrinkImage(snapshot.uri, LIVE_EDGE, 0.6, { width: snapshot.width, height: snapshot.height });
      try {
        // SerpApi est l'unique entrée Lens : attendre le vrai délai de recherche
        // visuelle au lieu d'afficher un fallback d'identification différent.
        const result = await searchVisualMatches({ uri: small.uri, name: 'lens-live.jpg', type: 'image/jpeg' }, { signal: controller.signal });
        if (stopped || controller.signal.aborted) return;
        state.failures = 0;
        // Le téléphone a bougé pendant la requête : ces cadres ne correspondent plus à l'aperçu.
        if (motionRef.current.movedAt > startedAt) return;
        state.doneAt = Date.now();
        writeLive({
          // Les résultats sont des pages visuelles ; le viseur ne prétend pas
          // identifier une position sans boîte fournie par le fournisseur.
          status: result.matches.length ? 'detected' : 'empty',
          products: [],
          matches: result.matches,
          selected: -1,
          photo: { width: small.width || snapshot.width, height: small.height || snapshot.height },
        });
      } catch (error) {
        if (stopped || controller.signal.aborted) return;
        state.failures += 1;
        if (isApiError(error) && (error.status === 503 || error.status === 429 || state.failures >= 3)) {
          writeLive({ ...IDLE_LIVE, status: 'unavailable' });
        }
      } finally {
        removePrivateCapture(snapshot.uri);
        if (small.created) removePrivateCapture(small.uri);
      }
    };
    const tick = async () => {
      if (stopped) return;
      const now = Date.now();
      const state = liveRef.current;
      const motion = motionRef.current;
      const due = shouldDetect({
        now,
        lastDetectAt: state.lastAt,
        detections: state.count,
        failures: state.failures,
        sensor: sensorRef.current,
        steady: isSteady(motion, now),
        movedSinceDetect: motion.movedAt > state.doneAt,
        hasResult: state.doneAt > 0 && motion.movedAt <= state.doneAt,
      });
      if (due && !photoLock.current) await detectOnce();
      if (!stopped) timer = setTimeout(() => { void tick(); }, 350);
    };
    timer = setTimeout(() => { void tick(); }, 700);
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [liveActive, writeLive]);

  const resetLive = useCallback(() => {
    liveRef.current = { lastAt: 0, doneAt: 0, count: 0, failures: 0, view: IDLE_LIVE };
    setLive(IDLE_LIVE);
  }, []);

  const onLiveSelect = useCallback((_index: number) => {
    // Pas de boîtes SerpApi : les pages visuelles s'ouvrent depuis leur carte,
    // et le cadre de sélection photo reste manuel.
  }, []);

  /* ── Déclencheur, galerie, codes, lien, mot clé ────────────────────────── */

  const flashFeedback = useCallback(() => {
    if (theme.motion.reduced === 0) return;
    flash.setValue(0.85);
    Animated.timing(flash, { toValue: 0, duration: 380, useNativeDriver: true }).start();
  }, [flash, theme.motion.reduced]);

  const onPhoto = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || !cameraReady || photoLock.current) return;
    photoLock.current = true;
    try {
      // Une image Live est peut-être en cours : la caméra ne prend qu'une photo à la fois.
      await liveCaptureRef.current?.catch(() => undefined);
      flashFeedback();
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
      // Le repérage Live sert directement s'il est récent et que le téléphone n'a pas bougé :
      // le cadre reste sur le produit que le client avait choisi.
      const state = liveRef.current;
      const view = state.view;
      const reuse = view.status === 'detected' && Date.now() - state.doneAt < LIVE_REUSE_MS && motionRef.current.movedAt <= state.doneAt;
      const working = await shrinkImage(picture.uri, SEARCH_EDGE, 0.8, { width: picture.width, height: picture.height });
      if (!mountedRef.current) return;
      openSession([{
        key: `capture-${Date.now()}`,
        uri: working.uri,
        width: working.width || picture.width,
        height: working.height || picture.height,
        cleanup: working.created ? [working.uri] : [],
        detection: reuse ? 'done' : 'pending',
        products: reuse ? view.products : [],
        selected: reuse ? view.selected : -1,
        selection: reuse && view.products[view.selected] ? padBox(view.products[view.selected].box) : FULL_BOX,
      }]);
    } finally {
      photoLock.current = false;
    }
  }, [cameraReady, discardOwnedPreview, flashFeedback, openSession]);

  const onGallery = useCallback(async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: GALLERY_LIMIT,
        orderedSelection: true,
      });
      if (!mountedRef.current || picked.canceled || !picked.assets[0]) return;
      const assets = picked.assets.slice(0, GALLERY_LIMIT);
      const photos = await Promise.all(assets.map(async (asset, index): Promise<SessionPhoto> => {
        const working = await shrinkImage(asset.uri, SEARCH_EDGE, 0.8, { width: asset.width, height: asset.height });
        return {
          key: `gallery-${Date.now()}-${index}`,
          uri: working.uri,
          width: working.width || asset.width,
          height: working.height || asset.height,
          cleanup: working.created ? [working.uri] : [],
          detection: 'pending',
          products: [],
          selected: -1,
          selection: FULL_BOX,
        };
      }));
      if (!mountedRef.current) return;
      discardOwnedPreview();
      setPreviewUri(photos[0].uri);
      openSession(photos);
    } catch (cause) {
      if (mountedRef.current) {
        setStage({ kind: 'error', error: new ApiError('device', 'La galerie n’a pas pu ouvrir cette image.', { code: 'GALLERY_PICK_FAILED', cause }) });
      }
    }
  }, [discardOwnedPreview, openSession]);

  const onCodeScanned = useCallback((scan: BarcodeScanningResult) => {
    if (scanLock.current) return;
    const value = scan.data?.trim();
    if (!value) return;
    scanLock.current = true;
    const isQr = scan.type === 'qr';
    const job: SearchJob = async (signal) => {
      if (isQr && isOpenableSourceUrl(value)) {
        const result = await analyzeUrl(value, 'qr', true, signal);
        const ordered = result.fallback && result.alternates.length > 0
          ? [...result.alternates, result.product]
          : [result.product, ...result.alternates];
        if (!signal.aborted) showSearch({ candidates: ordered, eventId: result.eventId });
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
    Keyboard.dismiss();
    const job: SearchJob = async (signal) => {
      const result = await analyzeText(clean, signal);
      if (!signal.aborted) showSearch(result);
    };
    void run(job);
  }, [run, showSearch]);

  const runLinkSearch = useCallback((value: string, recordHistory = true) => {
    const url = value.trim();
    if (!isOpenableSourceUrl(url)) {
      setLinkInvalid(true);
      return;
    }
    setLinkInvalid(false);
    Keyboard.dismiss();
    const job: SearchJob = async (signal) => {
      const result = await analyzeUrl(url, 'url', recordHistory, signal);
      const ordered = result.fallback && result.alternates.length > 0
        ? [...result.alternates, result.product]
        : [result.product, ...result.alternates];
      if (!signal.aborted) showSearch({ candidates: ordered, eventId: result.eventId });
    };
    void run(job);
  }, [run, showSearch]);

  const pasteLink = useCallback(async () => {
    try {
      const { getStringAsync } = await import('expo-clipboard');
      const value = (await getStringAsync()).trim();
      if (value) {
        setLink(value);
        setLinkInvalid(false);
      }
    } catch {
      // Presse-papiers indisponible : le champ reste éditable à la main.
    }
  }, []);

  const openHistoryItem = useCallback((item: LensHistoryItem) => {
    setPanel(null);
    if (isOpenableSourceUrl(item.sourceUrl)) runLinkSearch(item.sourceUrl, false);
    else if (item.queryLabel.trim().length >= 2) runTextSearch(item.queryLabel);
  }, [runLinkSearch, runTextSearch]);

  const onMenuPick = useCallback((item: LensMenuItem) => {
    setMenuOpen(false);
    if (item === 'info') setPanel('help');
    else if (item === 'history') setPanel('history');
    else if (item === 'rules') setPanel('rules');
    else if (item === 'privacy') router.push('/legal/privacy');
    else router.push('/legal/terms');
  }, []);

  const switchMode = useCallback((value: Mode) => {
    if (value === mode) return;
    Keyboard.dismiss();
    scanLock.current = false;
    // Live et QR code partagent la même caméra : elle reste montée entre les deux.
    const keepsCamera = (value === 'live' || value === 'code') && (mode === 'live' || mode === 'code');
    if (!keepsCamera) setCameraReady(false);
    if (value !== 'live' && value !== 'code') setTorch(false);
    resetLive();
    setMode(value);
  }, [mode, resetLive]);

  /**
   * APPUI SUR UNE CARTE → AYWEBs, toujours (28/10/2026).
   *
   * Lien collé, mots-clés, photo, QR : le chemin d'entrée ne change RIEN à la
   * destination. La carte porte l'adresse de la fiche ; l'appui ouvre CETTE
   * page dans le navigateur AYWEBs, où le client choisit couleur/taille sur le
   * site, et où « Add to Cart » relit la page (capture) avant d'ajouter.
   *
   * L'ancienne grande fiche Lens — destination de repli du catalogue et des
   * adresses refusées — est supprimée : plus aucun appui ne peut sortir du
   * parcours AYWEBs (voir `lensOpen.ts`).
   */
  const onOpen = useCallback((candidate: LensCandidate) => {
    const decision = lensOpenDecision(candidate);
    if (decision.screen !== 'browser') return;
    if (stage.kind === 'results' && stage.eventId) void markChosen(stage.eventId);
    router.push(decision.target);
  }, [markChosen, stage]);

  /**
   * Live : ouvrir la page d'une CORRESPONDANCE visuelle. SerpApi a trouvé des
   * pages qui ressemblent à la photo ; l'appui suit la MÊME règle que les
   * cartes — la page du marchand s'ouvre dans AYWEBs, jamais ailleurs.
   */
  const onOpenLiveMatch = useCallback((match: LensVisualMatch) => {
    if (!isOpenableSourceUrl(match.url)) return;
    const decision = lensOpenDecision({
      sourceUrl: match.url,
      source: match.source,
    });
    if (decision.screen === 'browser') router.push(decision.target);
  }, []);

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
    requestRef.current = null;
    lastJobRef.current = null;
    scanLock.current = false;
    photoLock.current = false;
    discardOwnedPreview();
    discardSession();
    setPreviewUri(null);
    setFavoriteNote(null);
    resetLive();
    setStage({ kind: 'idle' });
  }, [discardOwnedPreview, discardSession, resetLive]);

  const cancelSearch = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    lastJobRef.current = null;
    scanLock.current = false;
    discardOwnedPreview();
    discardSession();
    setPreviewUri(null);
    resetLive();
    setStage({ kind: 'idle' });
  }, [discardOwnedPreview, discardSession, resetLive]);

  const retry = useCallback(() => {
    const job = lastJobRef.current;
    if (job) void run(job, false);
    else reset();
  }, [reset, run]);

  const sessionPhoto = session ? session.photos[session.index] ?? null : null;
  const resultTitle = useMemo(() => {
    if (!sessionPhoto) return undefined;
    if (sessionPhoto.selected >= 0) return sessionPhoto.products[sessionPhoto.selected]?.name;
    return isFullFrame(sessionPhoto.selection) ? undefined : t('lens.select.zone');
  }, [sessionPhoto, t]);

  /** Le texte de la barre flottante : l'étape pendant la recherche, le produit trouvé après. */
  const barLabel = useMemo(() => {
    if (stage.kind === 'busy') return lensProgressLabel(stage.progress, t);
    if (stage.kind === 'results') return resultTitle || t('lens.resultsTitle');
    if (stage.kind === 'error') return t('lens.resultsTitle');
    return t('lens.bar.placeholder');
  }, [stage, resultTitle, t]);

  const infoModal = (
    <Modal visible={panel !== null} transparent animationType="slide" onRequestClose={() => setPanel(null)}>
      <View style={styles.helpRoot}>
        <Pressable style={styles.helpScrim} onPress={() => setPanel(null)} accessibilityRole="button" accessibilityLabel={t('sheet.close')} />
        <View style={[styles.helpSheet, { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.sheet, borderTopRightRadius: theme.radius.sheet, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.sheetHandle, { backgroundColor: theme.colors.lineControl }]} />
          {panel === 'history' ? <LensHistoryView onOpen={openHistoryItem} /> : (
            <ScrollView style={styles.helpScroll} contentContainerStyle={styles.helpScrollContent} showsVerticalScrollIndicator={false}>
              {panel === 'rules' ? <LensRulesView /> : <LensHelpView />}
            </ScrollView>
          )}
          <Button label={t('lens.help.back')} onPress={() => setPanel(null)} tone="quiet" block />
        </View>
      </View>
    </Modal>
  );

  if (ocerexOpen) {
    return (
      <SubScreen title={t('ocerex.title')} subtitle={t('ocerex.subtitle')} fallback="/lens">
        <OcerexFlow onClose={() => setOcerexOpen(false)} />
      </SubScreen>
    );
  }

  const resultScene = stage.kind === 'busy' || stage.kind === 'results' || stage.kind === 'error' || session !== null;
  if (resultScene) {
    const errorCopy = stage.kind === 'error' ? errorCopyKey(stage.error) : null;
    const deviceError = stage.kind === 'error' && isApiError(stage.error) && stage.error.kind === 'device';
    // Avec une photo, la feuille repose BAS (69 % de l'écran) : la photo et son
    // cadre restent visibles et manipulables ; levée, elle passe plein écran.
    const sheet = lensSheetGeometry({
      screenHeight: height,
      topInset: insets.top,
      bottomInset: insets.bottom,
      withPhoto: Boolean(sessionPhoto),
      busy: stage.kind === 'busy',
    });
    const sheetTop = sheet.restTop;
    const photoTop = insets.top + 58;
    const multi = (session?.photos.length ?? 0) > 1;
    const photoHeight = Math.max(120, sheetTop - photoTop - (multi ? 72 : 12));
    return (
      <View style={[styles.scene, { backgroundColor: sessionPhoto ? LENS_COLORS.black : theme.colors.infoSoft }]}>
        <StatusBar style="light" />
        {sessionPhoto ? (
          <LensSelectionView
            uri={sessionPhoto.uri}
            imageWidth={sessionPhoto.width}
            imageHeight={sessionPhoto.height}
            top={photoTop}
            height={photoHeight}
            width={width}
            products={sessionPhoto.products}
            selection={sessionPhoto.selection}
            selectedIndex={sessionPhoto.selected}
            detecting={sessionPhoto.detection === 'pending'}
            searching={stage.kind === 'busy' && sessionPhoto.detection !== 'pending'}
            onCommit={onSelectionCommit}
          />
        ) : previewUri ? (
          <AppImage uri={previewUri} contentFit="cover" style={styles.preview} accessibilityLabel={t('lens.capturedPhoto')} testID="lens-captured-preview" />
        ) : (
          // Fond de « viseur » toujours sombre : l'en-tête et les contrôles posés dessus sont
          // blancs. `ink` devenait BLANC en mode sombre (titre blanc sur blanc).
          <View style={[styles.preview, styles.previewFallback, { backgroundColor: LENS_COLORS.black }]}>
            <Ionicons name="scan-outline" size={theme.iconSize.xxl} color={LENS_COLORS.white} accessibilityElementsHidden />
          </View>
        )}
        {session && multi ? (
          <View style={[styles.thumbs, { top: sheetTop - 64, flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]} testID="lens-photo-thumbs">
            {session.photos.map((photo, index) => (
              <Pressable
                key={photo.key}
                onPress={() => showPhotoAt(index)}
                accessibilityRole="button"
                accessibilityState={{ selected: index === session.index }}
                accessibilityLabel={t('lens.select.photo', { index: index + 1, count: session.photos.length })}
                style={[styles.thumb, { borderColor: index === session.index ? LENS_COLORS.white : frost(0.35), borderRadius: theme.radius.md }]}
                testID={`lens-photo-thumb-${index}`}
              >
                <AppImage uri={photo.uri} contentFit="cover" style={StyleSheet.absoluteFill} decorative />
              </Pressable>
            ))}
            <View style={[styles.thumbCount, { backgroundColor: veil(0.65) }]}>
              <AppText variant="caption" weight="bold" color={LENS_COLORS.white}>{`${session.index + 1}/${session.photos.length}`}</AppText>
            </View>
          </View>
        ) : null}
        {sessionPhoto && tip ? (
          <View pointerEvents="none" style={[styles.tip, { top: photoTop + 8, backgroundColor: veil(0.78) }]} accessibilityLiveRegion="polite" testID="lens-selection-tip">
            <AppText variant="caption" color={LENS_COLORS.white} align="center">{t(tip.key, { count: tip.count ?? 0 })}</AppText>
          </View>
        ) : null}
        <View style={[styles.resultTop, { paddingTop: insets.top + 6, flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable onPress={reset} accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.overlayButton} hitSlop={HIT_SLOP}>
            <Ionicons name={theme.isRTL ? 'arrow-forward' : 'arrow-back'} size={theme.iconSize.md} color={LENS_COLORS.white} style={styles.crisp} accessibilityElementsHidden />
          </Pressable>
          {/* Barre flottante : elle remplace le titre quand une photo est
              analysée — la photo, son cadre et l'étape restent visibles. */}
          {sessionPhoto ? (
            <LensSearchBar uri={sessionPhoto.uri} label={barLabel} onCancel={cancelSearch} busy={stage.kind === 'busy'} />
          ) : (
            <AppText variant="title" weight="semibold" color={LENS_COLORS.white} align="center" style={styles.resultTitle}>{t('lens.title')}</AppText>
          )}
          <View style={styles.headerSpacer} />
        </View>

        <SearchSheet geometry={sheet}>
          {stage.kind === 'busy' ? (
            <>
              {/* L'identification arrive dès la première étape : la réponse en
                  clair s'affiche avant la première fiche marchande. */}
              {stage.identification ? <LensOverviewCard identification={stage.identification} /> : null}
              {stage.cards.length > 0 ? (
                <>
                  <LensProgressLine progress={stage.progress} />
                  <LensResultsGrid
                    candidates={stage.cards}
                    excluded={0}
                    favorited={favorited}
                    favoriteNote={favoriteNote}
                    onOpen={onOpen}
                    onFavorite={onFavorite}
                    onNewSearch={reset}
                    title={resultTitle}
                  />
                </>
              ) : (
                <LensSearchSkeleton onCancel={cancelSearch} title={resultTitle} progress={stage.progress} />
              )}
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
              title={resultTitle}
            />
          ) : null}
          {stage.kind === 'error' && errorCopy ? (
            <View style={styles.errorState} testID="lens-search-error">
              {/* Décision n° 1 : le rond gris disparaît, l'icône reste nue. */}
              <View style={styles.errorIcon}>
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

  const cameraMode = mode === 'live' || mode === 'code';
  const cameraAllowed = permission?.granted === true;
  const showCamera = cameraMode && cameraAllowed && focused;
  const headerBottom = insets.top + 58;
  const liveCount = live.matches.length;
  const livePill: string = live.status === 'detected'
    ? (liveCount === 1 ? t('lens.live.matchOne') : t('lens.live.matchMany', { count: liveCount }))
    : live.status === 'empty' ? t('lens.live.noMatch')
      : live.status === 'unavailable' ? t('lens.cameraHint') : t('lens.live.scanning');
  return (
    <View style={[styles.scene, { backgroundColor: LENS_COLORS.black }]} testID="lens-camera-experience">
      <StatusBar style="light" />
      {showCamera ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          animateShutter={false}
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
        {mode === 'live' && showCamera ? (
          <LensLiveOverlay
            detected={live.status === 'detected'}
            products={live.products}
            selected={live.selected}
            photo={live.photo}
            width={width}
            height={height}
            visibleTop={headerBottom}
            // Le cadre s'arrête au-dessus de la pastille d'état (posée sur le panneau).
            visibleBottom={height - panelHeight - 52}
            onSelect={onLiveSelect}
            matches={live.matches}
            onOpenMatch={onOpenLiveMatch}
          />
        ) : null}

        {mode === 'code' && showCamera ? (
          <View style={styles.focusFrame} pointerEvents="none">
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        ) : null}

        <View style={[styles.cameraTop, { paddingTop: insets.top + 6, flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.headerSide, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
            <Pressable onPress={() => goBack('/')} accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.overlayButton} hitSlop={HIT_SLOP}>
              <Ionicons name={theme.isRTL ? 'arrow-forward' : 'arrow-back'} size={theme.iconSize.md} color={LENS_COLORS.white} style={styles.crisp} accessibilityElementsHidden />
            </Pressable>
            {cameraMode && cameraAllowed ? (
              <Pressable onPress={() => setTorch((value) => !value)} accessibilityRole="button" accessibilityLabel={t('lens.flash')} style={styles.overlayButton} hitSlop={HIT_SLOP} testID="lens-torch">
                <Ionicons name={torch ? 'flash' : 'flash-off'} size={theme.iconSize.md} color={LENS_COLORS.white} style={styles.crisp} accessibilityElementsHidden />
              </Pressable>
            ) : null}
          </View>
          {/* « Z Lens » écrit en texte (pas le logo) — spécification du client. */}
          <AppText variant="title" weight="semibold" color={LENS_COLORS.white} align="center" style={styles.cameraTitle}>{t('lens.title')}</AppText>
          <View style={[styles.headerSide, { flexDirection: theme.isRTL ? 'row' : 'row-reverse' }]}>
            <Pressable onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel={t('lens.menu.open')} style={styles.overlayButton} hitSlop={HIT_SLOP} testID="lens-open-menu">
              <Ionicons name="ellipsis-vertical-outline" size={theme.iconSize.md} color={LENS_COLORS.white} style={styles.crisp} accessibilityElementsHidden />
            </Pressable>
          </View>
        </View>

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

        {mode === 'link' || mode === 'text' ? (
          <View style={[styles.offline, { top: headerBottom + 48 }]} pointerEvents="none">
            <View style={[styles.offlineIcon, { backgroundColor: frost(0.1) }]}>
              <Ionicons name={mode === 'link' ? 'link-outline' : 'search-outline'} size={theme.iconSize.lg} color={LENS_COLORS.white} accessibilityElementsHidden />
            </View>
            <AppText variant="title" weight="bold" color={LENS_COLORS.white} align="center">
              {mode === 'link' ? t('lens.link.title') : t('lens.text.title')}
            </AppText>
            <AppText color={frost(0.75)} align="center">{mode === 'link' ? t('lens.link.text') : t('lens.text.text')}</AppText>
          </View>
        ) : null}

        {mode === 'live' && showCamera ? (
          <View style={[styles.livePill, { bottom: panelHeight + 12, backgroundColor: veil(0.62) }]} pointerEvents="none" accessibilityLiveRegion="polite" testID="lens-live-status">
            <View style={[styles.livePillDot, { backgroundColor: live.status === 'detected' ? LENS_COLORS.activeSoft : frost(0.6) }]} />
            <AppText variant="caption" weight="semibold" color={LENS_COLORS.white} numberOfLines={1}>{livePill}</AppText>
          </View>
        ) : null}

        {/* Panneau du bas : boutons AU-DESSUS, barre des modes TOUT EN BAS (demande du client).
            TRANSPARENT : la caméra plein écran reste visible derrière les boutons, comme
            Google Lens ; seuls les boutons et la barre portent un voile translucide. */}
        <View
          style={[styles.panel, { paddingBottom: insets.bottom + 12, bottom: keyboardInset }]}
          onLayout={(event) => setPanelHeight(Math.round(event.nativeEvent.layout.height))}
          testID="lens-panel"
        >
          {mode === 'live' && cameraAllowed ? (
            <View style={[styles.captureRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable onPress={onGallery} accessibilityRole="button" accessibilityLabel={t('lens.pickGallery')} style={styles.side} testID="lens-gallery">
                <View style={styles.sideCircle}>
                  <Ionicons name="images-outline" size={theme.iconSize.md} color={LENS_COLORS.white} accessibilityElementsHidden />
                </View>
                <AppText variant="caption" weight="semibold" color={LENS_COLORS.white} style={styles.overCamera}>{t('lens.gallery')}</AppText>
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
                <View style={styles.shutterInner}>
                  <Ionicons name="search-outline" size={theme.iconSize.lg} color={LENS_COLORS.black} accessibilityElementsHidden />
                </View>
              </Pressable>
              <Pressable onPress={() => setOcerexOpen(true)} accessibilityRole="button" accessibilityLabel={t('ocerex.open')} style={styles.side} testID="lens-open-ocerex">
                <View style={styles.sideCircle}>
                  <Ionicons name="pricetag-outline" size={theme.iconSize.md} color={LENS_COLORS.white} accessibilityElementsHidden />
                </View>
                <AppText variant="caption" weight="semibold" color={LENS_COLORS.white} style={styles.overCamera}>OCEREX</AppText>
              </Pressable>
            </View>
          ) : null}

          {mode === 'code' && cameraAllowed ? (
            <View style={[styles.codeHint, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
              <Ionicons name="qr-code-outline" size={theme.iconSize.md} color={LENS_COLORS.white} accessibilityElementsHidden />
              <View style={styles.codeHintCopy}>
                <AppText weight="bold" color={LENS_COLORS.white}>{t('lens.codeHint')}</AppText>
                <AppText variant="caption" color={frost(0.75)}>{t('lens.codeAuto')}</AppText>
              </View>
            </View>
          ) : null}

          {mode === 'link' ? (
            <View style={[styles.textSearch, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card }]}>
              <View style={[styles.linkRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
                <View style={styles.linkField}>
                  <Field
                    value={link}
                    onChangeText={(value) => { setLink(value); if (linkInvalid) setLinkInvalid(false); }}
                    placeholder={t('lens.link.placeholder')}
                    onSubmitEditing={() => runLinkSearch(link)}
                    returnKeyType="search"
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel={t('lens.link.placeholder')}
                  />
                </View>
                <Button label={t('lens.link.paste')} onPress={() => { void pasteLink(); }} tone="quiet" testID="lens-link-paste" />
              </View>
              {linkInvalid ? (
                <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{t('lens.link.invalid')}</AppText>
              ) : null}
              <Button label={t('lens.search')} onPress={() => runLinkSearch(link)} disabled={link.trim().length < 8} block testID="lens-link-search" />
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

          <View style={[styles.modePicker, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]} accessibilityRole="tablist">
            {MODES.map(([value, label, icon]) => {
              const active = value === mode;
              return (
                <Pressable
                  key={value}
                  onPress={() => switchMode(value)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[styles.mode, active ? styles.modeActive : null]}
                  testID={`lens-mode-${value}`}
                >
                  <Ionicons name={icon} size={theme.iconSize.sm} color={active ? LENS_COLORS.black : LENS_COLORS.white} accessibilityElementsHidden />
                  <AppText variant="caption" weight="semibold" color={active ? LENS_COLORS.black : LENS_COLORS.white} align="center" numberOfLines={1}>{t(label)}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: LENS_COLORS.white, opacity: flash }]} />

      <LensMenu visible={menuOpen} top={insets.top + 54} onClose={() => setMenuOpen(false)} onPick={onMenuPick} />
      {infoModal}
    </View>
  );
}

const SHUTTER = 104;
const SHUTTER_CORE = 88;
const SIDE = 54;

const styles = StyleSheet.create({
  scene: { flex: 1 },
  cameraTop: { position: 'absolute', left: 8, right: 8, top: 0, alignItems: 'center', zIndex: 5 },
  headerSide: { width: 100, alignItems: 'center', gap: 4 },
  // Icônes nues sur la caméra, comme Google Lens : plus de pastille sombre derrière.
  // Zone de toucher 48 × 48 conservée.
  overlayButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 48, height: 48 },
  // Ombre SERRÉE (rayon 2, décalée d'un point) : lisible sur une image claire sans
  // flouter les contours — l'ancienne ombre large rendait textes et icônes baveux.
  crisp: { textShadowColor: veil(0.5), textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  cameraTitle: { flex: 1, textShadowColor: veil(0.5), textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  focusFrame: { position: 'absolute', left: '14%', right: '14%', top: '24%', aspectRatio: 1 },
  // Coins en quart de cercle, comme le viseur de Google Lens.
  corner: { position: 'absolute', width: 52, height: 52, borderColor: frost(0.9) },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 52 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 52 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 52 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 52 },
  livePill: {
    position: 'absolute', alignSelf: 'center', maxWidth: '92%', minHeight: 32, borderRadius: RADIUS.lg,
    paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  livePillDot: { width: 8, height: 8, borderRadius: 4 },
  offline: { position: 'absolute', left: 32, right: 32, alignItems: 'center', gap: 12 },
  offlineIcon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 16, paddingHorizontal: 12, gap: 16 },
  // Galerie et OCEREX tout près du déclencheur (repère : la vignette galerie de Google Lens).
  captureRow: { alignItems: 'center', justifyContent: 'center', gap: 24 },
  side: { width: 72, alignItems: 'center', gap: 4 },
  // Libellé blanc lisible sur une image claire (le panneau n'a plus de fond).
  overCamera: { textShadowColor: veil(0.5), textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  // Anneau blanc net (2 pt) sur un voile léger : l'icône ressort sans tache sombre.
  sideCircle: {
    width: SIDE, height: SIDE, borderRadius: SIDE / 2, borderWidth: 2, borderColor: LENS_COLORS.white,
    backgroundColor: veil(0.28), alignItems: 'center', justifyContent: 'center',
  },
  // Déclencheur nettement plus grand que Galerie et OCEREX (104 contre 54) ;
  // la marge basse aligne son centre sur celui des deux cercles (libellés dessous).
  shutterOuter: {
    width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2, backgroundColor: frost(0.35),
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  shutterInner: {
    width: SHUTTER_CORE, height: SHUTTER_CORE, borderRadius: SHUTTER_CORE / 2, backgroundColor: LENS_COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  codeHint: {
    alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: RADIUS.lg,
    backgroundColor: LENS_COLORS.cameraControl,
  },
  codeHintCopy: { flex: 1, gap: 4 },
  // Barre posée sur la caméra : voile sombre translucide (la caméra se devine derrière).
  modePicker: { minHeight: 64, borderRadius: RADIUS.full, padding: 4, backgroundColor: LENS_COLORS.cameraControl },
  mode: { flex: 1, minHeight: 56, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 4 },
  // Mode choisi = état actif : pastille violet clair, libellé noir (10,4:1).
  modeActive: { backgroundColor: LENS_COLORS.activeSoft },
  permissionCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  permissionCard: { width: '100%', maxWidth: 420, gap: 16, alignItems: 'center', padding: 24 },
  textSearch: { gap: 10, padding: 16 },
  linkRow: { alignItems: 'center', gap: 8 },
  linkField: { flex: 1 },
  preview: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  previewFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbs: { position: 'absolute', left: 12, right: 12, alignItems: 'center', gap: 8, zIndex: 2 },
  thumb: { width: 48, height: 48, borderWidth: 2, overflow: 'hidden' },
  thumbCount: { borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 4 },
  tip: { position: 'absolute', alignSelf: 'center', maxWidth: '88%', borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 8, zIndex: 3 },
  resultTop: { position: 'absolute', top: 0, left: 8, right: 8, alignItems: 'center', zIndex: 3 },
  resultTitle: { flex: 1, textShadowColor: veil(0.5), textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  // Au-dessus de tout le reste (en-tête, aide, vignettes) : plein écran, elle les couvre.
  searchSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 5 },
  sheetGrabArea: { height: 30, alignItems: 'center', justifyContent: 'center' },
  sheetHandle: { width: 48, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
  sheetDragHandle: { marginBottom: 0 },
  detectNotice: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  detectNoticeText: { flex: 1 },
  errorState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingBottom: 24 },
  errorIcon: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  helpRoot: { flex: 1, justifyContent: 'flex-end' },
  helpScrim: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: LENS_COLORS.cameraScrim },
  helpSheet: { maxHeight: '82%', paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  helpScroll: { flexGrow: 0, flexShrink: 1 },
  helpScrollContent: { paddingBottom: 4 },
});
