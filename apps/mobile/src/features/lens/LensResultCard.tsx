import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { LensCandidate } from '@/api/lens';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { lensMediaChain } from './lensMedia';
import { LENS_COLORS } from './lensPalette';
import { LensPriceBlock } from './LensPriceBlock';

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;

/** Carte unique des résultats Lens : visuelle, achetable et sans diagnostic. */
export function LensResultCard({
  candidate,
  favorite,
  onOpen,
  onFavorite,
}: {
  candidate: LensCandidate;
  favorite: boolean;
  onOpen: (candidate: LensCandidate) => void;
  onFavorite: (candidate: LensCandidate) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const media = lensMediaChain(candidate.image || candidate.images[0], 'card');
  const scale = useRef(new Animated.Value(1)).current;
  const appear = useRef(new Animated.Value(theme.motion.reduced === 0 ? 1 : 0)).current;
  const rise = useRef(new Animated.Value(theme.motion.reduced === 0 ? 0 : 12)).current;
  const rating = candidate.ratingKind === 'merchant' && candidate.rating != null ? candidate.rating : null;
  const cardOptions = candidate.sizes.length > 0 ? candidate.sizes : candidate.colors;
  const visibleOptions = cardOptions.slice(0, 4);
  const remainingOptions = Math.max(0, cardOptions.length - visibleOptions.length);

  useEffect(() => {
    if (theme.motion.reduced === 0) return;
    Animated.parallel([
      Animated.timing(appear, { toValue: 1, duration: theme.duration.standard, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: theme.duration.standard, useNativeDriver: true }),
    ]).start();
  }, [appear, rise, theme.duration.standard, theme.motion.reduced]);

  const animate = (toValue: number) => {
    if (theme.motion.reduced === 0) {
      scale.setValue(toValue);
      return;
    }
    Animated.spring(scale, {
      toValue,
      speed: 28,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: LENS_COLORS.white,
          opacity: appear,
          transform: [{ translateY: rise }, { scale }],
        },
      ]}
      testID={`lens-card-${candidate.id}`}
    >
      <Pressable
        onPress={() => onOpen(candidate)}
        onPressIn={() => animate(0.985)}
        onPressOut={() => animate(1)}
        accessibilityRole="button"
        accessibilityLabel={t('lens.viewProduct', { title: candidate.title })}
        testID={`lens-result-${candidate.id}`}
      >
        <View style={styles.mediaWrap}>
          <AppImage
            uri={media[0]}
            fallbackUris={media.slice(1)}
            contentFit="contain"
            style={[styles.media, { backgroundColor: LENS_COLORS.resultMedia }]}
            accessibilityLabel={candidate.title}
            testID={`lens-result-image-${candidate.id}`}
          />
          {candidate.promo ? (
            <View style={[styles.promo, theme.isRTL ? styles.promoRight : styles.promoLeft]}>
              <AppText variant="caption" weight="bold" color={LENS_COLORS.white}>{candidate.promo.label || t('lens.promo')}</AppText>
            </View>
          ) : null}
          <Pressable
            onPress={(event) => { event.stopPropagation(); onFavorite(candidate); }}
            disabled={favorite}
            accessibilityRole="button"
            accessibilityLabel={t(favorite ? 'lens.favorited' : 'lens.favorite')}
            accessibilityState={{ selected: favorite, disabled: favorite }}
            hitSlop={HIT_SLOP}
            testID={`lens-favorite-${candidate.id}`}
            style={({ pressed }) => [
              styles.favorite,
              theme.isRTL ? styles.favoriteLeft : styles.favoriteRight,
              { backgroundColor: LENS_COLORS.white, opacity: pressed ? theme.opacity.subtle : 1 },
            ]}
          >
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={theme.iconSize.md}
              color={favorite ? LENS_COLORS.sale : LENS_COLORS.black}
              accessibilityElementsHidden
            />
          </Pressable>
        </View>

        <View style={styles.copy}>
          {candidate.brand ? <AppText variant="caption" weight="bold" color={LENS_COLORS.black} numberOfLines={1}>{candidate.brand}</AppText> : null}
          <AppText variant="label" color={LENS_COLORS.black} numberOfLines={2}>{candidate.title}</AppText>
          {rating != null ? (
            <View style={[styles.rating, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
              <Ionicons name="star" size={theme.iconSize.sm} color={LENS_COLORS.star} accessibilityElementsHidden />
              <AppText variant="caption" weight="bold" color={LENS_COLORS.black}>{rating.toFixed(1)}</AppText>
              {candidate.ratingCount != null ? (
                <AppText variant="caption" color={LENS_COLORS.resultMuted}>{`(${candidate.ratingCount})`}</AppText>
              ) : null}
            </View>
          ) : null}
          <LensPriceBlock candidate={candidate} compact onWhite />
          {visibleOptions.length > 0 ? (
            <View style={[styles.options, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
              {visibleOptions.map((option) => (
                <View key={option} style={[styles.option, { borderColor: LENS_COLORS.resultLine, borderRadius: theme.radius.xs }]}>
                  <AppText variant="caption" color={LENS_COLORS.black} numberOfLines={1}>{option}</AppText>
                </View>
              ))}
              {remainingOptions > 0 ? (
                <AppText variant="caption" color={LENS_COLORS.resultMuted}>{`+${remainingOptions}`}</AppText>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 0 },
  mediaWrap: { position: 'relative', overflow: 'hidden' },
  media: { width: '100%', aspectRatio: 4 / 5 },
  promo: {
    position: 'absolute', top: 8, backgroundColor: LENS_COLORS.sale,
    borderRadius: 3, paddingHorizontal: 8, paddingVertical: 6,
  },
  promoLeft: { left: 7 },
  promoRight: { right: 7 },
  favorite: {
    position: 'absolute', top: 7, width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center', borderRadius: 20,
  },
  favoriteRight: { right: 7 },
  favoriteLeft: { left: 7 },
  copy: { gap: 6, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 12 },
  rating: { alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  options: { alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 2 },
  option: { minHeight: 28, minWidth: 34, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
