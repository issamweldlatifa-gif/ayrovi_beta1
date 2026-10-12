/**
 * بطاقة نتيجة Lens (المرجع 03): الصورة مع القلب في الزاوية واللافتات في الأسفل،
 * ثم العلامة والعنوان والسعر بالدينار (أحمر). كل رقم وكل لافتة من الخادم فقط.
 *
 * تحت البطاقة: الثقة، والتحقق من المخزون مباشرة من المصدر، ومراقبة السعر (كما في الخطة §3.4).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { mediaUrl } from '@/api/client';
import { lensLiveStock, type LensCandidate } from '@/api/lens';
import { AppImage } from '@/design/appImage';
import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';

import { lensCardState } from './lensCardState';
import { lensCardPath } from './cardImage';

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

  const priceLine = view.priceTnd !== null
    ? `${view.priceFrom ? `${t('lens.priceFrom')} ` : ''}${view.priceTnd.toFixed(2)} DT`
    : t('catalog.noPrice');

  return (
    <View style={[styles.card, { borderColor: theme.colors.line, borderRadius: theme.radius.card, backgroundColor: theme.colors.canvas }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={candidate.title} onPress={() => onOpen(candidate)}>
        <View style={[styles.media, { backgroundColor: theme.colors.surface }]}>
          {candidate.image ? (
            <AppImage
              uri={lensCardPath(candidate.image) ? mediaUrl(lensCardPath(candidate.image)) : candidate.image}
              fallbackUri={lensCardPath(candidate.image) ? candidate.image : null}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              accessibilityLabel={candidate.title}
            />
          ) : null}
          {onToggleFavorite ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={favorite ? t('lens.favoriteRemove') : t('lens.favoriteAdd')}
              accessibilityState={{ selected: favorite, busy: favoriteBusy }}
              disabled={favoriteBusy}
              onPress={() => onToggleFavorite(candidate)}
              style={[styles.heart, { backgroundColor: theme.colors.canvas, borderRadius: 20 }]}
            >
              <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={20} color={favorite ? theme.status.danger.fg : theme.colors.ink} />
            </Pressable>
          ) : null}
          <View style={styles.chips}>
            {candidate.colors.length > 0 ? (
              <View style={[styles.chip, { backgroundColor: theme.colors.canvas }]}>
                <AppText variant="caption" color={theme.colors.ink} numberOfLines={1}>{t('lens.combinations')}</AppText>
              </View>
            ) : null}
            {view.promoBadge ? (
              <View style={[styles.chip, { backgroundColor: theme.status.danger.fg }]}>
                <AppText variant="caption" weight="bold" color={theme.colors.canvas} numberOfLines={1}>{t('lens.promoBadge')}</AppText>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.text}>
          {candidate.brand ? (
            <AppText variant="label" weight="bold" numberOfLines={1}>{candidate.brand}</AppText>
          ) : null}
          <AppText variant="label" numberOfLines={2}>{candidate.title}</AppText>
          {candidate.sizes.length > 0 ? (
            <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>{candidate.sizes.join(' · ')}</AppText>
          ) : null}
          <AppText variant="label" weight="bold" color={view.priceTnd !== null ? theme.status.danger.fg : theme.colors.muted}>
            {priceLine}
          </AppText>
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
        </View>
      </Pressable>

      <View style={styles.footer}>
        <AppText variant="caption" color={theme.colors.muted}>
          {`${t('lens.verification')} : ${candidate.verification === 'VERIFIED' ? t('lens.verified') : t('lens.pending')}`}
        </AppText>
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  media: { width: '100%', aspectRatio: 0.85 },
  heart: {
    position: 'absolute', top: 8, right: 8, width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  chips: { position: 'absolute', left: 8, bottom: 8, gap: 4, alignItems: 'flex-start' },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, maxWidth: '100%' },
  text: { padding: 10, gap: 4 },
  wasRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  footer: { paddingHorizontal: 10, paddingBottom: 10, gap: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
});
