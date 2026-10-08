/**
 * صفحة المنتوج (Q1، 08/10/2026).
 *
 * القاعدة الذهبية هنا: **كل رقم يبان هو رقم الخادم**. التطبيق ما يجمّعش أتعاب،
 * ولا يحوّل عملة، ولا «يقدّر» سعراً. `finalPrice` يعرض كما هو، وتفاصيله
 * (ديوانة، شحن، خدمة) تعرض كما بعثها الخادم — حتى لو بدت غريبة، لأنّ التفسير
 * قرار الخادم موش قرارنا.
 *
 * والزرّان الموجودان **فقط** ما ينجّم يتنفّذ:
 *   • «افتح عند التاجر» — الرابط من الخادم؛
 *   • «المفضلة» — بـ`productId` (الخادم يقرا الاسم والصورة والسعر من جدوله).
 * وزر «زيد للسلّة» **ما زدناهوش**: إضافة منتوج كتالوج للسلّة تمرّ بحساب سعر
 * ثانٍ في الخادم، ونشر سعرين مختلفين لنفس المنتوج هو بالضبط الكذبة المطبوعة
 * اللي مانعملهاش. مسلك الشراء الكامل = Q5.
 */
import { useCallback } from 'react';
import { Image, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppText, Button, Card, KeyValue } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { addCatalogFavorite, fetchFavorites } from '@/api/account';
import { addCatalogToCart } from '@/api/cart';
import { isApiError } from '@/api/errors';
import { fetchCatalogProducts, normalizeStockStatus } from '@/api/catalog';
import { useSession } from '@/state/session';

