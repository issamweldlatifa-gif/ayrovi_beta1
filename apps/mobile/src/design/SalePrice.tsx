/**
 * Prix avec remise — modèle de la référence du 15/11 (004418) :
 *
 *     21,99 €                ← rouge, gras, quand il y a une vraie remise
 *     [-45%]  Prix d'origine : 39,99 €   ← pastille rouge pleine + origine barrée
 *
 * Sans remise fiable (`saleSummary`), le prix reste à l'encre et rien d'autre
 * ne s'affiche : jamais de prix barré inventé.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './ui';
import { useTheme } from './theme';
import { rowDirectionFor } from './layoutLogic';
import { RADIUS, SALE_BADGE } from './tokens.mobile';
import { saleBadgeLabel } from './saleLogic';

export function SaleBadge({ percent, testID }: { percent: number; testID?: string }) {
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: SALE_BADGE.background }]}>
      <AppText variant="captionStrong" color={SALE_BADGE.text} numberOfLines={1}>
        {saleBadgeLabel(percent)}
      </AppText>
    </View>
  );
}

export function SalePrice({
  price,
  original,
  percent,
  size = 'lg',
  originalPrefix,
  trailing,
  testID = 'sale-price',
}: {
  /** Prix payé, déjà formaté. */
  price: string;
  /** Prix d'origine formaté — seulement si la remise est réelle. */
  original?: string;
  /** Pourcentage entier issu de `saleSummary` ; `null` = pas de remise. */
  percent: number | null;
  size?: 'lg' | 'md';
  /** « Prix d'origine : » devant le montant barré. */
  originalPrefix?: string;
  /** Mention discrète à côté du prix (ex. « Douane et livraison incluses »). */
  trailing?: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  const discounted = percent != null && percent > 0;
  const row = rowDirectionFor(theme.isRTL);
  // Même rouge que la pastille en clair ; en sombre, le rouge clair lisible sur noir.
  const saleInk = theme.mode === 'dark' ? theme.status.danger.fg : SALE_BADGE.background;
  return (
    <View testID={testID} style={styles.stack}>
      <View style={[styles.priceRow, { flexDirection: row }]}>
        <AppText
          testID={`${testID}-amount`}
          variant={size === 'lg' ? 'price' : 'bodyStrong'}
          color={discounted ? saleInk : theme.colors.ink}
        >
          {price}
        </AppText>
        {trailing}
      </View>
      {discounted ? (
        <View style={[styles.originRow, { flexDirection: row }]}>
          <SaleBadge percent={percent} testID={`${testID}-badge`} />
          {original ? (
            <View style={[styles.originText, { flexDirection: row }]}>
              {originalPrefix ? (
                <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>{originalPrefix}</AppText>
              ) : null}
              <AppText testID={`${testID}-original`} variant="caption" color={theme.colors.muted} numberOfLines={1} style={styles.struck}>
                {original}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 4 },
  priceRow: { alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  originRow: { alignItems: 'center', gap: 8 },
  badge: { borderRadius: RADIUS.xs, paddingHorizontal: 6, paddingVertical: 2 },
  struck: { textDecorationLine: 'line-through' },
  originText: { flexShrink: 1, alignItems: 'center', gap: 4, flexWrap: 'wrap' },
});
