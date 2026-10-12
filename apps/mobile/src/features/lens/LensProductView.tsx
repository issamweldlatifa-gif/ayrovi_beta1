/**
 * صفحة منتج Lens داخل التطبيق — بدل فتح المتجر في المتصفح.
 *
 *  • السعر من الخادم وحده، والمخزون يُقرأ من الخادم عند الضغط على «تحقق».
 *  • الطلب يُرسل إلى سلة Ayrovi (`POST /api/cart/items`) فقط إن كان العرض مكتملاً.
 *  • رفض الخادم يُعرض بسببه، ولا نعرض نجاحاً إلا بردّه.
 */
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, Button, Card, Segmented } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { ApiError } from '@/api/errors';
import { addExternalToCart } from '@/api/cart';
import { useSessionId } from '@/session/session';
import { LensReviewForm } from './LensReviewForm';
import { refreshLiveStock, type LensCandidate, type LensLiveStock } from '@/api/lens';
import { availabilityKey, isOpenableSourceUrl, priceView } from './lensView';
import {
  buildCartPayload, orderBlock, resolveSelection, type OrderBlock,
} from './productOrder';

// قيمة «بلا اختيار» — نص ثابت غير فارغ حتى تبقى قراءة القاموس سليمة.
const NO_CHOICE = 'none';

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;

const BLOCK_KEY: Record<Exclude<OrderBlock, null>, TranslationKey> = {
  ambiguous: 'lens.product.ambiguous',
  manual: 'lens.product.manual',
  incomplete: 'lens.product.incomplete',
};

/** رموز الخادم للرفض ⇒ رسالة مفهومة؛ غير المعروف يُعرض بنص الخادم. */
function refusalKey(error: unknown): TranslationKey | string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_AYROVIX_PRICE_TOKEN') return 'lens.product.expired';
    if (error.code === 'NO_CONTRACT' || error.code.startsWith('VARIANT_')) return 'lens.product.variantRefused';
    if (error.message) return error.message;
  }
  return 'lens.product.orderFailed';
}

