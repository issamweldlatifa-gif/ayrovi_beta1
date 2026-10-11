/**
 * بطاقة عرض تجري (Q2، 08/10/2026).
 *
 * قاعدتان:
 *  • **قيمة الخصم تُعرض كما هي** — التطبيق ما يحسبش سعراً بعد الخصم، لأنّ
 *    أثر العرض على السعر النهائي قرار الخادم (`finalPrice`). عرض سعر مخفَّض
 *    نحسبوه نحنا = سعر ثانٍ لنفس المنتوج = كذبة مطبوعة.
 *  • عرض بلا صورة ⇒ إطار فارغ صريح، موش بطاقة مقطوعة.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import type { Promotion } from '@/api/sections';

/**
 * النصّ فوق البرتقالي AYROVI (نفس قرار `StoryCard`): البرتقالي لون فاتح،
 * والأسود فوقو هو التباين المقروء (~7:1 مقابل ~2.9:1 للأبيض).
 */


export interface PromotionCardProps {
  promotion: Promotion;
  onOpen: (promotion: Promotion) => void;
}

/** «لين 12/11» — تاريخ مختصر؛ والتاريخ المجهول ما يختلقش. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function PromotionCard({ promotion, onOpen }: PromotionCardProps) {
  const theme = useTheme();
  const t = useT();

  const discount =
    promotion.discountType === 'FIXED'
      ? t('sections.discountAmount', { value: promotion.value.toFixed(2) })
      : t('sections.discountPercent', { value: String(Math.round(promotion.value)) });

  const ends = shortDate(promotion.endsAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${promotion.name} — ${discount}`}
      onPress={() => onOpen(promotion)}
      style={[styles.card, { borderColor: theme.colors.line, borderRadius: theme.radius.card }]}
    >
      <View style={[styles.imageFrame, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card }]}>
        {promotion.image ? (
          <AppImage uri={mediaUrl(promotion.image)} style={styles.image} contentFit="cover" accessibilityLabel={promotion.name} />
        ) : (
          <AppText variant="caption" color={theme.colors.muted}>{promotion.name}</AppText>
        )}
        <View style={[styles.badge, { backgroundColor: theme.colors.accent, borderRadius: theme.radius.cta }]}>
          <AppText variant="caption" weight="bold" color={theme.colors.onAccent}>{discount}</AppText>
        </View>
      </View>

      <AppText variant="label" weight="bold" numberOfLines={2} style={styles.name}>{promotion.name}</AppText>

      {promotion.description ? (
        <AppText variant="caption" color={theme.colors.muted} numberOfLines={2}>{promotion.description}</AppText>
      ) : null}

      <View style={styles.footer}>
        {promotion.promoCode ? (
          <AppText variant="caption" weight="bold" color={theme.colors.accentText}>{promotion.promoCode}</AppText>
        ) : null}
        {ends ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('sections.until', { value: ends })}</AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 10, width: '48%', marginBottom: 12 },
  imageFrame: {
    aspectRatio: 16 / 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  badge: { position: 'absolute', top: 8, start: 8, paddingHorizontal: 8, paddingVertical: 2 },
  name: { minHeight: 34 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 6 },
});
