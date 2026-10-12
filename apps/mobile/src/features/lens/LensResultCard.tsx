/**
 * بطاقة نتيجة Lens في التطبيق — هي نفسها بطاقة المتجر (`ProductCard`) بعرض كامل،
 * مع ما يخص Lens فقط: التحقق من المخزون مباشرة من المصدر، والثقة، والسعر الأصلي،
 * وزر مراقبة السعر.
 *
 * كل الأرقام تجي من الخادم. ما نحسبوش شي هنا، ومخزون ما تأكدش ما يتقالش «متوفر».
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { lensLiveStock, type LensCandidate } from '@/api/lens';
import { ProductCard } from '@/features/catalog/ProductCard';
import { AppText, Button, KeyValue } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';

import { candidateToProduct } from './candidateToProduct';
import { lensCardState } from './lensCardState';

export interface LensResultCardProps {
  candidate: LensCandidate;
  onOpen: (candidate: LensCandidate) => void;
  /** `undefined` = زر المراقبة غير معروض (مثلاً شاشة المسح). */
  onWatch?: (candidate: LensCandidate) => void;
  watchBusy?: boolean;
  /** زر القلب: `undefined` = غير معروض. */
  favorite?: boolean;
  favoriteBusy?: boolean;
  onToggleFavorite?: (candidate: LensCandidate) => void;
}

type StockState =
  | { status: 'checking' }
  | { status: 'done'; availability: string; checkedAt: string }
  | { status: 'failed' };

function isWebLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function LensResultCard({
  candidate, onOpen, onWatch, watchBusy = false, favorite = false, favoriteBusy = false, onToggleFavorite,
}: LensResultCardProps) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const [stock, setStock] = useState<StockState | null>(null);
  const canVerify = isWebLink(candidate.sourceUrl);
  const checking = stock?.status === 'checking';
  const view = lensCardState(candidate);

  const availabilityText = (state: string): string => {
    switch (state) {
      case 'in_stock': return t('lens.avail.in_stock');
      case 'limited': return t('lens.avail.limited');
      case 'out_of_stock': return t('lens.avail.out_of_stock');
      default: return t('lens.avail.unknown');
    }
  };

  const verifyStock = async () => {
    setStock({ status: 'checking' });
    try {
      const rows = await lensLiveStock({ urls: [candidate.sourceUrl], title: candidate.title });
      const row = rows.find((r) => r.url === candidate.sourceUrl) ?? rows[0];
      if (!row) {
        setStock({ status: 'failed' });
        return;
      }
      setStock({ status: 'done', availability: row.availability, checkedAt: row.checkedAt });
    } catch {
      setStock({ status: 'failed' });
    }
  };

  const stockLine = (() => {
    if (!stock || stock.status === 'checking') return null;
    if (stock.status === 'failed') return t('lens.stockFailed');
    if (stock.availability === 'unknown') return t('lens.stockFailed');
    const time = new Date(stock.checkedAt).toLocaleTimeString(locale === 'ar' ? 'ar-TN' : 'fr-TN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${availabilityText(stock.availability)} · ${t('lens.stockChecked', { time })}`;
  })();

  return (
    <View style={styles.wrap}>
      {onToggleFavorite ? (
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favorite ? t('lens.favoriteRemove') : t('lens.favoriteAdd')}
            accessibilityState={{ selected: favorite, busy: favoriteBusy }}
            disabled={favoriteBusy}
            onPress={() => onToggleFavorite(candidate)}
            style={[styles.heart, { borderColor: theme.colors.line, borderRadius: theme.radius.control }]}
          >
            <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={20} color={favorite ? theme.status.danger.fg : theme.colors.ink} />
          </Pressable>
        </View>
      ) : null}
      <ProductCard
        product={candidateToProduct(candidate)}
        onOpen={() => onOpen(candidate)}
        style={styles.full}
        hasCombinations={candidate.colors.length > 0}
        promo={view.promoBadge}
      />
      <KeyValue
        label={t('lens.verification')}
        value={candidate.verification === 'VERIFIED' ? t('lens.verified') : t('lens.pending')}
      />
      {view.wasPriceTnd !== null || view.discountPercent !== null ? (
        <View style={styles.wasRow}>
          {view.wasPriceTnd !== null ? (
            <AppText variant="caption" color={theme.colors.muted}>
              {t('lens.wasPrice', { price: view.wasPriceTnd.toFixed(2) })}
            </AppText>
          ) : null}
          {view.discountPercent !== null ? (
            <AppText variant="caption" weight="bold" color={theme.status.danger.fg}>
              {`-${view.discountPercent}%`}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {candidate.offerCount > 1 ? (
        <AppText variant="caption" color={theme.colors.muted}>
          {t('lens.offerCount', { count: candidate.offerCount })}
        </AppText>
      ) : null}
      {candidate.priceOrigin === 'search' ? (
        <AppText variant="caption" color={theme.colors.muted}>{t('lens.priceFromSearch')}</AppText>
      ) : null}
      <View style={styles.actions}>
        {canVerify ? (
          <Button
            label={checking ? t('lens.verifyingStock') : t('lens.verifyStock')}
            tone="quiet"
            busy={checking}
            onPress={() => void verifyStock()}
          />
        ) : null}
        {onWatch ? (
          <Button label={t('lens.watchThis')} tone="quiet" busy={watchBusy} onPress={() => onWatch(candidate)} />
        ) : null}
      </View>
      {stockLine ? (
        <AppText variant="caption" color={theme.colors.muted}>{stockLine}</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10, gap: 4 },
  full: { width: '100%', marginTop: 0 },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  heart: { width: 40, height: 40, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  wasRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
});
