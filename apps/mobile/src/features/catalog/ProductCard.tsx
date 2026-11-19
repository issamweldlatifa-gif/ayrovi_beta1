import { memo, useCallback, useMemo } from 'react';
/**
 * بطاقة منتوج — واجهة المتجر (Q1، 08/10/2026 ؛ أُعيد بناؤها 13/11/2026).
 *
 * قاعدتان لا تُكسران :
 *
 *   1. **السعر من الخادم وحده.** `finalPrice` هو ما يعرض — التطبيق لا يجمع
 *      الأتعاب ولا يحوّل عملة. ما يبان «رخيص» بالصدفة.
 *   2. **النقص يُقال، لا يُخفّى.** صورة غايب ⇒ إطار فارغ صريح؛ مخزون مجهول
 *      ⇒ «غير مؤكّد»؛ سعر صفر ⇒ «بلا تسعير» (موّش «0.00 TND»، وهي كذبة
 *      مطبوعة).
 *
 * ── 13/11/2026 : الشكل مأخوذ من فيديو المرجع (Drive، شبكة «Sélection baskets») ──
 * الكارت توّا مبنية على `ProductTile` المشترك (`@/design/ProductTile`) وقياساتو
 * في `@/design/productTile.ts` :
 *   • صورة 2:3 من الحاشية للحاشية، فاصل 4 بين العمودين، وبلا إطار ولا حشو ؛
 *   • **التصاور تتقلّب بالصبع** داخل الكارت، والنقاط تحت الصورة تقول وين وصلت،
 *     والضغطة تحلّ الفيش على نفس الصورة ؛
 *   • **سطور ثابتة** : النقاط · الماركة · الاسم · المخزون · السعر (+ زرّ السلّة) —
 *     كل كارت عندها نفس الطول، والسطور متاع جارتين على نفس الخط ؛
 *   • «Promo» و«Combinaisons» ولّاو شارات على حاشية الصورة (ما عادش يطوّلو الكارت) ؛
 *   • **صور كبيرة / صغيرة** : الشاشة هي اللي تعطي المقاسات (`metrics`).
 *
 * ── 14/11/2026 : planche Privé `Screenshot_20261113_023638` (dérogation client) ──
 *   • la photo est posée ENTIÈRE (`contain`) sur le gris de son propre fond ;
 *   • plus de bouton panier ni de « En stock » vert sur la carte : la ligne d'info
 *     porte le « Prix conseillé ~~x~~ » du CRM quand il existe, sinon UNIQUEMENT
 *     un état de stock qui mérite d'être dit (limité, épuisé, non confirmé) ;
 *   • marque grasse, nom gris, prix gras.
 *
 * ── 18/11/2026 : maquette v2 approuvée (« Ok نفذ ») ──
 *   • un « + » JAUNE rond en bout de ligne prix (`onAdd`) : le geste d'achat de la
 *     carte, seul élément jaune de la grille (≈ 0,4 % de l'écran par carte).
 */
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { NavigationIcon as Ionicons } from '@/design/NavigationIcon';
import { COMMERCE } from '@/design/tokens.mobile';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { ProductTile, productTileTextStyle, type ProductTileBadge } from '@/design/ProductTile';
import { PRODUCT_TILE, productTileImages, productTileMetrics, type ProductTileMetrics } from '@/design/productTile';
import { useT, type Translate } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { normalizeStockStatus, type CatalogProduct } from '@/api/catalog';
import { formatMoney } from '@/format/money';

export interface ProductCardProps {
  product: CatalogProduct;
  /** Ouvre la fiche ; `photo` = la photo regardée dans la carte (0 = la première). */
  onOpen: (product: CatalogProduct, photo?: number) => void;
  /**
   * Cotes de la grille (`productTileMetrics`), calculées UNE fois par l'écran :
   * toutes les cartes ont la même hauteur. Sans elles : grille 2 colonnes à la
   * largeur de l'écran.
   */
  metrics?: ProductTileMetrics;
  /** Le marchand publie des couleurs ou tailles : repère « Combinaisons disponibles » (donnée réelle seulement). */
  hasCombinations?: boolean;
  /** Promotion donnée par le serveur (jamais déduite ici) : repère « Promo ». */
  promo?: boolean;
  /** « + » jaune : ajouter au panier depuis la carte (la fiche ouvre le choix de taille si besoin). */
  onAdd?: (product: CatalogProduct) => void;
}

/** Diamètre visuel du « + » d’achat ; la cible de 44 dp est indépendante. */
export const QUICK_ADD_SIZE = 30;

/**
 * نصّ المخزون اللي يستاهل يتقال : محدود، فارغ، أو غير مؤكّد. «En stock» ما
 * عادش يتكتب على الكارت (Privé) — المنتوج المعروض متوفّر بطبيعتو.
 */
