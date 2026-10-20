/**
 * AYWEBs — native shopping bridge. Store data and page analysis are server-led;
 * merchant browsing is opened only after validating the selected store's hosts.
 */
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppScreen } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import { AppText, Button, Card, Field, SectionHeader } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { useI18n, useT } from '@/i18n';
import { fetchAyWebsHome, analyzeAyWebsPage, type AyWebsStore } from '@/api/aywebs';
import { mediaUrl } from '@/api/client';
import { useSessionId } from '@/session/session';
import { ayWebsErrorMessage } from '@/features/aywebs/errors';
import { normalizeAyWebsUrl, storeForAyWebsUrl } from '@/features/aywebs/merchantSecurity';

function StoreTile({ store, onPress }: { store: AyWebsStore; onPress: () => void }) {
  const theme = useTheme();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('aywebs.store.open', { store: store.displayName })}
      onPress={onPress}
      style={({ pressed }) => [
        styles.storeTile,
        {
          flexDirection: rowDirectionFor(theme.isRTL),
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.line,
          borderRadius: theme.radius.card,
          minHeight: theme.geometry.minTarget + 16,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
      testID={`aywebs-store-${store.id}`}
    >
      <AppImage
        uri={mediaUrl(store.logo)}
        style={[styles.logo, { borderRadius: theme.radius.control, backgroundColor: theme.colors.canvas }]}
        contentFit="contain"
        accessibilityLabel={store.displayName}
      />
      <View style={styles.storeText}>
        <AppText variant="label" weight="bold" numberOfLines={1}>{store.displayName}</AppText>
        <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>
          {[store.country, store.currency].filter(Boolean).join(' · ')}
        </AppText>
      </View>
      <Ionicons
        name={theme.isRTL ? 'chevron-back' : 'chevron-forward'}
        size={18}
        color={theme.colors.muted}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

export default function AyWebsScreen() {
  const t = useT();
  const theme = useTheme();
  const { locale } = useI18n();
  const sessionId = useSessionId();
  const [url, setUrl] = useState('');
  const [inputError, setInputError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  const homeQuery = useQuery({
    queryKey: ['aywebs', 'home', sessionId],
    enabled: Boolean(sessionId),
    staleTime: 30_000,
    queryFn: ({ signal }) => fetchAyWebsHome(sessionId, { signal }),
  });

  const openBrowser = (store: AyWebsStore, initialUrl?: string) => {
    router.push({
      pathname: '/aywebs/browser',
      params: { storeId: store.id, ...(initialUrl ? { url: initialUrl } : {}) },
    } as never);
  };

  const openPastedUrl = useCallback(async () => {
    setInputError('');
    setAnalysisError('');
    if (!sessionId) return;
    const normalized = normalizeAyWebsUrl(url);
    if (!normalized) {
      setInputError(t('aywebs.link.invalid'));
      return;
    }
    const stores = homeQuery.data?.stores ?? [];
    const store = storeForAyWebsUrl(normalized, stores);
    if (!store) {
      setInputError(t('aywebs.link.unsupported'));
      return;
    }
    if (!store.canBrowse) {
      setInputError(t('aywebs.error.browseBlocked'));
      return;
    }
    setAnalyzing(true);
    try {
      const analysis = await analyzeAyWebsPage({ url: normalized, sessionId });
      if (!analysis.browseAllowed) {
        setAnalysisError(t('aywebs.error.browseBlocked'));
        return;
      }
      // The server analyzes the URL; the app opens only the matching registered
      // merchant, never an arbitrary link in an embedded WebView.
      openBrowser(store, normalized);
    } catch (error) {
      setAnalysisError(ayWebsErrorMessage(error, locale, t));
    } finally {
      setAnalyzing(false);
    }
  }, [homeQuery.data?.stores, locale, sessionId, t, url]);

  const refresh = useCallback(() => { void homeQuery.refetch(); }, [homeQuery]);
  const availableStores = (homeQuery.data?.stores ?? []).filter((store) => store.canBrowse);
  const preferredStores = (homeQuery.data?.popularStores ?? []).filter((store) => store.canBrowse);
  const popularStores = preferredStores.length ? preferredStores : availableStores;

  return (
    <AppScreen
      overlayHeader={({ scrolled }) => <AppHeader scrolled={scrolled} />}
      hasBottomBar
      chrome
      keyboard
      onRefresh={refresh}
      refreshing={homeQuery.isRefetching}
      testID="aywebs-home"
    >
      <SectionHeader title={t('aywebs.title')} hint={t('aywebs.subtitle')} />

      {!sessionId || homeQuery.isLoading ? <LoadingBlock labelKey="loading.server" /> : null}
      {homeQuery.isError ? <ErrorBlock error={homeQuery.error} onRetry={() => { void homeQuery.refetch(); }} /> : null}
      {homeQuery.data && !homeQuery.data.features.enabled ? (
        <Card title={t('aywebs.disabled.title')} hint={t('aywebs.disabled.body')} />
      ) : null}

      {homeQuery.data?.features.enabled ? (
        <>
          <Card title={t('aywebs.link.title')} hint={t('aywebs.link.hint')}>
            <Field
              value={url}
              onChangeText={(value) => { setUrl(value); setInputError(''); setAnalysisError(''); }}
              label={t('aywebs.link.label')}
              placeholder={t('aywebs.link.placeholder')}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={() => { void openPastedUrl(); }}
              accessibilityLabel={t('aywebs.link.label')}
              testID="aywebs-link-input"
            />
            {inputError ? <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{inputError}</AppText> : null}
            {analysisError ? <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{analysisError}</AppText> : null}
            <Button
              label={t('aywebs.link.analyze')}
              busy={analyzing}
              disabled={!url.trim() || !sessionId || homeQuery.isError}
              tone="solid"
              block
              onPress={() => { void openPastedUrl(); }}
              testID="aywebs-analyze-link"
            />
          </Card>

          <Card
            title={t('aywebs.cart.title')}
            hint={t('aywebs.cart.hint', { count: homeQuery.data.cart.itemsCount })}
          >
            <Button
              label={t('aywebs.cart.open')}
              tone="quiet"
              block
              onPress={() => router.push('/(tabs)/cart' as never)}
              leading={<Ionicons name="bag-outline" size={18} color={theme.colors.ink} />}
            />
          </Card>

          <View style={styles.storeSection}>
            <SectionHeader title={t('aywebs.stores.title')} hint={t('aywebs.stores.hint')} />
            {popularStores.length ? (
              <View style={styles.storeList}>
                {popularStores.map((store) => (
                  <StoreTile key={store.id} store={store} onPress={() => openBrowser(store)} />
                ))}
              </View>
            ) : (
              <Card title={t('aywebs.stores.empty')} />
            )}
          </View>

          {homeQuery.data.recentProducts.length ? (
            <Card title={t('aywebs.recent.title')} hint={t('aywebs.recent.hint')}>
              {homeQuery.data.recentProducts.slice(0, 4).map((product) => (
                <Pressable
                  key={product.productId}
                  accessibilityRole="button"
                  onPress={() => {
                    const store = homeQuery.data?.stores.find((candidate) => candidate.id === product.storeId);
                    if (store?.canBrowse) openBrowser(store, product.sourceUrl);
                  }}
                  style={[styles.recent, { borderTopColor: theme.colors.line, flexDirection: rowDirectionFor(theme.isRTL) }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="label" weight="bold" numberOfLines={2}>{product.title}</AppText>
                    <AppText variant="caption" color={theme.colors.muted}>
                      {product.storeName} · {product.pricingTnd === null ? t('aywebs.price.unavailable') : `${product.pricingTnd.toFixed(2)} TND`}
                    </AppText>
                  </View>
                  <Ionicons name={theme.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={theme.colors.muted} accessibilityElementsHidden />
                </Pressable>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  storeSection: { gap: 12 },
  storeList: { gap: 10 },
  storeTile: { alignItems: 'center', gap: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth },
  logo: { width: 46, height: 46 },
  storeText: { flex: 1, gap: 4 },
  recent: { alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
});
