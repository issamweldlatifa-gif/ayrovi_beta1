/**
 * AYWEBs — P3، الشريحتان 2 و3: صفحة المتجر داخل WebView + الكابتشر + «Add to Cart».
 *
 * الرحلة: الصفحة الحقيقية للمتجر تبان كاملة (بلا شريط عنوان ولا زر قراءة).
 * الشريط العلوي: الرجوع، اسم المتجر، وأيقونة السلة. الشريط السفلي يبقي زر
 * «Add to Cart» فقط، مع سطر حالة صغير وقت القراءة؛ ما عادش فيه شريط متصفح أو CTA إضافي.
 *
 *  • «Add to Cart» — يقرا الصفحة (كابتشر + قراءة من الخادم بالتوازي)، ثم **ورقة
 *    الاختيار فوق هذه الصفحة**، ثم إضافة حقيقية في سلّة AYWEBs على الخادم. المستعمل
 *    **ما يخرجش** من المتجر، والصفحة (HTML) **ما تتبعثش أبداً**، ولا سعر ولا حالة
 *    تخرج من الجهاز.
 *
 * شرط تفعيل «Add to Cart» هو نفسه في العقد: **الخادم** صنّف الصفحة كصفحة
 * منتوج. قبل التصنيف الزرّ معطّل والسبب مكتوب — زر ما ينجمش ينجح ما يتفعّلش.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { goBack } from '@/design/navigation';
import { Alert, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import {
  captureMatchesPageUrl, decideWebNavigation, isFatalMainPageLoadError, isSilentAppDeepLink, isSpaInPageProductSwitch, isWebPageUrl,
} from '@/features/aywebs/webNavigation';

import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useI18n } from '@/i18n';
import { ApiError } from '@/api/errors';
import { addErrorMessage } from '@/features/aywebs/addError';
import { StoreCartSheet } from '@/features/aywebs/StoreSheets';
import { rememberAyWebsVisit } from '@/features/aywebs/lastVisitedStore';
import {
  analyzeAyWebsPage, buildAyWebsCaptureInjection, fetchAyWebsCart, fetchAyWebsCaptureScript,
  isAyWebsBridgeMessage, parseAyWebsCaptureMessage, resolveAyWebsProductWithCapture,
  type AyWebsCart, type AyWebsCartItem, type AyWebsPageAnalysis, type AyWebsResolvedProduct, type AyWebsVariantOption,
} from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import { readOnlyStoreSelection } from '@/features/aywebs/storeSheetMode';
import { AYWEBS_NETWORK_OBSERVER_SCRIPT } from '@/features/aywebs/networkObserverScript';
import {
  groupsFromCapture, localVariantsFromCapture, optionsFromVariants, productFromCapture,
} from '@/features/aywebs/localProduct';
import { captureIsProductCard } from '@/features/aywebs/pageKind';
import { VariantReader, type VariantReaderHandle } from '@/features/aywebs/VariantReader';
import { waitForPageIdle } from '@/features/aywebs/captureFallback';
import {
  AYWEBS_CAPTURE_WATCHDOG_MS, canReusePrefetch, priceCandidatesOf, priceRetryDelayMs, readDecision, resolveAddToCart, shouldRetryAyWebsCaptureForPrice,
  type ReadIntent,
} from '@/features/aywebs/captureFlow';
import { useSessionId } from '@/session/session';
import { useSession } from '@/state/session';
import { shareableStoreUrl, sonimOwner, stageSonimDraft } from '@/features/sonim/sonimContext';

/** كي الصفحة ما تبعثش شي: مانبقاوش نستنّوا بلا نهاية. */

/**
 * باغ أنواع عند `react-native-webview` (13.17): الصنف معلن `WebView<P = undefined>`
 * و`WebViewProps & undefined` = `never`، فتفسير JSX يرفض كل خاصية. الإصلاح محلي:
 * المكوّن + مرجع فيه `injectJavaScript` (اللي موجود فعلاً في وقت التنفيذ).
 */
type WebViewHandle = { injectJavaScript: (script: string) => void; goBack: () => void };
const WebView = RNWebView as unknown as ComponentType<
  WebViewProps & { ref?: Ref<WebViewHandle> }
>;

/** كي الكابتشر ما يجيش في الوقت: سبب صريح، موش انتظار أبدي. */

