import { reelCaption } from '@/features/reels/reelCaption';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';
import type { ProductFavorites } from '@/features/reels/useProductFavorites';
import type { DiscoveryItem } from '@/api/socialCommerce';
import { CARD_SYSTEM, editorialRailMetrics } from '@/design/cardSystem';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { BRAND } from '@/design/tokens.generated';
import { RADIUS, RHYTHM, SOCIAL_EDITORIAL, veil } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { useI18n } from '@/i18n';
import { ReelPreview } from '@/features/reels/ReelPreview';
import { LinkedProductCard } from '@/features/shopping/LinkedProductCard';

const openProduct = (id: string) => router.push({ pathname: '/product/[id]', params: { id } });

function EditorialProduct({ product, favourites, width }: { product: LinkedProduct; favourites?: ProductFavorites; width: number }) {
  return <LinkedProductCard product={product} variant="editorial" editorialWidth={width} favourite={favourites?.isFavorite(product.id)}
    onToggleFavorite={favourites ? () => favourites.toggle(product.id) : undefined} />;
}

function ProductRail({ products, favourites, width }: { products: LinkedProduct[]; favourites?: ProductFavorites; width: number }) {
  const rail = editorialRailMetrics(width, products.length);
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast"
    snapToInterval={rail.snap} snapToAlignment="start" contentContainerStyle={styles.rail}>
    {products.map(product => <EditorialProduct key={product.id} product={product} favourites={favourites} width={rail.cardWidth} />)}
  </ScrollView>;
}

export function SocialFeedCard({ item, active, square, onOpenStory, cached, favourites, onAddLook }: {
  item: DiscoveryItem; active: boolean; square: boolean; cached: boolean; onAddLook?: () => void; favourites?: ProductFavorites; onOpenStory: (id: string) => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const columnWidth = Math.min(width, SOCIAL_EDITORIAL.contentMaxWidth);
  const { t, locale } = useI18n();
  if (item.kind === 'reel') {
    const reel = item.reel;
    const copy = reelCaption(reel, locale);
    const title = copy.title || t('socialCommerce.filter.reels');
    return <View style={[styles.column, styles.section]}>
      <View style={[styles.media, { aspectRatio: square ? 1 : SOCIAL_EDITORIAL.portraitAspect }]}>
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
      {item.products.length ? <ProductRail products={item.products} favourites={favourites} width={columnWidth} /> : null}
    </View>;
  }
  if (item.kind === 'story') {
    const title = locale === 'ar' && item.story.titleAr ? item.story.titleAr : item.story.title || t('sections.stories');
    const description = locale === 'ar' && item.story.descriptionAr ? item.story.descriptionAr : item.story.description;
    return <View style={[styles.column, styles.group]}>
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
  if (item.kind === 'article') return <View style={[styles.column, styles.group]}>
    <Pressable disabled={cached} accessibilityRole="link" style={[styles.article, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}
      onPress={() => router.push({ pathname: '/news/[id]', params: { id: item.newsId } })}>
      <View style={styles.articleCopy}>
        <AppText variant="captionStrong" color={theme.colors.muted}>{t('socialCommerce.editorial')}</AppText>
        <AppText variant="h3">{item.title}</AppText>
        {item.description ? <AppText variant="body" numberOfLines={3}>{item.description}</AppText> : null}
        {item.author ? <AppText variant="caption" color={theme.colors.muted}>{item.author}</AppText> : null}
      </View>
      {item.image ? <AppImage uri={mediaUrl(item.image)} decorative contentFit="cover" style={styles.thumbnail} /> : null}
    </Pressable>
  </View>;
  if (item.kind === 'pick') return <View style={[styles.column, styles.group]}>
    <AppText variant="captionStrong" color={theme.colors.muted}>{t('socialCommerce.pick')}</AppText>
    <AppText variant="h3">{item.title}</AppText>
    {item.description ? <AppText>{item.description}</AppText> : null}
    <EditorialProduct product={item.product} favourites={favourites} width={editorialRailMetrics(columnWidth, 1).cardWidth} />
  </View>;
  return <View style={[styles.column, styles.group]}>
    <AppText variant="captionStrong" color={theme.colors.muted}>{t('socialCommerce.look')}</AppText>
    <AppText variant="h2">{item.title}</AppText>
    {item.description ? <AppText>{item.description}</AppText> : null}
    <View style={[styles.look, { backgroundColor: theme.colors.surface }] }>
      <AppImage uri={mediaUrl(item.image)} decorative contentFit="cover" style={StyleSheet.absoluteFill} />
      {item.pins.map(({ x, y, product }) => <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={product.name}
        onPress={() => openProduct(product.id)} style={[styles.pin, { left: `${x}%`, top: `${y}%` }]}>
        <View style={styles.dot} />
      </Pressable>)}
    </View>
    {item.pins.length ? <ProductRail products={item.pins.map(pin => pin.product)} favourites={favourites} width={columnWidth} /> : null}
    {onAddLook && !cached && item.pins.length ? <Button label={t('socialCommerce.lookSelect')} onPress={onAddLook} tone="quiet" /> : null}
  </View>;
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: SOCIAL_EDITORIAL.contentMaxWidth, alignSelf: 'center', paddingHorizontal: CARD_SYSTEM.gutter, marginVertical: RHYTHM.block },
  section: { gap: RHYTHM.related },
  group: { gap: RHYTHM.tight },
  media: { backgroundColor: SOCIAL_EDITORIAL.cover[2], overflow: 'hidden', borderRadius: CARD_SYSTEM.radius },
  caption: { flex: 1, justifyContent: 'flex-end', padding: 16, gap: 4 },
  rail: { gap: CARD_SYSTEM.gap },
  story: { aspectRatio: SOCIAL_EDITORIAL.storyAspect, justifyContent: 'flex-end', borderRadius: RADIUS.xl },
  storyCopy: { gap: 4, padding: 16 },
  article: { gap: RHYTHM.group, alignItems: 'flex-start' },
  articleCopy: { flex: 1, minWidth: 0, gap: RHYTHM.inline },
  thumbnail: { width: 96, aspectRatio: 3 / 4, borderRadius: RADIUS.md },
  look: { aspectRatio: SOCIAL_EDITORIAL.portraitAspect, borderRadius: RADIUS.xl, overflow: 'hidden', ...(Platform.OS !== 'web' ? { direction: 'ltr' as const } : {}) },
  pin: { position: 'absolute', width: 44, height: 44, transform: [{ translateX: -22 }, { translateY: -22 }], alignItems: 'center', justifyContent: 'center' },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 6, borderColor: BRAND.white, backgroundColor: SOCIAL_EDITORIAL.cover[1] },
});
