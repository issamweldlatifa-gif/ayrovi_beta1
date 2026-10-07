/**
 * AYWEBs — P3، الشريحتان 2 و3: صفحة المتجر داخل WebView + الكابتشر + «Add to Cart».
 *
 * الرحلة كما في العقد: المستعمل يشوف الصفحة الحقيقية للمتجر (نفسها، بلا وسيط).
 * الزرّان يفعلان ما هو مكتوب عليهما:
 *
 *  • «اقرا هذه الصفحة» — يقراها بس: السكريبت الّلي **يجي من الخادم** يقرا وقائع
 *    نصّية ويبعثها للجسر، والخادم يقبل/يرفض ويحسب الثمن، ونعرضو قراره.
 *  • «Add to Cart» — نفس القراءة، ثم **ورقة الاختيار فوق هذه الصفحة**، ثم إضافة
 *    حقيقية في سلّة AYWEBs على الخادم. المستعمل **ما يخرجش** من المتجر،
 *    والصفحة (HTML) **ما تتبعثش أبداً**، ولا سعر ولا حالة تخرج من الجهاز.
 *
 * شرط تفعيل «Add to Cart» هو نفسه في العقد: **الخادم** صنّف الصفحة كصفحة
 * منتوج. قبل التصنيف الزرّ معطّل والسبب مكتوب — زر ما ينجمش ينجح ما يتفعّلش.
 */
