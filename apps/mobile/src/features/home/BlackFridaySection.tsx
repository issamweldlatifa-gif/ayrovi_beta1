import { memo } from 'react';
import { router, type Href } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { BlackFridayCampaign, BlackFridayOffer } from '@/api/blackFriday';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { FullBleed } from '@/design/layout';
import { BLACK_FRIDAY_EDITORIAL as B, PUBLICATION_THEME as P, RADIUS, veil } from '@/design/tokens.mobile';
import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { formatMoney } from '@/format/money';
import { useI18n } from '@/i18n';
import { blackFridayGeometry } from './blackFridayGeometry';

export const openBlackFridayDeals = () => router.push('/black-friday' as Href);
export const openBlackFridayProduct = (id: string) => router.push({ pathname: '/product/[id]', params: { id } });
type RailItem = { kind: 'product'; offer: BlackFridayOffer } | { kind: 'all' };

export const BlackFridaySection = memo(function BlackFridaySection({ campaign }: { campaign: BlackFridayCampaign }) {
  const { locale, t } = useI18n();
  const { isRTL, font } = useTheme();
  const g = blackFridayGeometry(useWindowDimensions().width);
  const cta = locale === 'ar' ? campaign.ctaAr : campaign.ctaFr;
  const items: RailItem[] = [...campaign.products.map(offer => ({ kind: 'product' as const, offer })), { kind: 'all' }];
  return <FullBleed>
    <View testID="home-black-friday" style={styles.section}>
      <View style={[styles.banner, { minHeight: g.bannerHeight, paddingBottom: g.overlap }]} testID="black-friday-banner">
        <AppText testID="black-friday-title" accessibilityRole="header" variant="display" align="center" color={P.paper}
          style={{ fontFamily: font('regular') }}>{campaign.title}</AppText>
        <AppText variant="label" align="center" color={P.paper}>{t('blackFriday.max', { percent: campaign.maxDiscount })}</AppText>
      </View>
      <FlatList testID="black-friday-rail" data={items} horizontal inverted={isRTL} showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.kind === 'all' ? 'all-deals' : item.offer.id} initialNumToRender={3} maxToRenderPerBatch={4} windowSize={5}
        accessibilityLabel={t('blackFriday.offers')}
        style={[styles.rail, { width: g.width, marginTop: -g.overlap }]}
        contentContainerStyle={{ paddingHorizontal: g.inset, gap: g.gap, minHeight: g.terminalHeight }}
        renderItem={({ item }) => item.kind === 'product'
          ? <BlackFridayTile offer={item.offer} width={g.tile} />
          : <Pressable testID="black-friday-terminal" accessibilityRole="link" accessibilityLabel={cta} onPress={openBlackFridayDeals}
              style={[styles.terminal, { width: g.tile, height: g.terminalHeight }]}>
              <AppImage testID="black-friday-terminal-image" uri={mediaUrl(campaign.cover)} decorative contentFit="cover" blurRadius={1} style={StyleSheet.absoluteFill} />
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim]} />
              <View style={styles.terminalLabel}>
                <AppText align="center" variant="bodyStrong" color={P.paper}>{cta}</AppText>
              </View>
            </Pressable>} />
      <Pressable testID="black-friday-all" accessibilityRole="link" onPress={openBlackFridayDeals}
        style={[styles.cta, { width: g.width - g.inset * 2, marginTop: g.afterRail, marginBottom: g.bottom, minHeight: Math.max(44, g.ctaHeight) }]}>
        <AppText variant="bodyStrong" align="center" color={P.ink}>{cta}</AppText>
      </Pressable>
    </View>
  </FullBleed>;
});

export function BlackFridayTile({ offer, width, showPrice = false }: { offer: BlackFridayOffer; width: number; showPrice?: boolean }) {
  const { t } = useI18n();
  return <Pressable testID={`black-friday-product-${offer.id}`} accessibilityRole="link" accessibilityLabel={offer.name}
    onPress={() => openBlackFridayProduct(offer.id)} style={{ width }}>
    <AppImage uri={mediaUrl(offer.image)} decorative contentFit="cover" style={styles.photo} />
    <View style={styles.copy}>
      <AppText variant="captionStrong" numberOfLines={showPrice ? 2 : 1} color={P.ink}>{offer.name}</AppText>
      <AppText variant="caption" color={P.muted}>
        {t('blackFriday.savings')}{' '}<AppText variant="captionStrong" color={P.ink}>{offer.discountPercent}%</AppText>
      </AppText>
      {showPrice ? <AppText variant="captionStrong" color={P.ink}>{formatMoney(offer.price)}{'  '}<AppText variant="caption" color={P.muted} style={styles.compare}>{formatMoney(offer.compareAtPrice)}</AppText></AppText> : null}
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  section: { backgroundColor: P.paper, alignItems: 'center' },
  banner: { alignSelf: 'stretch', paddingTop: 20, paddingHorizontal: 12, justifyContent: 'center', gap: 4, backgroundColor: B.navy },
  rail: { flexGrow: 0 },
  photo: { width: '100%', aspectRatio: 1, backgroundColor: P.neutral },
  copy: { paddingHorizontal: 8, paddingTop: 6, gap: 6, paddingBottom: 8 },
  compare: { textDecorationLine: 'line-through' },
  terminal: { backgroundColor: P.muted, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 20 },
  scrim: { backgroundColor: veil(0.49) },
  terminalLabel: { borderBottomWidth: 2, borderBottomColor: P.paper, paddingBottom: 2 },
  cta: { justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: RADIUS.full, borderWidth: 2, borderColor: P.ink },
});
