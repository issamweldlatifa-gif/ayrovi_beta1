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
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.line,
          borderRadius: theme.radius.card,
          opacity: appear,
          transform: [{ translateY: rise }, { scale }],
          ...theme.elevation.low,
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
            style={[styles.media, { backgroundColor: theme.colors.infoSoft }]}
            accessibilityLabel={candidate.title}
            testID={`lens-result-image-${candidate.id}`}
          />
          {candidate.promo ? (
            <View style={[styles.promo, theme.isRTL ? styles.promoRight : styles.promoLeft]}>
              <AppText variant="caption" weight="bold" color={LENS_COLORS.white}>{t('lens.promo')}</AppText>
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
              { backgroundColor: theme.colors.surface, opacity: pressed ? theme.opacity.subtle : 1 },
            ]}
          >
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={theme.iconSize.md}
              color={favorite ? LENS_COLORS.sale : theme.colors.ink}
              accessibilityElementsHidden
            />
          </Pressable>
        </View>

        <View style={styles.copy}>
          {candidate.brand ? <AppText variant="caption" weight="bold" numberOfLines={1}>{candidate.brand}</AppText> : null}
          <AppText variant="label" numberOfLines={2}>{candidate.title}</AppText>
          {candidate.description ? (
            <AppText variant="caption" color={theme.colors.muted} numberOfLines={2}>{candidate.description}</AppText>
          ) : null}
          {rating != null ? (
            <View style={[styles.rating, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
              <Ionicons name="star" size={theme.iconSize.sm} color={LENS_COLORS.star} accessibilityElementsHidden />
              <AppText variant="caption" weight="bold">{rating.toFixed(1)}</AppText>
              {candidate.ratingCount != null ? (
                <AppText variant="caption" color={theme.colors.muted}>{`(${candidate.ratingCount})`}</AppText>
              ) : null}
            </View>
          ) : null}
          <LensPriceBlock candidate={candidate} compact />
          {visibleOptions.length > 0 ? (
            <View style={[styles.options, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
              {visibleOptions.map((option) => (
                <View key={option} style={[styles.option, { borderColor: theme.colors.lineControl, borderRadius: theme.radius.xs }]}>
                  <AppText variant="caption" numberOfLines={1}>{option}</AppText>
                </View>
              ))}
              {remainingOptions > 0 ? (
                <AppText variant="caption" color={theme.colors.muted}>{`+${remainingOptions}`}</AppText>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 0, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  mediaWrap: { position: 'relative' },
  media: { width: '100%', aspectRatio: 4 / 5 },
  promo: {
    position: 'absolute', top: 10, backgroundColor: LENS_COLORS.sale,
    borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6,
  },
  promoLeft: { left: 10 },
  promoRight: { right: 10 },
  favorite: {
    position: 'absolute', top: 8, width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center', borderRadius: 22,
  },
  favoriteRight: { right: 8 },
  favoriteLeft: { left: 8 },
  copy: { gap: 6, padding: 10 },
  rating: { alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  options: { alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 2 },
  option: { minHeight: 28, minWidth: 34, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
