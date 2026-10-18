import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import WebView from 'react-native-webview';
import type { ComponentProps, ComponentType, Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText, Button, Field } from '@/design/ui';
import { ErrorBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useI18n, useT } from '@/i18n';
import { buildAyWebsCaptureInjection, fetchAyWebsCaptureScript, fetchAyWebsHome, resolveAyWebsProduct, type AyWebsCapture, type AyWebsResolvedProduct } from '@/api/aywebs';
import { useSessionId } from '@/session/session';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ayWebsErrorMessage } from '@/features/aywebs/errors';
import {
  isAllowedAyWebsMerchantUrl,
  normalizeAyWebsUrl,
  parseAyWebsCaptureMessage,
  safeAyWebsStartUrl,
} from '@/features/aywebs/merchantSecurity';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import {
  AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS,
  hasVerifiedAyWebsQuote,
  shouldRetryAyWebsCaptureForPrice,
} from '@/features/aywebs/captureFlow';

const CAPTURE_RESPONSE_TIMEOUT_MS = 15_000;
const SCRIPT_FAILURE_COPY: Record<string, string> = {
  EMPTY: 'aywebs.browser.capture.empty',
  TOO_LARGE: 'aywebs.browser.capture.tooLarge',
  NOT_JSON: 'aywebs.browser.capture.notJson',
  NOT_OBJECT: 'aywebs.browser.capture.notObject',
  SCRIPT_ERROR: 'aywebs.browser.capture.scriptError',
  BAD_CAPTURE: 'aywebs.browser.capture.badData',
};

type MerchantWebViewCommandRef = { injectJavaScript: (javascript: string) => void };
/**
 * react-native-webview 13.17 implements `forwardRef` at runtime but declares a
 * FunctionComponent without its imperative ref. This local type narrows that
 * one known declaration gap to the command we actually use.
 */
