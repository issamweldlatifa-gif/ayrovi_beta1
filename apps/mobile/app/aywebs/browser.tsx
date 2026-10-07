/**
 * AYWEBs — P3، الشريحة 2: صفحة المتجر داخل WebView + الكابتشر.
 *
 * الرحلة كما في العقد: المستعمل يشوف الصفحة الحقيقية للمتجر (نفسها، بلا
 * وسيط)، ويضغط «اقرا هذه الصفحة» — السكريبت اللّي **يجي من الخادم** يقرا
 * وقائع نصّية (عنوان، نصوص أسعار، توفّر، صور) ويبعثها للجسر. الصفحة نفسها
 * (HTML) **ما تتبعثش أبداً**، والخادم وحدو يقبل/يرفض ويحسب السعر بالدينار.
 *
 * الشاشة ما تدّعيش نجاحاً: كل نتيجة تتقال بالكلمات — «الكابتشر استُعمل» ولا
 * «الكابتشر مرفوض + السبب»، والقراءة بلا نتيجة تنتهي برسالة، موش بدوران.
 */
import { useCallback, useRef, useState, type ComponentType, type Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { AppText, Button, Card, KeyValue } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';
import {
  buildAyWebsCaptureInjection, fetchAyWebsCaptureScript, parseAyWebsCaptureMessage,
  resolveAyWebsProductWithCapture, type AyWebsResolveOutcome,
} from '@/api/aywebs';
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

  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<AyWebsResolveOutcome | null>(null);

  const stopTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  const readPage = useCallback(async () => {
    if (!captureAllowed || !sessionId || !url) return;
    setBusy(true);
    setNote('');
    try {
      const script = await fetchAyWebsCaptureScript();
      webRef.current?.injectJavaScript(buildAyWebsCaptureInjection(script));
      stopTimer();
      timer.current = setTimeout(() => {
        setBusy(false);
        setNote(t('aywebs.captureTimeout'));
      }, CAPTURE_TIMEOUT_MS);
    } catch (error) {
      stopTimer();
      setBusy(false);
      setNote(isApiError(error) ? userMessage(error)[locale] : t('aywebs.captureFailed'));
    }
  }, [captureAllowed, locale, sessionId, t, url]);

  const onMessage = useCallback(async (event: WebViewMessageEvent) => {
    stopTimer();
    const parsed = parseAyWebsCaptureMessage(event.nativeEvent.data);
    if (!parsed.ok) {
      setBusy(false);
      setNote(`${t('aywebs.captureFailed')} — ${parsed.reason}`);
      return;
    }
    try {
      const result = await resolveAyWebsProductWithCapture(url, {
        sessionId, storeId: storeId || undefined, capture: parsed.capture,
      });
      setOutcome(result);
      setNote('');
    } catch (error) {
      setNote(isApiError(error) ? userMessage(error)[locale] : t('aywebs.captureFailed'));
    } finally {
      setBusy(false);
    }
  }, [locale, sessionId, storeId, t, url]);

  const verdict = outcome?.capture ?? null;

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
        <Button
          label={t('aywebs.readPage')}
          onPress={readPage}
          busy={busy}
          disabled={!captureAllowed || !loaded || !sessionId}
        />
      </View>
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
});
