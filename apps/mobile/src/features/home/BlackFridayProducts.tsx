import { Pressable, StyleSheet, View } from 'react-native';
import type { BlackFridayCampaign, BlackFridayOffer } from '@/api/blackFriday';
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

export function BlackFridayProducts({ campaign, width }: { campaign: BlackFridayCampaign; width: number }) {
  const t = useT();
  const { isRTL } = useTheme();
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const favorites = useProductFavorites(signedIn, session.account?.id);
  const tile = Math.max(1, (width - 8) / 2);
  const title = (offer: BlackFridayOffer) => offer.brand && offer.name.startsWith(`${offer.brand} · `) ? offer.name.slice(offer.brand.length + 3) : offer.name;
  return <View style={styles.content} testID="black-friday-product-grid">
    <AppText variant="body" color={P.ink}>{t('blackFriday.count', { count: campaign.products.length })}</AppText>
    <View style={[styles.grid, { flexDirection: rowDirectionFor(isRTL) }]}>
      {campaign.products.map(offer => {
        const saved = signedIn && favorites.isFavorite(offer.id);
        return <View key={offer.id} style={{ width: tile }}>
          <Pressable testID={`black-friday-product-${offer.id}`} accessibilityRole="link" accessibilityLabel={offer.name}
            onPress={() => openBlackFridayProduct(offer.id)}>
            <View style={styles.photo}>
              <AppImage uri={mediaUrl(offer.image)} decorative contentFit="cover" style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, styles.marks, isRTL && styles.mirror]} pointerEvents="none">
                <BlackFridayBadge label={campaign.badge} testID="black-friday-product-badge" />
              </View>
            </View>
            <View style={styles.copy}>
              {offer.brand ? <AppText variant="bodyStrong" color={P.ink} numberOfLines={1}>{offer.brand}</AppText> : null}
              <AppText variant="body" color={P.ink} numberOfLines={1}>{title(offer)}</AppText>
              <AppText variant="bodyStrong" color={B.red}>{formatMoney(offer.price)}</AppText>
              <AppText variant="caption" color={P.muted}>{t('blackFriday.reference')}{' '}
                <AppText variant="caption" color={P.muted} style={styles.compare}>{formatMoney(offer.compareAtPrice)}</AppText>{' '}
                <AppText variant="captionStrong" color={B.red}>−{offer.discountPercent}%</AppText>
              </AppText>
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
  content: { gap: 24 }, grid: { flexWrap: 'wrap', columnGap: 8, rowGap: 32 },
  photo: { aspectRatio: 0.697, backgroundColor: P.neutral, borderRadius: RADIUS.lg, overflow: 'hidden' },
  marks: { justifyContent: 'flex-end', alignItems: 'flex-start', padding: 8 }, mirror: { direction: 'rtl' },
  favoriteLayer: { alignItems: 'flex-end', padding: 8 },
  favorite: { width: 44, height: 44, borderRadius: 22, backgroundColor: P.paper, alignItems: 'center', justifyContent: 'center' },
  copy: { paddingTop: 6, gap: 2 }, compare: { textDecorationLine: 'line-through' },
});