export default function ProductScreen() {
  const theme = useTheme();
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  // `status` moّش `authenticated`: واجهة الجلسة تعطي حالة صريحة.
  const signedIn = session.status === 'signedIn';
  const queryClient = useQueryClient();

  const products = useQuery({
    queryKey: ['catalog', 'products', 'all'],
    queryFn: ({ signal }) => fetchCatalogProducts({ signal, limit: 50 }),
    staleTime: 120_000,
  });

  const favorites = useQuery({
    queryKey: ['account', 'favorites'],
    queryFn: ({ signal }) => fetchFavorites({ signal }),
    enabled: signedIn,
  });

  const product = (products.data ?? []).find((entry) => entry.id === id) ?? null;
  const isFavorite = (favorites.data ?? []).some((entry) => entry.productId === id);

  /**
   * «زيد للسلّة» — كان ممنوعاً في Q1، وتحرّر في Q5.
   *
   * السبب اللي كان يمنعو: المسار العام للسلّة **يعيد حساب** السعر من
   * `sourcePrice` ⇒ سعر ثانٍ لنفس المنتوج. توّا `/api/cart/catalog` يستعمل
   * `final_price` المنشور ⇒ **سعر واحد**، هو سعر المتجر، `VERIFIED`.
   */
  const addToCart = useMutation({
    mutationFn: () => addCatalogToCart({ productId: String(id) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });

  const favorite = useMutation({
    mutationFn: () => addCatalogFavorite(String(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', 'favorites'] });
      queryClient.invalidateQueries({ queryKey: ['account'] });
    },
  });

  const openSource = useCallback(() => {
    if (!product?.sourceUrl) return;
    Linking.openURL(product.sourceUrl).catch(() => null);
  }, [product?.sourceUrl]);

  if (products.isPending) {
    return (
      <SubScreen title={t('catalog.title')}>
        <LoadingBlock />
      </SubScreen>
    );
  }

  if (products.isError) {
    return (
      <SubScreen title={t('catalog.title')} onRefresh={() => products.refetch()} refreshing={products.isFetching}>
        <ErrorBlock error={products.error} onRetry={() => products.refetch()} />
      </SubScreen>
    );
  }

  if (!product) {
    return (
      <SubScreen title={t('catalog.title')} onRefresh={() => products.refetch()} refreshing={products.isFetching}>
        <EmptyBlock>{t('catalog.empty')}</EmptyBlock>
      </SubScreen>
    );
  }

  const images = [product.image, ...product.additionalImages].filter(Boolean);

  /**
   * هل «زيد للسلّة» ينجّم ينجح؟
   *
   * الزر **ما يبانش** كان ما فمّاش سعر منشور، أو كان المنتوج نافد. الخادم
   * يرفض الحالتين (`NO_PRICE` · `OUT_OF_STOCK`)، فإظهار زر يفشل هو بالضبط
   * «الزر الميّت» الممنوع.
   */
  const outOfStock = normalizeStockStatus(product.stockStatus) === 'OUT_OF_STOCK';
  const canOrder = product.finalPrice > 0 && !outOfStock;

  return (
    <SubScreen
      title={product.name}
      subtitle={product.brandName || product.category || undefined}
      onRefresh={() => products.refetch()}
      refreshing={products.isFetching}
    >
      {images.length > 0 ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.gallery}>
          {images.map((uri, index) => (
            <Image
              key={`${uri}-${index}`}
              source={{ uri: mediaUrl(uri) }}
              style={styles.image}
              resizeMode="cover"
              accessibilityLabel={`${product.name} — ${index + 1}/${images.length}`}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.image, styles.imageEmpty, { backgroundColor: theme.colors.surface }]}>
          <AppText variant="caption" color={theme.colors.muted}>{t('catalog.noImage')}</AppText>
        </View>
      )}

      <Card title={t('catalog.priceDetail')}>
        <KeyValue
          label={t('catalog.sourcePrice')}
          value={product.originalPrice > 0 ? `${product.originalPrice} ${product.currency}`.trim() : t('catalog.noPrice')}
        />
        <KeyValue label={t('catalog.customs')} value={`${product.customsFee.toFixed(2)} TND`} />
        <KeyValue label={t('catalog.shipping')} value={`${product.shippingFee.toFixed(2)} TND`} />
        <KeyValue label={t('catalog.service')} value={`${product.serviceFee.toFixed(2)} TND`} />
        <KeyValue
          label={t('catalog.totalTnd')}
          value={product.finalPrice > 0 ? `${product.finalPrice.toFixed(2)} TND` : t('catalog.noPrice')}
        />
        {product.expressAvailable ? (
          <AppText variant="caption" color={theme.colors.accentText}>{t('catalog.express')}</AppText>
        ) : null}
      </Card>

      {product.brandName || product.category ? (
        <Card title={t('catalog.title')}>
          {product.brandName ? <KeyValue label={t('catalog.brand')} value={product.brandName} /> : null}
          {product.category ? <KeyValue label={t('catalog.category')} value={product.category} /> : null}
        </Card>
      ) : null}

      {product.description ? (
        <Card title={product.brandName || t('catalog.title')}>
          <AppText variant="body">{product.description}</AppText>
        </Card>
      ) : null}

      <View style={styles.actions}>
        {canOrder ? (
          <Button
            label={addToCart.isSuccess ? t('catalog.added') : t('catalog.addToCart')}
            onPress={() => addToCart.mutate()}
            busy={addToCart.isPending}
            disabled={addToCart.isSuccess}
          />
        ) : outOfStock ? (
          <AppText variant="caption" color={theme.colors.danger}>{t('catalog.stock.out_of_stock')}</AppText>
        ) : null}

        {product.sourceUrl ? (
          <Button label={t('catalog.openSource')} onPress={openSource} />
        ) : null}
        {signedIn ? (
          <Button
            label={isFavorite ? t('catalog.favorited') : t('catalog.favorite')}
            onPress={() => favorite.mutate()}
            busy={favorite.isPending}
            disabled={isFavorite || favorite.isPending}
          />
        ) : null}
      </View>

      {favorite.isError ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
          {t('catalog.retry')}
        </AppText>
      ) : null}

      {addToCart.isError ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.colors.danger}>
          {isApiError(addToCart.error) && addToCart.error.code ? addToCart.error.code : t('catalog.retry')}
        </AppText>
      ) : null}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  gallery: { height: 280, marginBottom: 12 },
  image: { width: 320, height: 280 },
  imageEmpty: { alignItems: 'center', justifyContent: 'center' },
  actions: { gap: 10, marginTop: 8 },
});
