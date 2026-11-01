import { memo, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { LensCandidate } from '@/api/lens';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { LENS_CARD_MEDIA_RATIO } from './lensCard';
import { lensMediaChain } from './lensMedia';
import { LensPriceBlock } from './LensPriceBlock';
import { LENS_COLORS } from './lensPalette';
import { productTitle } from './lensTitle';

type Props = {
  candidate: LensCandidate;
  favorite: boolean;
  onOpen: (candidate: LensCandidate) => void;
  onFavorite: (candidate: LensCandidate) => void;
};

/**
 * Carte éditoriale Lens à deux colonnes.
 *
 * La géométrie suit la référence commerce : grand média 2:3 (mesuré 0,667 sur
 * le modèle), gouttière blanche minimale, puis marque, nom et prix directement
 * sous l’image. Aucun panneau, aucune ombre et aucun carrousel interne ne
 * viennent agrandir la carte. Le rapport vit dans `lensCard.ts`, partagé avec
 * le squelette : la vignette ne change pas de hauteur à l'arrivée des résultats.
 */
function LensResultCardComponent({ candidate, favorite, onOpen, onFavorite }: Props) {
  const theme = useTheme();
  const t = useT();
  const intro = useRef(new Animated.Value(theme.motion.reduced === 0 ? 1 : 0)).current;
  const media = lensMediaChain(candidate.image || candidate.images[0] || '', 'card');
  const brand = candidate.brand?.trim() || candidate.source.trim();
  /* Titre PRODUIT, pas titre de page (28/10/2026) : la boutique est déjà écrite
     en gras juste au-dessus, inutile de la répéter dans le titre. */
  const title = productTitle(candidate.title, candidate);

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: theme.motion.reduced === 0 ? 0 : theme.duration.standard,
      useNativeDriver: true,
    }).start();
  }, [intro, theme.duration.standard, theme.motion.reduced]);

  const rise = intro.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const scale = intro.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] });
  const promo = candidate.promo?.label?.trim() || (candidate.promo ? t('lens.promo') : '');

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity: intro, transform: [{ translateY: rise }, { scale }] },
      ]}
    >
      <Pressable
        onPress={() => onOpen(candidate)}
        accessibilityRole="button"
        accessibilityLabel={t('lens.viewProduct', { title })}
        testID={`lens-result-${candidate.id}`}
        style={({ pressed }) => [styles.pressable, { opacity: pressed ? theme.opacity.subtle : 1 }]}
      >
        <View style={styles.mediaWrap}>
          {media.length ? (
            <AppImage
              uri={media[0]}
              fallbackUris={media.slice(1)}
              contentFit="cover"
              style={styles.media}
              accessibilityLabel={title}
            />
          ) : (
            <View style={styles.mediaFallback}>
              <Ionicons name="image-outline" size={theme.iconSize.lg} color={LENS_COLORS.resultMuted} accessibilityElementsHidden />
            </View>
          )}
          {promo ? (
            <View style={styles.promoBadge}>
              <AppText variant="caption" weight="bold" numberOfLines={1} style={styles.promoText}>{promo}</AppText>
            </View>
          ) : null}
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              if (!favorite) onFavorite(candidate);
            }}
            disabled={favorite}
            accessibilityRole="button"
            accessibilityLabel={favorite ? t('lens.favorited') : t('lens.favorite')}
            accessibilityState={{ selected: favorite, disabled: favorite }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.favorite,
              theme.isRTL ? styles.favoriteRTL : styles.favoriteLTR,
              { opacity: favorite ? theme.opacity.favorite : pressed ? theme.opacity.subtle : 1 },
            ]}
            testID={`lens-favorite-${candidate.id}`}
          >
            <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={theme.iconSize.sm} color={favorite ? LENS_COLORS.active : LENS_COLORS.black} accessibilityElementsHidden />
          </Pressable>
        </View>

        <View style={styles.copy}>
          {brand ? (
            <AppText variant="caption" weight="bold" numberOfLines={1} style={styles.brand}>{brand}</AppText>
          ) : null}
          <AppText variant="label" numberOfLines={2} style={styles.title}>{title}</AppText>
          <LensPriceBlock candidate={candidate} compact onWhite />
          {candidate.ratingKind === 'merchant' && candidate.rating != null ? (
            <View style={[styles.rating, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
              <Ionicons name="star" size={theme.iconSize.xs} color={LENS_COLORS.star} accessibilityElementsHidden />
              <AppText variant="caption" weight="semibold" style={styles.ratingText}>{candidate.rating.toFixed(1)}</AppText>
              {candidate.ratingCount ? <AppText variant="caption" color={LENS_COLORS.resultMuted}>{`(${candidate.ratingCount})`}</AppText> : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export const LensResultCard = memo(LensResultCardComponent);

const styles = StyleSheet.create({
  card: { width: '100%', backgroundColor: LENS_COLORS.white },
  pressable: { flex: 1, backgroundColor: LENS_COLORS.white },
  mediaWrap: { position: 'relative', width: '100%', aspectRatio: LENS_CARD_MEDIA_RATIO, backgroundColor: LENS_COLORS.resultMedia, overflow: 'hidden' },
  media: { width: '100%', height: '100%' },
  mediaFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  promoBadge: {
    position: 'absolute', left: 8, bottom: 8, maxWidth: '72%', minHeight: 24,
    justifyContent: 'center', backgroundColor: LENS_COLORS.sale, paddingHorizontal: 8, paddingVertical: 4,
  },
  promoText: { color: LENS_COLORS.white },
  // Cœur NU sur la vignette (17/10/2026) : la pastille blanche masquait le produit.
  favorite: {
    position: 'absolute', top: 6, width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
  },
  favoriteLTR: { right: 8 },
  favoriteRTL: { left: 8 },
  copy: { minHeight: 116, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 12, gap: 4 },
  brand: { color: LENS_COLORS.black },
  title: { color: LENS_COLORS.black, minHeight: 42 },
  rating: { alignItems: 'center', gap: 4, marginTop: 2 },
  ratingText: { color: LENS_COLORS.black },
});
