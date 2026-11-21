import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BlackFridayOffer } from '@/api/blackFriday';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { NavigationIcon } from '@/design/NavigationIcon';
import { rowDirectionFor } from '@/design/layoutLogic';
import { BLACK_FRIDAY_EDITORIAL as B, PUBLICATION_THEME as P, RADIUS } from '@/design/tokens.mobile';
import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { useProductFavorites } from '@/features/reels/useProductFavorites';
import { formatMoney } from '@/format/money';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';
import { BlackFridayBadge } from './BlackFridayBadge';
import { openBlackFridayProduct } from './BlackFridaySection';

export function BlackFridayProducts({ products, badge, width }: { products: BlackFridayOffer[]; badge: string; width: number }) {
  const t = useT();
  const { isRTL } = useTheme();
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const favorites = useProductFavorites(signedIn, session.account?.id);
  const [panel, setPanel] = useState<'sort' | 'filter' | null>(null);
  const [sort, setSort] = useState<'default' | 'asc' | 'desc'>('default');
  const [brand, setBrand] = useState('');
  const brands = [...new Set(products.map(offer => offer.brand).filter((value): value is string => Boolean(value)))];
  const activeBrand = brands.includes(brand) ? brand : '';
  const visible = products.filter(offer => !activeBrand || offer.brand === activeBrand);
  if (sort !== 'default') visible.sort((a, b) => sort === 'asc' ? a.price - b.price : b.price - a.price);
  const row = { flexDirection: rowDirectionFor(isRTL) };
  const tile = Math.max(1, (width - 4) / 2);
  const title = (offer: BlackFridayOffer) => offer.brand && offer.name.startsWith(`${offer.brand} · `) ? offer.name.slice(offer.brand.length + 3) : offer.name;
  return <View style={styles.content} testID="black-friday-product-grid">
    <View style={[styles.toolbar, row]}>
      <AppText variant="body" color={P.muted} style={styles.count}>{visible.length === 1 ? t('blackFriday.countOne') : t('blackFriday.count', { count: visible.length })}</AppText>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: panel === 'sort' }} style={[styles.tool, row]} onPress={() => setPanel(panel === 'sort' ? null : 'sort')}>
        <NavigationIcon name="swap-vertical-outline" color={P.ink} size={18} />
        <AppText variant="captionStrong">{t('blackFriday.sort')}</AppText>
      </Pressable>
      {brands.length > 1 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: panel === 'filter' }} style={[styles.tool, row]} onPress={() => setPanel(panel === 'filter' ? null : 'filter')}>
        <NavigationIcon name="options-outline" color={P.ink} size={18} />
        <AppText variant="captionStrong">{t('blackFriday.filters')}</AppText>
      </Pressable> : null}
    </View>
    {panel ? <View style={[styles.options, row]}>
      {panel === 'sort' ? (['default', 'asc', 'desc'] as const).map(option => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: sort === option }}
        style={styles.option} onPress={() => { setSort(option); setPanel(null); }}><AppText variant="captionStrong">{t(`blackFriday.sort.${option}`)}</AppText></Pressable>) :
        ['', ...brands].map(option => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: activeBrand === option }}
          style={styles.option} onPress={() => { setBrand(option); setPanel(null); }}><AppText variant="captionStrong">{option || t('blackFriday.allBrands')}</AppText></Pressable>)}
    </View> : null}
    <View style={[styles.grid, row]}>
      {visible.map(offer => {
        const saved = signedIn && favorites.isFavorite(offer.id);
        return <View key={offer.id} style={{ width: tile }}>
          <Pressable testID={`black-friday-product-${offer.id}`} accessibilityRole="link" accessibilityLabel={offer.name}
            onPress={() => openBlackFridayProduct(offer.id)}>
            <View style={styles.photo}>
              <AppImage uri={mediaUrl(offer.image)} decorative contentFit="contain" style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, styles.marks, isRTL && styles.mirror]} pointerEvents="none">
                <BlackFridayBadge label={badge} testID="black-friday-product-badge" />
              </View>
            </View>
            <View style={styles.copy}>
              {offer.brand ? <AppText variant="bodyStrong" color={P.ink} numberOfLines={1}>{offer.brand}</AppText> : null}
              <AppText variant="body" color={P.ink} numberOfLines={1}>{title(offer)}</AppText>
              <AppText variant="caption" color={P.muted}>{t('blackFriday.reference')}{' '}
                <AppText variant="caption" color={P.muted} style={styles.compare}>{formatMoney(offer.compareAtPrice)}</AppText>{' '}
                <AppText variant="captionStrong" color={B.red}>−{offer.discountPercent}%</AppText>
              </AppText>
              <AppText variant="h2" color={P.ink}>{formatMoney(offer.price)}</AppText>
            </View>
          </Pressable>
          {signedIn ? <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.favoriteLayer, isRTL && styles.mirror]}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('blackFriday.favorite', { name: offer.name })} accessibilityState={{ selected: saved }}
              style={styles.favorite} onPress={() => favorites.toggle(offer.id)}>
              <NavigationIcon name={saved ? 'heart' : 'heart-outline'} color={saved ? B.red : P.ink} size={25} />
            </Pressable>
          </View> : null}
        </View>;
      })}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: 2 }, grid: { flexWrap: 'wrap', columnGap: 4, rowGap: 24 },
  toolbar: { minHeight: 48, alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  count: { flex: 1 }, tool: { gap: 4, minHeight: 44, alignItems: 'center' },
  options: { flexWrap: 'wrap', gap: 6, padding: 8 },
  option: { minHeight: 44, justifyContent: 'center', borderRadius: RADIUS.full, borderWidth: StyleSheet.hairlineWidth, borderColor: P.muted, paddingHorizontal: 8 },
  photo: { aspectRatio: 0.66, backgroundColor: P.neutral, overflow: 'hidden' },
  marks: { justifyContent: 'flex-end', alignItems: 'flex-start', padding: 8 }, mirror: { direction: 'rtl' },
  favoriteLayer: { alignItems: 'flex-end', padding: 8 },
  favorite: { width: 44, height: 44, borderRadius: 22, backgroundColor: P.paper, alignItems: 'center', justifyContent: 'center' },
  copy: { padding: 12, gap: 2 }, compare: { textDecorationLine: 'line-through' },
});
