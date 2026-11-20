import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { foldCatalogSearch } from '../../../../../shared/catalogSearch';
import type { PublicationCampaignLayout } from '../../../../../shared/publicationCampaign';
import type { ReferencePublication } from '@/api/referencePublications';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { PUBLICATION_THEME as P, RADIUS } from '@/design/tokens.mobile';
import { formatMoney } from '@/format/money';
import { useI18n } from '@/i18n';
import type { ProductFavorites } from '@/features/reels/useProductFavorites';
import { OFFICIAL_PUBLISHER_ID, OFFICIAL_PUBLISHER_NAME, OFFICIAL_PUBLISHER_ROUTE } from './officialPublisher';
import { openPublicationProduct } from './publicationProductNavigation';
import { PublicationIcon, PublicationText } from './publicationDesign';
import { PUBLICATION_CAMPAIGN_TONES as C } from './publicationTokens';
import { usePublisherFollow } from './usePublisherFollow';

/** Reference measurements at 360 dp, independent of the number of published products. */
export const CAMPAIGN = {
  titleInset: 24, railInset: 20, gap: 16, radius: 16, photoAspect: 298 / 430,
  beforeRail: 54, afterRail: 36, followWidth: 128, followHeight: 48,
  heartDiameter: 40, filterHeight: 48, headingHeight: 128, productCopyHeight: 140, headingSize: 23, headingLine: 27,
} as const;

export function campaignTileSize(viewport: number) {
  const cardWidth = Math.max(0, (Math.min(viewport, 600) - 2 * CAMPAIGN.railInset - CAMPAIGN.gap) / 2);
  return { width: cardWidth, height: cardWidth / CAMPAIGN.photoAspect };
}

