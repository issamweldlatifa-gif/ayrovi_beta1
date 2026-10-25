/**
 * صفحة المنتوج — **الفيش الكاملة** (إعادة بناء 25/10/2026، الموكاب
 * `docs/design/cardproduit/mockup-complet-25-10.png`).
 *
 * القاعدة الذهبية ما تبدّلتش: **كل رقم يبان هو رقم الخادم**. التطبيق ما يجمّعش
 * أتعاب، ولا يحوّل عملة، ولا «يقدّر» سعراً.
 *
 * ── شنوّة في الشاشة (بالترتيب، كيما الموكاب) ────────────────────────────────
 *  1. الصورة + النقاط (ضغطة ⇒ فولسكرين)؛
 *  2. الاسم مسطّر على قد الكلمة + الثمن في الاتجاه الآخر + الوصف (سطرين)؛
 *  3. خطّ رقيق، ثمّ سطر **Taille** (بسهم يفتح ورقة المقاسات)؛
 *  4. شريط رمادي سميك، ثمّ **Couleur** + صور الألوان؛
 *  5. أقسام من الـCRM (Caractéristiques · Matière · Taille & coupe…) — قسم بلا
 *     محتوى ما يظهرش؛
 *  6. **Livraison rapide** (التاريخ محسوب من مدّة التوصيل في الـCRM) و
 *     **Retours gratuits** (عدد الأيام من الـCRM) و**Partager**؛
 *  7. بارّة ثابتة: الثمن على اليسار والزرّ **أسود** على اليمين.
 *
 * ── شنوّة ما فماش (قرار المالك) ────────────────────────────────────────────
 *  • **ما فماش «Prix conseillé»**، ما فماش ثمن مشطوب، ما فماش نسبة تخفيض؛
 *  • ما فماش عدّاد حملة في البارّة.
 *
 * والصدق في الزرّ: ما يخدمش كي يكون السعر غايب، ولا المنتوج نافد، ولا الاختيار
 * ناقص — الخادم يرفض الثلاثة، فما نعرضوش زرّ يعرف مسبقاً أنه بش يفشل.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Share, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { addCatalogToCart } from '@/api/cart';
import { isApiError } from '@/api/errors';
import { fetchCommercePolicy } from '@/api/checkout';
import { fetchCatalogProduct, fetchCatalogProducts, normalizeStockStatus } from '@/api/catalog';
import { variantChoiceState } from '@/features/shopping/variantChoice';
import {
  BuyBar,
  ChoiceRow,
  ColorStrip,
  FicheHeader,
  FichePhotoLayer,
  FicheIdentity,
  GalleryViewer,
  GrayBand,
  Hairline,
  InfoRow,
  SectionRow,
  SizeSheet,
  SpecLine,
} from '@/features/product/ProductFiche';
import {
  FICHE,
  colorTiles,
  deliveryWindow,
  galleryItems,
  hasSizeChoice,
  pickLabel,
  sectionIcon,
  sectionLabelKey,
  singleDimensionValue,
  singleSize,
  sizeChoices,
  sizeRows,
  specGroups,
  type ColorTile,
} from '@/features/product/fiche';
import { useSessionId } from '@/session/session';

export default function ProductScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();

  /**
   * المقاس واللون اللي اختارهم المستعمل — يتبعثوا مع السلّة
   * (`requestedSize` / `requestedColor`). وينتبدّلو كي يتبدّل المنتوج.
   */
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  /** الصورة المعروضة: تتبدّل كي يختار couleur عندها صورة (ميديا المتغيّر). */
  const [photo, setPhoto] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const [sizeSheet, setSizeSheet] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => { setSize(''); setColor(''); setPhoto(0); }, [id]);

  const products = useQuery({
    queryKey: ['catalog', 'products', 'all'],
    queryFn: ({ signal }) => fetchCatalogProducts({ signal, limit: 50 }),
    staleTime: 120_000,
  });

  // La fiche se lit par identifiant : un produit lié à un contenu peut ne pas être
  // dans les 50 premiers de la liste. La liste reste en secours.
  const byId = useQuery({
    queryKey: ['catalog', 'product', id],
    queryFn: ({ signal }) => fetchCatalogProduct(String(id), { signal }),
    enabled: Boolean(id),
    staleTime: 120_000,
    retry: false,
  });

  /**
   * Conditions commerciales (délai de livraison, fenêtre de retour) : elles
   * viennent du CRM, jamais d'un nombre écrit dans l'écran.
   */
  const policy = useQuery({
    queryKey: ['commerce', 'policy'],
    queryFn: ({ signal }) => fetchCommercePolicy({ signal }),
    staleTime: 300_000,
    retry: false,
  });

  const product = byId.data ?? (products.data ?? []).find((entry) => entry.id === id) ?? null;

  /**
   * ⚠️ RÈGLE DES HOOKS — TOUS LES HOOKS AVANT LE PREMIER `return`.
   *
   * `Partager` utilisait `useCallback` APRÈS les retours « chargement / erreur /
   * vide ». Au premier rendu (pas encore de produit) le composant appelait 40
   * hooks, au rendu suivant 41 : React lève « Rendered more hooks than during
   * the previous render » et, en production, FERME l'application. C'est le
   * plantage constaté en ouvrant une carte produit. Le partage ne dépend donc
   * plus que de valeurs sûres, calculées ici.
   */
  const shareName = product?.name ?? '';
  const sharePrice = product && product.finalPrice > 0 ? `${product.finalPrice.toFixed(2)} TND` : '';
  const share = useCallback(() => {
    if (!shareName) return;
    Share.share({ message: sharePrice ? `${shareName} — ${sharePrice}` : shareName }).catch(() => null);
  }, [shareName, sharePrice]);

  /**
   * « زيد للسلّة » — `/api/cart/catalog` يستعمل `final_price` المنشور ⇒ سعر واحد.
   */
  const addToCart = useMutation({
    mutationFn: (selection: { size: string; color: string }) => addCatalogToCart({
      productId: String(id),
      sessionId,
      requestedSize: selection.size || undefined,
      requestedColor: selection.color || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });

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

  const sizes = sizeChoices(sheet?.dimensions);
  const rows = sizeRows(sizes);
  const tiles = colorTiles(sheet);
  /** مقاس واحد معلن ⇒ سطر معلوماتي، بلا ورقة وبلا اختيار. */
  const onlySize = singleSize(sizes);
  const chooseSize = hasSizeChoice(sizes);

  /**
   * الاختيار المفروض: قيمة وحيدة في الـCRM ما تسألش عليها — والموديل يعرض
   * الصورة الأولى، فالصورة الأولى واللون الأول هوما اللي معروضين فعلاً.
   */
  const chosenSize = size || singleDimensionValue(sheet?.dimensions, 'size');
  const chosenColor = color
    || (tiles.length > 0 ? tiles[0]?.color ?? '' : singleDimensionValue(sheet?.dimensions, 'color'));

  const choice = variantChoiceState(sheet, { size: chosenSize, color: chosenColor });

  const outOfStock = normalizeStockStatus(product.stockStatus) === 'OUT_OF_STOCK'
    || sheet?.stock.status === 'OUT_OF_STOCK';
  /** الخادم يحسم `purchasable` (سعر + حالة + مخزون)؛ بلا ورقة، القاعدة القديمة. */
  const purchasable = sheet ? sheet.purchasable : product.finalPrice > 0 && !outOfStock;
  /** واختيار ناقص = طلب ناقص: الزر ما يخدمش حتى يكمل الاختيار. */
  const canOrder = purchasable && choice.ready;
  const hasPrice = product.finalPrice > 0;
  const priceLabel = hasPrice ? `${product.finalPrice.toFixed(2)} TND` : '';

  /**
   * NOMS DES BLOCS — la donnée du CRM en premier.
   *
   * `ficheLabels` vient du serveur (`products.fiche_labels`) : le proprietaire a
   * pu ecrire « Pointure », « Contenance », « Volume » a la place de « Taille »,
   * et nommer ses propres sections. Sans libelle du CRM, on retombe sur la
   * traduction de l application — jamais sur un nom choisi ici.
   */
  const ficheLabels = product.ficheLabels;
  const sizeLabel = pickLabel(ficheLabels?.size, t('catalog.size'));
  const colorLabel = pickLabel(ficheLabels?.color, t('catalog.color'));

  /** Sections : une par famille du CRM, dans l'ordre du CRM ; les vides n'existent pas. */
  const groups = specGroups(product.attributes, ficheLabels?.sections ?? null);

  /** Livraison : la date est calculée à partir du délai publié par le CRM. */
  const deliveryDates = policy.data ? deliveryWindow(policy.data.deliveryDelay, new Date(), locale) : null;
  const deliveryLines = deliveryDates ? [`${deliveryDates.from} - ${deliveryDates.to}`] : [];
  const returnLines = policy.data?.returnsDays
    ? [t('product.returnsWindow', { days: policy.data.returnsDays })]
    : [];

  const pickColor = (tile: ColorTile) => {
    setColor(tile.color);
    if (tile.image) {
      const position = items.findIndex((item) => item.url === tile.image);
      if (position >= 0) setPhoto(position);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.canvas }]}>
      {/* 1. الصورة ثابتة (ما تتحرّكش): الورقة البيضاء هي اللي تطلع فوقها */}
      <FichePhotoLayer items={items} index={photo} />

      <Animated.ScrollView
        testID="product-fiche-scroll"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        contentContainerStyle={{ paddingBottom: FICHE.ctaHeight + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* النافذة الشفافة: من هنا تبان الصورة الثابتة، والضغطة تفتح الفولسكرين */}
        <Pressable
          testID="product-photo-window"
          accessibilityRole="button"
          accessibilityLabel={t('product.openGallery')}
          onPress={() => setViewer(photo)}
          style={styles.photoWindow}
        />

        {/* 2. الورقة: fond opaque, angles droits (cotes de la maquette) */}
        <View style={[styles.sheet, { backgroundColor: theme.colors.canvas }]}>
        {/* الاسم مسطّر + الثمن + الوصف */}
        <FicheIdentity name={product.name} price={hasPrice ? priceLabel : null} description={product.description} />

        {/* 3. خطّ رقيق ثمّ سطر Taille */}
        <View style={styles.rule} />
        <Hairline />
        <ChoiceRow
          icon="resize-outline"
          label={sizeLabel}
          value={onlySize || chosenSize || undefined}
          chevron={chooseSize}
          onPress={chooseSize ? () => setSizeSheet(true) : undefined}
          testID="product-size-row"
        />
        <GrayBand />

        {/* 4. Couleur + صور الألوان (الصورة تجي من ميديا المتغيّر) */}
        {tiles.length > 0 ? (
          <>
            <View style={styles.colorBlock}>
              <ChoiceRow icon="color-palette-outline" label={colorLabel} value={chosenColor} />
              <ColorStrip tiles={tiles} selected={chosenColor} onSelect={pickColor} />
            </View>
            <GrayBand />
          </>
        ) : null}

        {/* 5. أقسام الـCRM */}
        {groups.length > 0 ? (
          <>
            {groups.map((group) => (
              <SectionRow
                key={group.section}
                icon={sectionIcon(group.section)}
                title={group.title || t(sectionLabelKey(group.section))}
              >
                <View style={styles.specs}>
                  {group.rows.map((row) => <SpecLine key={row.key} label={row.label} value={row.value} />)}
                </View>
              </SectionRow>
            ))}
            <GrayBand />
          </>
        ) : null}

        {/* 6. التوصيل والإرجاع والمشاركة */}
        <InfoRow
          icon="car-outline"
          title={t('product.fastDelivery')}
          titleColor={theme.status.success.fg}
          lines={deliveryLines}
        />
        {returnLines.length > 0 ? (
          <InfoRow icon="arrow-undo-outline" title={t('product.freeReturns')} lines={returnLines} />
        ) : null}
        <GrayBand />
        <InfoRow icon="share-social-outline" title={t('product.share')} onPress={share} testID="product-share" />
        <Hairline />
        </View>
      </Animated.ScrollView>

      <FicheHeader
        title={product.name}
        onBack={() => goBack('/')}
        onCart={() => router.push('/cart')}
        scrollY={scrollY}
        topInset={insets.top}
      />

      {purchasable && hasPrice ? (
        <BuyBar
          price={priceLabel}
          label={addToCart.isSuccess ? t('catalog.added') : t('catalog.addToCart')}
          busy={addToCart.isPending}
          disabled={addToCart.isSuccess || !sessionId || !canOrder}
          onPress={() => addToCart.mutate({ size: chosenSize, color: chosenColor })}
          error={addToCart.isError
            ? (isApiError(addToCart.error) && addToCart.error.code ? addToCart.error.code : t('catalog.retry'))
            : null}
          testID="product-add-to-cart"
        />
      ) : null}

      <GalleryViewer items={items} index={viewer} onClose={() => setViewer(null)} />
      <SizeSheet
        visible={sizeSheet}
        onClose={() => setSizeSheet(false)}
        rows={rows}
        selected={chosenSize}
        onSelect={(value) => { setSize(value); setSizeSheet(false); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  /** Fenêtre de la photo : transparente, elle laisse voir la couche épinglée. */
  photoWindow: { height: FICHE.imageHeight },
  /** La feuille qui monte : opaque (elle doit cacher la photo) et sans coin arrondi. */
  sheet: { overflow: 'hidden' },
  rule: { height: FICHE.ruleGap },
  colorBlock: { paddingTop: FICHE.blockTop, paddingBottom: FICHE.blockBottom },
  specs: { gap: 8 },
});
