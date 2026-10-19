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
  parseAyWebsCaptureMessage, resolveAyWebsProductWithCapture,
  type AyWebsPageAnalysis, type AyWebsResolveOutcome,
} from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import { ReadingProgress } from '@/features/aywebs/ReadingProgress';
import { resolveWithParallelCapture, waitForPageIdle } from '@/features/aywebs/captureFallback';
import { CAPTURE_BUDGET_MS, type ReadPhase } from '@/features/aywebs/phase';
import { useSessionId } from '@/session/session';
import { useSession } from '@/state/session';

/** كي الصفحة ما تبعثش شي: مانبقاوش نستنّوا بلا نهاية. */
const CAPTURE_TIMEOUT_MS = CAPTURE_BUDGET_MS;

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
const captureTimeout = () => new ApiError('timeout', 'Capture : la page n’a rien renvoyé dans le délai.');

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

  const [busy, setBusy] = useState(false);
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

  const stopTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  /** تصنيف الصفحة — شرط تفعيل «Add to Cart» (لا تخمين من الرابط). */
  useEffect(() => {
    if (!sessionId || !pageUrl || !isWebPageUrl(pageUrl)) return;
    let alive = true;
    setClassified(false);
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
   * الجسر. كي ما تجي شي: مهلة 15 ثانية ثم سبب صريح.
   */
  const requestCapture = useCallback((): Promise<Record<string, unknown>> => {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      setBusy(true);
      setNote('');
      startWaiting('preparing');
      waiter.current = { resolve, reject };
      fetchAyWebsCaptureScript()
        // الصفحة لازم تكمّل تحميلها قبل القراءة (Amazon يعطي DOM ناقص ⇒ NO_PRICE_TEXT).
        .then(async (script) => {
          await waitForPageIdle(() => pageLoadingRef.current);
          return script;
        })
        .then((script) => {
          // الحقن هو المنعرج الثاني: من توّا الكلمة صارت للصفحة.
          startWaiting('reading');
          webRef.current?.injectJavaScript(buildAyWebsCaptureInjection(script));
          stopTimer();
          timer.current = setTimeout(() => {
            waiter.current = null;
            setBusy(false);
            reject(captureTimeout());
          }, CAPTURE_TIMEOUT_MS);
        })
        .catch((error) => {
          waiter.current = null;
          setBusy(false);
          reject(error);
        });
    });
  }, []);

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
    try {
      /* الكابتشر مسرّع فقط: كان فشل (صفحة ساكتة، سكريبت ما وصلش، شبكة مقطوعة)،
         نكمّلو بالقراءة من الخادم كيف الويب، والورقة تحل. */
      /* Lecture serveur lancée TOUT DE SUITE (sans capture), en parallèle de la
         lecture de la page: le serveur travaille pendant que le téléphone lit. Une
         capture réussie l'emporte (résolution avec capture, rapide). */
      const { outcome: result, capture } = await resolveWithParallelCapture<AyWebsResolveOutcome>({
        readCapture: captureAllowed ? requestCapture : undefined,
        // refresh : une intention Add ne sert jamais une lecture mémorisée (19/10/2026).
        resolve: (captured) => resolveAyWebsProductWithCapture(pageUrl, {
          sessionId, storeId: storeId || undefined, capture: captured, refresh: true,
        }),
        onPhase: () => startWaiting('resolving'),
      });
      setOutcome(result);
      setNote('');
      setSheet({ outcome: result, capture });
      endWaiting('done');
    } catch (error) {
      fail(error);
    } finally {
      stopTimer();
      setBusy(false);
    }
  }, [captureAllowed, endWaiting, fail, productPage, requestCapture, sessionId, startWaiting, storeId, pageUrl]);

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
          if (!state.url) return;
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
