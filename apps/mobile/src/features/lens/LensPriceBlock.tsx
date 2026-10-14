import { StyleSheet, View } from 'react-native';

import type { LensCandidate } from '@/api/lens';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { LENS_COLORS } from './lensPalette';
import { pricePresentation } from './lensView';

const money = (amount: number): string => `${amount.toFixed(2)} TND`;

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
    ? money(view.current.amount)
    : view.current.kind === 'original'
      ? `${view.current.amount.toFixed(2)} ${view.current.currency}`
      : t('lens.priceUnpublished');
  const discounted = view.referenceTnd != null && view.discountPercent != null && view.discountPercent > 0;

  return (
    <View style={styles.block} testID="lens-price-block">
      <View style={[styles.priceRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
        <AppText
          variant={compact ? 'label' : 'title'}
          weight="bold"
          color={discounted ? LENS_COLORS.sale : onWhite ? LENS_COLORS.black : theme.colors.ink}
          numberOfLines={1}
        >
          {currentText}
        </AppText>
        {view.referenceTnd != null ? (
          <AppText variant={compact ? 'caption' : 'body'} color={onWhite ? LENS_COLORS.resultMuted : theme.colors.muted} style={styles.struck} numberOfLines={1}>
            {money(view.referenceTnd)}
          </AppText>
        ) : null}
        {discounted ? (
          <AppText variant={compact ? 'caption' : 'body'} weight="bold" color={LENS_COLORS.sale} numberOfLines={1}>
            {`−${view.discountPercent}%`}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 2 },
  priceRow: { alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  struck: { textDecorationLine: 'line-through' },
});
