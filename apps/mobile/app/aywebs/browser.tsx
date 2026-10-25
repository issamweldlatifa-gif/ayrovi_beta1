/**
 * AYWEBs — P3، الشريحتان 2 و3: صفحة المتجر داخل WebView + الكابتشر + «Add to Cart».
 *
 * الرحلة: الصفحة الحقيقية للمتجر تبان كاملة (بلا شريط عنوان ولا زر قراءة).
 * الشريط العلوي: الرجوع، اسم المتجر، والإغلاق. الشريط السفلي: زر «Add to Cart» فقط،
 * مع سطر حالة صغير وقت القراءة.
 *
 *  • «Add to Cart» — يقرا الصفحة (كابتشر + قراءة من الخادم بالتوازي)، ثم **ورقة
 *    الاختيار فوق هذه الصفحة**، ثم إضافة حقيقية في سلّة AYWEBs على الخادم. المستعمل
 *    **ما يخرجش** من المتجر، والصفحة (HTML) **ما تتبعثش أبداً**، ولا سعر ولا حالة
 *    تخرج من الجهاز.
 *
 * شرط تفعيل «Add to Cart» هو نفسه في العقد: **الخادم** صنّف الصفحة كصفحة
 * منتوج. قبل التصنيف الزرّ معطّل والسبب مكتوب — زر ما ينجمش ينجح ما يتفعّلش.
 */
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ComponentType, type Ref } from 'react';
import { goBack } from '@/design/navigation';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { captureMatchesPageUrl, decideWebNavigation, isWebPageUrl } from '@/features/aywebs/webNavigation';

import { AppText, Button, Card, KeyValue } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useI18n } from '@/i18n';
import { ApiError } from '@/api/errors';
import { addErrorMessage } from '@/features/aywebs/addError';
import { fetchFavorites } from '@/api/account';
import { StoreCartSheet, StoreFavoriteSheet } from '@/features/aywebs/StoreSheets';
import { canonicalSourceUrl, isPageSaved } from '@/features/aywebs/storeShopping';
import {
  analyzeAyWebsPage, buildAyWebsCaptureInjection, fetchAyWebsCaptureScript,
  parseAyWebsCaptureMessage, resolveAyWebsProductWithCapture,
  type AyWebsPageAnalysis, type AyWebsResolveOutcome, type AyWebsResolvedProduct, type AyWebsVariantOption,
} from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import {
  groupsFromCapture, localVariantsFromCapture, optionsFromVariants, productFromCapture,
} from '@/features/aywebs/localProduct';
import { captureIsProductCard } from '@/features/aywebs/pageKind';
import { VariantReader, type VariantReaderHandle } from '@/features/aywebs/VariantReader';
import { waitForPageIdle } from '@/features/aywebs/captureFallback';
import {
  AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS, canReusePrefetch, AYWEBS_CAPTURE_WATCHDOG_MS, priceCandidatesOf, readDecision, resolveAddToCart, shouldRetryAyWebsCaptureForPrice,
  type ReadIntent,
} from '@/features/aywebs/captureFlow';
import { useSessionId } from '@/session/session';
import { useSession } from '@/state/session';
import { formatMoney } from '@/format/money';

/** كي الصفحة ما تبعثش شي: مانبقاوش نستنّوا بلا نهاية. */

/**
 * باغ أنواع عند `react-native-webview` (13.17): الصنف معلن `WebView<P = undefined>`
 * و`WebViewProps & undefined` = `never`، فتفسير JSX يرفض كل خاصية. الإصلاح محلي:
 * المكوّن + مرجع فيه `injectJavaScript` (اللي موجود فعلاً في وقت التنفيذ).
 */
type WebViewHandle = { injectJavaScript: (script: string) => void; goBack: () => void; goForward: () => void };
const WebView = RNWebView as unknown as ComponentType<
  WebViewProps & { ref?: Ref<WebViewHandle> }
>;

/** كي الكابتشر ما يجيش في الوقت: سبب صريح، موش انتظار أبدي. */

