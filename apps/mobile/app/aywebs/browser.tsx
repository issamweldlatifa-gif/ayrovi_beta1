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
import {
  buildAyWebsCaptureInjection,
  buildAyWebsVariantSelectionInjection,
  fetchAyWebsCaptureScript,
  fetchAyWebsHome,
  resolveAyWebsProduct,
  type AyWebsCapture,
  type AyWebsResolvedProduct,
} from '@/api/aywebs';
import { fetchFavorites } from '@/api/account';
import { useSessionId } from '@/session/session';
import { useSession } from '@/state/session';
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
import { StoreCartSheet, StoreFavoriteSheet } from '@/features/aywebs/StoreSheets';
import { isPageSaved } from '@/features/aywebs/storeShopping';
import { decideWebNavigation } from '@/features/aywebs/webNavigation';

const CAPTURE_RESPONSE_TIMEOUT_MS = 15_000;
const SCRIPT_FAILURE_COPY: Record<string, string> = {
  EMPTY: 'aywebs.browser.capture.empty',
  TOO_LARGE: 'aywebs.browser.capture.tooLarge',
  NOT_JSON: 'aywebs.browser.capture.notJson',
  NOT_OBJECT: 'aywebs.browser.capture.notObject',
  SCRIPT_ERROR: 'aywebs.browser.capture.scriptError',
  BAD_CAPTURE: 'aywebs.browser.capture.badData',
};