export function LensProductView({
  candidate, eventId, onBack, onOpenMerchantUrl,
}: {
  candidate: LensCandidate;
  eventId: string | null;
  onBack: () => void;
  onOpenMerchantUrl?: (url: string) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const queryClient = useQueryClient();
  const sessionId = useSessionId();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [size, setSize] = useState<string>(NO_CHOICE);
  const [color, setColor] = useState<string>(NO_CHOICE);
  const [quantity, setQuantity] = useState(1);
  const [stock, setStock] = useState<LensLiveStock | null>(null);
  const [stockBusy, setStockBusy] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sizeValue = size === NO_CHOICE ? '' : size;
  const colorValue = color === NO_CHOICE ? '' : color;
  const selection = useMemo(() => resolveSelection(candidate, sizeValue, colorValue), [candidate, sizeValue, colorValue]);
  const block = orderBlock(selection);
  const offerTnd = selection.offer.priceTnd;
  const view = priceView(candidate);
  const priceText = offerTnd != null
    ? `${offerTnd.toFixed(2)} TND`
    : view.kind === 'tnd'
      ? `${view.amount.toFixed(2)} TND`
      : view.kind === 'original'
        ? `${view.amount.toFixed(2)} ${view.currency}`
        : t('lens.priceUnpublished');

  const checkStock = useCallback(async () => {
    setStockBusy(true);
    setMessage(null);
    try {
      const [row] = await refreshLiveStock([candidate.sourceUrl], candidate.title);
      setStock(row ?? null);
    } catch (error) {
      setMessage(error instanceof ApiError && error.message ? error.message : t('lens.product.stockFailed'));
    } finally {
      setStockBusy(false);
    }
  }, [candidate, t]);

  const order = useCallback(async () => {
    setMessage(null);
    const payload = buildCartPayload({
      candidate, selection, size: sizeValue, color: colorValue, quantity, customerNote: '',
    });
    if (!payload) {
      setMessage(t(BLOCK_KEY[block ?? 'incomplete']));
      return;
    }
    setOrderBusy(true);
    try {
      await addExternalToCart({ payload, sessionId });
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      router.push('/checkout');
    } catch (error) {
      const key = refusalKey(error);
      setMessage(key.startsWith('lens.') ? t(key as TranslationKey) : key);
    } finally {
      setOrderBusy(false);
    }
  }, [block, candidate, colorValue, quantity, queryClient, selection, sessionId, sizeValue, t]);

  const openMerchant = useCallback(() => {
    if (!isOpenableSourceUrl(candidate.sourceUrl)) return;
    if (onOpenMerchantUrl) onOpenMerchantUrl(candidate.sourceUrl);
    else void WebBrowser.openBrowserAsync(candidate.sourceUrl);
  }, [candidate.sourceUrl, onOpenMerchantUrl]);

  const noChoice = t('lens.product.noChoice');
  const sizeOptions = [
    { value: NO_CHOICE, label: noChoice },
    ...candidate.sizes.map((value) => ({ value, label: value })),
  ];
  const colorOptions = [
    { value: NO_CHOICE, label: noChoice },
    ...candidate.colors.map((value) => ({ value, label: value })),
  ];

  return (
    <View style={styles.wrap}>
      <Pressable onPress={onBack} accessibilityRole="button" hitSlop={HIT_SLOP} testID="lens-product-back">
        <AppText variant="caption" color={theme.colors.muted}>{t('lens.product.back')}</AppText>
      </Pressable>

      <Card>
        {candidate.image ? (
          <Image source={{ uri: mediaUrl(candidate.image) }} style={styles.image} accessibilityLabel={candidate.title} />
        ) : null}
        <AppText>{candidate.title}</AppText>
        {candidate.brand ? <AppText variant="caption" color={theme.colors.muted}>{candidate.brand}</AppText> : null}
        <AppText>{priceText}</AppText>
        <AppText variant="caption" color={theme.colors.muted}>{t(availabilityKey(stock?.availability ?? candidate.availability))}</AppText>
        {stock?.checkedAt ? (
          <AppText variant="caption" color={theme.colors.muted}>
            {t('lens.product.stockChecked', { time: new Date(stock.checkedAt).toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' }) })}
          </AppText>
        ) : null}
        <View style={styles.row}>
          <Pressable onPress={checkStock} disabled={stockBusy} accessibilityRole="button" hitSlop={HIT_SLOP} testID="lens-check-stock" style={styles.actionRow}>
            <Ionicons name="refresh-outline" size={20} color={theme.colors.ink} />
            <AppText variant="caption">{t('lens.product.checkStock')}</AppText>
          </Pressable>
          <Pressable onPress={openMerchant} accessibilityRole="button" hitSlop={HIT_SLOP} testID="lens-open-merchant" style={styles.actionRow}>
            <Ionicons name="open-outline" size={20} color={theme.colors.ink} />
            <AppText variant="caption">{t('catalog.openSource')}</AppText>
          </Pressable>
        </View>
      </Card>

      {candidate.sizes.length > 0 ? (
        <Segmented options={sizeOptions} value={size} onChange={setSize} label={t('lens.product.size')} />
      ) : null}
      {candidate.colors.length > 0 ? (
        <Segmented options={colorOptions} value={color} onChange={setColor} label={t('lens.product.color')} />
      ) : null}

      <View style={styles.row}>
        <AppText>{t('lens.product.quantity')}</AppText>
        <Pressable onPress={() => setQuantity((q) => Math.max(1, q - 1))} accessibilityRole="button" accessibilityLabel={t('lens.product.less')} hitSlop={HIT_SLOP} testID="lens-qty-minus">
          <Ionicons name="remove-outline" size={24} color={theme.colors.ink} />
        </Pressable>
        <AppText>{String(quantity)}</AppText>
        <Pressable onPress={() => setQuantity((q) => Math.min(99, q + 1))} accessibilityRole="button" accessibilityLabel={t('lens.product.more')} hitSlop={HIT_SLOP} testID="lens-qty-plus">
          <Ionicons name="add-outline" size={24} color={theme.colors.ink} />
        </Pressable>
      </View>

      {block ? <AppText variant="caption" color={theme.colors.muted}>{t(BLOCK_KEY[block])}</AppText> : null}
      {message ? <AppText variant="caption" color={theme.status.danger.fg}>{message}</AppText> : null}

      {block !== null ? (
        reviewOpen ? (
          <LensReviewForm
            candidate={candidate}
            desiredSize={sizeValue}
            desiredColor={colorValue}
            eventId={eventId}
            sessionId={sessionId}
          />
        ) : (
          <Button
            label={t('lens.review.open')}
            onPress={() => setReviewOpen(true)}
            tone="quiet"
            block
            testID="lens-review-open"
          />
        )
      ) : (
        <Button
          label={orderBusy ? t('lens.product.ordering') : t('lens.product.order')}
          onPress={order}
          disabled={orderBusy || !sessionId}
          block
          testID="lens-order"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  image: { width: '100%', aspectRatio: 1, borderRadius: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  actionRow: { flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 44 },
});
