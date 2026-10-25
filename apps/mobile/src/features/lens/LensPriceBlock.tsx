import { StyleSheet, View } from 'react-native';

import type { LensCandidate } from '@/api/lens';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { LENS_COLORS } from './lensPalette';
import { pricePresentation } from './lensView';
import { formatAmount, formatMoney } from '@/format/money';


/** Prix client : montant courant, référence barrée et réduction, rien de plus. */
export function LensPriceBlock({
  candidate,
  compact = false,
  onWhite = false,
}: {
  candidate: LensCandidate;
  compact?: boolean;
  /** Les cartes résultats restent blanches, même si le téléphone est en mode sombre. */
  onWhite?: boolean;
}) {
  const theme = useTheme();
  const t = useT();
  const view = pricePresentation(candidate);
  const currentText = view.current.kind === 'tnd'
    ? formatMoney(view.current.amount)
    : view.current.kind === 'original'
      ? `${formatAmount(view.current.amount)} ${view.current.currency}`
      : t('lens.priceUnpublished');
  const discounted = view.referenceTnd != null && view.discountPercent != null && view.discountPercent > 0;
  // Rouge de baisse de prix : fixe sur une carte blanche ; sur la fiche, il suit le
  // thème (même teinte en clair, rouge éclairci en sombre pour rester ≥ 4,5:1).
  const dropRed = onWhite ? LENS_COLORS.sale : theme.status.danger.fg;

  return (
    <View style={[styles.block, compact ? styles.compactBlock : null]} testID="lens-price-block">
      {compact && view.referenceTnd != null ? (
        <AppText
          variant="caption"
          color={onWhite ? LENS_COLORS.resultMuted : theme.colors.muted}
          style={styles.struck}
          numberOfLines={1}
        >
          {formatMoney(view.referenceTnd)}
        </AppText>
      ) : null}
      <View style={[styles.priceRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
        <AppText
          variant={compact ? 'label' : 'title'}
          weight="bold"
          color={discounted ? dropRed : onWhite ? LENS_COLORS.black : theme.colors.ink}
          numberOfLines={1}
        >
          {currentText}
        </AppText>
        {!compact && view.referenceTnd != null ? (
          <AppText variant="body" color={onWhite ? LENS_COLORS.resultMuted : theme.colors.muted} style={styles.struck} numberOfLines={1}>
            {formatMoney(view.referenceTnd)}
          </AppText>
        ) : null}
        {discounted ? (
          <AppText variant={compact ? 'caption' : 'body'} weight="bold" color={dropRed} numberOfLines={1}>
            {`−${view.discountPercent}%`}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 2 },
  compactBlock: { minHeight: 38, justifyContent: 'flex-end' },
  priceRow: { alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  struck: { textDecorationLine: 'line-through' },
});
