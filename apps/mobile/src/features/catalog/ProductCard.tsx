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
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { ProductTile, productTileTextStyle, type ProductTileBadge } from '@/design/ProductTile';
import { PRODUCT_TILE, productTileImages, productTileMetrics, type ProductTileMetrics } from '@/design/productTile';
import { useT, type Translate } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { normalizeStockStatus, type CatalogProduct } from '@/api/catalog';
import { addCatalogToCart } from '@/api/cart';
import { touchCartReservation } from '@/features/shopping/cartReservation';
import { useSessionId } from '@/session/session';
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
  /**
   * Bouton « mettre au panier » sur la carte (exigence du 25/10 : « le bouton
   * panier n'existait pas »). `true` par défaut ; les aperçus CRM le coupent
   * pour ne pas créer de panier depuis une prévisualisation.
   */
  withCart?: boolean;
}

/** نصّ المخزون: كل الحالات المعروفة، والباقي «غير مؤكّد» موش فراغ. */
function stockLabel(status: string, t: Translate): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  switch (normalizeStockStatus(status)) {
    case 'AVAILABLE':
      return { text: t('catalog.stock.in_stock'), tone: 'ok' };
    case 'LIMITED':
      return { text: t('catalog.stock.limited'), tone: 'warn' };
    case 'OUT_OF_STOCK':
      return { text: t('catalog.stock.out_of_stock'), tone: 'warn' };
    default:
      return { text: t('catalog.stock.unknown'), tone: 'muted' };
  }
}

export const ProductCard = memo(function ProductCard({
  product, onOpen, metrics, hasCombinations = false, promo = false, withCart = true,
}: ProductCardProps) {
  const theme = useTheme();
  const t = useT();
  const window = useWindowDimensions();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  /**
   * Le MÊME add-to-cart que la fiche : `/api/cart/catalog`, prix serveur, jamais
   * un prix recomposé ici. Le panier de l'onglet est invalidé après succès.
   */
  const cart = useMutation({
    mutationFn: () => addCatalogToCart({ productId: product.id, sessionId }),
    onSuccess: () => {
      touchCartReservation();
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });
  const tile = metrics ?? productTileMetrics({ width: window.width, density: 'grid', fontScale: window.fontScale });
  const stock = stockLabel(product.stockStatus, t);
  const hasPrice = product.finalPrice > 0;
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

  const stockColor = stock.tone === 'ok' ? theme.status.success.fg : stock.tone === 'warn' ? theme.status.warning.fg : theme.colors.muted;

  return (
    <ProductTile
      testID={`product-card-${product.id}`}
      metrics={tile}
      images={images}
      accessibilityLabel={`${product.name}${hasPrice ? ` — ${formatMoney(product.finalPrice)}` : ''}`}
      imageLabel={product.name}
      brand={brand}
      name={product.name}
      meta={(
        <AppText
          numberOfLines={1}
          color={stockColor}
          maxFontSizeMultiplier={PRODUCT_TILE.maxFontScale}
          style={[productTileTextStyle('meta', tile), { fontFamily: theme.font('regular') }]}
          testID={`product-card-stock-${product.id}`}
        >
          {stock.text}
        </AppText>
      )}
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
      trailing={withCart && hasPrice ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cart.isSuccess ? t('catalog.added') : t('catalog.addToCart')}
          accessibilityState={{ disabled: cart.isPending }}
          disabled={cart.isPending}
          testID={`product-card-cart-${product.id}`}
          hitSlop={styles.cartHit}
          onPress={(event) => { event.stopPropagation?.(); cart.mutate(); }}
          style={({ pressed }) => [styles.cartButton, { height: tile.lines.price, opacity: cart.isPending ? theme.opacity.subtle : pressed ? theme.opacity.subtle : 1 }]}
        >
          <Ionicons
            name={cart.isSuccess ? 'checkmark' : 'bag-add-outline'}
            size={theme.iconSize.md}
            color={cart.isSuccess ? theme.status.success.fg : theme.colors.ink}
            accessibilityElementsHidden
          />
        </Pressable>
      ) : null}
    />
  );
});

const styles = StyleSheet.create({
  // 40 × (ligne prix) + débord de 10 en haut et en bas : cible ≥ 44 sans grandir la ligne.
  cartButton: { width: 40, alignItems: 'center', justifyContent: 'center' },
  cartHit: { top: 12, bottom: 12, left: 4, right: 4 },
});