import { useCallback, useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { AppText, Button, Card, KeyValue } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { ApiError, isApiError, userMessage } from '@/api/errors';
import {
  analyzeAyWebsPage, buildAyWebsCaptureInjection, fetchAyWebsCaptureScript,
  parseAyWebsCaptureMessage, resolveAyWebsProductWithCapture,
  type AyWebsResolveOutcome,
} from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import { useAyWebsSessionId } from '@/features/aywebs/session';

/** كي الصفحة ما تبعثش شي: مانبقاوش نستنّوا بلا نهاية. */
const CAPTURE_TIMEOUT_MS = 15_000;

/**
 * باغ أنواع عند `react-native-webview` (13.17): الصنف معلن `WebView<P = undefined>`
 * و`WebViewProps & undefined` = `never`، فتفسير JSX يرفض كل خاصية. الإصلاح محلي:
 * المكوّن + مرجع فيه `injectJavaScript` (اللي موجود فعلاً في وقت التنفيذ).
 */
type WebViewHandle = { injectJavaScript: (script: string) => void };
const WebView = RNWebView as unknown as ComponentType<
  WebViewProps & { ref?: Ref<WebViewHandle> }
>;

/** كي الكابتشر ما يجيش في الوقت: سبب صريح، موش انتظار أبدي. */
const captureTimeout = () => new ApiError('timeout', 'Capture : la page n’a rien renvoyé dans le délai.');

export default function AyWebsBrowserScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const sessionId = useAyWebsSessionId();

  const params = useLocalSearchParams<{ url?: string; storeId?: string; capture?: string }>();
  const url = String(params.url ?? '');
  const storeId = String(params.storeId ?? '');
  const captureAllowed = params.capture === '1';

  const webRef = useRef<WebViewHandle>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** الوعد الجاري لقراءة الصفحة: يتفتح بالحقن ويتسدّ بالرسالة (ولا بالمهلة). */
  const waiter = useRef<{ resolve: (capture: Record<string, unknown>) => void; reject: (error: unknown) => void } | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<AyWebsResolveOutcome | null>(null);
  /** تصنيف الخادم للصفحة: `null` = مازال، و`false` = موش صفحة منتوج. */
  const [productPage, setProductPage] = useState<boolean | null>(null);
  const [classified, setClassified] = useState(false);
  /** الورقة: المنتوج + الكابتشر اللي بعثناه (باش الإضافة ما تعاودش تقرا التاجر). */
  const [sheet, setSheet] = useState<{ outcome: AyWebsResolveOutcome; capture?: unknown } | null>(null);

  const stopTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  /** تصنيف الصفحة — شرط تفعيل «Add to Cart» (لا تخمين من الرابط). */
  useEffect(() => {
    if (!sessionId || !url) return;
    let alive = true;
    setClassified(false);
    analyzeAyWebsPage(url, { sessionId })
      .then((analysis) => {
        if (!alive) return;
        setProductPage(analysis.isProductPage);
        setClassified(true);
      })
      .catch(() => {
        if (!alive) return;
        // ما نعرفوش: الزرّ يبقى معطّلاً والسبب يظهر — موش نفعّلوه بالتخمين.
        setProductPage(null);
        setClassified(true);
      });
    return () => { alive = false; };
  }, [sessionId, url]);

  /**
   * يطلب قراءة الصفحة ويرجّع الوعد: يتفتح بالحقن، ويتسدّ بالرسالة اللي تجي من
   * الجسر. كي ما تجي شي: مهلة 15 ثانية ثم سبب صريح.
   */
  const requestCapture = useCallback((): Promise<Record<string, unknown>> => {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      setBusy(true);
      setNote('');
      waiter.current = { resolve, reject };
      fetchAyWebsCaptureScript()
        .then((script) => {
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
    setBusy(false);
    setNote(isApiError(error) ? userMessage(error)[locale] : t('aywebs.captureFailed'));
  }, [locale, t]);

  /** «اقرا هذه الصفحة»: قراءة + قرار الخادم، بلا أي إضافة. */
  const readPage = useCallback(async () => {
    if (!captureAllowed || !sessionId || !url) return;
    try {
      const capture = await requestCapture();
      const result = await resolveAyWebsProductWithCapture(url, {
        sessionId, storeId: storeId || undefined, capture,
      });
      setOutcome(result);
      setNote('');
    } catch (error) {
      fail(error);
    } finally {
      stopTimer();
      setBusy(false);
    }
  }, [captureAllowed, fail, requestCapture, sessionId, storeId, url]);

  /**
   * «Add to Cart»: يقرا (كي مسموح)، يحلّ المنتوج، ثم يفتح ورقة الاختيار
   * **فوق هذه الصفحة** — الإضافة الحقيقية تجي في الورقة.
   */
  const addToCart = useCallback(async () => {
    if (!sessionId || !url || productPage !== true) return;
    try {
      const capture = captureAllowed ? await requestCapture() : undefined;
      const result = await resolveAyWebsProductWithCapture(url, {
        sessionId, storeId: storeId || undefined, capture,
      });
      setOutcome(result);
      setNote('');
      setSheet({ outcome: result, capture });
    } catch (error) {
      fail(error);
    } finally {
      stopTimer();
      setBusy(false);
    }
  }, [captureAllowed, fail, productPage, requestCapture, sessionId, storeId, url]);

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

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.canvas, paddingTop: insets.top + theme.space[2] }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{ minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget, justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.ink} />
        </Pressable>
        <AppText variant="title" numberOfLines={1} style={styles.headerTitle}>
          {t('aywebs.browserTitle')}
        </AppText>
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

      <WebView
        ref={webRef}
        source={{ uri: url }}
        style={styles.web}
        originWhitelist={['https://*']}
        javaScriptEnabled
        setSupportMultipleWindows={false}
        onLoadEnd={() => setLoaded(true)}
        onMessage={onMessage}
        onError={() => setNote(t('aywebs.captureFailed'))}
        startInLoadingState
        renderLoading={() => (
          <View style={[styles.loading, { backgroundColor: theme.colors.canvas }]}>
            <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.loadingPage')}</AppText>
          </View>
        )}
      />

      <View style={[styles.footer, { borderTopColor: theme.colors.line, paddingBottom: insets.bottom + theme.space[2] }]}>
        {busy ? <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.reading')}</AppText> : null}
        {note ? <AppText variant="caption" color={theme.colors.danger}>{note}</AppText> : null}
        {!captureAllowed ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.readNotAllowed')}</AppText>
        ) : null}
        {/* السبب بالكلمات: تصنيف الخادم يقرّر إذا الزرّ يتفعّل ولا لا. */}
        {!classified ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.classifying')}</AppText>
        ) : productPage !== true ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.addNotProductPage')}</AppText>
        ) : null}

        <View style={styles.row}>
          <Button
            label={t('aywebs.readPage')}
            tone="quiet"
            onPress={readPage}
            busy={busy && !addEnabled}
            disabled={!captureAllowed || !loaded || !sessionId}
          />
          <Button
            label={t('aywebs.addToCart')}
            onPress={addToCart}
            busy={busy && addEnabled}
            disabled={!addEnabled}
          />
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  headerTitle: { flex: 1, paddingRight: 8 },
  web: { flex: 1, marginTop: 8 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 8, gap: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
