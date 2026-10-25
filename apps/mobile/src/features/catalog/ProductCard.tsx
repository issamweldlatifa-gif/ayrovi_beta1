/**
 * بطاقة منتوج — واجهة المتجر (Q1، 08/10/2026).
 *
 * قاعدتان لا تُكسران :
 *
 *   1. **السعر من الخادم وحده.** `finalPrice` هو ما يعرض — التطبيق لا يجمع
 *      الأتعاب ولا يحوّل عملة. ما يبان «رخيص» بالصدفة.
 *   2. **النقص يُقال، لا يُخفّى.** صورة غايب ⇒ إطار فارغ صريح؛ مخزون مجهول
 *      ⇒ «غير مؤكّد»؛ سعر صفر ⇒ «بلا تسعير» (موّش «0.00 TND»، وهي كذبة
 *      مطبوعة).
 *
 * الشكل أصلي (React Native) — المرجع الموقع هو **الخاصية**، موش التصميم.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { useT, type Translate } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { normalizeStockStatus, type CatalogProduct } from '@/api/catalog';
import { addCatalogToCart } from '@/api/cart';
import { useSessionId } from '@/session/session';
import { formatMoney } from '@/format/money';

export interface ProductCardProps {
  product: CatalogProduct;
  onOpen: (product: CatalogProduct) => void;
  /** Largeur/forme imposées par l'écran appelant (ex. liste pleine largeur des résultats). */
  style?: StyleProp<ViewStyle>;
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

export function ProductCard({ product, onOpen, style, hasCombinations = false, promo = false, withCart = true }: ProductCardProps) {
  const theme = useTheme();
  const t = useT();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  /**
   * Le MÊME add-to-cart que la fiche : `/api/cart/catalog`, prix serveur, jamais
   * un prix recomposé ici. Le panier de l'onglet est invalidé après succès.
   */
  const cart = useMutation({
    mutationFn: () => addCatalogToCart({ productId: product.id, sessionId }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['cart'] }); },
  });
  const stock = stockLabel(product.stockStatus, t);
  const hasPrice = product.finalPrice > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}${hasPrice ? ` — ${formatMoney(product.finalPrice)}` : ''}`}
      onPress={() => onOpen(product)}
      style={[styles.card, { borderColor: theme.colors.line, borderRadius: theme.radius.card }, style]}
    >
      <View style={[styles.imageFrame, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card }]}>
        {product.image ? (
          <AppImage uri={mediaUrl(product.image)} style={styles.image} contentFit="cover" accessibilityLabel={product.name} />
        ) : (
          <AppText variant="caption" color={theme.colors.muted}>{t('catalog.noImage')}</AppText>
        )}
      </View>

      {hasCombinations || promo ? (
        <View style={styles.chipRow}>
          {hasCombinations ? (
            <View style={[styles.chip, { backgroundColor: theme.colors.canvas, borderColor: theme.colors.line, borderRadius: theme.radius.control }]}>
              <AppText variant="caption" color={theme.colors.ink} numberOfLines={1}>{t('product.combinations')}</AppText>
            </View>
          ) : null}
          {promo ? (
            <View style={[styles.chip, { backgroundColor: theme.status.danger.fg, borderColor: theme.status.danger.fg, borderRadius: theme.radius.control }]}>
              <AppText variant="caption" weight="bold" color={theme.colors.canvas} numberOfLines={1}>{t('product.promoBadge')}</AppText>
            </View>
          ) : null}
        </View>
      ) : null}

      {product.brandName ? (
        <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>{product.brandName}</AppText>
      ) : null}

      <AppText variant="label" weight="bold" numberOfLines={2} style={styles.name}>{product.name}</AppText>

      <View style={styles.footer}>
        {hasPrice ? (
          <AppText variant="label" weight="bold" color={theme.colors.ink}>
            {formatMoney(product.finalPrice)}
          </AppText>
        ) : (
          <AppText variant="caption" color={theme.colors.muted}>{t('catalog.noPrice')}</AppText>
        )}
        <AppText
          variant="caption"
          color={stock.tone === 'ok' ? theme.status.success.fg : stock.tone === 'warn' ? theme.status.warning.fg : theme.colors.muted}
        >
          {stock.text}
        </AppText>
      </View>

      {withCart && hasPrice ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('catalog.addToCart')}
          accessibilityState={{ disabled: cart.isPending }}
          disabled={cart.isPending}
          testID={`product-card-cart-${product.id}`}
          onPress={(event) => { event.stopPropagation?.(); cart.mutate(); }}
          style={[styles.cartButton, { backgroundColor: theme.colors.ink, borderRadius: theme.radius.control }]}
        >
          <Ionicons name={cart.isSuccess ? 'checkmark' : 'bag-add-outline'} size={16} color={theme.colors.canvas} accessibilityElementsHidden />
          <AppText variant="caption" weight="bold" color={theme.colors.canvas} numberOfLines={1}>
            {cart.isSuccess ? t('catalog.added') : t('catalog.addToCart')}
          </AppText>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 10,
    width: '48%',
    marginBottom: 12,
  },
  imageFrame: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderWidth: StyleSheet.hairlineWidth, alignSelf: 'flex-start' },
  name: { marginTop: 2, minHeight: 34 },
  cartButton: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 6 },
});
