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
  analyzeAyWebsPage, buildAyWebsCaptureInjection, fetchAyWebsCaptureScript,
  parseAyWebsCaptureMessage,
  type AyWebsPageAnalysis, type AyWebsResolveOutcome,
} from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import { waitForPageIdle } from '@/features/aywebs/captureFallback';
import {
  AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS,
  AYWEBS_CAPTURE_SAFETY_TIMEOUT_MS,
  canOpenLocalSheetFromCapture,
  canReuseLocalCapture,
  priceCandidatesOf,
  shouldRetryAyWebsCaptureForPrice,
} from '@/features/aywebs/captureFlow';
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** الوعد الجاري لقراءة الصفحة: يتفتح بالحقن ويتسدّ بالرسالة (ولا بالمهلة). */
  const waiter = useRef<{ resolve: (capture: Record<string, unknown>) => void; reject: (error: unknown) => void } | null>(null);
  /** Vrai pendant que la page charge (mis à jour par onNavigationStateChange). */
  const pageLoadingRef = useRef(false);
  /* Lecture faite À L'OUVERTURE de la page : « Add to Cart » ouvre la feuille locale sans appel serveur. */
  const prefetch = useRef<{
    url: string;
    at: number;
    status: 'reading' | 'ok' | 'failed';
    capture?: Record<string, unknown>;
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
  /** تصنيف الخادم للصفحة الحالية: مصدر السماح بالقراءة وبالإضافة. */
  const [pageAnalysis, setPageAnalysis] = useState<AyWebsPageAnalysis | null>(null);
  const captureAllowed = pageAnalysis
    ? (pageAnalysis.captureAllowed || pageAnalysis.externalCaptureAllowed)
    : captureAllowedParam;
  const [classified, setClassified] = useState(false);
  /** Feuille ouverte depuis la capture locale : la confirmation serveur se fait au clic sur Confirmer. */
  const [sheet, setSheet] = useState<{ url: string; storeId: string; capture: Record<string, unknown> } | null>(null);

  const stopTimer = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);
  useEffect(() => () => {
    stopTimer();
    prefetch.current?.controller.abort();
    addController.current?.abort();
  }, [stopTimer]);

  /** تصنيف الصفحة — شرط تفعيل «Add to Cart» (لا تخمين من الرابط). */
  useEffect(() => {
    if (!sessionId || !pageUrl || !isWebPageUrl(pageUrl)) return;
    let alive = true;
    setClassified(false);
    setProductPage(null);
    analyzeAyWebsPage(pageUrl, { sessionId })
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
    return () => { alive = false; };
  }, [sessionId, pageUrl]);

  /**
   * يطلب قراءة الصفحة ويرجّع الوعد: يتفتح بالحقن، ويتسدّ بالرسالة اللي تجي من
   * الجسر، مع مهلة أمان صامتة (20 ثانية) باش الزرّ ما يبقاش معلّق للأبد كان
   * الـWebView ما جاوبش (بلا أي عدّاد مرئي للعميل).
   */
  const requestCapture = useCallback((signal?: AbortSignal, quiet = false): Promise<Record<string, unknown>> => {
    return new Promise<Record<string, unknown>>((resolveOuter, rejectOuter) => {
      let settled = false;
      let activeWaiter: { resolve: (capture: Record<string, unknown>) => void; reject: (error: unknown) => void } | null = null;
      const clearOwnWaiter = () => {
        if (activeWaiter && waiter.current === activeWaiter) {
          waiter.current = null;
        }
      };
      const finish = () => {
        settled = true;
        stopTimer();
        signal?.removeEventListener('abort', onAbort);
      };
      const resolve = (value: Record<string, unknown>) => { if (settled) return; finish(); resolveOuter(value); };
      const reject = (error: unknown) => { if (settled) return; finish(); rejectOuter(error); };
      /* Annulation (nouvel appui ou écran fermé) : on libère la page et le minuteur. */
      const onAbort = () => {
        if (settled) return;
        stopTimer();
        clearOwnWaiter();
        if (!quiet) { setBusy(false); }
        reject(new ApiError('aborted', 'Requête interrompue.'));
      };
      if (signal?.aborted) { reject(new ApiError('aborted', 'Requête interrompue.')); return; }
      signal?.addEventListener('abort', onAbort);
      if (!quiet) { setBusy(true); setNote(''); }
      captureRetries.current = 0;
      const armSafetyTimer = () => {
        stopTimer();
        timer.current = setTimeout(() => {
          if (settled) return;
          clearOwnWaiter();
          if (!quiet) { setBusy(false); }
          reject(new ApiError('http', 'Nous n’avons pas pu lire le titre ou le prix de ce produit.', {
            status: 422,
            code: 'CAPTURE_INCOMPLETE',
            missingFields: ['title', 'price'],
          }));
        }, AYWEBS_CAPTURE_SAFETY_TIMEOUT_MS);
        (timer.current as { unref?: () => void } | null)?.unref?.();
      };
      const inject = (script: string) => {
        if (settled) return;
        armSafetyTimer();
        webRef.current?.injectJavaScript(buildAyWebsCaptureInjection(script));
      };
      /* Prix absent de la capture ⇒ relance bornée (fc3cce38 / captureFlow.ts). */
      const onCaptured = (capture: Record<string, unknown>) => {
        if (settled) return;
        const script = lastScript.current;
        if (script && shouldRetryAyWebsCaptureForPrice(priceCandidatesOf(capture), captureRetries.current)) {
          captureRetries.current += 1;
          activeWaiter = { resolve: onCaptured, reject };
          waiter.current = activeWaiter;
          stopTimer();
          const retryTimer = setTimeout(() => {
            if (settled) return;
            inject(script);
          }, AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS);
          (retryTimer as { unref?: () => void } | null)?.unref?.();
          return;
        }
        resolve(capture);
      };
      activeWaiter = { resolve: onCaptured, reject };
      waiter.current = activeWaiter;
      fetchAyWebsCaptureScript()
        // الصفحة لازم تكمّل تحميلها قبل القراءة (Amazon يعطي DOM ناقص ⇒ NO_PRICE_TEXT).
        .then(async (script) => {
          await waitForPageIdle(() => pageLoadingRef.current);
          return script;
        })
        .then((script) => {
          if (settled) return;
          // الحقن هو المنعرج الثاني: من توّا الكلمة صارت للصفحة.
          lastScript.current = script;
          inject(script);
        })
        .catch((error) => {
          if (settled) return;
          clearOwnWaiter();
          if (!quiet) setBusy(false);
          reject(error);
        });
    });
  }, [stopTimer]);

  /**
   * Lit la page en silence dès qu'elle est chargée et reconnue comme fiche produit.
   * AUCUN appel serveur (resolveAyWebsProductWithCapture) pendant ni après cette lecture :
   * la capture reste en mémoire dans `prefetch.current` pour ouvrir la feuille immédiatement.
   */
  const startPrefetch = useCallback((targetUrl: string) => {
    const current = prefetch.current;
    const sameUrl = current
      && (current.url === targetUrl || canonicalSourceUrl(current.url) === canonicalSourceUrl(targetUrl));
    if (sameUrl && current.status !== 'failed') return;
    current?.controller.abort();
    const controller = new AbortController();
    const entry: NonNullable<typeof prefetch.current> = {
      url: targetUrl,
      at: 0,
      status: 'reading',
      controller,
      promise: Promise.resolve({}),
    };
    entry.promise = requestCapture(controller.signal, true).then(
      (capture) => {
        entry.capture = capture;
        entry.status = 'ok';
        entry.at = Date.now();
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
    if (!captureAllowed || productPage !== true || !pageUrl) return;
    startPrefetch(pageUrl);
  }, [captureAllowed, productPage, pageReady, pageUrl, startPrefetch]);

  const fail = useCallback((error: unknown) => {
    setBusy(false);
    setNote(isApiError(error) ? userMessage(error)[locale] : t('aywebs.captureFailed'));
  }, [locale, t]);

  /**
   * «Add to Cart» :
   *  - Si la lecture automatique est encore en cours : le bouton reste en chargement, pas de second appel.
   *  - Si la capture est prête pour cette `url` : ouvre `AddToCartSheet` IMMÉDIATEMENT depuis la capture locale, sans appel serveur.
   *  - Sinon : lit la page dans la WebView et ouvre la feuille locale dès la capture reçue, sans appel serveur.
   */
  const addToCart = useCallback(async () => {
    if (!sessionId || !pageUrl || productPage !== true) return;
    const currentPrefetch = prefetch.current;
    const matchesCurrentUrl = currentPrefetch
      && (currentPrefetch.url === pageUrl || canonicalSourceUrl(currentPrefetch.url) === canonicalSourceUrl(pageUrl));
    if (matchesCurrentUrl && currentPrefetch.status === 'reading') {
      return;
    }
    if (
      matchesCurrentUrl
      && currentPrefetch.status === 'ok'
      && currentPrefetch.capture !== undefined
    ) {
      if (canReuseLocalCapture({ url: currentPrefetch.url, status: 'ok', capture: currentPrefetch.capture }, pageUrl)) {
        setNote('');
        setSheet({ url: pageUrl, storeId, capture: currentPrefetch.capture });
        return;
      }
    }

    addController.current?.abort();
    if (!captureAllowed) {
      const incomplete = new ApiError('http', 'Nous n’avons pas pu lire le titre ou le prix de ce produit.', {
        status: 422,
        code: 'CAPTURE_INCOMPLETE',
        missingFields: ['title', 'price'],
      });
      setNote(userMessage(incomplete)[locale]);
      return;
    }

    const controller = new AbortController();
    addController.current = controller;
    const isCurrent = () => addController.current === controller;
    try {
      const captured = await requestCapture(controller.signal);
      if (controller.signal.aborted) return;
      if (!canOpenLocalSheetFromCapture(captured)) {
        const incomplete = new ApiError('http', 'Nous n’avons pas pu lire le titre ou le prix de ce produit.', {
          status: 422,
          code: 'CAPTURE_INCOMPLETE',
          missingFields: ['title', 'price'],
        });
        setNote(userMessage(incomplete)[locale]);
        return;
      }
      prefetch.current = {
        url: pageUrl,
        at: Date.now(),
        status: 'ok',
        capture: captured,
        promise: Promise.resolve(captured),
        controller,
      };
      setNote('');
      setSheet({ url: pageUrl, storeId, capture: captured });
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
  }, [captureAllowed, fail, locale, pageUrl, productPage, requestCapture, sessionId, stopTimer, storeId]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    stopTimer();
    const pending = waiter.current;
    waiter.current = null;
    const parsed = parseAyWebsCaptureMessage(event.nativeEvent.data);
    if (!parsed.ok) {
      setBusy(false);
      setNote(`${t('aywebs.captureFailed')} — ${parsed.reason}`);
      pending?.reject(new ApiError('malformed', `Capture refusée : ${parsed.reason}`));
      return;
    }
    setBusy(false);
    pending?.resolve(parsed.capture);
  }, [t]);

  const verdict = outcome?.capture ?? null;
  const addEnabled = productPage === true && !busy && !prefetchReading && Boolean(sessionId);

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
          setPageUrl((prev) => {
            if (prev === state.url || canonicalSourceUrl(prev) === canonicalSourceUrl(state.url)) {
              return prev;
            }
            setSheet(null);
            setOutcome(null);
            setNote('');
            return state.url;
          });
          setNav({ canGoBack: state.canGoBack, canGoForward: state.canGoForward, title: state.title ?? '' });
        }}
        onLoadEnd={() => {
          pageLoadingRef.current = false;
          setPageReady(true);
        }}
        onLoadProgress={(event) => {
          if (event?.nativeEvent?.progress === 1) {
            pageLoadingRef.current = false;
            setPageReady(true);
          }
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
      </View>

      {sheet ? (
        <AddToCartSheet
          visible
          sessionId={sessionId}
          sourceUrl={sheet.url}
          storeId={sheet.storeId}
          fallbackTitle={nav.title || storeName}
          capture={sheet.capture}
          product={outcomeMatchesPage ? outcome?.product ?? null : null}
          quoteToken={outcomeMatchesPage ? outcome?.quoteToken ?? '' : ''}
          onResolved={(res) => setOutcome(res)}
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
