import { Pressable, StyleSheet, View } from 'react-native';
import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { BRAND } from '@/design/tokens.generated';
import { RADIUS } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { formatAmount } from '@/format/money';

export function HighlightProductCard({ product, onPress, compact = false, testID }: {
  product: LinkedProduct; onPress: () => void; compact?: boolean; testID: string;
}) {
  const t = useT();
  const price = `${formatAmount(product.price)} ${product.currency}`;
  const action = t(compact ? 'highlights.watch' : 'highlights.buy');
  return <Pressable testID={testID} onPress={onPress} accessibilityRole={compact ? 'button' : 'link'}
    accessibilityLabel={`${action} · ${product.name} · ${price}`}
    style={({ pressed }) => [styles.card, compact ? styles.compact : styles.shop, pressed && styles.pressed]}>
    <View style={[styles.photo, compact && styles.compactPhoto]}>
      <AppImage uri={mediaUrl(product.image)} decorative contentFit="contain" style={StyleSheet.absoluteFill} />
    </View>
    {!compact ? <AppText variant="caption" color={BRAND.black} numberOfLines={1} align="center">{product.name}</AppText> : null}
    <AppText variant="captionStrong" color={BRAND.black} numberOfLines={1} adjustsFontSizeToFit align="center">{price}</AppText>
    {!compact ? <View style={styles.buy}><AppText variant="captionStrong" color={BRAND.white} align="center">{action}</AppText></View> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.white, borderRadius: RADIUS.md, overflow: 'hidden', gap: 3 },
  shop: { padding: 6, width: '100%' },
  compact: { padding: 4, width: 72 },
  photo: { height: 62, backgroundColor: BRAND.lightGray, overflow: 'hidden', borderRadius: 8 },
  compactPhoto: { height: 42 },
  buy: { borderRadius: RADIUS.full, backgroundColor: BRAND.black, minHeight: 28, justifyContent: 'center', paddingHorizontal: 4 },
  pressed: { opacity: 0.83 },
});