export function PublicationCampaignCard({ post, layout, viewport, query, favorites, signedIn, onAuth, onSponsor, onOpen }: {
  post: ReferencePublication; layout: PublicationCampaignLayout; viewport: number; query: string;
  favorites: ProductFavorites; signedIn: boolean; onAuth: () => void; onSponsor: () => void; onOpen: () => void;
}) {
  const { t, locale } = useI18n();
  const { isRTL } = useTheme();
  const dir = rowDirectionFor(isRTL);
  const colors = C[layout];
  const follow = usePublisherFollow(post.channelId, onAuth);
  const [filterOpen, setFilterOpen] = useState(false);
  const [promosOnly, setPromosOnly] = useState(false);
  const [brand, setBrand] = useState('');
  const official = post.channelId === OFFICIAL_PUBLISHER_ID;
  const publisher = official ? OFFICIAL_PUBLISHER_NAME : post.channelName;
  const brands = useMemo(() => [...new Set(post.products.flatMap(product => product.brand ? [product.brand] : []))], [post.products]);
  const terms = foldCatalogSearch(query).split(' ').filter(Boolean);
  const products = post.products.filter(product => {
    const search = foldCatalogSearch(`${product.name} ${product.brand ?? ''}`);
    return terms.every(term => search.includes(term)) && (!brand || product.brand === brand) && (!promosOnly || (product.compareAtPrice != null && product.compareAtPrice > product.price));
  });
  const filterCount = Number(promosOnly) + Number(Boolean(brand));
  const headline = post.title || post.subtitle || t('publication.lookTitle');
  const tile = campaignTileSize(viewport);
  const followText = t(follow.state === 'following' ? 'publication.following' : follow.state === 'error' ? 'publication.followRetry' : 'publication.follow');
  const sponsor = (color: string) => <Pressable accessibilityRole="button" accessibilityLabel={t('publication.sponsored')} onPress={onSponsor}
    style={[styles.sponsor, { flexDirection: dir }]}>
    <PublicationText variant="caption" color={color}>{t('publication.sponsored')}</PublicationText>
    <PublicationIcon name="information-circle-outline" size={14} color={color} />
  </Pressable>;
  const toggle = (label: string, selected: boolean, press: () => void) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected }}
    onPress={press} style={[styles.filterChip, selected ? styles.selectedFilter : null]}>
    <PublicationText variant="captionStrong" color={selected ? P.paper : P.ink}>{label}</PublicationText>
  </Pressable>;
  return <View testID={layout}>
    <View testID="publication-campaign-filter-area" style={styles.filterArea}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('publication.campaignFilters')} accessibilityState={{ expanded: filterOpen, selected: filterCount > 0 }}
        testID="publication-campaign-filters" onPress={() => setFilterOpen(value => !value)} style={[styles.filterButton, { flexDirection: dir }]}>
        <PublicationText variant="bodyStrong" style={styles.underline}>{t('publication.campaignFilters')}</PublicationText>
        {filterCount ? <View style={styles.filterBadge}><PublicationText variant="captionStrong" color={P.paper}>{filterCount}</PublicationText></View> : null}
      </Pressable>
      {filterOpen ? <View style={[styles.filterOptions, { flexDirection: dir }]}>
        {toggle(t('publication.campaignReset'), !promosOnly && !brand, () => { setPromosOnly(false); setBrand(''); })}
        {toggle(t('publisher.promo'), promosOnly, () => setPromosOnly(value => !value))}
        {brands.map(value => toggle(value, brand === value, () => setBrand(current => current === value ? '' : value)))}
      </View> : null}
    </View>
    <View testID="publication-campaign-headline" style={[styles.headlinePanel, { backgroundColor: colors.headline }]}>
      {post.sponsored ? sponsor(colors.ink) : null}
      <Pressable testID="publication-campaign-open" accessibilityRole="link" accessibilityLabel={headline} onPress={onOpen} style={styles.headingLink}>
        <PublicationText color={colors.ink} variant="h1" style={styles.headline}>{headline}</PublicationText>
        {post.subtitle && post.subtitle !== headline ? <PublicationText color={colors.ink} variant="h1" style={styles.headline}>{post.subtitle}</PublicationText> : null}
      </Pressable>
    </View>
    <View testID="publication-campaign-body" style={[styles.body, { backgroundColor: colors.body }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" testID="publication-campaign-products"
        contentContainerStyle={[styles.rail, { direction: isRTL ? 'rtl' : 'ltr' }]}>
        {products.map(product => {
          const saved = signedIn && favorites.isFavorite(product.id);
          const compare = product.compareAtPrice && product.compareAtPrice > product.price ? product.compareAtPrice : null;
          // Derived *only* from the explicit published compare-at price, never called a 30-day low.
          const percent = compare ? Math.round((1 - product.price / compare) * 100) : 0;
          return <View key={product.id} testID={`publication-campaign-product-${product.id}`} style={{ width: tile.width }}>
            <Pressable accessibilityRole="link" accessibilityLabel={product.name} onPress={() => openPublicationProduct(product.id)}>
              <View style={[styles.photo, tile]} testID="publication-campaign-photo">
                <AppImage uri={mediaUrl(product.image)} contentFit="contain" decorative style={StyleSheet.absoluteFill} />
                {(post.sponsored && post.actionLabel && post.actionLabel.length <= 20) || compare ? <View style={styles.badges} pointerEvents="none">
                  {post.sponsored && post.actionLabel && post.actionLabel.length <= 20 ? <PublicationText variant="captionStrong" color={colors.heartInk} style={[styles.badge, { backgroundColor: colors.heart }]}>{post.actionLabel}</PublicationText> : null}
                  {compare ? <PublicationText variant="captionStrong" color={P.paper} style={styles.promo}>{t('publisher.promo')}</PublicationText> : null}
                </View> : null}
              </View>
              <View style={styles.productCopy}>
                {post.sponsored ? <View style={styles.sponsorSpace} /> : null}
                {product.brand ? <PublicationText variant="bodyStrong" color={colors.ink} numberOfLines={1}>{product.brand}</PublicationText> : null}
                <PublicationText color={colors.ink} numberOfLines={1}>{product.name}</PublicationText>
                <View style={styles.prices}>
                  <PublicationText color={colors.ink}>{formatMoney(product.price)}</PublicationText>
                  {compare ? <PublicationText variant="caption" color={colors.ink}>
                    {t('publication.campaignCompare')}{' '}<PublicationText variant="caption" color={colors.ink} style={styles.compare}>{formatMoney(compare)}</PublicationText>
                    {percent > 0 ? `\n−${new Intl.NumberFormat(locale === 'ar' ? 'ar-TN' : 'fr-TN', { style: 'percent' }).format(percent / 100)}` : ''}
                  </PublicationText> : null}
                </View>
              </View>
            </Pressable>
            {post.sponsored ? <View pointerEvents="box-none" style={[styles.sponsorOverlay, { top: tile.height }]}>{sponsor(colors.ink)}</View> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ selected: saved }}
              accessibilityLabel={t(saved ? 'publisher.unsave' : 'publisher.save', { name: product.name })}
              onPress={() => signedIn ? favorites.toggle(product.id) : onAuth()} style={styles.heartTouch}>
              <View style={[styles.heart, { backgroundColor: colors.heart }]}><PublicationIcon name={saved ? 'heart' : 'heart-outline'} size={28} color={colors.heartInk} /></View>
            </Pressable>
          </View>;
        })}
        {!products.length ? <PublicationText color={colors.ink}>{t(post.products.length ? 'publication.photoFilteredEmpty' : 'publication.lookNoProducts')}</PublicationText> : null}
      </ScrollView>
      {publisher ? <View style={[styles.footer, { flexDirection: dir }]}>
        {post.channelId ? <Pressable testID="publication-campaign-follow" accessibilityRole="button" accessibilityLabel={followText}
          accessibilityState={{ disabled: follow.disabled, selected: follow.state === 'following' }}
          style={[styles.follow, { borderColor: colors.ink, flexDirection: dir }]} disabled={follow.disabled} onPress={follow.press}>
          <PublicationIcon name={follow.state === 'following' ? 'checkmark-outline' : 'add-outline'} color={colors.ink} size={24} />
          <PublicationText variant="bodyStrong" color={colors.ink}>{follow.state === 'pending' ? '…' : followText}</PublicationText>
        </Pressable> : null}
        {official ? <Pressable accessibilityRole="link" onPress={() => router.push(OFFICIAL_PUBLISHER_ROUTE)} style={styles.publisher}><PublicationText variant="bodyStrong" color={colors.ink}>{publisher}</PublicationText></Pressable> :
          <PublicationText variant="bodyStrong" color={colors.ink} style={styles.publisher}>{publisher}</PublicationText>}
      </View> : null}
      {follow.writeFailed ? <PublicationText accessibilityRole="alert" color={colors.ink} style={styles.followError}>{t('publication.followError')}</PublicationText> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  filterArea: { minHeight: CAMPAIGN.filterHeight, paddingTop: 2, paddingHorizontal: CAMPAIGN.railInset, backgroundColor: P.paper },
  filterButton: { alignSelf: 'flex-end', minHeight: 44, alignItems: 'center', gap: 12 },
  filterBadge: { minWidth: 20, minHeight: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: P.ink },
  underline: { textDecorationLine: 'underline' },
  filterOptions: { flexWrap: 'wrap', gap: 8, paddingBottom: 12 },
  filterChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: P.neutral, borderRadius: RADIUS.xl },
  selectedFilter: { backgroundColor: P.ink },
  headlinePanel: { minHeight: CAMPAIGN.headingHeight, justifyContent: 'center', paddingHorizontal: CAMPAIGN.titleInset, paddingTop: 8, paddingBottom: 12 },
  headingLink: { minHeight: 44, justifyContent: 'center' },
  headline: { fontSize: CAMPAIGN.headingSize, lineHeight: CAMPAIGN.headingLine },
  sponsor: { alignItems: 'center', gap: 8, minHeight: 28, alignSelf: 'flex-start' },
  sponsorSpace: { height: 28 },
  sponsorOverlay: { position: 'absolute', start: 0 },
  body: { paddingTop: CAMPAIGN.beforeRail, paddingBottom: CAMPAIGN.titleInset },
  rail: { gap: CAMPAIGN.gap, paddingHorizontal: CAMPAIGN.railInset },
  photo: { backgroundColor: C.photo, borderRadius: CAMPAIGN.radius, overflow: 'hidden' },
  badges: { position: 'absolute', start: 8, bottom: 8, gap: 4, alignItems: 'flex-start' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.xs },
  promo: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.xs, backgroundColor: C.promo },
  heartTouch: { position: 'absolute', top: 6, end: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heart: { width: CAMPAIGN.heartDiameter, height: CAMPAIGN.heartDiameter, borderRadius: CAMPAIGN.heartDiameter / 2, alignItems: 'center', justifyContent: 'center' },
  productCopy: { minHeight: CAMPAIGN.productCopyHeight, paddingTop: 4 },
  prices: { marginTop: 8 },
  compare: { textDecorationLine: 'line-through' },
  footer: { marginTop: CAMPAIGN.afterRail, paddingHorizontal: CAMPAIGN.titleInset, gap: 16, alignItems: 'center' },
  follow: { minHeight: CAMPAIGN.followHeight, minWidth: CAMPAIGN.followWidth, borderWidth: 2, borderRadius: RADIUS.xl, justifyContent: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  publisher: { flexShrink: 1 },
  followError: { paddingHorizontal: CAMPAIGN.titleInset },
});