/**
 * Filet de sécurité de l'écran : si le rendu lève, expo-router affiche le repli
 * (arabe + français, bouton « عاود ») à la place de l'écran — l'application
 * reste ouverte, l'utilisateur peut revenir. Voir `src/design/AppErrorBoundary.tsx`
 * et la cause du 25/10/2026 (ordre des hooks). Toute route en a un : c'est
 * vérifié par `tests/error-boundary-coverage.test.ts`.
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function AyWebsBrowserScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const sessionId = useSessionId();
  const { account, status } = useSession();
  const queryClient = useQueryClient();
  const cartQueryKey = useMemo(() => ['store-sheet', 'aywebs-cart', sessionId] as const, [sessionId]);
  const [cartAddedAt, setCartAddedAt] = useState(0);

  useEffect(() => {
    if (!cartAddedAt) return undefined;
    const timerId = setTimeout(() => setCartAddedAt(0), 2400);
    return () => clearTimeout(timerId);
  }, [cartAddedAt]);

  const storeCart = useQuery({
    queryKey: cartQueryKey,
    queryFn: ({ signal }) => fetchAyWebsCart({ sessionId, signal }),
    enabled: Boolean(sessionId),
    retry: false,
    staleTime: 20_000,
  });

  const params = useLocalSearchParams<{ url?: string | string[]; storeId?: string | string[]; storeName?: string | string[]; capture?: string | string[] }>();
  const rawUrlParam = Array.isArray(params.url) ? params.url[0] : params.url;
  const url = (() => {
    const trimmed = String(rawUrlParam ?? '').trim();
    if (/^https?%3A%2F%2F/i.test(trimmed)) {
      try { return decodeURIComponent(trimmed).trim(); } catch { return trimmed; }
    }
    return trimmed;
  })();
  const storeId = String((Array.isArray(params.storeId) ? params.storeId[0] : params.storeId) ?? '');
  /** السماح الأوّلي من شاشة المتجر؛ يتحدّث حسب الصفحة الحالية بعد التصنيف. */
  const captureParam = Array.isArray(params.capture) ? params.capture[0] : params.capture;
  const captureAllowedParam = captureParam === '1';
  const storeName = String((Array.isArray(params.storeName) ? params.storeName[0] : params.storeName) ?? '');
  /** رابط غير صالح (مخطط غريب أو فارغ) لا يُحمَّل أبداً في الـWebView. */
  const pageOk = isWebPageUrl(url);

  const webRef = useRef<WebViewHandle>(null);
  /* Lecteur masqué de la page de variante (confirmation d'un choix ≠ page affichée). */
  const variantReader = useRef<VariantReaderHandle>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** الوعد الجاري لقراءة الصفحة: يتفتح بالحقن ويتسدّ بالرسالة (ولا بالمهلة). */
  const waiter = useRef<{
    resolve: (capture: Record<string, unknown>) => void;
    reject: (error: unknown) => void;
    quiet: boolean;
    requestedUrl: string;
  } | null>(null);
  /** Vrai pendant que la page charge (mis à jour par onNavigationStateChange). */
  const pageLoadingRef = useRef(false);
  /** Page pour laquelle on a déjà attendu la fin du chargement (une seule fois par page). */
  const idleWaitedUrl = useRef<string | null>(null);
  /* Lecture mise en cache si déjà présente. */
  const prefetch = useRef<{
    url: string;
    at: number;
    status: 'reading' | 'ok' | 'failed';
    promise: Promise<Record<string, unknown>>;
    controller: AbortController;
  } | null>(null);
  /** Nombre de relances de capture faute de prix, et dernier script chargé. */
  const captureRetries = useRef(0);
  /** Contrôleur de l'appui « Add » en cours : un nouvel appui, ou la sortie de l'écran, l'annule. */
  const addController = useRef<AbortController | null>(null);
  const lastScript = useRef<string | null>(null);

  const [busy, setBusy] = useState(false);
  /** Android back first follows merchant WebView history when it exists. */
  const [webCanGoBack, setWebCanGoBack] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [note, setNote] = useState('');
  /* العنوان المحمَّل في الـWebView: ثابت لكل فتح، ويتحدّث إذا تبدّل الرابط الممرَّر للشاشة. */
  const [loadUrl, setLoadUrl] = useState(url);
  /* الصفحة الحالية كما يصرّح بها التنقّل داخل الـWebView (تتبع الروابط). */
  const [pageUrl, setPageUrl] = useState(url);
  useEffect(() => {
    if (!url || url === loadUrl) return;
    setLoadUrl(url);
    setPageUrl(url);
  }, [url, loadUrl]);
  /** Page courante, lisible depuis `requestCapture` (qui ne dépend d'aucun état React). */
  const pageUrlRef = useRef(pageUrl);
  const lastRecordedVisit = useRef('');
  useEffect(() => { pageUrlRef.current = pageUrl; }, [pageUrl]);
  /** Script de capture propre au marchand analysé (lu par `requestCapture`, callback stable). */
  const captureStoreIdRef = useRef('');
  /**
   * Lecture EN COURS dans le WebView (une seule à la fois). Sert à rattacher une
   * pré-lecture silencieuse à la lecture du client au lieu de la remplacer
   * (voir `readDecision` : le « Requête interrompue » du 23/10/2026 à 04:14:28).
   */
  const inFlightRead = useRef<{
    intent: ReadIntent;
    pageUrl: string;
    status: 'pending' | 'done' | 'failed';
    promise: Promise<Record<string, unknown>>;
  } | null>(null);
  /** تصنيف الخادم للصفحة الحالية: مصدر السماح بالقراءة وبالإضافة. */
  const [pageAnalysis, setPageAnalysis] = useState<AyWebsPageAnalysis | null>(null);
  /* Une réponse d'analyse n'a droit de piloter QUE son URL. Pendant une
     navigation, l'ancienne fiche ne peut donc ni autoriser une injection sur la
     nouvelle page ni laisser son bouton actif une fraction de seconde. */
  const currentPageAnalysis = pageAnalysis
    && captureMatchesPageUrl(pageAnalysis.url, pageUrl)
    ? pageAnalysis
    : null;
  const currentStoreId = currentPageAnalysis?.storeId || (pageUrl === url ? storeId : '');
  const currentStoreName = currentPageAnalysis?.storeName || storeName;
  const cartUnits = useMemo(() => (storeCart.data?.items ?? [])
    .filter((item) => item.storeId === currentStoreId)
    .reduce((total, item) => total + item.quantity, 0), [currentStoreId, storeCart.data?.items]);
  const cartAccessibilityLabel = cartUnits > 0
    ? t('aywebs.bar.cartCount', { count: cartUnits })
    : t('aywebs.bar.cart');
  const handleCartAdded = useCallback((_item: AyWebsCartItem, cart: AyWebsCart) => {
    void queryClient.cancelQueries({ queryKey: cartQueryKey, exact: true });
    queryClient.setQueryData(cartQueryKey, cart);
    setCartAddedAt(Date.now());
  }, [cartQueryKey, queryClient]);
  /** Persist the real last page locally; invalid/non-web URLs are ignored. */
  useEffect(() => {
    if (!isWebPageUrl(pageUrl)) return;
    let host: string;
    try { host = new URL(pageUrl).hostname.replace(/^www[.]/i, ''); } catch { return; }
    const visitStoreId = currentPageAnalysis?.storeId || storeId || host;
    const visitStoreName = currentPageAnalysis?.storeName || storeName || host;
    const key = `${visitStoreId}|${pageUrl}`;
    if (lastRecordedVisit.current === key) return;
    lastRecordedVisit.current = key;
    void rememberAyWebsVisit({ storeId: visitStoreId, storeName: visitStoreName, url: pageUrl });
  }, [currentPageAnalysis?.storeId, currentPageAnalysis?.storeName, pageUrl, storeId, storeName]);
  const captureAllowed = currentPageAnalysis
    ? (currentPageAnalysis.captureAllowed || currentPageAnalysis.externalCaptureAllowed)
    : captureAllowedParam;
  /**
   * Le SERVEUR décide page par page :
   * `product_page` = lecture automatique possible ; `on_demand` = seulement
   * après appui ; `never` = aucune injection. Sans analyse de l'URL courante,
   * on ne lit rien et on ne devine pas depuis la page précédente.
   */
  const injection = currentPageAnalysis?.captureInjection;
  const capturePage = injection ? injection !== 'never' : false;
  /** الورقة: المنتوج + الكابتشر اللي بعثناه (باش الإضافة ما تعاودش تقرا التاجر). */
  const [sheet, setSheet] = useState<{
    product: AyWebsResolvedProduct; options: AyWebsVariantOption[]; capture?: unknown; quoteToken?: string; local: boolean;
  } | null>(null);

  /* Changer de document annule le travail de l'ancien : pré-lecture, appui Add,
     promesse partagée et feuille ouverte. Aucun résultat du produit A ne peut
     ainsi compléter le produit B après une navigation ou une redirection. */
  const previousPageUrl = useRef(pageUrl);
  useEffect(() => {
    if (previousPageUrl.current === pageUrl) return;
    /* Les SPA comme AliExpress réécrivent souvent les paramètres de suivi (`spm`,
       `pdp_npi`, `_t`) ou le sous-domaine mobile sur la MÊME fiche produit : ne
       pas avorter l'appui en cours ni vider l'analyse pour une mutation interne. */
    const sameDocument = captureMatchesPageUrl(previousPageUrl.current, pageUrl);
    previousPageUrl.current = pageUrl;
    if (sameDocument) return;
    captureStoreIdRef.current = '';
    const reading = prefetch.current;
    prefetch.current = null;
    reading?.controller.abort();
    const addition = addController.current;
    addController.current = null;
    addition?.abort();
    inFlightRead.current = null;
    setBusy(false);
    setSheet(null);
    setPageAnalysis(null);
    setNote('');
  }, [pageUrl]);

  /**
   * لا نعرض مراحل القراءة ولا عدّادها (23/10/2026): المستعمل ما يهمّوش كيفاش
   * نقراو. الزرّ يدور أثناء العمل، وهذا كل شي. تبقّى الدالتان فراغين باش
   * مسار القراءة يبقى مقروءاً بلا أن نلمس منطقه.
   */
  const startWaiting = useCallback((_first?: string) => undefined, []);
  const endWaiting = useCallback((_last?: string) => undefined, []);
  useEffect(() => () => { addController.current?.abort(); }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // Close app-owned overlays first, then follow merchant history if available.
      if (cartOpen) { setCartOpen(false); return true; }
      if (sheet) { setSheet(null); return true; }
      if (!webCanGoBack) return false;
      webRef.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [cartOpen, sheet, webCanGoBack]);

  const stopTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  const invalidatePrefetchOnTouch = useCallback(() => {
    const activePrefetch = prefetch.current;
    if (!activePrefetch) return;
    prefetch.current = null;
    if (activePrefetch.status === 'reading') {
      activePrefetch.controller.abort();
    }
  }, []);

  /** تصنيف الصفحة — شرط تفعيل «Add to Cart» (لا تخمين من الرابط). */
  useEffect(() => {
    if (!sessionId || !pageUrl || !isWebPageUrl(pageUrl)) return;
    if (pageAnalysis && captureMatchesPageUrl(pageAnalysis.url, pageUrl)) return;
    let alive = true;
    analyzeAyWebsPage(pageUrl, { sessionId })
      .then((analysis) => {
        if (!alive || !captureMatchesPageUrl(analysis.url, pageUrlRef.current)) return;
        captureStoreIdRef.current = analysis.storeId;
        setPageAnalysis(analysis);
      })
      .catch(() => {
        if (!alive) return;
        // ما نعرفوش: الزرّ يبقى معطّلاً والسبب يظهر — موش نفعّلوه بالتخمين.
        captureStoreIdRef.current = '';
        setPageAnalysis(null);
      });
    return () => { alive = false; };
  }, [pageAnalysis, sessionId, pageUrl]);

  /**
   * يطلب قراءة الصفحة ويرجّع الوعد: يتفتح بالحقن، ويتسدّ بالرسالة اللي تجي من
   * الجسر. ما فماش مهلة: الزر يبقى في التحميل حتى تجي القراءة، أو تتلغى بإعادة الضغط
   * أو بغلق الشاشة (الإلغاء يمرّ عبر signal).
   */
  const requestCapture = useCallback((signal?: AbortSignal, quiet = false): Promise<Record<string, unknown>> => {
    const intent: ReadIntent = quiet ? 'silent' : 'user';
    const inFlight = inFlightRead.current;
    /* Pré-lecture silencieuse pendant une lecture du client : on se rattache à elle.
       Deux scripts injectés en même temps, c'est deux fois la même page lue et la
       lecture du client jetée en « Requête interrompue » (constaté le 23/10/2026). */
    if (inFlight && inFlight.status === 'pending'
      && readDecision(inFlight, intent, pageUrlRef.current) === 'join') {
      return inFlight.promise;
    }
    const promise = new Promise<Record<string, unknown>>((resolveOuter, rejectOuter) => {
      let settled = false;
      const finish = () => { settled = true; stopTimer(); signal?.removeEventListener('abort', onAbort); };
      const resolve = (value: Record<string, unknown>) => { if (settled) return; finish(); resolveOuter(value); };
      const reject = (error: unknown) => { if (settled) return; finish(); rejectOuter(error); };
      /* Une seule lecture à la fois dans le WebView : la nouvelle REJETTE l'ancienne.
         Sans ça, l'appelant de l'ancienne attend pour toujours (bouton « Chargement » bloqué).
         Une lecture silencieuse n'arrive jamais ici si un client attend (voir plus haut). */
      const previous = waiter.current;
      if (previous) {
        waiter.current = null;
        stopTimer();
        previous.reject(new ApiError('aborted', 'Lecture remplacée par une nouvelle lecture. Réessayez.'));
      }
      /* Annulation (nouvel appui ou écran fermé) : on libère la page et le minuteur. */
      const onAbort = () => {
        if (settled) return;
        stopTimer();
        if (waiter.current?.reject === reject) waiter.current = null;
        if (!quiet) { setBusy(false); endWaiting('failed'); }
        reject(new ApiError('aborted', 'Requête interrompue.'));
      };
      if (signal?.aborted) { reject(new ApiError('aborted', 'Requête interrompue.')); return; }
      signal?.addEventListener('abort', onAbort);
      if (!quiet) { setBusy(true); setNote(''); startWaiting('preparing'); }
      captureRetries.current = 0;
      /* Filet de sécurité (20 s) : si le WebView ne renvoie jamais la capture, on rend la main.
         Le bouton revient à son état normal, et l'appui suivant relance la lecture. */
      const armWatchdog = () => {
        stopTimer();
        timer.current = setTimeout(() => {
          timer.current = null;
          if (settled) return;
          if (waiter.current?.reject === reject) waiter.current = null;
          if (!quiet) { setBusy(false); endWaiting('failed'); }
          reject(new ApiError('timeout', 'La lecture de la page a pris trop de temps. Réessayez.'));
        }, AYWEBS_CAPTURE_WATCHDOG_MS);
      };
      const inject = (script: string) => {
        if (!quiet) startWaiting('reading');
        armWatchdog();
        webRef.current?.injectJavaScript(buildAyWebsCaptureInjection(script));
      };
      /* Prix absent de la capture ⇒ relance bornée (fc3cce38 / captureFlow.ts). */
      const requestedUrl = pageUrlRef.current;
      const onCaptured = (capture: Record<string, unknown>) => {
        const script = lastScript.current;
        if (script && shouldRetryAyWebsCaptureForPrice(priceCandidatesOf(capture), captureRetries.current)) {
          captureRetries.current += 1;
          waiter.current = { resolve: onCaptured, reject, quiet, requestedUrl: pageUrlRef.current || requestedUrl };
          stopTimer();
          setTimeout(() => inject(script), priceRetryDelayMs(captureRetries.current - 1));
          return;
        }
        resolve(capture);
      };
      waiter.current = { resolve: onCaptured, reject, quiet, requestedUrl };
      fetchAyWebsCaptureScript({ storeId: captureStoreIdRef.current })
        /* الصفحة لازم تكمّل تحميلها قبل القراءة (Amazon يعطي DOM ناقص ⇒ NO_PRICE_TEXT).
           مرّة واحدة لكل صفحة: موقع SHEIN/TEMU (تطبيق mono-page) يحافظ على طلب
           مفتوح، فـ`onNavigationStateChange` يبقى "يحمّل" — الانتظار في كل قراءة
           كان يعني 8 ثوانٍ إضافية مضروبة في عدد المحاولات. */
        .then(async (script) => {
          if (!idleWaitedUrl.current || !captureMatchesPageUrl(idleWaitedUrl.current, pageUrlRef.current)) {
            idleWaitedUrl.current = pageUrlRef.current;
            await waitForPageIdle(() => pageLoadingRef.current);
          }
          return script;
        })
        .then((script) => {
          // الحقن هو المنعرج الثاني: من توّا الكلمة صارت للصفحة.
          lastScript.current = script;
          inject(script);
        })
        .catch((error) => {
          if (waiter.current?.reject === reject) waiter.current = null;
          if (!quiet) setBusy(false);
          reject(error);
        });
    });
    /* Journal de la lecture en cours : `intent` décide qui remplace qui (voir `readDecision`). */
    const entry: NonNullable<typeof inFlightRead.current> = {
      intent, pageUrl: pageUrlRef.current, status: 'pending', promise,
    };
    inFlightRead.current = entry;
    promise.then(
      () => { if (inFlightRead.current === entry) entry.status = 'done'; },
      () => { if (inFlightRead.current === entry) entry.status = 'failed'; },
    );
    return promise;
  }, []);

  const fail = useCallback((error: unknown) => {
    endWaiting('failed');
    setBusy(false);
    setNote(addErrorMessage(error, locale, t));
  }, [endWaiting, locale, t]);

  /** «اقرا هذه الصفحة»: قراءة + قرار الخادم، بلا أي إضافة. */
  /**
   * «Add to Cart»: يقرا (كي مسموح)، يحلّ المنتوج، ثم يفتح ورقة الاختيار
   * **فوق هذه الصفحة** — الإضافة الحقيقية تجي في الورقة.
   */
  const addToCart = useCallback(async () => {
    if (!sessionId || !pageUrl || !capturePage) return;
    /* Un nouvel appui remplace le précédent : l'ancien est annulé, il ne touche plus l'écran. */
    addController.current?.abort();
    const controller = new AbortController();
    addController.current = controller;
    const isCurrent = () => addController.current === controller;
    const activePageUrl = pageUrlRef.current || pageUrl;
    const readPageCapture = async (): Promise<Record<string, unknown>> => {
      const entry = prefetch.current;
      if (entry && canReusePrefetch(entry, pageUrlRef.current || activePageUrl, Date.now())) {
        setBusy(true);
        setNote('');
        try {
          return await entry.promise;
        } catch {
          prefetch.current = null;
          if (controller.signal.aborted) throw new ApiError('aborted', 'Requête interrompue.');
        }
      }
      try {
        return await requestCapture(controller.signal);
      } catch (error) {
        if (!controller.signal.aborted && error instanceof ApiError && error.isAborted) {
          return await requestCapture(controller.signal);
        }
        throw error;
      }
    };
    try {
      /* Lecture locale : la feuille s'ouvre dès que la capture est prête — aucun appel au serveur à l'appui. */
      if (captureAllowed) {
        const captured = await readPageCapture();
        if (controller.signal.aborted) return;
        /* Une capture n'est pas une fiche : accueil / rayon / bannière n'ouvrent
           pas de feuille. Le serveur applique LA MÊME règle de son côté. */
        if (!captureIsProductCard(captured)) {
          setNote(t('aywebs.notAProductPage'));
          endWaiting('failed');
          return;
        }
        const liveUrl = pageUrlRef.current || activePageUrl;
        const variants = localVariantsFromCapture(captured);
        const localProduct: AyWebsResolvedProduct = {
          ...productFromCapture(captured, liveUrl, currentStoreId, currentStoreName),
          /* Les groupes viennent de la TABLE DES VARIANTES, et à défaut des
             groupes NOMMÉS lus sur la page (23/10/2026) : une fiche Zalando
             avait sinon une feuille sans couleur ni taille. */
          variantGroups: groupsFromCapture(captured, variants),
          variantDetails: optionsFromVariants(variants),
        };
        setNote('');
        setSheet({ product: localProduct, options: localProduct.variantDetails, capture: captured, local: true });
        endWaiting('done');
        return;
      }
      /* UNE capture, puis UNE résolution (avec capture, ou sans si la capture échoue ou
         tarde). Pas de seconde requête serveur quand la capture réussit (19/10/2026). */
      /* Pas de délai : la page est lue dans le navigateur du client jusqu'au bout. Le bouton reste
         en chargement ; si la lecture échoue, on explique ce qui manque (sans lecture serveur de repli). */
      const { decision, outcome: result, capture } = await resolveAddToCart({
        readCapture: captureAllowed ? readPageCapture : undefined,
        waitForCapture: true,
        // refresh : une intention Add ne sert jamais une lecture mémorisée (19/10/2026).
        resolve: (captured) => {
          const capObj = captured && typeof captured === 'object' ? (captured as Record<string, unknown>) : null;
          const capUrl = typeof capObj?.url === 'string' && isWebPageUrl(capObj.url) ? capObj.url : '';
          let targetResolveUrl = pageUrlRef.current || activePageUrl;
          if (capUrl && isSpaInPageProductSwitch(capUrl, targetResolveUrl)) {
            targetResolveUrl = capUrl;
          }
          const aeObj = capObj?.aliexpress && typeof capObj.aliexpress === 'object'
            ? (capObj.aliexpress as { pageItemId?: unknown })
            : null;
          const modalItemId = String(aeObj?.pageItemId ?? '').trim().replace(/^AE-/i, '');
          if (/^\d{6,20}$/.test(modalItemId)) {
            try {
              const parsedResolve = new URL(targetResolveUrl);
              if (/(?:^|\.)aliexpress\.(?:com|us|ru)$/i.test(parsedResolve.hostname)
                && /(?:BundleDeals|aye-bundle-deals|tesla-landing|bundle-deals)/i.test(parsedResolve.pathname)
                && !parsedResolve.searchParams.get('productIds')) {
                targetResolveUrl = `${parsedResolve.protocol}//${parsedResolve.host}/item/${modalItemId}.html`;
              }
            } catch { /* ignore */ }
          }
          return resolveAyWebsProductWithCapture(targetResolveUrl, {
            sessionId, storeId: currentStoreId || undefined, capture: captured, refresh: true, signal: controller.signal,
          });
        },
        signal: controller.signal,
        onPhase: (phase) => { if (phase !== 'reading') startWaiting('resolving'); },
      });
      if (controller.signal.aborted) return;
      /* Pas de feuille sans prix, devise ou devis vérifiés : la décision NOMME les champs manquants. */
      if (decision.kind === 'refused') {
        setNote(addErrorMessage(decision.error, locale, t));
        endWaiting('failed');
        return;
      }
      if (!result) {
        setNote(t('aywebs.captureFailed'));
        endWaiting('failed');
        return;
      }
      setNote('');
      setSheet({ product: result.product, options: result.product.variantDetails, capture, quoteToken: result.quoteToken, local: false });
      endWaiting('done');
    } catch (error) {
      if (controller.signal.aborted) return;
      fail(error);
    } finally {
      if (isCurrent()) {
        stopTimer();
        setBusy(false);
        addController.current = null;
      }
    }
  }, [captureAllowed, capturePage, currentStoreId, currentStoreName, endWaiting, fail, locale, requestCapture, sessionId, startWaiting, pageUrl, t]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    /* Les pages marchandes (AliExpress WindVane/AEHybrid/aplus, SHEIN…) envoient
       souvent leurs propres messages au pont `ReactNativeWebView` : on les ignore
       sans toucher au lecteur en cours ni afficher « Lecture de la page impossible ». */
    if (!isAyWebsBridgeMessage(event.nativeEvent.data)) return;
    const pending = waiter.current;
    const parsed = parseAyWebsCaptureMessage(event.nativeEvent.data);
    if (!parsed.ok) {
      stopTimer();
      waiter.current = null;
      setBusy(false);
      if (!pending?.quiet) setNote(t('aywebs.captureFailed'));
      pending?.reject(new ApiError('malformed', `Capture refusée : ${parsed.reason}`));
      return;
    }
    /* Le pont peut livrer une réponse déjà partie avant une redirection. Si la
       lecture en attente vise déjà la nouvelle page, on ignore simplement ce
       message tardif de l'ancien document sans tuer la lecture en cours. */
    const captureUrl = (parsed.capture as { url?: unknown }).url;
    if (!captureMatchesPageUrl(captureUrl, pageUrlRef.current)) {
      if (isSpaInPageProductSwitch(captureUrl, pageUrlRef.current) && typeof captureUrl === 'string') {
        pageUrlRef.current = captureUrl;
        setPageUrl(captureUrl);
      } else {
        if (pending && captureMatchesPageUrl(pending.requestedUrl, pageUrlRef.current)
          && !captureMatchesPageUrl(captureUrl, pending.requestedUrl)) {
          return;
        }
        stopTimer();
        waiter.current = null;
        setBusy(false);
        pending?.reject(new ApiError('http', 'Capture périmée : la page affichée a changé.', {
          status: 422,
          code: 'CAPTURE_INCOMPLETE',
        }));
        return;
      }
    }
    stopTimer();
    waiter.current = null;
    setBusy(false);
    pending?.resolve(parsed.capture);
  }, [t]);

  const addEnabled = capturePage && !busy && Boolean(sessionId);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.canvas, paddingTop: insets.top + theme.space[2] }]}>
      <View style={[styles.header, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => goBack('/(tabs)/aywebs')}
          testID="aywebs-store-header-back"
          style={{ minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget, justifyContent: 'center' }}
        >
          <Ionicons
            name={theme.isRTL ? 'chevron-forward' : 'chevron-back'}
            size={theme.iconSize.md}
            color={theme.colors.ink}
            accessibilityElementsHidden
          />
        </Pressable>
        <View style={styles.titleBox}>
          <AppText variant="lead" weight="semibold" numberOfLines={1}>{storeName || t('aywebs.browserTitle')}</AppText>
        </View>
        <Pressable
          testID="aywebs-ask-sonim"
          accessibilityRole="button"
          accessibilityLabel={t('sonim.sharePage')}
          disabled={!sonimOwner(sessionId, status, account?.id)}
          onPress={() => {
            const cleanUrl = shareableStoreUrl(pageUrlRef.current);
            if (!cleanUrl || !stageSonimDraft(sonimOwner(sessionId, status, account?.id), `${t('sonim.sharePagePrompt')}\n${cleanUrl}`)) {
              Alert.alert(t('sonim.shareUnavailable'));
              return;
            }
            router.push('/sonim-assistant');
          }}
          style={{ minHeight: 40, minWidth: 40, justifyContent: 'center', alignItems: 'center' }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cartAccessibilityLabel}
          onPress={() => setCartOpen(true)}
          testID="aywebs-store-header-cart"
          style={{ minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget, justifyContent: 'center', alignItems: 'center' }}
        >
          <View style={styles.cartIconWrap}>
            <Ionicons name="bag-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
            {cartUnits > 0 ? (
              <View
                testID="aywebs-store-header-cart-count"
                style={[
                  styles.cartBadge,
                  { backgroundColor: theme.status.success.fg, borderColor: theme.colors.canvas },
                  theme.isRTL ? styles.cartBadgeRTL : styles.cartBadgeLTR,
                ]}
              >
                <AppText variant="caption" weight="bold" color={theme.colors.canvas}>
                  {cartUnits > 99 ? '99+' : String(cartUnits)}
                </AppText>
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>

      {pageOk ? (
      <View
        style={styles.web}
        onTouchStart={invalidatePrefetchOnTouch}
        onTouchEnd={invalidatePrefetchOnTouch}
      >
        <WebView
          ref={webRef}
          source={{ uri: loadUrl }}
          style={styles.webFill}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={(request: { url: string }) => {
          if (decideWebNavigation(request.url) === 'allow') return true;
          if (!isSilentAppDeepLink(request.url)) setNote(t('aywebs.blockedScheme'));
          return false;
        }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        androidLayerType="hardware"
        textZoom={100}
        overScrollMode="never"
        allowsBackForwardNavigationGestures
        injectedJavaScriptBeforeContentLoaded={AYWEBS_NETWORK_OBSERVER_SCRIPT}
        setSupportMultipleWindows={false}
        onNavigationStateChange={(state) => {
          pageLoadingRef.current = state.loading === true;
          setWebCanGoBack((prev) => (prev === state.canGoBack ? prev : state.canGoBack));
          if (!state.url || !isWebPageUrl(state.url)) return;
          if (pageUrlRef.current !== state.url) {
            pageUrlRef.current = state.url;
            setPageUrl(state.url);
          }
        }}
        onLoadEnd={() => {
          const failedLabel = t('aywebs.captureFailed');
          setNote((current) => (current === failedLabel ? '' : current));
        }}
        onMessage={onMessage}
        onError={(event) => {
          if (!isFatalMainPageLoadError(event.nativeEvent, pageUrlRef.current)) return;
          setNote(t('aywebs.captureFailed'));
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={[styles.loading, { backgroundColor: theme.colors.canvas }]}>
            <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.loadingPage')}</AppText>
          </View>
        )}
        />
      </View>
      ) : (
        <View style={[styles.web, styles.loading, { backgroundColor: theme.colors.canvas }]}>
          <AppText variant="body" color={theme.status.danger.fg}>{t('aywebs.badUrl')}</AppText>
        </View>
      )}

      <View style={[styles.footer, { borderTopColor: theme.colors.line, paddingBottom: insets.bottom + theme.space[2] }]}>
        {/* Le client ne lit PAS notre cuisine : aucun journal de lecture, aucune
            ligne « lecture serveur ». Le bouton qui tourne dit ce qu'il fait, et
            une erreur réelle s'écrit en clair (23/10/2026). */}
        {note ? <AppText variant="caption" color={theme.status.danger.fg}>{note}</AppText> : null}

        <Button
          label={busy ? t('aywebs.loading') : cartAddedAt ? t('aywebs.added') : t('aywebs.selectOptions')}
          tone="commerce"
          block
          onPress={addToCart}
          busy={busy}
          disabled={!addEnabled}
          testID="aywebs-store-add-to-cart"
        />

      </View>

      {sheet ? (
        <AddToCartSheet
          visible
          sessionId={sessionId}
          product={sheet.product}
          options={sheet.options}
          capture={sheet.capture}
          quoteToken={sheet.quoteToken}
          local={sheet.local}
          readOnlySelection={readOnlyStoreSelection(sheet.product.storeId)}
          readVariant={(url: string) => (variantReader.current
            ? variantReader.current.read(url)
            : Promise.reject(new ApiError('device', 'Lecteur de variante indisponible.')))}
          onClose={() => {
            invalidatePrefetchOnTouch();
            setSheet(null);
          }}
          onAdded={handleCartAdded}
        />
      ) : null}

      <VariantReader ref={variantReader} storeId={sheet?.product.storeId || currentPageAnalysis?.storeId || undefined} />

      {sessionId ? (
        <StoreCartSheet
          visible={cartOpen}
          onClose={() => setCartOpen(false)}
          sessionId={sessionId}
          storeId={currentStoreId}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  cartIconWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  cartBadge: { position: 'absolute', top: -3, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cartBadgeLTR: { right: -5 },
  cartBadgeRTL: { left: -5 },
  titleBox: { flex: 1, paddingHorizontal: 4 },
  web: { flex: 1, marginTop: 8 },
  webFill: { flex: 1 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 10, gap: 6 },
});