export function stockLabel(status: string, t: Translate): { text: string; tone: 'warn' | 'muted' } | null {
  switch (normalizeStockStatus(status)) {
    case 'AVAILABLE':
      return null;
    case 'LIMITED':
      return { text: t('catalog.stock.limited'), tone: 'warn' };
    case 'OUT_OF_STOCK':
      return { text: t('catalog.stock.out_of_stock'), tone: 'warn' };
    default:
      return { text: t('catalog.stock.unknown'), tone: 'muted' };
  }
}

export const ProductCard = memo(function ProductCard({
  product, onOpen, metrics, hasCombinations = false, promo = false, onAdd,
}: ProductCardProps) {
  const theme = useTheme();
  const t = useT();
  const window = useWindowDimensions();
  const tile = metrics ?? productTileMetrics({ width: window.width, density: 'grid', fontScale: window.fontScale });
  const stock = stockLabel(product.stockStatus, t);
  const hasPrice = product.finalPrice > 0;
  /** Prix barré : `compare_at_price` du CRM, seulement s'il dépasse le prix de vente. */
  const reference = hasPrice && product.compareAtPrice != null && product.compareAtPrice > product.finalPrice
    ? formatMoney(product.compareAtPrice)
    : null;
  const brand = product.brandName?.trim() || product.family?.name?.trim() || '';

  // Toutes les photos publiées, dans l'ordre du CRM : principale puis additionnelles.
  const images = useMemo(
    () => productTileImages(product.image, product.additionalImages ?? []).map((uri) => ({ uri: mediaUrl(uri) })),
    [product.image, product.additionalImages],
  );
  const badges = useMemo(() => {
    const list: ProductTileBadge[] = [];
    if (promo) list.push({ label: t('product.promoBadge'), tone: 'sale' });
    if (hasCombinations) list.push({ label: t('product.combinations'), tone: 'neutral' });
    return list;
  }, [promo, hasCombinations, t]);
  const open = useCallback((photo: number) => onOpen(product, photo), [onOpen, product]);

  const stockColor = stock?.tone === 'warn' ? theme.status.warning.fg : theme.colors.muted;
  const metaStyle = [productTileTextStyle('meta', tile), { fontFamily: theme.font('regular') }];

  return (
    <ProductTile
      testID={`product-card-${product.id}`}
      metrics={tile}
      images={images}
      accessibilityLabel={[brand, product.name, hasPrice ? formatMoney(product.finalPrice) : t('catalog.noPrice'), reference ? `${t('product.referencePrice')} ${reference}` : null, stock?.text].filter(Boolean).join(' — ')}
      imageLabel={product.name}
      brand={brand}
      name={product.name}
      meta={reference ? (
        <AppText
          numberOfLines={1}
          color={theme.colors.muted}
          maxFontSizeMultiplier={PRODUCT_TILE.maxFontScale}
          style={metaStyle}
          testID={`product-card-reference-${product.id}`}
        >
          <AppText color={theme.colors.muted} style={[metaStyle, { textDecorationLine: 'line-through' }]}>{reference}</AppText>
          {` · ${t('product.referencePrice')}`}
        </AppText>
      ) : stock ? (
        <AppText
          numberOfLines={1}
          color={stockColor}
          maxFontSizeMultiplier={PRODUCT_TILE.maxFontScale}
          style={metaStyle}
          testID={`product-card-stock-${product.id}`}
        >
          {stock.text}
        </AppText>
      ) : undefined}
      price={hasPrice ? formatMoney(product.finalPrice) : (
        <AppText
          numberOfLines={1}
          color={theme.colors.muted}
          maxFontSizeMultiplier={PRODUCT_TILE.maxFontScale}
          style={[productTileTextStyle('meta', tile), { fontFamily: theme.font('regular') }]}
        >
          {t('catalog.noPrice')}
        </AppText>
      )}
      badges={badges}
      onOpen={open}
      trailing={onAdd && hasPrice && normalizeStockStatus(product.stockStatus) !== 'OUT_OF_STOCK' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('catalog.addToCart')} — ${product.name}`}
          onPress={(event) => { event.stopPropagation(); onAdd(product); }}
          testID={`product-card-add-${product.id}`}
          style={styles.addTarget}
        >
          {({ pressed }) => <View pointerEvents="none" style={[styles.add, { backgroundColor: pressed ? COMMERCE.actionPressed : COMMERCE.action }]}>
            <Ionicons name="add-outline" size={theme.iconSize.sm} color={COMMERCE.onAction} accessibilityElementsHidden />
          </View>}
        </Pressable>
      ) : undefined}
    />
  );
});

const styles = StyleSheet.create({
  addTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  add: { width: QUICK_ADD_SIZE, height: QUICK_ADD_SIZE, borderRadius: QUICK_ADD_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
});
