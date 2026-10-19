/**
 * AYWEBs — الواجهة الرئيسية: «رابط → تحليل → فتح المتجر»، سلّة، ثم قائمة المتاجر.
 *
 * التطبيق ما يحسبش سعراً، وما يعرضش رقماً من عندو، وما يدّعيش نجاحاً:
 * كل رقم هنا جاء من الخادم، وكل حالة (مُتحقَّق / ما تأكّدناش) مكتوبة بصراحة.
 *
 * الدخول للمتجر مباشرة: كل متجر في القائمة يفتح صفحته الرئيسية داخل التطبيق
 * (انظر `features/aywebs/storeEntry.ts`). الزر المعطّل يقول السبب.
 */
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppScreen } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import { AppText, Button, Card, Field, KeyValue, SectionHeader } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import {
  analyzeAyWebsPage, ayWebsNeedsHumanRequest, fetchAyWebsCart, fetchAyWebsStores,
  resolveAyWebsProductWithCapture, type AyWebsPageAnalysis, type AyWebsResolveOutcome, type AyWebsStore,
} from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import { storeEntryTarget, type StoreEntryTarget } from '@/features/aywebs/storeEntry';
import { useSessionId } from '@/session/session';

/** وجهة فتح الصفحة في التطبيق، إن سمح الخادم بالتصفّح. */
function openTargetOf(result: AyWebsPageAnalysis): StoreEntryTarget | null {
  const canOpen = result.browseAllowed || result.captureAllowed || result.externalCaptureAllowed;
  if (!canOpen) return null;
  const canCapture = result.captureAllowed || result.externalCaptureAllowed;
  return {
    pathname: '/aywebs/browser',
    params: {
      url: result.url,
      storeId: result.storeId || '',
      storeName: result.storeName || '',
      capture: canCapture ? '1' : '0',
    },
  };
}

