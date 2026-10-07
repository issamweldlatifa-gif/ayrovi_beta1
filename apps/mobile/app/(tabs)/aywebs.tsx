/**
 * AYWEBs — P3، الشريحة 1: «رابط → تحليل → سعر بالدينار».
 *
 * الفكرة كما في الموقع بالضبط: المستعمل يلصق رابط، والقرار الكل متاع الخادم.
 * التطبيق ما يحسبش سعراً، وما يعرضش رقماً من عندو، وما يدّعيش نجاحاً:
 * كل رقم هنا جاء من الخادم، وكل حالة (مُتحقَّق / ما تأكّدناش) مكتوبة بصراحة.
 *
 * اللي مازال: فتح صفحة المتجر داخل WebView مع الكابتشر (الشريحة 2)، ثم
 * الخيارات والسلّة (الشريحة 3). الأزرار هِنا كلها تخدم فعلاً — ما فماش زر
 * يعلن مرحلة فارغة.
 */
import { useCallback, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';

import { AppText, Button, Card, Field, KeyValue, Screen } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import {
  analyzeAyWebsPage, ayWebsNeedsHumanRequest, fetchAyWebsStores, resolveAyWebsProductWithCapture,
  type AyWebsPageAnalysis, type AyWebsResolveOutcome,
} from '@/api/aywebs';
import { AddToCartSheet } from '@/features/aywebs/AddToCartSheet';
import { useAyWebsSessionId } from '@/features/aywebs/session';

export default function AyWebsScreen() {
  const t = useT();
  const theme = useTheme();
  const sessionId = useAyWebsSessionId();

  const [url, setUrl] = useState('');
  const [analysis, setAnalysis] = useState<AyWebsPageAnalysis | null>(null);
  const [outcome, setOutcome] = useState<AyWebsResolveOutcome | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const stores = useQuery({
    queryKey: ['aywebs', 'stores'],
    queryFn: ({ signal }) => fetchAyWebsStores({ signal }),
    staleTime: 5 * 60_000,
  });

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
  /* فتح الصفحة داخل التطبيق: مفيد للتصفّح، وللكابتشر كي يسمح بيه الخادم
     للتحليل (`capture_allowed` / `external_capture_allowed`). */
  const canOpen = Boolean(analysis) && (analysis!.browseAllowed || analysis!.captureAllowed || analysis!.externalCaptureAllowed);
  const canCapture = Boolean(analysis) && (analysis!.captureAllowed || analysis!.externalCaptureAllowed);

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

  return (
    <Screen tab="aywebs" phase="P3" onRefresh={reload} refreshing={stores.isFetching && !stores.isPending}>
      <Card title={t('aywebs.linkTitle')} hint={t('aywebs.linkHint')}>
        <Field
          label={t('aywebs.linkLabel')}
          value={url}
          onChangeText={setUrl}
          placeholder="https://www.amazon.com/dp/…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
        />
        <View style={styles.row}>
          <Button
            label={t('aywebs.analyze')}
            onPress={() => analyze.mutate(trimmed)}
            busy={analyze.isPending}
            disabled={!ready}
            tone="quiet"
          />
          <Button
            label={t('aywebs.resolve')}
            onPress={() => resolve.mutate(trimmed)}
            busy={resolve.isPending}
            disabled={!ready}
          />
        </View>
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
          {canOpen ? (
            <Button
              label={t('aywebs.openBrowser')}
              tone="quiet"
              onPress={() => router.push({
                pathname: '/aywebs/browser',
                params: {
                  url: analysis.url,
                  storeId: analysis.storeId,
                  capture: canCapture ? '1' : '0',
                },
              })}
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
            <Image source={{ uri: mediaUrl(product.images[0]) }} style={styles.image} resizeMode="contain" />
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
          {product.purchaseMode === 'SUPPORTED' || product.purchaseMode === '' ? (
            <Button
              label={t('aywebs.addToCart')}
              onPress={() => setSheetOpen(true)}
              disabled={!sessionId}
            />
          ) : null}
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

      <Card title={t('aywebs.storesTitle')} hint={t('aywebs.storesHint')}>
        {stores.isPending ? (
          <LoadingBlock label={{ fr: 'Chargement des boutiques…', ar: 'جارٍ تحميل المتاجر…' }} />
        ) : stores.isError ? (
          <ErrorBlock error={stores.error} onRetry={reload} />
        ) : (stores.data ?? []).length === 0 ? (
          <EmptyBlock>{t('aywebs.storesEmpty')}</EmptyBlock>
        ) : (
          (stores.data ?? []).map((store) => (
            <KeyValue
              key={store.id}
              label={store.displayName || store.name}
              value={store.operational ? t('aywebs.storeOperational') : t('aywebs.storeNotOperational')}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  image: { width: '100%', height: 180, marginBottom: 8 },
});
