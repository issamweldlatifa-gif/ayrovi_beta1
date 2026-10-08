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
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT, type Translate } from '@/i18n';
import { mediaUrl } from '@/api/client';
import type { CatalogProduct } from '@/api/catalog';

export interface ProductCardProps {
  product: CatalogProduct;
  onOpen: (product: CatalogProduct) => void;
}

/** نصّ المخزون: كل الحالات المعروفة، والباقي «غير مؤكّد» موش فراغ. */
function stockLabel(status: string, t: Translate): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  switch (status) {
    case 'in_stock':
      return { text: t('catalog.stock.in_stock'), tone: 'ok' };
    case 'limited':
      return { text: t('catalog.stock.limited'), tone: 'warn' };
    case 'out_of_stock':
      return { text: t('catalog.stock.out_of_stock'), tone: 'warn' };
    default:
      return { text: t('catalog.stock.unknown'), tone: 'muted' };
  }
}

export function ProductCard({ product, onOpen }: ProductCardProps) {
  const theme = useTheme();
  const t = useT();
  const stock = stockLabel(product.stockStatus, t);
  const hasPrice = product.finalPrice > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}${hasPrice ? ` — ${product.finalPrice.toFixed(2)} TND` : ''}`}
      onPress={() => onOpen(product)}
      style={[styles.card, { borderColor: theme.colors.line, borderRadius: theme.radius.card }]}
    >
      <View style={[styles.imageFrame, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card }]}>
        {product.image ? (
          <Image source={{ uri: mediaUrl(product.image) }} style={styles.image} resizeMode="cover" />
        ) : (
          <AppText variant="caption" color={theme.colors.muted}>{t('catalog.noImage')}</AppText>
        )}
      </View>

      {product.brandName ? (
        <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>{product.brandName}</AppText>
      ) : null}

      <AppText variant="label" weight="bold" numberOfLines={2} style={styles.name}>{product.name}</AppText>

      <View style={styles.footer}>
        {hasPrice ? (
          <AppText variant="label" weight="bold" color={theme.colors.accentText}>
            {product.finalPrice.toFixed(2)} TND
          </AppText>
        ) : (
          <AppText variant="caption" color={theme.colors.muted}>{t('catalog.noPrice')}</AppText>
        )}
        <AppText
          variant="caption"
          color={stock.tone === 'ok' ? theme.colors.accentText : stock.tone === 'warn' ? theme.colors.danger : theme.colors.muted}
        >
          {stock.text}
        </AppText>
      </View>
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
  name: { marginTop: 2, minHeight: 34 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 6 },
});
