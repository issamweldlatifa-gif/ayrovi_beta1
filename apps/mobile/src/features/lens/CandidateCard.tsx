/**
 * بطاقة نتيجة Lens — مشتركة بين شاشة البحث وشاشة المسح.
 *
 * كل ما فيها يجي من الخادم (`priceTnd`, `availability`, `verification`)، وما
 * يتخبّاش شي: سعر غايب يتقال «ما فماش تسعير»، وثقة ناقصة تتقال
 * «يتأكّد»، وسعر من مقتطف البحث يتقال كذلك. الضغط على البطاقة يفتح المتجر
 * (كابتشر + «Add to Cart») — موش شراءً صامتاً من هنا.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, KeyValue } from '@/design/ui';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { useI18n } from '@/i18n';
import { mediaUrl } from '@/api/client';
import type { LensCandidate } from '@/api/lens';

export interface CandidateCardProps {
  candidate: LensCandidate;
  onOpen: (candidate: LensCandidate) => void;
  /** إضافة مراقبة سعر — `undefined` = موش معروضة (شاشة المسح مثلاً). */
  onWatch?: (candidate: LensCandidate) => void;
  watchBusy?: boolean;
}

export function CandidateCard({ candidate, onOpen, onWatch, watchBusy = false }: CandidateCardProps) {
  const theme = useTheme();
  const { t } = useI18n();

  const availabilityText = (state: string): string => {
    switch (state) {
      case 'in_stock': return t('lens.avail.in_stock');
      case 'limited': return t('lens.avail.limited');
      case 'out_of_stock': return t('lens.avail.out_of_stock');
      default: return t('lens.avail.unknown');
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(candidate)}
      style={[styles.card, { borderColor: theme.colors.line, borderRadius: theme.radius.card }]}
    >
      {candidate.image ? (
        <AppImage uri={mediaUrl(candidate.image)} style={styles.image} contentFit="contain" accessibilityLabel={candidate.title} />
      ) : null}
      <AppText variant="label" weight="bold" numberOfLines={3}>{candidate.title}</AppText>
      {candidate.brand ? (
        <AppText variant="caption" color={theme.colors.muted}>{candidate.brand}</AppText>
      ) : null}
      <KeyValue label={t('lens.source')} value={candidate.source || candidate.sourceUrl} />
      {candidate.priceTnd != null ? (
        <KeyValue label={t('aywebs.totalTnd')} value={`${candidate.priceTnd.toFixed(2)} TND`} />
      ) : (
        <KeyValue label={t('aywebs.totalTnd')} value={t('lens.noQuote')} />
      )}
      <KeyValue
        label={t('aywebs.sourcePrice')}
        value={candidate.price != null ? `${candidate.price} ${candidate.currency}`.trim() : t('aywebs.noPrice')}
      />
      <KeyValue label={t('aywebs.availability')} value={availabilityText(candidate.availability)} />
      <KeyValue
        label={t('lens.verification')}
        value={candidate.verification === 'VERIFIED' ? t('lens.verified') : t('lens.pending')}
      />
      {candidate.originalPriceTnd != null && candidate.priceTnd != null && candidate.originalPriceTnd > candidate.priceTnd ? (
        <AppText variant="caption" color={theme.colors.muted}>
          {t('lens.wasPrice', { price: candidate.originalPriceTnd.toFixed(2) })}
        </AppText>
      ) : null}
      {candidate.offerCount > 1 ? (
        <AppText variant="caption" color={theme.colors.muted}>
          {t('lens.offerCount', { count: candidate.offerCount })}
        </AppText>
      ) : null}
      {candidate.priceOrigin === 'search' ? (
        <AppText variant="caption" color={theme.colors.muted}>{t('lens.priceFromSearch')}</AppText>
      ) : null}
      <View style={[styles.actions, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
        <Button label={t('lens.openInAywebs')} tone="quiet" onPress={() => onOpen(candidate)} />
        {onWatch ? (
          <Button
            label={t('lens.watchThis')}
            tone="quiet"
            busy={watchBusy}
            onPress={() => onWatch(candidate)}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 8, marginTop: 10, gap: 2 },
  image: { width: '100%', height: 160 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
});
