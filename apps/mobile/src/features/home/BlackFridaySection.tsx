import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { mediaUrl } from '@/api/client';
import type { Promotion } from '@/api/sections';
import { AppImage } from '@/design/appImage';
import { FullBleed } from '@/design/layout';
import { PUBLICATION_THEME as P, RADIUS, veil } from '@/design/tokens.mobile';
import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { OFFICIAL_PUBLISHER_ROUTE } from '@/features/publications/officialPublisher';
import { useT } from '@/i18n';

const CAMPAIGN = { maxWidth: 640, margin: 12, gap: 8, tileFraction: 0.555, overlap: 20 } as const;
const openPromotions = () => router.push('/promotions');
function openDeal(deal: Promotion) {
  const product = deal.productIds[0];
  const arrival = deal.arrivalIds[0];
  if (product) router.push({ pathname: '/product/[id]', params: { id: product } });
  else if (arrival) router.push({ pathname: OFFICIAL_PUBLISHER_ROUTE, params: { arrivalId: arrival } });
  else openPromotions();
}

export function BlackFridaySection({ promotions }: { promotions: readonly Promotion[] }) {
  const t = useT();
  const { isRTL } = useTheme();
  const { width } = useWindowDimensions();
  const cards = promotions.filter(promo => promo.image).slice(0, 12);
  const size = Math.min(CAMPAIGN.maxWidth, width) * CAMPAIGN.tileFraction;
  return <FullBleed>
    <View testID="home-black-friday" style={styles.section}>
      <View style={[styles.banner, !cards.length && styles.noCards]}>
        <AppText accessibilityRole="header" variant="display" color={P.paper} style={styles.title}>{'Black Friday\nWeek'}</AppText>
        <AppText variant="bodyStrong" color={P.paper} style={styles.center}>{t(cards.length ? 'blackFriday.subtitle' : 'blackFriday.empty')}</AppText>
      </View>
      <View style={styles.body}>
        {cards.length ? <ScrollView testID="black-friday-rail" horizontal showsHorizontalScrollIndicator={false}
          decelerationRate="fast" snapToInterval={size + CAMPAIGN.gap} style={styles.rail}
          contentContainerStyle={[styles.railContent, { direction: isRTL ? 'rtl' : 'ltr' }]}>
          {cards.map(deal => <Pressable accessibilityRole="link" accessibilityLabel={deal.name} key={deal.id} onPress={() => openDeal(deal)} style={{ width: size }}>
            <AppImage uri={mediaUrl(deal.image)} contentFit="cover" decorative style={styles.photo} />
            <AppText variant="bodyStrong" color={P.ink} numberOfLines={2} style={styles.copy}>{deal.name}</AppText>
            {['PERCENTAGE', 'PERCENT'].includes(deal.discountType) && deal.value > 0 && deal.value <= 100 ? <AppText color={P.muted} variant="caption" style={styles.copy}>{t('blackFriday.discount', { percent: deal.value })}</AppText> : null}
          </Pressable>)}
          {cards.length > 1 ? <Pressable accessibilityRole="link" onPress={openPromotions} style={[styles.allTile, { width: size, minHeight: size * 1.18 }]}>
            <AppImage uri={mediaUrl(cards[cards.length - 1]?.image)} contentFit="cover" decorative style={StyleSheet.absoluteFill} />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tileScrim]} />
            <AppText color={P.paper} variant="bodyStrong" style={[styles.center, styles.underlined]}>{t('blackFriday.all')}</AppText>
          </Pressable> : null}
        </ScrollView> : null}
        <Pressable testID="black-friday-all" accessibilityRole="link" onPress={openPromotions} style={styles.cta}>
          <AppText color={P.ink} variant="bodyStrong" style={styles.center}>{t('blackFriday.all')}</AppText>
        </Pressable>
      </View>
    </View>
  </FullBleed>;
}
const styles = StyleSheet.create({
  section: { backgroundColor: P.paper, alignItems: 'center' },
  banner: { alignSelf: 'stretch', backgroundColor: P.ink, gap: 6, paddingHorizontal: 20, paddingTop: 40, paddingBottom: 48 },
  noCards: { paddingBottom: 40 },
  center: { textAlign: 'center' }, title: { textAlign: 'center' },
  body: { width: '100%', maxWidth: CAMPAIGN.maxWidth, paddingBottom: 20, gap: 20 },
  rail: { marginTop: -CAMPAIGN.overlap }, railContent: { paddingHorizontal: CAMPAIGN.margin, gap: CAMPAIGN.gap, alignItems: 'flex-start' },
  photo: { width: '100%', aspectRatio: 1, backgroundColor: P.neutral },
  copy: { paddingHorizontal: 8, paddingTop: 6 }, allTile: { backgroundColor: P.ink, justifyContent: 'center', padding: 16 },
  tileScrim: { backgroundColor: veil(0.62) },
  underlined: { textDecorationLine: 'underline' },
  cta: { marginHorizontal: CAMPAIGN.margin, marginTop: 12, minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', borderRadius: RADIUS.full, borderWidth: 2, borderColor: P.ink },
});
