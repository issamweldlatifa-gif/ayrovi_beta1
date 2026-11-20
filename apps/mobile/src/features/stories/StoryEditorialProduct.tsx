import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { mediaUrl } from '@/api/client';
import type { LinkedProduct } from '@/api/linkedProduct';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { ICON_SIZE, RADIUS, PUBLICATION_THEME as P } from '@/design/tokens.mobile';
import { useTheme } from '@/design/theme';
import { BRAND } from '@/design/tokens.generated';
import { AppText } from '@/design/ui';
import { formatAmount } from '@/format/money';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';
import { useProductFavorites } from '@/features/reels/useProductFavorites';

export function useStoryFavorites() {
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const favorites = useProductFavorites(signedIn, session.account?.id);
  return { isFavorite: favorites.isFavorite, toggle: (id: string) => signedIn ? favorites.toggle(id) : router.push('/sign-in') };
}

export function StoryEditorialProduct({ item, width, saved, onFavorite }: {
  item: LinkedProduct; width?: number; saved: boolean; onFavorite: () => void;
}) {
  const { isRTL } = useTheme();
  const t = useT();
  const tile = width !== undefined;
  const direction = rowDirectionFor(isRTL);
  const price = `${formatAmount(item.price)} ${item.currency}`;
  const discounted = item.compareAtPrice != null && item.compareAtPrice > item.price;
  return <View testID={`editorial-story-product-${item.id}`} style={tile ? { width } : [styles.card, { flexDirection: direction }]}>
    <Pressable accessibilityRole="link" accessibilityLabel={[item.brand, item.name, price].filter(Boolean).join(' — ')}
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })}
      style={tile ? undefined : [styles.link, { flexDirection: direction }]}>
      <View style={tile ? styles.tileImage : styles.thumbnail}>
        {item.image ? <AppImage uri={mediaUrl(item.image)} decorative contentFit="contain" style={StyleSheet.absoluteFill} /> : null}
      </View>
      <View style={tile ? styles.tileCopy : styles.copy}>
        {item.brand ? <AppText color={P.ink} variant="bodyStrong" numberOfLines={1}>{item.brand}</AppText> : null}
        <AppText color={P.ink} numberOfLines={tile ? 2 : 1}>{item.name}</AppText>
        <AppText color={P.ink} variant={tile ? 'bodyStrong' : 'body'}>{price}</AppText>
        {tile && discounted ? <AppText variant="caption" color={P.ink} style={styles.compare}>{formatAmount(item.compareAtPrice!)} {item.currency}</AppText> : null}
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityState={{ selected: saved }}
      accessibilityLabel={t(saved ? 'publisher.unsave' : 'publisher.save', { name: item.name })} onPress={onFavorite}
      style={[styles.favorite, tile && styles.tileFavorite]}>
      <Ionicons name={saved ? 'heart' : 'heart-outline'} color={P.ink} size={ICON_SIZE.md} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.white, borderRadius: RADIUS.lg, alignItems: 'center', minHeight: 80, overflow: 'hidden' },
  link: { flex: 1, minWidth: 0, alignItems: 'center' },
  thumbnail: { width: 56, minHeight: 80, alignSelf: 'stretch', backgroundColor: P.neutral, borderRadius: RADIUS.lg, overflow: 'hidden' },
  copy: { flex: 1, padding: 8 },
  tileImage: { width: '100%', aspectRatio: 322 / 465, backgroundColor: P.neutral, borderRadius: RADIUS.lg, overflow: 'hidden' },
  tileCopy: { paddingTop: 8, gap: 4 },
  favorite: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.white, borderRadius: RADIUS.full },
  tileFavorite: { position: 'absolute', top: 8, end: 8 },
  compare: { textDecorationLine: 'line-through' },
});