export default function AyWebsScreen() {
  const t = useT();
  const theme = useTheme();
  const sessionId = useSessionId();

  const [url, setUrl] = useState('');
  const [analysis, setAnalysis] = useState<AyWebsPageAnalysis | null>(null);
  const [outcome, setOutcome] = useState<AyWebsResolveOutcome | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const stores = useQuery({
    queryKey: ['aywebs', 'stores'],
    queryFn: ({ signal }) => fetchAyWebsStores({ signal }),
    staleTime: 5 * 60_000,
  });

  const cart = useQuery({
    queryKey: ['aywebs', 'cart', sessionId],
    queryFn: ({ signal }) => fetchAyWebsCart({ sessionId, signal }),
    enabled: Boolean(sessionId),
    staleTime: 30_000,
  });
  const cartLines = cart.data?.items.length ?? 0;

  const analyze = useMutation({
    mutationFn: (target: string) => analyzeAyWebsPage(target, { sessionId }),
    onSuccess: (result) => {
      setAnalysis(result);
      // رابط جديد = منتوج جديد: نمسح نتيجة الرابط القديم باش ما يبقاش
      // سعر منتوج فوق تحليل منتوج آخر.
      setOutcome(null);
    },
  });

  /**
   * النداء الوحيد للسعر: يرجّع البطاقة **وفاتورة السعر الموقّعة**
   * (`quote_token`) — وهي اللي تخلي الإضافة للسلّة بلا إعادة قراءة التاجر.
   */
  const resolve = useMutation({
    mutationFn: (target: string) => resolveAyWebsProductWithCapture(target, {
      sessionId,
      storeId: analysis?.storeId || undefined,
    }),
    onSuccess: setOutcome,
  });
  const product = outcome?.product ?? null;

  const reload = useCallback(() => { stores.refetch(); }, [stores]);

  const trimmed = url.trim();
  const ready = Boolean(sessionId) && trimmed.length > 0;
  const canOpenAnalysis = analysis ? openTargetOf(analysis) : null;

  const availabilityText = (state: string) => {
    if (state === 'AVAILABLE') return t('aywebs.avail.AVAILABLE');
    if (state === 'OUT_OF_STOCK') return t('aywebs.avail.OUT_OF_STOCK');
    return t('aywebs.avail.UNKNOWN');
  };

  const purchaseText = (mode: string) => {
    if (mode === 'SUPPORTED') return t('aywebs.purchase.SUPPORTED');
    if (mode === 'URL_REQUEST') return t('aywebs.purchase.URL_REQUEST');
    return t('aywebs.purchase.MANUAL_REVIEW');
  };

  /** «Analyser et ouvrir la boutique»: التحليل، ثم فتح الصفحة فوراً إن سمح الخادم. */
  const analyzeAndOpen = () => {
    analyze.mutate(trimmed, {
      onSuccess: (result) => {
        const target = openTargetOf(result);
        if (target) router.push(target);
      },
    });
  };

  const renderStore = (store: AyWebsStore) => {
    const target = storeEntryTarget(store);
    const enabled = Boolean(target) && Boolean(sessionId);
    const name = store.displayName || store.name;
    const logo = mediaUrl(store.logo);
    return (
      <Pressable
        key={store.id}
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityState={{ disabled: !enabled }}
        accessibilityHint={target ? undefined : t('aywebs.storeEnterUnavailable')}
        disabled={!enabled}
        onPress={() => { if (target) router.push(target); }}
        testID={`aywebs-store-${store.id}`}
        style={({ pressed }) => [
          styles.storeRow,
          {
            flexDirection: rowDirectionFor(theme.isRTL),
            borderColor: theme.colors.line,
            opacity: enabled ? (pressed ? 0.85 : 1) : 0.5,
          },
        ]}
      >
        <View style={styles.logoBox}>
          {logo ? (
            <AppImage uri={logo} style={styles.logo} contentFit="contain" accessibilityLabel={name} />
          ) : (
            <AppText variant="lead" weight="bold">{name.slice(0, 1)}</AppText>
          )}
        </View>
        <View style={styles.storeText}>
          <AppText variant="lead" weight="bold">{name}</AppText>
          <AppText variant="caption" color={theme.colors.muted}>
            {[store.country, store.currency].filter(Boolean).join(' · ')}
          </AppText>
          {!target ? (
            <AppText variant="caption" color={theme.status.danger.fg}>{t('aywebs.storeEnterUnavailable')}</AppText>
          ) : !store.operational ? (
            <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.storeNotOperational')}</AppText>
          ) : null}
        </View>
        <Ionicons
          name={theme.isRTL ? 'chevron-back' : 'chevron-forward'}
          size={20}
          color={theme.colors.muted}
          accessibilityElementsHidden
        />
      </Pressable>
    );
  };

  return (
    <AppScreen
      overlayHeader={({ scrolled }) => <AppHeader scrolled={scrolled} />}
      hasBottomBar
      chrome onRefresh={reload} refreshing={stores.isFetching && !stores.isPending}>

      {/*
        رسالة القسم — هاذا النصّ كان يعيش في هيدر `Screen` القديم.
        صار `SectionHeader` (§18.2-3): نفس المحتوى، بمكوّن موحّد.
      */}
      <SectionHeader title={t('screen.aywebs.subtitle')} hint={t('screen.aywebs.body')} />

      <Card title={t('aywebs.analyzeCardTitle')} hint={t('aywebs.analyzeCardHint')}>
        <Field
          label={t('aywebs.linkLabel')}
          accessibilityLabel={t('aywebs.linkLabel')}
          value={url}
          onChangeText={setUrl}
          placeholder="https://…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
        />
        <Button
          label={t('aywebs.analyzeOpen')}
          onPress={analyzeAndOpen}
          busy={analyze.isPending}
          disabled={!ready}
          testID="aywebs-analyze"
        />
        <Button
          label={t('aywebs.resolve')}
          tone="quiet"
          onPress={() => resolve.mutate(trimmed)}
          busy={resolve.isPending}
          disabled={!ready}
          testID="aywebs-resolve"
        />
        {!sessionId ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.sessionPending')}</AppText>
        ) : null}
      </Card>

      {analyze.isError ? (
        <ErrorBlock error={analyze.error} onRetry={() => analyze.mutate(trimmed)} />
      ) : null}

      {analysis ? (
        <Card title={t('aywebs.analysisTitle')}>
          <KeyValue
            label={t('aywebs.store')}
            value={analysis.storeName || analysis.storeId || t('aywebs.unknownStore')}
          />
          <KeyValue
            label={t('aywebs.pageType')}
            value={analysis.isProductPage ? t('aywebs.pageProduct') : t('aywebs.pageOther')}
          />
          <KeyValue
            label={t('aywebs.capture')}
            value={analysis.captureAllowed || analysis.externalCaptureAllowed
              ? t('aywebs.captureAllowed')
              : t('aywebs.captureBlocked')}
          />
          {analysis.fallback ? (
            <AppText variant="caption" color={theme.colors.muted}>
              {t('aywebs.serverNote')} : {analysis.fallback}
            </AppText>
          ) : null}
          {canOpenAnalysis ? (
            <Button
              label={t('aywebs.openBrowser')}
              tone="quiet"
              onPress={() => router.push(canOpenAnalysis)}
            />
          ) : null}
          {/* متجر موش في القائمة: بدل «ما نعرفوش»، طلب إضافة متجر بعلّة واضحة. */}
          {!analysis.registered ? (
            <Button
              label={t('aywebs.openStoreRequest')}
              tone="quiet"
              onPress={() => router.push({
                pathname: '/aywebs/store-request',
                params: { url: analysis.url, storeName: analysis.storeName },
              })}
            />
          ) : null}
        </Card>
      ) : null}

      {resolve.isError ? (
        <ErrorBlock error={resolve.error} onRetry={() => resolve.mutate(trimmed)} />
      ) : null}

      {product ? (
        <Card title={t('aywebs.productTitle')} hint={product.sourceDomain || product.storeName}>
          {product.images[0] ? (
            <AppImage
              uri={mediaUrl(product.images[0])}
              style={styles.image}
              contentFit="contain"
              accessibilityLabel={product.title}
            />
          ) : null}
          <AppText variant="lead" weight="bold">{product.title}</AppText>
          {product.brand ? (
            <AppText variant="caption" color={theme.colors.muted}>{product.brand}</AppText>
          ) : null}

          {product.ayroviPricing?.totalTnd != null ? (
            <KeyValue
              label={t('aywebs.totalTnd')}
              value={`${product.ayroviPricing.totalTnd.toFixed(2)} TND`}
            />
          ) : null}
          <KeyValue
            label={t('aywebs.sourcePrice')}
            value={product.price != null ? `${product.price} ${product.currency}`.trim() : t('aywebs.noPrice')}
          />
          {product.ayroviPricing?.totalTnd == null ? (
            <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.noQuote')}</AppText>
          ) : null}

          <KeyValue label={t('aywebs.availability')} value={availabilityText(product.availability.state)} />
          <KeyValue
            label={t('aywebs.priceVerified')}
            value={product.priceVerified ? t('aywebs.verifiedYes') : t('aywebs.verifiedNo')}
          />
          <KeyValue
            label={t('aywebs.currencyVerified')}
            value={product.currencyVerified ? t('aywebs.verifiedYes') : t('aywebs.verifiedNo')}
          />
          <KeyValue label={t('aywebs.purchaseMode')} value={purchaseText(product.purchaseMode)} />
          {product.variantGroups.map((group) => (
            <KeyValue
              key={group.attribute}
              label={group.attribute}
              value={group.values.join(' · ')}
            />
          ))}
          {product.fromCache ? (
            <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.fromCache')}</AppText>
          ) : null}
          {outcome?.missing.length ? (
            <AppText variant="caption" color={theme.colors.muted}>
              {t('aywebs.serverNote')} : {outcome.missing.join(', ')}
            </AppText>
          ) : null}
          {/* «Add to Cart»: يفتح ورقة الاختيار. الإضافة الحقيقية في الورقة —
              نيّة فقط تخرج من الجهاز، والخادم هو اللي يكتب السطر ويحسب الثمن. */}
          {/* Tous les modes : `MANUAL_REVIEW` (boutique sans achat automatisé) s'ajoute
              aussi au panier — l'achat passe alors par la revue humaine côté serveur. */}
          <Button
            label={t('aywebs.addToCart')}
            onPress={() => setSheetOpen(true)}
            disabled={!sessionId}
          />
          {/* متجر ما يسمحش بالشراء المباشر: الطلب يمشي لمراجعة بشرية — بالكلمات،
              بلا ما نوعدو بالمستحيل. */}
          {ayWebsNeedsHumanRequest(product.purchaseMode) ? (
            <>
              <AppText variant="caption" color={theme.colors.muted}>
                {t('aywebs.purchaseMode')} : {purchaseText(product.purchaseMode)}
              </AppText>
              <Button
                label={t('aywebs.openPurchaseRequest')}
                onPress={() => router.push({
                  pathname: '/aywebs/request',
                  params: { url: product.sourceUrl, title: product.title, storeId: product.storeId },
                })}
              />
            </>
          ) : null}
        </Card>
      ) : null}

      {product ? (
        <AddToCartSheet
          visible={sheetOpen}
          sessionId={sessionId}
          product={product}
          options={product.variantDetails}
          quoteToken={outcome?.quoteToken}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}

      <Card title={t('aywebs.cartCardTitle')}>
        <AppText variant="body" color={theme.colors.muted}>
          {t('aywebs.cartCardCount', { count: cartLines })}
        </AppText>
        <Button
          label={t('aywebs.cartBridgeOpen')}
          tone="quiet"
          onPress={() => router.push('/aywebs/cart')}
          testID="aywebs-open-cart"
        />
      </Card>

      <SectionHeader title={t('aywebs.chooseStore')} hint={t('aywebs.chooseStoreHint')} />
      <Button
        label={t('aywebs.stores.open')}
        tone="quiet"
        onPress={() => router.push('/aywebs/stores')}
        testID="aywebs-open-stores"
      />
      {stores.isPending ? (
        <LoadingBlock labelKey="loading.stores" />
      ) : stores.isError ? (
        <ErrorBlock error={stores.error} onRetry={reload} />
      ) : (stores.data ?? []).filter((store) => store.enabled).length === 0 ? (
        <EmptyBlock>{t('aywebs.storesEmpty')}</EmptyBlock>
      ) : (
        (stores.data ?? []).filter((store) => store.enabled).map(renderStore)
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: 260 },
  storeRow: {
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    minHeight: 72,
  },
  logoBox: { width: 64, height: 44, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 64, height: 44 },
  storeText: { flex: 1, gap: 2 },
});