export default function AyWebsBrowserScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const sessionId = useSessionId();

  const params = useLocalSearchParams<{ url?: string; storeId?: string; storeName?: string; capture?: string }>();
  const url = String(params.url ?? '');
  const storeId = String(params.storeId ?? '');
  /** السماح الأوّلي من شاشة المتجر؛ يتحدّث حسب الصفحة الحالية بعد التصنيف. */
  const captureAllowedParam = params.capture === '1';
  const storeName = String(params.storeName ?? '');
  /** رابط غير صالح (مخطط غريب أو فارغ) لا يُحمَّل أبداً في الـWebView. */
  const pageOk = isWebPageUrl(url);

  const webRef = useRef<WebViewHandle>(null);
  /* Lecteur masqué de la page de variante (confirmation d'un choix ≠ page affichée). */
  const variantReader = useRef<VariantReaderHandle>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** الوعد الجاري لقراءة الصفحة: يتفتح بالحقن ويتسدّ بالرسالة (ولا بالمهلة). */
  const waiter = useRef<{ resolve: (capture: Record<string, unknown>) => void; reject: (error: unknown) => void } | null>(null);
  /** Vrai pendant que la page charge (mis à jour par onNavigationStateChange). */
  const pageLoadingRef = useRef(false);
  /* Lecture faite À L'OUVERTURE de la page (20/10/2026) : « Add to Cart » la trouve prête. */
  const prefetch = useRef<{
    url: string;
    at: number;
    status: 'reading' | 'ok' | 'failed';
    promise: Promise<Record<string, unknown>>;
    controller: AbortController;
  } | null>(null);
  const [pageReady, setPageReady] = useState(false);
  /** Nombre de relances de capture faute de prix, et dernier script chargé. */
  const captureRetries = useRef(0);
  /** Contrôleur de l'appui « Add » en cours : un nouvel appui, ou la sortie de l'écran, l'annule. */
  const addController = useRef<AbortController | null>(null);
  const lastScript = useRef<string | null>(null);

  const [busy, setBusy] = useState(false);
  /* Lecture à l'ouverture en cours : le bouton « Add » tourne jusqu'à la fin, puis revient à son état normal. */
  const [prefetchReading, setPrefetchReading] = useState(false);
  /** Barre du bas : précédent / suivant (dans le magasin), titre de la page, volets. */
  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false, title: '' });
  const [cartOpen, setCartOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<AyWebsResolveOutcome | null>(null);
  /** تصنيف الخادم للصفحة: `null` = مازال، و`false` = موش صفحة منتوج. */
  const [productPage, setProductPage] = useState<boolean | null>(null);
  /* العنوان المحمَّل في الـWebView: ثابت — شريط العنوان ما بقاش فوق. */
  const [loadUrl] = useState(url);
  /* الصفحة الحالية كما يصرّح بها التنقّل داخل الـWebView (تتبع الروابط). */
  const [pageUrl, setPageUrl] = useState(url);
  /** Page courante, lisible depuis `requestCapture` (qui ne dépend d'aucun état React). */
  const pageUrlRef = useRef(pageUrl);
  useEffect(() => { pageUrlRef.current = pageUrl; }, [pageUrl]);
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
  const autoPrefetchAllowed = currentPageAnalysis?.captureInjection === 'product_page';
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
    previousPageUrl.current = pageUrl;
    const reading = prefetch.current;
    prefetch.current = null;
    reading?.controller.abort();
    const addition = addController.current;
    addController.current = null;
    addition?.abort();
    inFlightRead.current = null;
    setPrefetchReading(false);
    setBusy(false);
    setSheet(null);
    setOutcome(null);
    setPageAnalysis(null);
    setProductPage(null);
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

  const stopTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  /** تصنيف الصفحة — شرط تفعيل «Add to Cart» (لا تخمين من الرابط). */
  useEffect(() => {
    if (!sessionId || !pageUrl || !isWebPageUrl(pageUrl)) return;
    let alive = true;
    analyzeAyWebsPage(pageUrl, { sessionId })
      .then((analysis) => {
        if (!alive || !captureMatchesPageUrl(analysis.url, pageUrlRef.current)) return;
        setPageAnalysis(analysis);
        setProductPage(analysis.isProductPage);
      })
      .catch(() => {
        if (!alive) return;
        // ما نعرفوش: الزرّ يبقى معطّلاً والسبب يظهر — موش نفعّلوه بالتخمين.
        setPageAnalysis(null);
        setProductPage(null);
      });
    return () => { alive = false; };
  }, [sessionId, pageUrl]);

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
      const onCaptured = (capture: Record<string, unknown>) => {
        const script = lastScript.current;
        if (script && shouldRetryAyWebsCaptureForPrice(priceCandidatesOf(capture), captureRetries.current)) {
          captureRetries.current += 1;
          waiter.current = { resolve: onCaptured, reject };
          stopTimer();
          setTimeout(() => inject(script), AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS);
          return;
        }
        resolve(capture);
      };
      waiter.current = { resolve: onCaptured, reject };
      fetchAyWebsCaptureScript()
        // الصفحة لازم تكمّل تحميلها قبل القراءة (Amazon يعطي DOM ناقص ⇒ NO_PRICE_TEXT).
        .then(async (script) => {
          await waitForPageIdle(() => pageLoadingRef.current);
          return script;
        })
        .then((script) => {
          // الحقن هو المنعرج الثاني: من توّا الكلمة صارت للصفحة.
          lastScript.current = script;
          inject(script);
        })
        .catch((error) => {
          waiter.current = null;
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

  /** Lit la page en silence, dès qu'elle est chargée et reconnue comme fiche produit. */
  const startPrefetch = useCallback((url: string) => {
    const current = prefetch.current;
    if (current && current.url === url && current.status !== 'failed') return;
    current?.controller.abort();
    const controller = new AbortController();
    const entry: NonNullable<typeof prefetch.current> = {
      url, at: 0, status: 'reading', controller,
      promise: Promise.resolve({}),
    };
    entry.promise = requestCapture(controller.signal, true).then(
      (capture) => {
        entry.status = 'ok'; entry.at = Date.now();
        if (prefetch.current === entry) setPrefetchReading(false);
        return capture;
      },
      (error: unknown) => {
        entry.status = 'failed';
        if (prefetch.current === entry) setPrefetchReading(false);
        throw error;
      },
    );
    entry.promise.catch(() => undefined);
    prefetch.current = entry;
    setPrefetchReading(true);
  }, [requestCapture]);

  useEffect(() => {
    if (!captureAllowed || !autoPrefetchAllowed || !pageReady || !pageUrl) return;
    startPrefetch(pageUrl);
  }, [autoPrefetchAllowed, captureAllowed, pageReady, pageUrl, startPrefetch]);

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
    try {
      /* Lecture locale : la feuille s'ouvre dès que la capture est prête — aucun appel au serveur à l'appui. */
      if (captureAllowed) {
        const entry = prefetch.current;
        const captured = await (canReusePrefetch(entry, pageUrl, Date.now()) && entry ? entry.promise : requestCapture(controller.signal));
        if (controller.signal.aborted) return;
        /* Une capture n'est pas une fiche : accueil / rayon / bannière n'ouvrent
           pas de feuille. Le serveur applique LA MÊME règle de son côté. */
        if (!captureIsProductCard(captured)) {
          setNote(t('aywebs.notAProductPage'));
          endWaiting('failed');
          return;
        }
        const variants = localVariantsFromCapture(captured);
        const localProduct: AyWebsResolvedProduct = {
          ...productFromCapture(captured, pageUrl, storeId, storeName),
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
        readCapture: captureAllowed ? () => {
          const entry = prefetch.current;
          if (entry && canReusePrefetch(entry, pageUrl, Date.now())) return entry.promise;
          return requestCapture(controller.signal);
        } : undefined,
        waitForCapture: true,
        // refresh : une intention Add ne sert jamais une lecture mémorisée (19/10/2026).
        resolve: (captured) => resolveAyWebsProductWithCapture(pageUrl, {
          sessionId, storeId: storeId || undefined, capture: captured, refresh: true, signal: controller.signal,
        }),
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
      setOutcome(result);
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
  }, [captureAllowed, capturePage, endWaiting, fail, locale, requestCapture, sessionId, startWaiting, storeId, pageUrl, t]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const pending = waiter.current;
    const parsed = parseAyWebsCaptureMessage(event.nativeEvent.data);
    if (!parsed.ok) {
      stopTimer();
      waiter.current = null;
      setBusy(false);
      setNote(`${t('aywebs.captureFailed')} — ${parsed.reason}`);
      pending?.reject(new ApiError('malformed', `Capture refusée : ${parsed.reason}`));
      return;
    }
    /* Le pont peut livrer une réponse déjà partie avant une redirection. Même
       si une nouvelle lecture attend, elle ne doit JAMAIS recevoir cette
       ancienne capture : on rejette et le client pourra relire la page courante. */
    const captureUrl = (parsed.capture as { url?: unknown }).url;
    if (!captureMatchesPageUrl(captureUrl, pageUrlRef.current)) {
      stopTimer();
      waiter.current = null;
      setBusy(false);
      setNote(t('aywebs.captureFailed'));
      pending?.reject(new ApiError('aborted', 'Capture ignorée : la page affichée a changé.'));
      return;
    }
    stopTimer();
    waiter.current = null;
    setBusy(false);
    pending?.resolve(parsed.capture);
  }, [t]);

  const verdict = outcome?.capture ?? null;
  const addEnabled = capturePage && !busy && !prefetchReading && Boolean(sessionId);

  /* Favoris : seulement pour une page produit. La liste sert à afficher le cœur plein. */
  const { status: accountStatus } = useSession();
  const favorites = useQuery({
    queryKey: ['account', 'favorites'],
    queryFn: ({ signal }) => fetchFavorites({ signal }),
    enabled: capturePage && accountStatus === 'signedIn',
    retry: false,
  });
  const saved = isPageSaved(favorites.data ?? [], pageUrl);
  const outcomeMatchesPage = Boolean(outcome && pageUrl
    && canonicalSourceUrl(outcome.product.sourceUrl) === canonicalSourceUrl(pageUrl));
  const favoriteTitle = (outcomeMatchesPage ? outcome?.product.title : '') || nav.title || storeName;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.canvas, paddingTop: insets.top + theme.space[2] }]}>
      <View style={[styles.header, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => goBack('/(tabs)/aywebs')}
          style={{ minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget, justifyContent: 'center' }}
        >
          <Ionicons
            name={theme.isRTL ? 'chevron-forward' : 'chevron-back'}
            size={26}
            color={theme.colors.ink}
            accessibilityElementsHidden
          />
        </Pressable>
        <View style={styles.titleBox}>
          <AppText variant="title" numberOfLines={1}>{storeName || t('aywebs.browserTitle')}</AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => goBack('/(tabs)/aywebs')}
          style={{ minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget, justifyContent: 'center', alignItems: 'center' }}
        >
          <Ionicons name="close" size={24} color={theme.colors.ink} accessibilityElementsHidden />
        </Pressable>
      </View>

      {outcome ? (
        <Card title={t('aywebs.serverVerdict')} hint={outcome.product.storeName || undefined}>
          <KeyValue label={t('aywebs.productTitle')} value={outcome.product.title} />
          {outcome.product.ayroviPricing?.totalTnd != null ? (
            <KeyValue label={t('aywebs.totalTnd')} value={`${formatMoney(outcome.product.ayroviPricing.totalTnd)}`} />
          ) : null}
          <KeyValue
            label={t('aywebs.sourcePrice')}
            value={outcome.product.price != null
              ? `${outcome.product.price} ${outcome.product.currency}`.trim()
              : t('aywebs.noPrice')}
          />
          <KeyValue
            label={t('aywebs.capture')}
            value={verdict?.used ? t('aywebs.captureUsed') : t('aywebs.captureRefused')}
          />
          {verdict && !verdict.used && verdict.rejection ? (
            <KeyValue label={t('aywebs.captureRejection')} value={verdict.rejection} />
          ) : null}
          {outcome.priceRejection ? (
            <KeyValue label={t('aywebs.priceRejection')} value={outcome.priceRejection} />
          ) : null}
        </Card>
      ) : null}

      {pageOk ? (
      <WebView
        ref={webRef}
        source={{ uri: loadUrl }}
        style={styles.web}
        /**
         * `'*'` عمداً: لو بقيت القائمة `https://*`، المكتبة تفتح كل عنوان خارجها
         * في تطبيق آخر قبل أن تسألنا. القرار كله هنا: الصفحات تبقى، والباقي يُمنع.
         */
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={(request: { url: string }) => {
          if (decideWebNavigation(request.url) === 'allow') return true;
          setNote(t('aywebs.blockedScheme'));
          return false;
        }}
        javaScriptEnabled
        setSupportMultipleWindows={false}
        onNavigationStateChange={(state) => {
          pageLoadingRef.current = state.loading === true;
          setPageReady(state.loading !== true);
          if (!state.url) return;
          /* Référence synchrone : une capture déjà dans le pont ne peut plus
             être rattachée à l'ancien document pendant le prochain rendu. */
          pageUrlRef.current = state.url;
          setPageUrl(state.url);
          setNav({ canGoBack: state.canGoBack, canGoForward: state.canGoForward, title: state.title ?? '' });
        }}
        onMessage={onMessage}
        onError={() => setNote(t('aywebs.captureFailed'))}
        startInLoadingState
        renderLoading={() => (
          <View style={[styles.loading, { backgroundColor: theme.colors.canvas }]}>
            <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.loadingPage')}</AppText>
          </View>
        )}
      />
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

        <View style={[styles.toolbar, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          <ToolIcon
            name={theme.isRTL ? 'chevron-forward' : 'chevron-back'}
            label={t('aywebs.nav.back')}
            disabled={!nav.canGoBack}
            onPress={() => webRef.current?.goBack()}
            testID="aywebs-store-back"
          />
          <ToolIcon
            name={theme.isRTL ? 'chevron-back' : 'chevron-forward'}
            label={t('aywebs.nav.forward')}
            disabled={!nav.canGoForward}
            onPress={() => webRef.current?.goForward()}
            testID="aywebs-store-forward"
          />
          <ToolIcon
            name="bag-outline"
            label={t('aywebs.bar.cart')}
            onPress={() => setCartOpen(true)}
            testID="aywebs-store-cart"
          />
          <ToolIcon
            name={saved ? 'heart' : 'heart-outline'}
            label={t('aywebs.bar.favorites')}
            disabled={!capturePage}
            active={saved}
            onPress={() => setFavOpen(true)}
            testID="aywebs-store-fav"
          />
          <View style={styles.addBox}>
            <Button
              label={busy || prefetchReading ? t('aywebs.loading') : t('aywebs.addToCart')}
              tone="main"
              block
              onPress={addToCart}
              busy={busy || prefetchReading}
              disabled={!addEnabled}
              testID="aywebs-store-add-to-cart"
            />
          </View>
        </View>

        {/*
         * Page que le serveur n'a pas reconnue comme fiche produit (accueil,
         * catégorie, boutique hors registre) : l'ajout automatique n'a pas de
         * preuve, donc on ne le propose pas. Le client garde une issue :
         * une demande d'achat relue par un humain, avec la page sous les yeux.
         * Sans cela, il resterait dans un cul-de-sac (23/10/2026).
         */}
        {productPage === false && pageOk ? (
          <Button
            label={t('aywebs.requestPurchase')}
            tone="quiet"
            block
            onPress={() => router.push({
              pathname: '/aywebs/request',
              params: { url: pageUrl, title: nav.title || '', storeId: currentPageAnalysis?.storeId || storeId },
            })}
            testID="aywebs-store-request"
          />
        ) : null}
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
          readVariant={(url: string) => (variantReader.current
            ? variantReader.current.read(url)
            : Promise.reject(new ApiError('device', 'Lecteur de variante indisponible.')))}
          onClose={() => setSheet(null)}
        />
      ) : null}

      <VariantReader ref={variantReader} />

      {sessionId ? (
        <StoreCartSheet
          visible={cartOpen}
          onClose={() => setCartOpen(false)}
          sessionId={sessionId}
          storeId={currentPageAnalysis?.storeId || storeId}
        />
      ) : null}
      <StoreFavoriteSheet
        visible={favOpen}
        onClose={() => setFavOpen(false)}
        sourceUrl={pageUrl}
        title={favoriteTitle}
        saved={saved}
      />
    </View>
  );
}

/** Icône de la barre du bas : cible tactile complète, grisée quand l'action n'est pas possible. */
function ToolIcon({ name, label, onPress, disabled = false, active = false, testID }: {
  name: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.toolIcon,
        { minWidth: 36, minHeight: theme.geometry.minTarget, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
      ]}
    >
      <Ionicons name={name} size={22} color={active ? theme.colors.accentText : theme.colors.ink} accessibilityElementsHidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  titleBox: { flex: 1, paddingHorizontal: 4 },
  web: { flex: 1, marginTop: 8 },
  toolbar: { alignItems: 'center', gap: 2 },
  toolIcon: { alignItems: 'center', justifyContent: 'center' },
  addBox: { flex: 1, marginStart: 4 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 8, gap: 6 },
});
