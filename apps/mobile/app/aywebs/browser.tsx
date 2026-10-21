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
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { decideWebNavigation, isWebPageUrl } from '@/features/aywebs/webNavigation';

import { AppText, Button, Card, KeyValue } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useI18n } from '@/i18n';
import { ApiError, isApiError, userMessage } from '@/api/errors';
import { fetchFavorites } from '@/api/account';
import { StoreCartSheet, StoreFavoriteSheet } from '@/features/aywebs/StoreSheets';
import { canonicalSourceUrl, isPageSaved } from '@/features/aywebs/storeShopping';
import {
  AYWEBS_RESOLVE_TIMEOUT_MS, analyzeAyWebsPage, buildAyWebsCaptureInjection, fetchAyWebsCaptureScript,
  parseAyWebsCaptureMessage, resolveAyWebsProductWithCapture,
  type AyWebsPageAnalysis, type AyWebsResolveOutcome,
} from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import { ReadingProgress } from '@/features/aywebs/ReadingProgress';
import { CAPTURE_BUDGET_MS } from '@/features/aywebs/phase';
import { withReadDeadline } from '@/features/aywebs/readDeadline';
import { waitForPageIdle } from '@/features/aywebs/captureFallback';
import {
  AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS, canReusePrefetch, canReuseVerified, priceCandidatesOf, resolveAddToCart, shouldRetryAyWebsCaptureForPrice,
} from '@/features/aywebs/captureFlow';
import type { ReadPhase } from '@/features/aywebs/phase';
import { useSessionId } from '@/session/session';
import { useSession } from '@/state/session';

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
  const captureSequence = useRef(0);
  /** الوعد الجاري لقراءة الصفحة: يتفتح بالحقن ويتسدّ بالرسالة (ولا بالمهلة). */
  const waiter = useRef<{ id: string; resolve: (capture: Record<string, unknown>) => void; reject: (error: unknown) => void } | null>(null);
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

  /** Contrôleur de l'appui « Add » en cours : un nouvel appui, ou la sortie de l'écran, l'annule. */
  const addController = useRef<AbortController | null>(null);


  /* Fiche vérifiée par le serveur au chargement (réutilisée à l'ouverture de la feuille). */
  const verified = useRef<{ url: string; capture: unknown; outcome: AyWebsResolveOutcome; at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  // Background prefetch must never disable the user's Add action.
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
  const pageUrlRef = useRef(url);
  /** تصنيف الخادم للصفحة الحالية: مصدر السماح بالقراءة وبالإضافة. */
  const [pageAnalysis, setPageAnalysis] = useState<AyWebsPageAnalysis | null>(null);
  const captureAllowed = pageAnalysis
    ? (pageAnalysis.captureAllowed || pageAnalysis.externalCaptureAllowed)
    : captureAllowedParam;
  const [classified, setClassified] = useState(false);
  /** الورقة: المنتوج + الكابتشر اللي بعثناه (باش الإضافة ما تعاودش تقرا التاجر). */
  const [sheet, setSheet] = useState<{ outcome: AyWebsResolveOutcome; capture?: unknown } | null>(null);

  /**
   * مرحلة القراءة + الزمن المستهلك: **جايان من مجريات حقيقية**، موش من عدّاد.
   * كل مرحلة تتعيّن عند منعرج فعلي في الكود (جلب السكريبت، الحقن، نداء الخادم).
   */
  const [phase, setPhase] = useState<ReadPhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);

  const startWaiting = useCallback((first: ReadPhase) => {
    startedAt.current = Date.now();
    setElapsed(0);
    setPhase(first);
    if (tick.current) clearInterval(tick.current);
    tick.current = setInterval(() => setElapsed(Date.now() - startedAt.current), 500);
  }, []);
  const endWaiting = useCallback((last: ReadPhase) => {
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    setPhase(last);
  }, []);
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);
  useEffect(() => () => {
    addController.current?.abort();
    prefetch.current?.controller.abort();
  }, []);

  /** تصنيف الصفحة — شرط تفعيل «Add to Cart» (لا تخمين من الرابط). */
  useEffect(() => {
    if (!sessionId || !pageUrl || !isWebPageUrl(pageUrl)) return;
    let alive = true;
    const controller = new AbortController();
    setPageAnalysis(null);
    setProductPage(null);
    setClassified(false);
    withReadDeadline((signal) => analyzeAyWebsPage(pageUrl, { sessionId, signal }), { signal: controller.signal, timeoutMs: 15_000 })
      .then((analysis) => {
        if (!alive) return;
        setPageAnalysis(analysis);
        setProductPage(analysis.isProductPage);
        setClassified(true);
      })
      .catch(() => {
        if (!alive) return;
        // ما نعرفوش: الزرّ يبقى معطّلاً والسبب يظهر — موش نفعّلوه بالتخمين.
        setPageAnalysis(null);
        setProductPage(null);
        setClassified(true);
      });
    return () => { alive = false; controller.abort(); };
  }, [sessionId, pageUrl]);

  /** A capture owns its waiter, retries and deadline. Late messages cannot settle another read. */
  const requestCapture = useCallback((signal?: AbortSignal, quiet = false): Promise<Record<string, unknown>> => {
    const id = `ayw_${++captureSequence.current}`;
    if (!quiet) startWaiting('preparing');
    return withReadDeadline((captureSignal) => new Promise<Record<string, unknown>>((resolve, reject) => {
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      let retries = 0;
      let script = '';
      let settled = false;
      const finish = (error: unknown, capture?: Record<string, unknown>) => {
        if (settled) return;
        settled = true;
        clearTimeout(retryTimer);
        captureSignal.removeEventListener('abort', onAbort);
        if (waiter.current?.id === id) waiter.current = null;
        if (error) reject(error); else resolve(capture!);
      };
      const onAbort = () => finish(new ApiError('aborted', 'Lecture annulée.'));
      const inject = () => {
        if (settled || captureSignal.aborted) return;
        try {
          if (!webRef.current) throw new ApiError('device', 'Navigateur indisponible.');
          if (!quiet) setPhase('reading');
          webRef.current.injectJavaScript(buildAyWebsCaptureInjection(script, id));
        } catch (error) { finish(error); }
      };
      const onCaptured = (capture: Record<string, unknown>) => {
        if (settled) return;
        if (shouldRetryAyWebsCaptureForPrice(priceCandidatesOf(capture), retries)) {
          retries += 1;
          retryTimer = setTimeout(inject, AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS);
        } else finish(null, capture);
      };
      // There must be only one active bridge reader.
      waiter.current?.reject(new ApiError('aborted', 'Lecture remplacée.'));
      waiter.current = { id, resolve: onCaptured, reject: (error) => finish(error) };
      captureSignal.addEventListener('abort', onAbort, { once: true });
      fetchAyWebsCaptureScript({ signal: captureSignal })
        .then(async (value) => {
          await waitForPageIdle(() => !captureSignal.aborted && pageLoadingRef.current);
          if (settled || captureSignal.aborted) return;
          script = value;
          inject();
        })
        .catch((error) => finish(error));
    }), { signal, timeoutMs: CAPTURE_BUDGET_MS });
  }, [startWaiting]);

  /** Lit la page en silence, dès qu'elle est chargée et reconnue comme fiche produit. */
  const startPrefetch = useCallback((url: string) => {
    const current = prefetch.current;
    if (current && current.url === url && current.status !== 'failed') return;
    current?.controller.abort();
    const controller = new AbortController();
    const entry: NonNullable<typeof prefetch.current> = {
      url, at: Date.now(), status: 'reading', controller,
      promise: Promise.resolve({}),
    };
    entry.promise = requestCapture(controller.signal, true).then(
      (capture) => {
        entry.status = 'ok'; entry.at = Date.now();
        return capture;
      },
      (error: unknown) => {
        entry.status = 'failed';
        throw error;
      },
    );
    entry.promise.catch(() => undefined);
    prefetch.current = entry;
    verified.current = null;
    /* Verify in the background without locking the Add button. */
    entry.promise
      .then((capture) => withReadDeadline((signal) => resolveAyWebsProductWithCapture(url, {
        sessionId: sessionId || '', storeId: storeId || undefined, capture, signal,
      }), { signal: controller.signal, timeoutMs: AYWEBS_RESOLVE_TIMEOUT_MS }).then((outcome) => ({ capture, outcome })))
      .then(({ capture, outcome }) => {
        if (controller.signal.aborted || prefetch.current !== entry) return;
        if (outcome.quoteToken && outcome.missing.length === 0) {
          verified.current = { url, capture, outcome, at: Date.now() };
        }
      })
      .catch(() => undefined);
  }, [requestCapture, sessionId, storeId]);

  useEffect(() => {
    if (!captureAllowed || productPage !== true || !pageReady || !pageUrl) return;
    startPrefetch(pageUrl);
  }, [captureAllowed, productPage, pageReady, pageUrl, startPrefetch]);

  const fail = useCallback((error: unknown) => {
    endWaiting('failed');
    setBusy(false);
    setNote(isApiError(error) ? userMessage(error)[locale] : t('aywebs.captureFailed'));
  }, [endWaiting, locale, t]);

  /** «اقرا هذه الصفحة»: قراءة + قرار الخادم، بلا أي إضافة. */
  /**
   * «Add to Cart»: يقرا (كي مسموح)، يحلّ المنتوج، ثم يفتح ورقة الاختيار
   * **فوق هذه الصفحة** — الإضافة الحقيقية تجي في الورقة.
   */
  const addToCart = useCallback(async () => {
    if (!sessionId || !pageUrl || productPage !== true) return;
    /* Un nouvel appui remplace le précédent : l'ancien est annulé, il ne touche plus l'écran. */
    addController.current?.abort();
    addController.current = null;
    setBusy(false);
    /* Fiche déjà vérifiée il y a moins de 10 min : la feuille s'ouvre tout de suite, sans appel serveur. */
    const reuse = verified.current;
    if (reuse && canReuseVerified(reuse, pageUrl, Date.now())) {
      setOutcome(reuse.outcome);
      setNote('');
      setSheet({ outcome: reuse.outcome, capture: reuse.capture });
      endWaiting('done');
      return;
    }
    const controller = new AbortController();
    addController.current = controller;
    const isCurrent = () => addController.current === controller && pageUrlRef.current === pageUrl;
    setBusy(true);
    setNote('');
    startWaiting('reading');
    try {
      /* UNE capture, puis UNE résolution (avec capture, ou sans si la capture échoue ou
         tarde). Pas de seconde requête serveur quand la capture réussit (19/10/2026). */
      // Bound bridge waiting and server resolution; never leave Add spinning indefinitely.
      const { decision, outcome: result, capture } = await withReadDeadline((signal) => resolveAddToCart({
        readCapture: captureAllowed ? () => {
          const entry = prefetch.current;
          if (entry && canReusePrefetch(entry, pageUrl, Date.now())) return entry.promise;
          return requestCapture(signal);
        } : undefined,
        budgetMs: CAPTURE_BUDGET_MS,
        onBudgetExceeded: () => { prefetch.current?.controller.abort(); },
        // refresh : une intention Add ne sert jamais une lecture mémorisée (19/10/2026).
        resolve: (captured) => resolveAyWebsProductWithCapture(pageUrl, {
          sessionId, storeId: storeId || undefined, capture: captured, refresh: true, signal,
        }),
        signal,
        onPhase: (phase) => { if (isCurrent() && phase !== 'reading') setPhase('resolving'); },
      }), { signal: controller.signal, timeoutMs: CAPTURE_BUDGET_MS + AYWEBS_RESOLVE_TIMEOUT_MS });
      if (controller.signal.aborted || !isCurrent()) return;
      /* Pas de feuille sans prix, devise ou devis vérifiés : la décision NOMME les champs manquants. */
      if (decision.kind === 'refused') {
        setNote(decision.error.code === 'CAPTURE_INCOMPLETE' ? userMessage(decision.error)[locale] : t('aywebs.captureFailed'));
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
      setSheet({ outcome: result, capture });
      endWaiting('done');
    } catch (error) {
      if (controller.signal.aborted || !isCurrent()) return;
      fail(error);
    } finally {
      if (isCurrent()) {
        setBusy(false);
        addController.current = null;
      }
    }
  }, [captureAllowed, endWaiting, fail, locale, productPage, requestCapture, sessionId, startWaiting, storeId, pageUrl, t]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const pending = waiter.current;
    if (!pending) return;
    // Ignore merchant messages and replies from an earlier page/read.
    let envelope: Record<string, unknown>;
    try { envelope = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (!envelope || envelope.__aywebs_requestId !== pending.id) return;
    const parsed = parseAyWebsCaptureMessage(event.nativeEvent.data);
    if (!parsed.ok) {
      pending.reject(new ApiError('malformed', `Capture refusée : ${parsed.reason}`));
      return;
    }
    pending.resolve(parsed.capture);
  }, []);

  const invalidatePageRead = useCallback(() => {
    addController.current?.abort();
    addController.current = null;
    prefetch.current?.controller.abort();
    prefetch.current = null;
    verified.current = null;
    waiter.current?.reject(new ApiError('aborted', 'Page remplacée.'));
    waiter.current = null;
    setBusy(false);
    setSheet(null);
    setOutcome(null);
    setNote('');
    setProductPage(null);
    setPageAnalysis(null);
    setClassified(false);
    endWaiting('idle');
  }, [endWaiting]);

  const verdict = outcome?.capture ?? null;
  const addEnabled = productPage === true && !busy && Boolean(sessionId);

  /* Favoris : seulement pour une page produit. La liste sert à afficher le cœur plein. */
  const { status: accountStatus } = useSession();
  const favorites = useQuery({
    queryKey: ['account', 'favorites'],
    queryFn: ({ signal }) => fetchFavorites({ signal }),
    enabled: productPage === true && accountStatus === 'signedIn',
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
            <KeyValue label={t('aywebs.totalTnd')} value={`${outcome.product.ayroviPricing.totalTnd.toFixed(2)} TND`} />
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
          if (state.url !== pageUrlRef.current) {
            pageUrlRef.current = state.url;
            invalidatePageRead();
            setPageUrl(state.url);
          }
          setNav({ canGoBack: state.canGoBack, canGoForward: state.canGoForward, title: state.title ?? '' });
        }}
        onMessage={onMessage}
        onError={() => { invalidatePageRead(); setNote(t('aywebs.captureFailed')); }}
        onContentProcessDidTerminate={() => { invalidatePageRead(); setNote(t('aywebs.captureFailed')); }}
        onRenderProcessGone={() => { invalidatePageRead(); setNote(t('aywebs.captureFailed')); }}
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
        {phase !== 'idle' ? (
          <ReadingProgress
            phase={phase}
            elapsedMs={elapsed}
            labels={[t('aywebs.phase.preparing'), t('aywebs.phase.reading'), t('aywebs.phase.resolving')]}
            countdownPrefix={t('aywebs.phase.remaining')}
            compact
          />
        ) : null}
        {note ? <AppText variant="caption" color={theme.status.danger.fg}>{note}</AppText> : null}
        {!captureAllowed ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.readNotAllowed')}</AppText>
        ) : null}
        {/* السبب بالكلمات: تصنيف الخادم يقرّر إذا الزرّ يتفعّل ولا لا. */}
        {!classified ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.classifying')}</AppText>
        ) : productPage !== true ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.addNotProductPage')}</AppText>
        ) : null}

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
            disabled={productPage !== true}
            active={saved}
            onPress={() => setFavOpen(true)}
            testID="aywebs-store-fav"
          />
          <View style={styles.addBox}>
            <Button
              label={busy ? t('aywebs.loading') : t('aywebs.addToCart')}
              tone="main"
              block
              onPress={addToCart}
              busy={busy}
              disabled={!addEnabled}
              testID="aywebs-store-add-to-cart"
            />
          </View>
        </View>
      </View>

      {sheet ? (
        <AddToCartSheet
          visible
          sessionId={sessionId}
          product={sheet.outcome.product}
          options={sheet.outcome.product.variantDetails}
          capture={sheet.capture}
          quoteToken={sheet.outcome.quoteToken}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sessionId ? (
        <StoreCartSheet visible={cartOpen} onClose={() => setCartOpen(false)} sessionId={sessionId} storeId={storeId} />
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
