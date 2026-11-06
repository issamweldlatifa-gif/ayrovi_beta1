/** Compact presentation of a genuine linked catalogue product. No parallel cart or pricing logic. */
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { LinkedProduct } from '@/api/linkedProduct';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import {
  PUBLICATION_THEME as P,
  ICON_SIZE,
  RADIUS,
} from '@/design/tokens.mobile';
import { formatAmount } from '@/format/money';
import { useI18n } from '@/i18n';
export function PublicationProductLink({
  product,
  onOpen,
}: {
  product: LinkedProduct;
  onOpen?: () => void;
}) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  return (
    <Pressable
      testID={`publication-product-${product.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${ar ? 'عرض المنتج' : 'Voir le produit'} ${
        product.name
      }`}
      onPress={
        onOpen ||
        (() =>
          router.push({
            pathname: '/product/[id]',
            params: { id: product.id },
          }))
      }
      style={[styles.row, { flexDirection: ar ? 'row-reverse' : 'row' }]}
    >
      <View style={styles.image}>
        {product.image ? (
          <AppImage
            uri={mediaUrl(product.image)}
            style={styles.fill}
            contentFit="contain"
            decorative
          />
        ) : null}
      </View>
      <View style={styles.copy}>
        {product.brand ? (
          <AppText variant="caption" color={P.muted} numberOfLines={1}>
            {product.brand}
          </AppText>
        ) : null}
        <AppText variant="captionStrong" color={P.ink} numberOfLines={2}>
          {product.name}
        </AppText>
        {Number.isFinite(product.price) && product.price > 0 ? (
          <AppText variant="caption" color={P.ink}>
            {formatAmount(product.price)} {product.currency}
          </AppText>
        ) : null}
      </View>
      <AppText variant="captionStrong" color={P.accent}>
        {ar ? 'عرض' : 'Voir'}
      </AppText>
      <Ionicons
        name={ar ? 'chevron-back' : 'chevron-forward'}
        size={ICON_SIZE.sm}
        color={P.accent}
      />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: P.line,
  },
  image: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: P.neutral,
  },
  fill: { width: '100%', height: '100%' },
  copy: { flex: 1, gap: 2 },
});
