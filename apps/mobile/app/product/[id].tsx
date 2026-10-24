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
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppText, Button, Card, KeyValue } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { addCatalogFavorite, fetchFavorites } from '@/api/account';
import { addCatalogToCart } from '@/api/cart';
import { isApiError } from '@/api/errors';
import { fetchCatalogProduct, fetchCatalogProducts, normalizeStockStatus } from '@/api/catalog';
import { dimensionValueUsable, variantChoiceState } from '@/features/shopping/variantChoice';
import { useSession } from '@/state/session';
import { useSessionId } from '@/session/session';

export default function ProductScreen() {
  const theme = useTheme();
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  // `status` moّش `authenticated`: واجهة الجلسة تعطي حالة صريحة.
  const signedIn = session.status === 'signedIn';
  // معرّف جلسة الزائر: إلزامي على `/api/cart/catalog` (بلاه 400). `''` = مازال ما تحضّرش.
  const sessionId = useSessionId();
  /**
   * المقاس واللون اللي اختارهم المستعمل — يتبعثوا مع السلّة
   * (`requestedSize` / `requestedColor`)، وهاكة السطر في السلّة يوصف الحاجة
   * اللي تORDERات فعلاً. وينتبدّلو كي يتبدّل المنتوج (مسار جديد = اختيار جديد).
   */
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  useEffect(() => { setSize(''); setColor(''); }, [id]);
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

  // La fiche se lit par identifiant : un produit lié à un contenu n'est pas forcément
  // dans les 50 premiers de la liste. La liste reste en secours.
  const byId = useQuery({
    queryKey: ['catalog', 'product', id],
    queryFn: ({ signal }) => fetchCatalogProduct(String(id), { signal }),
    enabled: Boolean(id),
    staleTime: 120_000,
    retry: false,
  });
  const product = byId.data ?? (products.data ?? []).find((entry) => entry.id === id) ?? null;
  const isFavorite = (favorites.data ?? []).some((entry) => entry.productId === id);

  /**
   * «زيد للسلّة» — كان ممنوعاً في Q1، وتحرّر في Q5.
   *
   * السبب اللي كان يمنعو: المسار العام للسلّة **يعيد حساب** السعر من
   * `sourcePrice` ⇒ سعر ثانٍ لنفس المنتوج. توّا `/api/cart/catalog` يستعمل
   * `final_price` المنشور ⇒ **سعر واحد**، هو سعر المتجر، `VERIFIED`.
   */
  const addToCart = useMutation({
    mutationFn: () => addCatalogToCart({
      productId: String(id),
      sessionId,
      requestedSize: size || undefined,
      requestedColor: color || undefined,
    }),
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

  if (!product && products.isPending && byId.isPending) {
    return (
      <SubScreen title={t('catalog.title')}>
        <LoadingBlock />
      </SubScreen>
    );
  }

  if (!product && products.isError && byId.isError) {
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

  /**
   * الورقة الكبيرة (`sheet`) — ردّ واحد من الخادم فيه الصور والاختيارات
   * والمخزون. `null` معناها «جينا من اللائحة» (اللائحة ما تحملش الورقة):
   * وقتها نرجعو للقاعدة القديمة بدل ما نمنعو زر يخدم.
   */
  const sheet = product.sheet;
  const images = sheet && sheet.images.length > 0
    ? sheet.images
    : [product.image, ...product.additionalImages].filter(Boolean);
  const choice = variantChoiceState(sheet, { size, color });

  /**
   * هل «زيد للسلّة» ينجّم ينجح؟
   *
   * الزر **ما يبانش** كان ما فمّاش سعر منشور، أو كان المنتوج نافد. الخادم
   * يرفض الحالتين (`NO_PRICE` · `OUT_OF_STOCK`)، فإظهار زر يفشل هو بالضبط
   * «الزر الميّت» الممنوع.
   */
  const outOfStock = normalizeStockStatus(product.stockStatus) === 'OUT_OF_STOCK'
    || sheet?.stock.status === 'OUT_OF_STOCK';
  /** الخادم يحسم `purchasable` (سعر + حالة + مخزون)؛ بلا ورقة، القاعدة القديمة. */
  const purchasable = sheet ? sheet.purchasable : product.finalPrice > 0 && !outOfStock;
  /** واختيار ناقص = طلب ناقص: الزر ما يخدمش حتى يكمل الاختيار. */
  const canOrder = purchasable && choice.ready;
  const stockLine = sheet?.stock.tracked && sheet.stock.quantity !== null
    ? sheet.stock.status === 'OUT_OF_STOCK'
      ? t('catalog.stock.out_of_stock')
      : sheet.stock.status === 'LOW'
        ? t('catalog.stock.left', { count: sheet.stock.quantity })
        : t('catalog.stock.in_stock')
    : null;

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
            <AppImage
              key={`${uri}-${index}`}
              uri={mediaUrl(uri)}
              style={styles.image}
              contentFit="cover"
              accessibilityLabel={`${product.name} — ${index + 1}/${images.length}`}
            />
          ))}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.image,
            styles.imageEmpty,
            { backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.line },
          ]}
        >
          <AppText variant="caption" color={theme.colors.muted}>{t('catalog.noImage')}</AppText>
        </View>
      )}

      {sheet && sheet.dimensions.length > 0 ? (
        <Card title={t('catalog.chooseTitle')}>
          {sheet.dimensions.map((dimension) => (
            <View key={dimension.key} style={styles.dimension}>
              <AppText variant="caption" color={theme.colors.muted}>
                {t(dimension.key === 'size' ? 'catalog.size' : 'catalog.color')}
              </AppText>
              <View style={styles.choices}>
                {dimension.values.map((value) => {
                  const selected = (dimension.key === 'size' ? size : color) === value.value;
                  const usable = dimensionValueUsable(value);
                  return (
                    <Pressable
                      key={value.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled: !usable }}
                      accessibilityLabel={usable ? value.value : `${value.value} — ${t('catalog.variant.unavailable')}`}
                      disabled={!usable}
                      onPress={() => (dimension.key === 'size' ? setSize(value.value) : setColor(value.value))}
                      style={[
                        styles.choice,
                        {
                          borderColor: selected ? theme.colors.ink : theme.colors.line,
                          backgroundColor: theme.colors.surface,
                          opacity: usable ? 1 : 0.45,
                        },
                      ]}
                    >
                      <AppText variant="caption" weight={selected ? 'bold' : 'regular'}>{value.value}</AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          {choice.missing === 'size' ? (
            <AppText variant="caption" color={theme.colors.muted}>{t('catalog.chooseSize')}</AppText>
          ) : null}
          {choice.missing === 'color' ? (
            <AppText variant="caption" color={theme.colors.muted}>{t('catalog.chooseColor')}</AppText>
          ) : null}
          {!choice.missing && choice.matched && !choice.available ? (
            <AppText variant="caption" color={theme.status.danger.fg}>{t('catalog.variant.unavailable')}</AppText>
          ) : null}
        </Card>
      ) : null}

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
        {stockLine ? <KeyValue label={t('catalog.availability')} value={stockLine} /> : null}
        {product.expressAvailable ? (
          <AppText variant="caption" color={theme.status.info.fg}>{t('catalog.express')}</AppText>
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
        {purchasable ? (
          <Button
            label={addToCart.isSuccess ? t('catalog.added') : t('catalog.addToCart')}
            tone="main"
            onPress={() => addToCart.mutate()}
            busy={addToCart.isPending}
            disabled={addToCart.isSuccess || !sessionId || !canOrder}
            testID="product-add-to-cart"
          />
        ) : outOfStock ? (
          <AppText variant="caption" color={theme.status.danger.fg}>{t('catalog.stock.out_of_stock')}</AppText>
        ) : null}

        {product.sourceUrl ? (
          <Button label={t('catalog.openSource')} tone="quiet" onPress={openSource} />
        ) : null}
        {signedIn ? (
          <Button
            label={isFavorite ? t('catalog.favorited') : t('catalog.favorite')}
            tone="quiet"
            onPress={() => favorite.mutate()}
            busy={favorite.isPending}
            disabled={isFavorite || favorite.isPending}
            testID="product-favorite"
          />
        ) : null}
      </View>

      {favorite.isError ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.status.danger.fg}>
          {t('catalog.retry')}
        </AppText>
      ) : null}

      {addToCart.isError ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.status.danger.fg}>
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
  // اختيار المقاس/اللون: شبكة بسيطة داخل البطاقة، بلا `absolute` وبلا قياسات جديدة.
  dimension: { gap: 8, marginBottom: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minWidth: 48, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
});