type NativeWebViewProps = ComponentProps<typeof WebView>;
const MerchantWebView = WebView as unknown as ComponentType<NativeWebViewProps & { ref?: Ref<MerchantWebViewCommandRef> }>;

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function AyWebsBrowserScreen() {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const insets = useSafeAreaInsets();
  const sessionId = useSessionId();
  const params = useLocalSearchParams<{ storeId?: string | string[]; url?: string | string[] }>();
  const storeId = routeParam(params.storeId);
  const requestedUrl = routeParam(params.url);
  const webViewRef = useRef<MerchantWebViewCommandRef | null>(null);
  const scriptRef = useRef('');
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureRetryCount = useRef(0);
  const captureCycleId = useRef(0);
  const activeRequestId = useRef('');
  const captureBusyRef = useRef(false);

  const [address, setAddress] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [navigationWarning, setNavigationWarning] = useState('');
  const [resolved, setResolved] = useState<AyWebsResolvedProduct | null>(null);
  const [capturedPage, setCapturedPage] = useState<AyWebsCapture | null>(null);

  const homeQuery = useQuery({
    queryKey: ['aywebs', 'home', sessionId],
    enabled: Boolean(sessionId),
    staleTime: 30_000,
    queryFn: ({ signal }) => fetchAyWebsHome(sessionId, { signal }),
  });
  const store = useMemo(
    () => homeQuery.data?.stores.find((item) => item.id === storeId && item.canBrowse) ?? null,
    [homeQuery.data?.stores, storeId],
  );
  const safeHomeUrl = store ? safeAyWebsStartUrl(store.homeUrl, store) : null;
  const open = store
    ? (currentUrl ? safeAyWebsStartUrl(currentUrl, store) : (!requestedUrl ? safeHomeUrl : null))
    : null;
  const source = useMemo(() => (open ? { uri: open } : { uri: '' }), [open]);

  useEffect(() => {
    if (!store) return;
    const start = requestedUrl ? safeAyWebsStartUrl(requestedUrl, store) : safeAyWebsStartUrl(store.homeUrl, store);
    if (!start) {
      setCurrentUrl('');
      setAddress(requestedUrl);
      setNavigationWarning(t('aywebs.browser.navigationBlocked'));
      return;
    }
    setCurrentUrl(start);
    setAddress(start);
    setLoaded(false);
    setNavigationWarning('');
  }, [requestedUrl, store, t]);

  useEffect(() => () => {
    if (captureTimer.current) clearTimeout(captureTimer.current);
    if (captureRetryTimer.current) clearTimeout(captureRetryTimer.current);
    captureCycleId.current += 1;
    captureBusyRef.current = false;
    activeRequestId.current = '';
  }, []);

  const cancelPendingCapture = useCallback(() => {
    if (captureTimer.current) clearTimeout(captureTimer.current);
    if (captureRetryTimer.current) clearTimeout(captureRetryTimer.current);
    captureTimer.current = null;
    captureRetryTimer.current = null;
    activeRequestId.current = '';
    captureRetryCount.current = 0;
    captureCycleId.current += 1;
    if (captureBusyRef.current) {
      captureBusyRef.current = false;
      setCaptureBusy(false);
    }
  }, []);

  const goToAddress = useCallback(() => {
    Keyboard.dismiss();
    setCaptureError('');
    if (!store) return;
    const normalized = normalizeAyWebsUrl(address);
    if (!normalized || !isAllowedAyWebsMerchantUrl(normalized, store)) {
      setNavigationWarning(t('aywebs.browser.navigationBlocked'));
      return;
    }
    cancelPendingCapture();
    setNavigationWarning('');
    setLoaded(false);
    setCurrentUrl(normalized);
  }, [address, cancelPendingCapture, store, t]);

  const injectCapture = useCallback(() => {
    if (!webViewRef.current || !scriptRef.current) throw new Error('WEBVIEW_NOT_READY');
    if (captureTimer.current) clearTimeout(captureTimer.current);
    const requestId = Crypto.randomUUID();
    activeRequestId.current = requestId;
    captureBusyRef.current = true;
    setCaptureBusy(true);
    captureTimer.current = setTimeout(() => {
      captureTimer.current = null;
      activeRequestId.current = '';
      captureBusyRef.current = false;
      setCaptureBusy(false);
      setCaptureError(t('aywebs.browser.capture.timeout'));
    }, CAPTURE_RESPONSE_TIMEOUT_MS);
    webViewRef.current.injectJavaScript(buildAyWebsCaptureInjection(scriptRef.current, requestId));
  }, [t]);

  const capturePage = useCallback(async () => {
    if (!store || !sessionId || !currentUrl || !homeQuery.data?.features.captureEnabled || captureBusyRef.current) return;
    if (captureRetryTimer.current) clearTimeout(captureRetryTimer.current);
    captureRetryTimer.current = null;
    captureRetryCount.current = 0;
    const cycleId = ++captureCycleId.current;
    setCaptureError('');
    setNavigationWarning('');
    setCaptureBusy(true);
    captureBusyRef.current = true;
    try {
      if (!scriptRef.current) scriptRef.current = await fetchAyWebsCaptureScript();
      if (cycleId !== captureCycleId.current) return;
      injectCapture();
    } catch (error) {
      if (cycleId !== captureCycleId.current) return;
      if (captureTimer.current) clearTimeout(captureTimer.current);
      if (captureRetryTimer.current) clearTimeout(captureRetryTimer.current);
      captureTimer.current = null;
      captureRetryTimer.current = null;
      activeRequestId.current = '';
      captureBusyRef.current = false;
      setCaptureBusy(false);
      setCaptureError(ayWebsErrorMessage(error, locale, t));
    }
  }, [currentUrl, homeQuery.data?.features.captureEnabled, injectCapture, locale, sessionId, store, t]);

  const onMessage = useCallback(async (event: { nativeEvent: { data: string } }) => {
    const message = parseAyWebsCaptureMessage(event.nativeEvent.data);
    if (!captureBusyRef.current || !activeRequestId.current || message.requestId !== activeRequestId.current) return;
    const cycleId = captureCycleId.current;
    if (captureTimer.current) clearTimeout(captureTimer.current);
    captureTimer.current = null;
    activeRequestId.current = '';
    if (!message.ok) {
      captureBusyRef.current = false;
      setCaptureBusy(false);
      const key = SCRIPT_FAILURE_COPY[message.code] ?? 'aywebs.browser.capture.badData';
      setCaptureError(t(key as never));
      return;
    }
    if (!store || !sessionId || !isAllowedAyWebsMerchantUrl(message.capture.url, store)) {
      captureBusyRef.current = false;
      setCaptureBusy(false);
      setCaptureError(t('aywebs.browser.navigationBlocked'));
      return;
    }
    const captureUrl = normalizeAyWebsUrl(message.capture.url);
    if (!captureUrl) {
      captureBusyRef.current = false;
      setCaptureBusy(false);
      setCaptureError(t('aywebs.browser.capture.badData'));
      return;
    }
    if (shouldRetryAyWebsCaptureForPrice(message.capture.priceCandidates, captureRetryCount.current)) {
      captureRetryCount.current += 1;
      captureRetryTimer.current = setTimeout(() => {
        captureRetryTimer.current = null;
        if (cycleId !== captureCycleId.current) return;
        try {
          injectCapture();
        } catch (error) {
          if (captureTimer.current) clearTimeout(captureTimer.current);
          captureTimer.current = null;
          activeRequestId.current = '';
          captureBusyRef.current = false;
          setCaptureBusy(false);
          setCaptureError(ayWebsErrorMessage(error, locale, t));
        }
      }, AYWEBS_CAPTURE_EMPTY_PRICE_RETRY_DELAY_MS);
      return;
    }
    try {
      // Add est une intention explicite : contourner le mémo d'échec et relire
      // le prix marchand au lieu de rouvrir une ancienne réponse à 0,00.
      const result = await resolveAyWebsProduct({
        url: captureUrl,
        storeId: store.id,
        sessionId,
        capture: message.capture,
        refresh: true,
      });
      if (cycleId !== captureCycleId.current) return;
      if (result.product.storeId !== store.id || !isAllowedAyWebsMerchantUrl(result.product.sourceUrl, store)) {
        setCaptureError(t('aywebs.browser.capture.badData'));
        return;
      }
      if (!hasVerifiedAyWebsQuote(result.product, result.quoteToken)) {
        // Ne jamais ouvrir la feuille d'options avec « 0,00 » ou un prix/devise
        // que le serveur n'a pas vérifiés.
        setCaptureError(t('aywebs.error.captureIncomplete'));
        return;
      }
      setCapturedPage(message.capture);
      setResolved(result);
    } catch (error) {
      if (cycleId !== captureCycleId.current) return;
      setCaptureError(ayWebsErrorMessage(error, locale, t));
    } finally {
      if (cycleId === captureCycleId.current) {
        captureBusyRef.current = false;
        setCaptureBusy(false);
      }
    }
  }, [injectCapture, locale, sessionId, store, t]);

  const onShouldStartLoadWithRequest = useCallback((request: { url: string; isTopFrame?: boolean }) => {
    // Ignore only non-top-frame navigations when WebKit identifies them. The
    // page and any top-level redirect must remain on the selected store.
    if (request.isTopFrame === false) return true;
    if (!store || !isAllowedAyWebsMerchantUrl(request.url, store)) {
      setNavigationWarning(t('aywebs.browser.navigationBlocked'));
      return false;
    }
    setNavigationWarning('');
    return true;
  }, [store, t]);

  const onNavigationStateChange = useCallback((navigation: { url: string; loading: boolean }) => {
    if (navigation.url && store && isAllowedAyWebsMerchantUrl(navigation.url, store)) {
      const normalized = normalizeAyWebsUrl(navigation.url);
      if (normalized) {
        if (normalized !== currentUrl) cancelPendingCapture();
        setCurrentUrl(normalized);
        setAddress(normalized);
      }
    }
    setLoaded(!navigation.loading);
  }, [cancelPendingCapture, currentUrl, store]);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/aywebs' as never);
  };

  if (!sessionId || homeQuery.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.canvas, paddingTop: insets.top + 24 }]}>
        <ActivityIndicator color={theme.colors.accentText} />
        <AppText variant="caption" color={theme.colors.muted}>{t('loading.server')}</AppText>
      </View>
    );
  }

  if (homeQuery.isError) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.canvas, padding: 24, paddingTop: insets.top + 24 }]}>
        <ErrorBlock error={homeQuery.error} onRetry={() => { void homeQuery.refetch(); }} />
        <Button label={t('common.back')} tone="quiet" onPress={back} />
      </View>
    );
  }

  if (!store) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.canvas, padding: 24, paddingTop: insets.top + 24 }]}>
        <Ionicons name="alert-circle-outline" size={32} color={theme.status.danger.fg} accessibilityElementsHidden />
        <AppText variant="label" color={theme.status.danger.fg} align="center">{t('aywebs.browser.storeMissing')}</AppText>
        <Button label={t('common.back')} tone="quiet" onPress={back} />
      </View>
    );
  }

  const captureEnabled = store.captureSupported
    && homeQuery.data?.features.enabled === true
    && homeQuery.data.features.captureEnabled === true;
  const webViewProps = {
    ref: webViewRef,
    source: source ?? { uri: '' },
    style: styles.webView,
    originWhitelist: ['https://*'],
    javaScriptEnabled: true,
    domStorageEnabled: true,
    sharedCookiesEnabled: false,
    thirdPartyCookiesEnabled: false,
    allowFileAccess: false,
    allowFileAccessFromFileURLs: false,
    allowUniversalAccessFromFileURLs: false,
    mixedContentMode: 'never' as const,
    setSupportMultipleWindows: false,
    javaScriptCanOpenWindowsAutomatically: false,
    mediaPlaybackRequiresUserAction: true,
    onMessage,
    onShouldStartLoadWithRequest,
    onNavigationStateChange,
    onLoadStart: () => setLoaded(false),
    onLoadEnd: () => setLoaded(true),
    onError: () => { setLoaded(true); setNavigationWarning(t('aywebs.browser.loadError')); },
    onHttpError: () => { setLoaded(true); setNavigationWarning(t('aywebs.browser.loadError')); },
    testID: 'aywebs-merchant-webview',
  } satisfies NativeWebViewProps & { ref: Ref<MerchantWebViewCommandRef> };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.canvas, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.line, backgroundColor: theme.colors.canvas }]}>
        <View style={styles.titleRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={back}
            style={[styles.back, { minWidth: theme.geometry.minTarget, minHeight: theme.geometry.minTarget }]}
          >
            <Ionicons name={theme.isRTL ? 'arrow-forward' : 'arrow-back'} size={22} color={theme.colors.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppText variant="label" weight="bold" numberOfLines={1}>{store.displayName}</AppText>
            <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>{t('aywebs.browser.secure')}</AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={back}
            style={[styles.back, { minWidth: theme.geometry.minTarget, minHeight: theme.geometry.minTarget }]}
          >
            <Ionicons name="close" size={22} color={theme.colors.ink} />
          </Pressable>
        </View>
        <View style={[styles.addressRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          <View style={{ flex: 1 }}>
            <Field
              value={address}
              onChangeText={(value) => { setAddress(value); setNavigationWarning(''); }}
              label={t('aywebs.browser.address')}
              placeholder={t('aywebs.browser.addressPlaceholder')}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={goToAddress}
              testID="aywebs-browser-address"
            />
          </View>
          <Button label={t('aywebs.browser.go')} tone="quiet" onPress={goToAddress} disabled={!address.trim()} />
        </View>
        {navigationWarning ? <AppText variant="caption" color={theme.status.warning.fg}>{navigationWarning}</AppText> : null}
      </View>

      <View style={styles.webArea}>
        {Platform.OS === 'web' ? (
          <View style={styles.center}>
            <Ionicons name="phone-portrait-outline" size={30} color={theme.colors.muted} accessibilityElementsHidden />
            <AppText variant="body" color={theme.colors.muted} align="center">{t('aywebs.browser.mobileOnly')}</AppText>
          </View>
        ) : open ? (
          <MerchantWebView {...webViewProps} />
        ) : (
          <View style={styles.center}>
            <Ionicons name="lock-closed-outline" size={30} color={theme.status.warning.fg} accessibilityElementsHidden />
            <AppText variant="body" color={theme.status.warning.fg} align="center">{t('aywebs.browser.navigationBlocked')}</AppText>
          </View>
        )}
        {!loaded && Platform.OS !== 'web' ? (
          <View pointerEvents="none" style={[styles.loadingOverlay, { backgroundColor: theme.colors.canvas }]}>
            <ActivityIndicator color={theme.colors.accentText} />
            <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.browser.loading')}</AppText>
          </View>
        ) : null}
      </View>
      {captureError ? (
        <View style={[styles.notice, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
          <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{captureError}</AppText>
          <Pressable accessibilityRole="button" onPress={() => setCaptureError('')}>
            <AppText variant="caption" weight="bold" color={theme.colors.accentText}>{t('common.close')}</AppText>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, theme.space[2]), borderTopColor: theme.colors.line, backgroundColor: theme.colors.canvas }]}>
        <Button
          label={t('aywebs.addToCart')}
          busy={captureBusy}
          disabled={!captureEnabled || !loaded || Platform.OS === 'web' || !open}
          tone="main"
          block
          onPress={() => { void capturePage(); }}
          leading={<Ionicons name="pricetags-outline" size={18} color={theme.colors.onAction} />}
          testID="aywebs-capture-product"
        />
        {!captureEnabled ? <AppText variant="caption" color={theme.colors.muted} align="center">{t('aywebs.disabled.capture')}</AppText> : null}
      </View>

      {resolved ? (
        <AddToCartSheet
          visible
          resolved={resolved}
          capture={capturedPage}
          sessionId={sessionId}
          onContinueShopping={() => { setResolved(null); setCapturedPage(null); }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { alignItems: 'center', justifyContent: 'center' },
  addressRow: { alignItems: 'flex-end', gap: 8 },
  webArea: { flex: 1, position: 'relative' },
  webView: { flex: 1 },
  loadingOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 10 },
  footer: { paddingTop: 10, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notice: { marginHorizontal: 12, marginVertical: 6, padding: 12, borderWidth: 1, borderRadius: 12, gap: 8 }
});
