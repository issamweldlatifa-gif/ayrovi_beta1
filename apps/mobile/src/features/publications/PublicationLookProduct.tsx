import { Pressable, StyleSheet, View } from 'react-native';
import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { PUBLICATION_THEME as P, RADIUS, STATUS } from '@/design/tokens.mobile';
import { formatMoney } from '@/format/money';
import { useT } from '@/i18n';
import { PUBLICATION_TYPE, PublicationIcon, PublicationText } from './publicationDesign';
import { openPublicationProduct } from './publicationProductNavigation';

export function PublicationLookProduct({ item, tileWidth, saved, onFavorite }: {
  item: LinkedProduct; tileWidth?: number; saved: boolean; onFavorite: () => void;
}) {
  const t = useT();
  const { isRTL } = useTheme();
  const grid = tileWidth !== undefined;
  const direction = rowDirectionFor(isRTL);
  const compare = item.compareAtPrice && item.compareAtPrice > item.price ? item.compareAtPrice : null;
  const discount = compare ? Math.round(100 * (1 - item.price / compare)) : 0;
  const sale = STATUS.danger.light.fg;
  return <View testID={`publication-look-product-${item.id}`} style={grid ? { width: tileWidth } : styles.row}>
    <Pressable accessibilityRole="link" accessibilityLabel={item.name} onPress={() => openPublicationProduct(item.id)}
      style={grid ? null : [styles.rowLink, { flexDirection: direction }]}>
      <View testID="publication-look-product-image" style={[styles.image, grid ? { height: tileWidth * 458 / 322 } : styles.rowImage]}>
        <AppImage uri={mediaUrl(item.image)} decorative contentFit="contain" style={StyleSheet.absoluteFill} />
        {grid && (compare || item.isNew) ? <View style={styles.badges} pointerEvents="none">
          {compare ? <PublicationText variant="captionStrong" color={P.paper} style={[styles.badge, { backgroundColor: sale }]}>{t('publisher.promo')}</PublicationText> : null}
          {item.isNew ? <PublicationText variant="captionStrong" style={styles.badge}>{t('publication.productNew')}</PublicationText> : null}
        </View> : null}
      </View>
      <View style={grid ? styles.gridCopy : styles.rowCopy}>
        {item.brand ? <PublicationText variant="bodyStrong" numberOfLines={1}>{item.brand}</PublicationText> : null}
        <PublicationText numberOfLines={grid ? 2 : 3}>{item.name}</PublicationText>
        <PublicationText style={styles.price} variant={compare ? 'bodyStrong' : 'body'} color={compare ? sale : P.ink}>{formatMoney(item.price)}</PublicationText>
        {compare ? <PublicationText variant="caption" color={P.muted}>{t('publication.campaignCompare')}{' '}
          <PublicationText variant="caption" color={P.muted} style={styles.compare}>{formatMoney(compare)}</PublicationText>
          {discount > 0 ? <PublicationText variant="caption" color={sale}>{`  −${discount}%`}</PublicationText> : null}
        </PublicationText> : null}
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={t(saved ? 'publisher.unsave' : 'publisher.save', { name: item.name })}
      accessibilityState={{ selected: saved }} onPress={onFavorite} style={[styles.heart, grid && styles.gridHeart]}>
      <PublicationIcon name={saved ? 'heart' : 'heart-outline'} size={26} color={P.ink} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  row: { marginBottom: 12, minHeight: 126 },
  rowLink: { gap: 8, paddingEnd: PUBLICATION_TYPE.touch },
  image: { backgroundColor: P.neutral, overflow: 'hidden', borderRadius: RADIUS.md },
  rowImage: { width: 76, height: 126, borderStartStartRadius: 0, borderEndStartRadius: 0 },
  rowCopy: { flex: 1, paddingTop: 10 },
  gridCopy: { paddingTop: 12 },
  price: { marginTop: 8 },
  compare: { textDecorationLine: 'line-through' },
  heart: { position: 'absolute', top: 8, end: 0, width: PUBLICATION_TYPE.touch, height: PUBLICATION_TYPE.touch, alignItems: 'center', justifyContent: 'center' },
  gridHeart: { end: 8, borderRadius: PUBLICATION_TYPE.touch / 2, backgroundColor: P.paper },
  badges: { position: 'absolute', start: 8, bottom: 8, gap: 4, alignItems: 'flex-start' },
  badge: { borderRadius: RADIUS.xs, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: P.paper },
});
