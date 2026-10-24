/**
 * صفحة المنتوج — **الورقة الكبيرة** (إعادة بناء 24/10/2026).
 *
 * القاعدة الذهبية ما تبدّلتش: **كل رقم يبان هو رقم الخادم**. التطبيق ما يجمّعش
 * أتعاب، ولا يحوّل عملة، ولا «يقدّر» سعراً.
 *
 * ── شنوّة تبدّل (الموكاب: `docs/design/bigcard/mockup-sticky-24-10.png`) ─────
 *   • **الصورة ثابتة (430)**: ما تتحرّكش، والورقة البيضاء هي اللي تطلع فوقها؛
 *   • **en-tête** شفّاف فوق الصورة، يولّي أبيض كي توصلو الورقة (بلا قفزة)؛
 *   • **galerie** كاملة: تصاور + فيديو، بضغطة تتحلّ في فل سكرين (عدّاد + سحب)؛
 *   • **feuille المقاس** عوض الـchips اللي تدفع الصفحة؛
 *   • **أقسام قابلة للفتح** (الخصائص · الوصف · تفصيل السعر) — قسم بلا محتوى ما
 *     يظهرش أصلاً؛
 *   • **بارّة شراء ثابتة** بزرّ **أسود** (قرار المالك، 24/10).
 *
 * والصدق في الزرّ: ما يخدمش كي يكون السعر غايب، ولا المنتوج نافد، ولا الاختيار
 * ناقص — الخادم يرفض الثلاثة، فما نعرضوش زرّ يعرف مسبقاً أنه بش يفشل.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, KeyValue } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { addCatalogFavorite, fetchFavorites } from '@/api/account';
import { addCatalogToCart } from '@/api/cart';
import { isApiError } from '@/api/errors';
import { fetchCatalogProduct, fetchCatalogProducts, normalizeStockStatus } from '@/api/catalog';
import { variantChoiceState } from '@/features/shopping/variantChoice';
import {
  Accordion,
  BuyBar,
  FicheHeader,
  FicheMedia,
  GalleryViewer,
  SizeSheet,
} from '@/features/product/ProductFiche';
import {
  FICHE,
  ficheSections,
  galleryItems,
  sectionLabelKey,
  sheetOffset,
  sizeChoices,
  specGroups,
} from '@/features/product/fiche';
import { useSession } from '@/state/session';
import { useSessionId } from '@/session/session';

export default function ProductScreen() {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const sessionId = useSessionId();

  /**
   * المقاس واللون اللي اختارهم المستعمل — يتبعثوا مع السلّة
   * (`requestedSize` / `requestedColor`). وينتبدّلو كي يتبدّل المنتوج.
   */
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  useEffect(() => { setSize(''); setColor(''); }, [id]);
  const queryClient = useQueryClient();

  /** Galerie plein écran + feuille de taille : état d'écran, pas de la donnée. */
  const [viewer, setViewer] = useState<number | null>(null);
  const [sizeSheet, setSizeSheet] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

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
   * «زيد للسلّة» — `/api/cart/catalog` يستعمل `final_price` المنشور ⇒ سعر واحد.
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
   * الورقة من الخادم: تصاور + فيديو + اختيارات + مخزون. كان جاء من اللائحة
   * (`sheet === null`) نرجعو للصورة الأساسية.
   */
  const sheet = product.sheet;
  const images = sheet && sheet.images.length > 0
    ? sheet.images
    : [product.image, ...product.additionalImages].filter(Boolean);
  const items = galleryItems(images, sheet?.videos ?? []);
  const choice = variantChoiceState(sheet, { size, color });

  const sizes = sizeChoices(sheet?.dimensions);
  const colors = sheet?.dimensions.find((dimension) => dimension.key === 'color')?.values ?? [];

  const outOfStock = normalizeStockStatus(product.stockStatus) === 'OUT_OF_STOCK'
    || sheet?.stock.status === 'OUT_OF_STOCK';
  /** الخادم يحسم `purchasable` (سعر + حالة + مخزون)؛ بلا ورقة، القاعدة القديمة. */
  const purchasable = sheet ? sheet.purchasable : product.finalPrice > 0 && !outOfStock;
  /** واختيار ناقص = طلب ناقص: الزر ما يخدمش حتى يكمل الاختيار. */
  const canOrder = purchasable && choice.ready;
  const priceLabel = product.finalPrice > 0 ? `${product.finalPrice.toFixed(2)} TND` : t('catalog.noPrice');
  const stockLine = sheet?.stock.tracked && sheet.stock.quantity !== null
    ? sheet.stock.status === 'OUT_OF_STOCK'
      ? t('catalog.stock.out_of_stock')
      : sheet.stock.status === 'LOW'
        ? t('catalog.stock.left', { count: sheet.stock.quantity })
        : t('catalog.stock.in_stock')
    : null;

  /** Attributs regroupés par section du CRM ; les sections vides n'existent pas. */
  const groups = specGroups(product.attributes);
  const sections = ficheSections({ attributes: product.attributes, description: product.description, hasPrice: product.finalPrice > 0 });
  const chosen = [size, color].filter(Boolean).join(' · ');

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.canvas }]}>
      {/* 1. الصورة ثابتة تحت كل شيء: الورقة هي اللي تطلع فوقها. */}
      <FicheMedia items={items} onOpen={setViewer} topInset={insets.top} />

      <Animated.ScrollView
        testID="product-fiche-scroll"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        contentContainerStyle={{ paddingBottom: FICHE.ctaHeight + insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        {/* الفراغ اللي يخلّي الصورة تبان قبل ما تطلع الورقة. */}
        <View style={{ height: sheetOffset() + insets.top }} />

        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.canvas, paddingHorizontal: FICHE.gutter },
          ]}
        >
          {product.brandName ? (
            <AppText variant="caption" color={theme.colors.muted}>{product.brandName}</AppText>
          ) : null}
          <AppText variant="title" weight="bold" numberOfLines={3}>{product.name}</AppText>
          <AppText variant="label" weight="bold">{priceLabel}</AppText>
          {stockLine ? (
            <AppText variant="caption" color={theme.colors.muted}>{stockLine}</AppText>
          ) : null}

          {/* 2. الاختيار: صفّ واحد يفتح feuille بدل شبكة تدفع الصفحة. */}
          {sizes.length > 0 || colors.length > 1 ? (
            <Pressable
              testID="product-size-row"
              accessibilityRole="button"
              accessibilityLabel={t('catalog.chooseTitle')}
              onPress={() => setSizeSheet(true)}
              style={[styles.choiceRow, { borderColor: theme.colors.line }]}
            >
              <AppText variant="caption" color={theme.colors.muted}>{t('catalog.chooseTitle')}</AppText>
              <View style={styles.choiceValue}>
                <AppText variant="body" weight="bold" numberOfLines={1}>
                  {chosen || t('catalog.chooseSize')}
                </AppText>
                <Ionicons name={theme.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={theme.colors.ink} accessibilityElementsHidden />
              </View>
            </Pressable>
          ) : null}

          {choice.missing === 'size' && sizes.length > 0 ? (
            <AppText variant="caption" color={theme.colors.muted}>{t('catalog.chooseSize')}</AppText>
          ) : null}
          {choice.missing === 'color' && colors.length > 1 ? (
            <AppText variant="caption" color={theme.colors.muted}>{t('catalog.chooseColor')}</AppText>
          ) : null}
          {!choice.missing && choice.matched && !choice.available ? (
            <AppText variant="caption" color={theme.status.danger.fg}>{t('catalog.variant.unavailable')}</AppText>
          ) : null}
          {outOfStock ? (
            <AppText variant="caption" color={theme.status.danger.fg}>{t('catalog.stock.out_of_stock')}</AppText>
          ) : null}

          {/* 3. الأقسام: بلا محتوى ⇒ بلا قسم. */}
          {product.family || product.brandName || product.category ? (
            <Accordion title={t('product.section.identite')} defaultOpen>
              <View style={styles.specs}>
                {product.family ? <KeyValue label={t('product.family')} value={product.family.name} /> : null}
                {product.brandName ? <KeyValue label={t('catalog.brand')} value={product.brandName} /> : null}
                {product.category ? <KeyValue label={t('catalog.category')} value={product.category} /> : null}
              </View>
            </Accordion>
          ) : null}

          {groups.map((group) => (
            <Accordion key={group.section} title={t(sectionLabelKey(group.section))}>
              <View style={styles.specs}>
                {group.rows.map((row) => <KeyValue key={row.key} label={row.label} value={row.value} />)}
              </View>
            </Accordion>
          ))}

          {sections.description ? (
            <Accordion title={t('product.description')}>
              <AppText variant="body">{product.description}</AppText>
            </Accordion>
          ) : null}

          {sections.priceDetail ? (
            <Accordion title={t('catalog.priceDetail')}>
              <KeyValue
                label={t('catalog.sourcePrice')}
                value={product.originalPrice > 0 ? `${product.originalPrice} ${product.currency}`.trim() : t('catalog.noPrice')}
              />
              <KeyValue label={t('catalog.customs')} value={`${product.customsFee.toFixed(2)} TND`} />
              <KeyValue label={t('catalog.shipping')} value={`${product.shippingFee.toFixed(2)} TND`} />
              <KeyValue label={t('catalog.service')} value={`${product.serviceFee.toFixed(2)} TND`} />
              <KeyValue label={t('catalog.totalTnd')} value={priceLabel} />
              {stockLine ? <KeyValue label={t('catalog.availability')} value={stockLine} /> : null}
              {product.expressAvailable ? (
                <AppText variant="caption" color={theme.status.info.fg}>{t('catalog.express')}</AppText>
              ) : null}
            </Accordion>
          ) : null}

          {/* 4. الإجراءات الثانوية: كل واحدة تنجّم تتنفّذ فعلاً. */}
          <View style={styles.secondary}>
            {product.sourceUrl ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('catalog.openSource')} onPress={openSource} style={styles.linkRow}>
                <AppText variant="caption">{t('catalog.openSource')}</AppText>
                <Ionicons name="open-outline" size={18} color={theme.colors.ink} accessibilityElementsHidden />
              </Pressable>
            ) : null}
            {signedIn ? (
              <Pressable
                testID="product-favorite"
                accessibilityRole="button"
                accessibilityState={{ selected: isFavorite, disabled: isFavorite || favorite.isPending }}
                accessibilityLabel={isFavorite ? t('catalog.favorited') : t('catalog.favorite')}
                disabled={isFavorite || favorite.isPending}
                onPress={() => favorite.mutate()}
                style={styles.linkRow}
              >
                <AppText variant="caption">{isFavorite ? t('catalog.favorited') : t('catalog.favorite')}</AppText>
                <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={18} color={theme.colors.ink} accessibilityElementsHidden />
              </Pressable>
            ) : null}
          </View>

          {favorite.isError ? (
            <AppText accessibilityRole="alert" variant="caption" color={theme.status.danger.fg}>{t('catalog.retry')}</AppText>
          ) : null}
          {addToCart.isError ? (
            <AppText accessibilityRole="alert" variant="caption" color={theme.status.danger.fg}>
              {isApiError(addToCart.error) && addToCart.error.code ? addToCart.error.code : t('catalog.retry')}
            </AppText>
          ) : null}
        </View>
      </Animated.ScrollView>

      <FicheHeader title={product.name} onBack={() => goBack('/')} scrollY={scrollY} topInset={insets.top} />

      {purchasable ? (
        <BuyBar
          price={priceLabel}
          label={addToCart.isSuccess ? t('catalog.added') : t('catalog.addToCart')}
          busy={addToCart.isPending}
          disabled={addToCart.isSuccess || !sessionId || !canOrder}
          onPress={() => addToCart.mutate()}
          testID="product-add-to-cart"
        />
      ) : null}

      <GalleryViewer items={items} index={viewer} onClose={() => setViewer(null)} />
      <SizeSheet
        visible={sizeSheet}
        onClose={() => setSizeSheet(false)}
        choices={sizes}
        selected={size}
        onSelect={setSize}
        colorChoices={colors}
        color={color}
        onColor={setColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sheet: {
    borderTopLeftRadius: FICHE.sheetRadius,
    borderTopRightRadius: FICHE.sheetRadius,
    paddingTop: 20,
    gap: 8,
  },
  choiceRow: {
    marginTop: 8,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  choiceValue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  specs: { gap: 8 },
  secondary: { marginTop: 8, gap: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
});
