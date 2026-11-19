import { reelCaption } from '@/features/reels/reelCaption';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';
import type { ProductFavorites } from '@/features/reels/useProductFavorites';
import type { DiscoveryItem } from '@/api/socialCommerce';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { BRAND } from '@/design/tokens.generated';
import { RADIUS, SOCIAL_EDITORIAL, veil } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { useI18n } from '@/i18n';
import { ReelPreview } from '@/features/reels/ReelPreview';
import { LinkedProductCard } from '@/features/shopping/LinkedProductCard';

const openProduct = (id: string) => router.push({ pathname: '/product/[id]', params: { id } });

function EditorialProduct({ product, favourites }: { product: LinkedProduct; favourites?: ProductFavorites }) {
  return <LinkedProductCard product={product} variant="editorial" favourite={favourites?.isFavorite(product.id)}
    onToggleFavorite={favourites ? () => favourites.toggle(product.id) : undefined} />;
}

function ProductRail({ products, favourites }: { products: LinkedProduct[]; favourites?: ProductFavorites }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast"
    snapToInterval={SOCIAL_EDITORIAL.productWidth + SOCIAL_EDITORIAL.productGap} snapToAlignment="start" contentContainerStyle={styles.rail}>
    {products.map(product => <EditorialProduct key={product.id} product={product} favourites={favourites} />)}
  </ScrollView>;
}

export function SocialFeedCard({ item, active, square, onOpenStory, cached, favourites, onAddLook }: {
  item: DiscoveryItem; active: boolean; square: boolean; cached: boolean; onAddLook?: () => void; favourites?: ProductFavorites; onOpenStory: (id: string) => void;
}) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  if (item.kind === 'reel') {
    const reel = item.reel;
    const copy = reelCaption(reel, locale);
    const title = copy.title || t('socialCommerce.filter.reels');
    return <View style={[styles.section, square ? styles.squareInset : null]}>
      <View style={[styles.media, { aspectRatio: square ? 1 : 9 / 13, borderRadius: square ? RADIUS.xl : 0 }]}>
        {reel.posterUrl ? <AppImage uri={mediaUrl(reel.posterUrl)} decorative contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
        {active ? <ReelPreview uri={reel.videoUrl} playing /> : null}
        <LinearGradient colors={['transparent', veil(0.84)]} style={StyleSheet.absoluteFill} />
        <Pressable disabled={cached} accessibilityRole="button" accessibilityLabel={title} style={styles.caption}
          onPress={() => router.push({ pathname: '/reels-viewer', params: { id: item.id } })}>
          <Ionicons name="play-circle-outline" size={theme.iconSize.lg} color={BRAND.white} />
          <AppText color={BRAND.white} variant="h3" numberOfLines={2}>{title}</AppText>
          {copy.description ? <AppText color={BRAND.white} variant="body" numberOfLines={2}>{copy.description}</AppText> : null}
        </Pressable>
      </View>
      {item.products.length ? <ProductRail products={item.products} favourites={favourites} /> : null}
    </View>;
  }
  if (item.kind === 'story') {
    const title = locale === 'ar' && item.story.titleAr ? item.story.titleAr : item.story.title || t('sections.stories');
    const description = locale === 'ar' && item.story.descriptionAr ? item.story.descriptionAr : item.story.description;
    return <View style={styles.group}>
      <Pressable disabled={cached} accessibilityRole="button" accessibilityLabel={title} style={[styles.media, styles.story]} onPress={() => onOpenStory(item.id)}>
        {item.story.mediaType === 'IMAGE' ? <AppImage uri={mediaUrl(item.story.mediaUrl)} decorative contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
        <LinearGradient colors={['transparent', veil(0.84)]} style={StyleSheet.absoluteFill} />
        <View style={styles.storyCopy}>
          <AppText color={BRAND.white} variant="label">{t('sections.stories')}</AppText>
          <AppText color={BRAND.white} variant="h2" numberOfLines={2}>{title}</AppText>
          {description ? <AppText color={BRAND.white} variant="body" numberOfLines={2}>{description}</AppText> : null}
        </View>
      </Pressable>
    </View>;
  }
  if (item.kind === 'article') return <View style={styles.group}>
    <Pressable disabled={cached} accessibilityRole="link" style={[styles.article, { borderColor: theme.colors.line }]}
      onPress={() => router.push({ pathname: '/news/[id]', params: { id: item.newsId } })}>
      <View style={styles.articleCopy}>
        <AppText variant="label" color={theme.colors.muted}>{t('socialCommerce.editorial')}</AppText>
        <AppText variant="h3">{item.title}</AppText>
        {item.description ? <AppText variant="body" numberOfLines={3}>{item.description}</AppText> : null}
        {item.author ? <AppText variant="caption" color={theme.colors.muted}>{item.author}</AppText> : null}
      </View>
      {item.image ? <AppImage uri={mediaUrl(item.image)} decorative contentFit="cover" style={styles.thumbnail} /> : null}
    </Pressable>
  </View>;
  if (item.kind === 'pick') return <View style={styles.group}>
    <AppText variant="label" color={theme.colors.muted}>{t('socialCommerce.pick')}</AppText>
    <AppText variant="h3">{item.title}</AppText>
    {item.description ? <AppText>{item.description}</AppText> : null}
    <EditorialProduct product={item.product} favourites={favourites} />
  </View>;
  return <View style={styles.group}>
    <AppText variant="label" color={theme.colors.muted}>{t('socialCommerce.look')}</AppText>
    <AppText variant="h2">{item.title}</AppText>
    {item.description ? <AppText>{item.description}</AppText> : null}
    <View style={[styles.look, { backgroundColor: theme.colors.surface }] }>
      <AppImage uri={mediaUrl(item.image)} decorative contentFit="cover" style={StyleSheet.absoluteFill} />
      {item.pins.map(({ x, y, product }) => <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={product.name}
        onPress={() => openProduct(product.id)} style={[styles.pin, { left: `${x}%`, top: `${y}%` }]}>
        <View style={styles.dot} />
      </Pressable>)}
    </View>
    {item.pins.length ? <ProductRail products={item.pins.map(pin => pin.product)} favourites={favourites} /> : null}
    {onAddLook && !cached && item.pins.length ? <Button label={t('socialCommerce.lookSelect')} onPress={onAddLook} tone="quiet" /> : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { marginVertical: 16, gap: 12 },
  squareInset: { marginHorizontal: 16 },
  group: { marginVertical: 16, paddingHorizontal: 16, gap: 8 },
  media: { backgroundColor: SOCIAL_EDITORIAL.cover[2], overflow: 'hidden' },
  caption: { flex: 1, justifyContent: 'flex-end', padding: 16, gap: 4 },
  rail: { gap: SOCIAL_EDITORIAL.productGap, paddingHorizontal: 4 },
  story: { minHeight: 230, aspectRatio: 5 / 4, justifyContent: 'flex-end', borderRadius: RADIUS.xl },
  storyCopy: { gap: 4, padding: 16 },
  article: { borderTopWidth: 2, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 16, paddingVertical: 16 },
  articleCopy: { flex: 1, gap: 4 },
  thumbnail: { width: 96, aspectRatio: 3 / 4, borderRadius: RADIUS.md },
  look: { aspectRatio: 4 / 5, borderRadius: RADIUS.xl, overflow: 'hidden', direction: 'ltr' },
  pin: { position: 'absolute', width: 44, height: 44, transform: [{ translateX: -22 }, { translateY: -22 }], alignItems: 'center', justifyContent: 'center' },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 6, borderColor: BRAND.white, backgroundColor: SOCIAL_EDITORIAL.cover[1] },
});