type MerchantWebViewCommandRef = {
  injectJavaScript: (javascript: string) => void;
  goBack?: () => void;
  goForward?: () => void;
};
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
  const { status: accountStatus } = useSession();
  const params = useLocalSearchParams<{
    storeId?: string | string[];
    storeName?: string | string[];
    url?: string | string[];
  }>();
  const storeId = routeParam(params.storeId);
  const storeNameParam = routeParam(params.storeName);
  const requestedUrl = routeParam(params.url);
  const webViewRef = useRef<MerchantWebViewCommandRef | null>(null);
  const scriptRef = useRef('');
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureRetryCount = useRef(0);
  const captureCycleId = useRef(0);
  const activeRequestId = useRef('');
  const captureBusyRef = useRef(false);
  const capturedPageRef = useRef<AyWebsCapture | null>(null);
  const pendingVariantSelectionRef = useRef<Record<string, string> | null>(null);
  const pendingVariantChangeRef = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null);
  const variantNavigationRef = useRef(false);

  const initialSafeUrl = normalizeAyWebsUrl(requestedUrl) ?? '';
  const [address, setAddress] = useState(initialSafeUrl || requestedUrl);
  const [currentUrl, setCurrentUrl] = useState(initialSafeUrl);
  const [loaded, setLoaded] = useState(false);
  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false, title: '' });
  const [cartOpen, setCartOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
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
    ? (currentUrl ? safeAyWebsStartUrl(currentUrl, store) : (!requestedUrl ? safeHomeUrl : safeAyWebsStartUrl(requestedUrl, store)))
    : normalizeAyWebsUrl(currentUrl || requestedUrl);
  const source = useMemo(() => (open ? { uri: open } : { uri: '' }), [open]);

  const favorites = useQuery({
    queryKey: ['account', 'favorites'],
    queryFn: ({ signal }) => fetchFavorites({ signal }),
    enabled: Boolean(currentUrl) && accountStatus === 'signedIn',
    retry: false,
  });
  const saved = isPageSaved(favorites.data ?? [], currentUrl);
  const displayStoreName = store?.displayName || storeNameParam || t('aywebs.browserTitle');
  const favoriteTitle = resolved?.product.title || nav.title || displayStoreName;

  useEffect(() => {
    if (store) {
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
      return;
    }
    if (requestedUrl) {
      const normalized = normalizeAyWebsUrl(requestedUrl);
      if (!normalized) {
        setCurrentUrl('');
        setAddress(requestedUrl);
        setNavigationWarning(t('aywebs.browser.navigationBlocked'));
        return;
      }
      setCurrentUrl(normalized);
      setAddress(normalized);
      setNavigationWarning('');
    }
  }, [requestedUrl, store, t]);

  useEffect(() => () => {
    if (captureTimer.current) clearTimeout(captureTimer.current);
    if (captureRetryTimer.current) clearTimeout(captureRetryTimer.current);
    captureCycleId.current += 1;
    captureBusyRef.current = false;
    activeRequestId.current = '';
    pendingVariantChangeRef.current?.reject(new Error('CAPTURE_CANCELLED'));
    pendingVariantChangeRef.current = null;
    pendingVariantSelectionRef.current = null;
  }, []);

  const failPendingVariantChange = useCallback((reason = 'VARIANT_SELECTION_UNVERIFIED') => {
    const pending = pendingVariantChangeRef.current;
    pendingVariantChangeRef.current = null;
    pendingVariantSelectionRef.current = null;
    variantNavigationRef.current = false;
    if (captureTimer.current) clearTimeout(captureTimer.current);
    if (captureRetryTimer.current) clearTimeout(captureRetryTimer.current);
    captureTimer.current = null;
    captureRetryTimer.current = null;
    activeRequestId.current = '';
    captureRetryCount.current = 0;
    captureBusyRef.current = false;
    setCaptureBusy(false);
    capturedPageRef.current = null;
    setCapturedPage(null);
    setResolved(null);
    setCaptureError(t('aywebs.variant.refreshFailed'));
    pending?.reject(new Error(reason));
  }, [t]);

  const cancelPendingCapture = useCallback(() => {
    if (captureTimer.current) clearTimeout(captureTimer.current);
    if (captureRetryTimer.current) clearTimeout(captureRetryTimer.current);
    captureTimer.current = null;
    captureRetryTimer.current = null;
    activeRequestId.current = '';
    captureRetryCount.current = 0;
    captureCycleId.current += 1;
    if (pendingVariantChangeRef.current) failPendingVariantChange('CAPTURE_CANCELLED');
    if (captureBusyRef.current) {
      captureBusyRef.current = false;
      setCaptureBusy(false);
    }
  }, [failPendingVariantChange]);

  const goToAddress = useCallback(() => {
    Keyboard.dismiss();
    setCaptureError('');
    const normalized = normalizeAyWebsUrl(address);
    if (!normalized || (store && !isAllowedAyWebsMerchantUrl(normalized, store))) {
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
      if (pendingVariantChangeRef.current) {
        failPendingVariantChange('CAPTURE_TIMEOUT');
        return;
      }
      activeRequestId.current = '';
      captureBusyRef.current = false;
      setCaptureBusy(false);
      setCaptureError(t('aywebs.browser.capture.timeout'));
    }, CAPTURE_RESPONSE_TIMEOUT_MS);
    const selection = pendingVariantSelectionRef.current;
    const captured = capturedPageRef.current;
    const injection = selection
      ? buildAyWebsVariantSelectionInjection(scriptRef.current, requestId, captured?.variantGroups || [], selection)
      : buildAyWebsCaptureInjection(scriptRef.current, requestId);
    webViewRef.current.injectJavaScript(injection);
  }, [failPendingVariantChange, t]);

  const captureEnabled = store
    ? store.captureSupported
      && homeQuery.data?.features.enabled === true
      && homeQuery.data.features.captureEnabled === true
    : homeQuery.data?.features.enabled !== false && homeQuery.data?.features.captureEnabled !== false;

  const capturePage = useCallback(async () => {
    if (!sessionId || !currentUrl || !captureEnabled || captureBusyRef.current) return;
    if (captureRetryTimer.current) clearTimeout(captureRetryTimer.current);
    captureRetryTimer.current = null;
    captureRetryCount.current = 0;
    pendingVariantSelectionRef.current = null;
    variantNavigationRef.current = false;
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
  }, [captureEnabled, currentUrl, injectCapture, locale, sessionId, t]);

  const captureSelectedVariant = useCallback(async (selection: Record<string, string>) => {
    if (!sessionId || !currentUrl || captureBusyRef.current) throw new Error('CAPTURE_BUSY');
    if (!capturedPageRef.current?.variantGroups.length) throw new Error('VARIANT_GROUPS_MISSING');
    if (captureRetryTimer.current) clearTimeout(captureRetryTimer.current);
    captureRetryTimer.current = null;
    captureRetryCount.current = 0;
    pendingVariantSelectionRef.current = { ...selection };
    variantNavigationRef.current = false;
    const cycleId = ++captureCycleId.current;
    let resolveCapture!: () => void;
    let rejectCapture!: (error: Error) => void;
    const completion = new Promise<void>((resolve, reject) => {
      resolveCapture = resolve;
      rejectCapture = reject;
    });
    pendingVariantChangeRef.current = { resolve: resolveCapture, reject: rejectCapture };
    setCaptureError('');
    setCaptureBusy(true);
    captureBusyRef.current = true;
    try {
      if (!scriptRef.current) scriptRef.current = await fetchAyWebsCaptureScript();
      if (cycleId !== captureCycleId.current) {
        failPendingVariantChange('CAPTURE_CANCELLED');
        return completion;
      }
      injectCapture();
    } catch (error) {
      if (cycleId === captureCycleId.current && pendingVariantChangeRef.current) {
        failPendingVariantChange(error instanceof Error ? error.message : 'VARIANT_SELECTION_UNVERIFIED');
      }
    }
    return completion;
  }, [currentUrl, failPendingVariantChange, injectCapture, sessionId]);

  const onMessage = useCallback(async (event: { nativeEvent: { data: string } }) => {
    const message = parseAyWebsCaptureMessage(event.nativeEvent.data);
    if (!captureBusyRef.current || !activeRequestId.current || message.requestId !== activeRequestId.current) return;
    const cycleId = captureCycleId.current;
    const pendingSelection = pendingVariantSelectionRef.current;
    const hasPendingVariantChange = pendingVariantChangeRef.current !== null;
    if (captureTimer.current) clearTimeout(captureTimer.current);
    captureTimer.current = null;
    activeRequestId.current = '';
    if (!message.ok) {
      if (hasPendingVariantChange) {
        failPendingVariantChange('CAPTURE_SCRIPT_FAILED');
        return;
      }
      captureBusyRef.current = false;
      setCaptureBusy(false);
      const key = SCRIPT_FAILURE_COPY[message.code] ?? 'aywebs.browser.capture.badData';
      setCaptureError(t(key as never));
      return;
    }
    if (!sessionId || (store && !isAllowedAyWebsMerchantUrl(message.capture.url, store))) {
      if (hasPendingVariantChange) failPendingVariantChange('CAPTURE_URL_REJECTED');
      else {
        captureBusyRef.current = false;
        setCaptureBusy(false);
        setCaptureError(t('aywebs.browser.navigationBlocked'));
      }
      return;
    }
    const captureUrl = normalizeAyWebsUrl(message.capture.url);
    if (!captureUrl) {
      if (hasPendingVariantChange) failPendingVariantChange('CAPTURE_URL_REJECTED');
      else {
        captureBusyRef.current = false;
        setCaptureBusy(false);
        setCaptureError(t('aywebs.browser.capture.badData'));
      }
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
          if (hasPendingVariantChange) {
            failPendingVariantChange(error instanceof Error ? error.message : 'CAPTURE_FAILED');
            return;
          }
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
      // Une sélection native est suivie d'une nouvelle lecture DOM, jamais d'un
      // prix copié depuis une autre couleur/taille. Le serveur doit confirmer.
      const resolvedStoreId = store?.id || 'generic';
      const result = await resolveAyWebsProduct({
        url: captureUrl,
        storeId: resolvedStoreId,
        sessionId,
        ...(pendingSelection ? { variant: pendingSelection } : {}),
        capture: message.capture,
        refresh: true,
      });
      if (cycleId !== captureCycleId.current) return;
      if (store && (result.product.storeId !== store.id || !isAllowedAyWebsMerchantUrl(result.product.sourceUrl, store))) {
        if (hasPendingVariantChange) failPendingVariantChange('RESOLVED_PRODUCT_MISMATCH');
        else setCaptureError(t('aywebs.browser.capture.badData'));
        return;
      }
      if (pendingSelection) {
        const capturedAttributes = message.capture.selectedVariantAttributes || {};
        const resolvedAttributes = result.product.selectedVariant || {};
        const requestMatchesCapture = Object.entries(pendingSelection).every(([attribute, value]) => (
          String(capturedAttributes[attribute] || '').trim().toLowerCase() === String(value).trim().toLowerCase()
          && String(resolvedAttributes[attribute] || '').trim().toLowerCase() === String(value).trim().toLowerCase()
        ));
        if (!result.captureUsed || !requestMatchesCapture) {
          failPendingVariantChange('VARIANT_SELECTION_NOT_VERIFIED');
          return;
        }
      } else if (!hasVerifiedAyWebsQuote(result.product, result.quoteToken)
        && !result.product.variantGroups.some((group) => group.values.length > 0)) {
        // Sans choix possibles, aucun devis incomplet ne doit ouvrir la feuille.
        setCaptureError(t('aywebs.error.captureIncomplete'));
        return;
      }
      capturedPageRef.current = message.capture;
      setCapturedPage(message.capture);
      setResolved(result);
      captureRetryCount.current = 0;
      if (pendingSelection) {
        const pending = pendingVariantChangeRef.current;
        pendingVariantChangeRef.current = null;
        pendingVariantSelectionRef.current = null;
        variantNavigationRef.current = false;
        pending?.resolve();
      }
    } catch (error) {
      if (cycleId !== captureCycleId.current) return;
      if (hasPendingVariantChange) failPendingVariantChange(error instanceof Error ? error.message : 'CAPTURE_RESOLVE_FAILED');
      else setCaptureError(ayWebsErrorMessage(error, locale, t));
    } finally {
      if (cycleId === captureCycleId.current) {
        captureBusyRef.current = false;
        setCaptureBusy(false);
      }
    }
  }, [failPendingVariantChange, injectCapture, locale, sessionId, store, t]);

  const onShouldStartLoadWithRequest = useCallback((request: { url: string; isTopFrame?: boolean }) => {
    if (request.isTopFrame === false) return true;
    if (decideWebNavigation(request.url) !== 'allow') {
      setNavigationWarning(t('aywebs.blockedScheme'));
      return false;
    }
    if (store && !isAllowedAyWebsMerchantUrl(request.url, store)) {
      setNavigationWarning(t('aywebs.browser.navigationBlocked'));
      return false;
    }
    setNavigationWarning('');
    return true;
  }, [store, t]);

  const onNavigationStateChange = useCallback((navigation: {
    url: string;
    loading: boolean;
    canGoBack?: boolean;
    canGoForward?: boolean;
    title?: string;
  }) => {
    setNav({
      canGoBack: Boolean(navigation.canGoBack),
      canGoForward: Boolean(navigation.canGoForward),
      title: navigation.title ?? '',
    });
    if (navigation.url && (!store || isAllowedAyWebsMerchantUrl(navigation.url, store))) {
      const normalized = normalizeAyWebsUrl(navigation.url);
      if (normalized) {
        if (normalized !== currentUrl) {
          if (pendingVariantSelectionRef.current) variantNavigationRef.current = true;
          else cancelPendingCapture();
        }
        setCurrentUrl(normalized);
        setAddress(normalized);
      }
    }
    if (pendingVariantSelectionRef.current && navigation.loading) variantNavigationRef.current = true;
    setLoaded(!navigation.loading);
  }, [cancelPendingCapture, currentUrl, store]);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/aywebs' as never);
  };

  if (!open && !requestedUrl) {
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
  }

  const webViewProps = {
    ref: webViewRef,
    source: source ?? { uri: '' },
    style: styles.webView,
    originWhitelist: ['*'],
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
    onLoadEnd: () => {
      setLoaded(true);
      if (pendingVariantSelectionRef.current && variantNavigationRef.current) {
        variantNavigationRef.current = false;
        if (captureRetryTimer.current) clearTimeout(captureRetryTimer.current);
        captureRetryTimer.current = setTimeout(() => {
          captureRetryTimer.current = null;
          if (!pendingVariantSelectionRef.current || !captureBusyRef.current) return;
          try { injectCapture(); } catch (error) { failPendingVariantChange(error instanceof Error ? error.message : 'CAPTURE_FAILED'); }
        }, 300);
      }
    },
    onError: () => { setLoaded(true); setNavigationWarning(t('aywebs.browser.loadError')); },
    onHttpError: () => { setLoaded(true); setNavigationWarning(t('aywebs.browser.loadError')); },
    testID: 'webview',
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
            <AppText variant="label" weight="bold" numberOfLines={1}>{displayStoreName}</AppText>
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
        {!captureEnabled ? <AppText variant="caption" color={theme.colors.muted} align="center">{t('aywebs.disabled.capture')}</AppText> : null}
        <View style={[styles.toolbar, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          <ToolIcon
            name={theme.isRTL ? 'chevron-forward' : 'chevron-back'}
            label={t('aywebs.nav.back')}
            disabled={!nav.canGoBack}
            onPress={() => webViewRef.current?.goBack?.()}
            testID="aywebs-store-back"
          />
          <ToolIcon
            name={theme.isRTL ? 'chevron-back' : 'chevron-forward'}
            label={t('aywebs.nav.forward')}
            disabled={!nav.canGoForward}
            onPress={() => webViewRef.current?.goForward?.()}
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
            disabled={!currentUrl}
            active={saved}
            onPress={() => setFavOpen(true)}
            testID="aywebs-store-fav"
          />
          <View style={styles.addBox}>
            <Button
              label={t('aywebs.addToCart')}
              busy={captureBusy}
              disabled={!captureEnabled || !loaded || Platform.OS === 'web' || !open}
              tone="main"
              block
              onPress={() => { void capturePage(); }}
              leading={<Ionicons name="pricetags-outline" size={18} color={theme.colors.onAction} />}
              testID="aywebs-store-add-to-cart"
            />
          </View>
        </View>
      </View>

      {resolved ? (
        <AddToCartSheet
          visible
          resolved={resolved}
          capture={capturedPage}
          sessionId={sessionId}
          onVariantChange={captureSelectedVariant}
          onContinueShopping={() => {
            capturedPageRef.current = null;
            pendingVariantSelectionRef.current = null;
            variantNavigationRef.current = false;
            setResolved(null);
            setCapturedPage(null);
          }}
        />
      ) : null}

      {sessionId ? (
        <StoreCartSheet visible={cartOpen} onClose={() => setCartOpen(false)} sessionId={sessionId} storeId={storeId} />
      ) : null}
      <StoreFavoriteSheet
        visible={favOpen}
        onClose={() => setFavOpen(false)}
        sourceUrl={currentUrl}
        title={favoriteTitle}
        saved={saved}
      />
    </View>
  );
}

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
  header: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { alignItems: 'center', justifyContent: 'center' },
  addressRow: { alignItems: 'flex-end', gap: 8 },
  webArea: { flex: 1, position: 'relative' },
  webView: { flex: 1 },
  loadingOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 10 },
  footer: { paddingTop: 10, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  toolbar: { alignItems: 'center', gap: 2 },
  toolIcon: { alignItems: 'center', justifyContent: 'center' },
  addBox: { flex: 1, marginStart: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notice: { marginHorizontal: 12, marginVertical: 6, padding: 12, borderWidth: 1, borderRadius: 12, gap: 8 },
});
