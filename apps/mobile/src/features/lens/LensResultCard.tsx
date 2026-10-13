import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { LensCandidate } from '@/api/lens';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import { availabilityKey } from './lensView';
import { lensMediaChain } from './lensMedia';
import { LensPriceBlock } from './LensPriceBlock';

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;

export function LensResultCard({
  candidate,
  favorite,
  stockBusy,
  onOpen,
  onFavorite,
  onCheckStock,
}: {
  candidate: LensCandidate;
  favorite: boolean;
  stockBusy: boolean;
  onOpen: (candidate: LensCandidate) => void;
  onFavorite: (candidate: LensCandidate) => void;
  onCheckStock: (candidate: LensCandidate) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const media = lensMediaChain(candidate.image || candidate.images[0], 'card');
  const hasOptions = candidate.colors.length > 0 || candidate.sizes.length > 0;
  const merchantRating = candidate.ratingKind === 'merchant' && candidate.rating != null
    ? candidate.rating
    : null;
  const match = candidate.match != null && Number.isFinite(candidate.match)
    ? Math.max(0, Math.min(100, Math.round(candidate.match)))
    : null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.line,
          borderRadius: theme.radius.card,
        },
      ]}
      testID={`lens-card-${candidate.id}`}
    >
      <View style={[styles.topRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
        <AppText variant="caption" color={theme.colors.muted} numberOfLines={1} style={styles.source}>
          {candidate.source}
        </AppText>
        <Pressable
          onPress={() => onFavorite(candidate)}
          disabled={favorite}
          accessibilityRole="button"
          accessibilityLabel={t(favorite ? 'lens.favorited' : 'lens.favorite')}
          accessibilityState={{ selected: favorite, disabled: favorite }}
          hitSlop={HIT_SLOP}
          testID={`lens-favorite-${candidate.id}`}
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? theme.opacity.subtle : 1 }]}
        >
          <Ionicons
            name={favorite ? 'heart' : 'heart-outline'}
            size={theme.iconSize.md}
            color={favorite ? theme.colors.accent : theme.colors.ink}
            accessibilityElementsHidden
          />
        </Pressable>
      </View>

      <Pressable
        onPress={() => onOpen(candidate)}
        accessibilityRole="button"
        accessibilityLabel={t('lens.viewProduct', { title: candidate.title })}
        testID={`lens-result-${candidate.id}`}
      >
        <AppImage
          uri={media[0]}
          fallbackUris={media.slice(1)}
          contentFit="contain"
          style={[styles.media, { backgroundColor: theme.colors.infoSoft }]}
          accessibilityLabel={candidate.title}
          testID={`lens-result-image-${candidate.id}`}
        />
      </Pressable>

      {(hasOptions || candidate.promo || candidate.offerCount > 1) ? (
        <View style={[styles.flags, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
          {candidate.promo ? (
            <View style={[styles.flag, { backgroundColor: theme.status.warning.soft, borderColor: theme.status.warning.border }]}>
              <AppText variant="caption" weight="bold" color={theme.status.warning.fg}>{t('lens.promo')}</AppText>
            </View>
          ) : null}
          {hasOptions ? (
            <View style={[styles.flag, { backgroundColor: theme.status.info.soft, borderColor: theme.status.info.border }]}>
              <AppText variant="caption" color={theme.status.info.fg}>{t('lens.optionsAvailable')}</AppText>
            </View>
          ) : null}
          {candidate.offerCount > 1 ? (
            <View style={[styles.flag, { backgroundColor: theme.status.info.soft, borderColor: theme.status.info.border }]}>
              <AppText variant="caption" color={theme.status.info.fg}>{t('lens.offerCount', { count: candidate.offerCount })}</AppText>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.copy}>
        {candidate.brand ? <AppText variant="caption" weight="bold">{candidate.brand}</AppText> : null}
        <AppText variant="label" numberOfLines={2}>{candidate.title}</AppText>
        {candidate.description ? (
          <AppText variant="caption" color={theme.colors.muted} numberOfLines={2}>{candidate.description}</AppText>
        ) : null}
        {merchantRating != null || match != null ? (
          <View style={[styles.metaRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
            {merchantRating != null ? (
              <>
                <Ionicons name="star" size={theme.iconSize.sm} color={theme.status.warning.fg} accessibilityElementsHidden />
                <AppText variant="caption">{merchantRating.toFixed(1)}</AppText>
                {candidate.ratingCount != null ? (
                  <AppText variant="caption" color={theme.colors.muted}>{`(${candidate.ratingCount})`}</AppText>
                ) : null}
              </>
            ) : match != null ? (
              <AppText variant="caption" weight="bold">{t('lens.match', { percent: match })}</AppText>
            ) : null}
          </View>
        ) : null}
        <LensPriceBlock candidate={candidate} compact />
        <AppText variant="caption" color={theme.colors.muted}>
          {t(availabilityKey(candidate.availability) as TranslationKey)}
        </AppText>
      </View>

      <Pressable
        onPress={() => onCheckStock(candidate)}
        disabled={stockBusy}
        accessibilityRole="button"
        accessibilityLabel={t('lens.product.checkStock')}
        accessibilityState={{ busy: stockBusy, disabled: stockBusy }}
        testID={`lens-stock-${candidate.id}`}
        style={({ pressed }) => [
          styles.stockButton,
          {
            borderTopColor: theme.colors.line,
            opacity: stockBusy ? theme.opacity.disabled : pressed ? theme.opacity.subtle : 1,
          },
        ]}
      >
        <Ionicons name="refresh-outline" size={theme.iconSize.sm} color={theme.colors.ink} accessibilityElementsHidden />
        <AppText variant="caption" weight="bold">
          {stockBusy ? t('lens.product.stockChecking') : t('lens.product.checkStock')}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 0, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  topRow: { alignItems: 'center', paddingHorizontal: 8, minHeight: 44 },
  source: { flex: 1 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  media: { width: '100%', aspectRatio: 9 / 13 },
  flags: { gap: 4, flexWrap: 'wrap', paddingHorizontal: 8, paddingTop: 8 },
  flag: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  copy: { gap: 4, padding: 8 },
  metaRow: { alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  stockButton: {
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
});
