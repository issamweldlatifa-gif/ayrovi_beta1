import { StyleSheet, View } from 'react-native';

import type { LensCandidate } from '@/api/lens';
import type { CartLineQuote } from '@/api/pricing';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { pricePresentation } from './lensView';

const money = (amount: number): string => `${amount.toFixed(2)} TND`;

export function LensPriceBlock({
  candidate,
  quote = null,
  compact = false,
}: {
  candidate: LensCandidate;
  quote?: CartLineQuote | null;
  compact?: boolean;
}) {
  const theme = useTheme();
  const t = useT();
  const view = pricePresentation(candidate, quote);
  const currentText = view.current.kind === 'tnd'
    ? money(view.current.amount)
    : view.current.kind === 'original'
      ? `${view.current.amount.toFixed(2)} ${view.current.currency}`
      : t('lens.priceUnpublished');

  return (
    <View style={styles.block}>
      {view.promoLabel ? (
        <AppText variant="caption" weight="bold" color={theme.colors.accentText} numberOfLines={compact ? 1 : undefined}>
          {view.promoLabel}
        </AppText>
      ) : null}
      <AppText
        variant={compact ? 'label' : 'lead'}
        weight="bold"
        color={view.referenceTnd != null ? theme.colors.accentText : theme.colors.ink}
      >
        {currentText}
      </AppText>
      {view.referenceTnd != null ? (
        <View style={[styles.referenceRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
          <AppText
            variant="caption"
            color={theme.colors.muted}
            style={styles.struck}
          >
            {money(view.referenceTnd)}
          </AppText>
          {view.discountPercent != null && view.discountPercent > 0 ? (
            <AppText variant="caption" weight="bold" color={theme.colors.accentText}>
              {`−${view.discountPercent}%`}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {!compact && candidate.price != null && candidate.price > 0 && candidate.currency ? (
        <AppText variant="caption" color={theme.colors.muted}>
          {t('lens.priceMerchant', { amount: candidate.price.toFixed(2), currency: candidate.currency })}
        </AppText>
      ) : null}
      {!compact && view.verifiedAtSource ? (
        <AppText variant="caption" color={theme.status.success.fg}>{t('lens.priceVerified')}</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 2 },
  referenceRow: { alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  struck: { textDecorationLine: 'line-through' },
});
