import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme, webDirection } from '@/design/theme';
import { formatAmount } from '@/format/money';
import { useI18n, useT } from '@/i18n';
import { ReelViewerGlyph, ReelViewerText } from './ReelViewerChrome';
import { REEL_VIEWER as V, type reelViewerCardSize } from './reelViewerStyle';

export function ReelArticleCard({ product, size, testID, onFavorite, favorite, mirror, interactive }: {
  product: LinkedProduct; size: ReturnType<typeof reelViewerCardSize>; testID: string;
  onFavorite?: () => void; favorite: boolean; mirror?: ViewStyle; interactive: boolean;
}) {
  const { isRTL, opacity } = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const priceLabel = (value: number) => `${formatAmount(value)} ${product.currency}`;
  const brand = product.brand?.trim();
  const price = priceLabel(product.price);
  const previousPrice = product.compareAtPrice;
  const reference = typeof previousPrice === 'number' && Number.isFinite(previousPrice) && previousPrice > product.price ? priceLabel(previousPrice) : null;
  const savings = reference && previousPrice ? 1 - product.price / previousPrice : 0;
  const discount = savings >= 0.005 ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(-savings) : '';
  const label = [brand, product.name, price, reference ? `${t('cart.originally')} ${reference}` : '', discount, product.available === false ? t('shopping.unavailable') : ''].filter(Boolean).join(' — ');
  // The scroller is RTL on web, but this card mirrors its own rows and touch targets.
  return <View style={[styles.card, webDirection(false), { width: size.width, height: size.height }, mirror]}>
    <Pressable testID={testID} accessibilityRole="link" accessibilityLabel={label} tabIndex={interactive ? 0 : -1}
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })}
      style={({ pressed }) => [styles.link, { flexDirection: rowDirectionFor(isRTL), opacity: pressed ? opacity.dimmed : 1 }]}>
      <View testID={`${testID}-photo`} style={[styles.photo, { width: size.thumb }]}>
        {product.image ? <AppImage uri={mediaUrl(product.image)} contentFit="contain" decorative style={StyleSheet.absoluteFill} /> : null}
      </View>
      <View style={[styles.copy, onFavorite ? (isRTL ? styles.copyRTL : styles.copyLTR) : null]}>
        {brand ? <ReelViewerText tone="brand" weight="bold" color={V.ink} numberOfLines={1}>{brand}</ReelViewerText> : null}
        <ReelViewerText tone="product" color={V.ink} numberOfLines={1}>{product.name}</ReelViewerText>
        <ReelViewerText testID={`${testID}-price`} tone="price" weight={reference ? 'bold' : 'regular'} color={reference ? V.savings : V.ink}
          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{price}</ReelViewerText>
        {reference ? <View style={[styles.references, { flexDirection: rowDirectionFor(isRTL) }]}>
          <ReelViewerText testID={`${testID}-reference`} tone="reference" color={V.secondary} numberOfLines={1} style={styles.struck}>{reference}</ReelViewerText>
          {discount ? <ReelViewerText tone="reference" color={V.savings} numberOfLines={1}>{discount}</ReelViewerText> : null}
        </View> : null}
        {product.available === false ? <ReelViewerText tone="reference" color={V.secondary} numberOfLines={1}>{t('shopping.unavailable')}</ReelViewerText> : null}
      </View>
    </Pressable>
    {onFavorite ? <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.favoriteOverlay, { alignItems: isRTL ? 'flex-start' : 'flex-end' }]}>
      <Pressable testID={`linked-product-fav-${product.id}`} accessibilityRole="button" tabIndex={interactive ? 0 : -1}
      accessibilityLabel={favorite ? t('shopping.favouriteRemove') : t('shopping.favouriteAdd')} accessibilityState={{ selected: favorite }}
      onPress={onFavorite} style={styles.favorite}>
      <ReelViewerGlyph name="heart" size={V.railGlyph} color={V.ink} selected={favorite} />
      </Pressable>
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  card: { borderRadius: V.cardRadius, backgroundColor: V.paper, overflow: 'hidden' },
  link: { flex: 1 },
  photo: { backgroundColor: V.photo, marginBottom: 8, overflow: 'hidden' },
  copy: { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingTop: 8, gap: 4 },
  copyLTR: { paddingRight: V.railTarget }, copyRTL: { paddingLeft: V.railTarget },
  references: { alignItems: 'center', gap: 6 },
  struck: { textDecorationLine: 'line-through', flexShrink: 1 },
  favoriteOverlay: { paddingTop: 2 },
  favorite: { width: V.railTarget, height: V.railTarget, alignItems: 'center', justifyContent: 'center' },
});
