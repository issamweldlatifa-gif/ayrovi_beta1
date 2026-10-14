/**
 * Fiche produit Lens native.
 *
 * La vue reste React Native : galerie `expo-image`, choix tactiles, devis et
 * lecture marchand via l'API. Aucun HTML/CSS du site et aucun WebView.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, Button, Card } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import { ApiError } from '@/api/errors';
import { addExternalToCart } from '@/api/cart';
import { quoteCartLine, type CartLineQuote } from '@/api/pricing';
import { useSessionId } from '@/session/session';
import { LensReviewForm } from './LensReviewForm';
import { analyzeUrl, refreshLiveStock, type LensCandidate } from '@/api/lens';
import { availabilityKey, isOpenableSourceUrl } from './lensView';
import { lensGallery, lensMediaChain } from './lensMedia';
import { LensPriceBlock } from './LensPriceBlock';
import { mergeLiveStock, mergeProductEnrichment } from './productHydration';
import {
  buildCartPayload, effectiveChoice, missingChoice, orderBlock, resolveSelection, type OrderBlock,
} from './productOrder';

const NO_CHOICE = 'none';
const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;

const BLOCK_KEY: Record<Exclude<OrderBlock, null>, TranslationKey> = {
  ambiguous: 'lens.product.ambiguous',
  manual: 'lens.product.manual',
  incomplete: 'lens.product.incomplete',
};

function refusalKey(error: unknown): TranslationKey | string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_AYROVIX_PRICE_TOKEN') return 'lens.product.expired';
    if (error.code === 'NO_CONTRACT' || error.code.startsWith('VARIANT_')) return 'lens.product.variantRefused';
    if (error.message) return error.message;
  }
  return 'lens.product.orderFailed';
}

function ChoiceChips({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const theme = useTheme();
  if (values.length === 0) return null;
  if (values.length === 1) {
    return <AppText variant="caption" color={theme.colors.muted}>{`${label}: ${values[0]}`}</AppText>;
  }
  return (
    <View style={styles.choiceBlock}>
      <AppText variant="caption" weight="bold">{label}</AppText>
      <View style={[styles.chips, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
        {values.map((option) => {
          const active = option === value;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                {
                  minHeight: theme.geometry.minTarget,
                  borderRadius: theme.radius.control,
                  borderColor: active ? theme.colors.ink : theme.colors.lineControl,
                  backgroundColor: active ? theme.colors.action : theme.colors.surface,
                },
              ]}
            >
              <AppText variant="caption" weight={active ? 'bold' : 'regular'} color={active ? theme.colors.onAction : theme.colors.ink}>
                {option}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
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
  const [product, setProduct] = useState(candidate);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [size, setSize] = useState<string>(NO_CHOICE);
  const [color, setColor] = useState<string>(NO_CHOICE);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [stockBusy, setStockBusy] = useState(false);
  const [enrichmentBusy, setEnrichmentBusy] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [backgroundNotice, setBackgroundNotice] = useState<TranslationKey | null>(null);
  const [quoted, setQuoted] = useState<{ key: string; data: CartLineQuote } | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteFailed, setQuoteFailed] = useState(false);

  useEffect(() => {
    setProduct(candidate);
    setSize(NO_CHOICE);
    setColor(NO_CHOICE);
    setQuantity(1);
    setActiveImage(0);
    setReviewOpen(false);
    setMessage(null);
    setBackgroundNotice(null);
    setQuoted(null);
    setQuoteFailed(false);

    if (!isOpenableSourceUrl(candidate.sourceUrl)) return;
    const controller = new AbortController();
    setEnrichmentBusy(true);
    analyzeUrl(candidate.sourceUrl, 'url', false, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setProduct((current) => mergeProductEnrichment(current, result.product, candidate.sourceUrl));
      })
      .catch(() => {
        if (!controller.signal.aborted) setBackgroundNotice('lens.product.enrichmentFailed');
      })
      .finally(() => {
        if (!controller.signal.aborted) setEnrichmentBusy(false);
      });
    return () => controller.abort();
  }, [candidate]);

  const sizeValue = size === NO_CHOICE ? '' : size;
  const colorValue = color === NO_CHOICE ? '' : color;
  const choice = effectiveChoice(product, sizeValue, colorValue);
  const selection = useMemo(
    () => resolveSelection(product, choice.size, choice.color),
    [choice.color, choice.size, product],
  );
  const block = orderBlock(selection);
  const needsChoice = missingChoice(product, sizeValue, colorValue);
  const missingSizeChoice = product.sizes.length > 1 && !sizeValue.trim();
  const missingColorChoice = product.colors.length > 1 && !colorValue.trim();
  const choicePromptKey: TranslationKey = missingSizeChoice && missingColorChoice
    ? 'lens.product.chooseOption'
    : missingSizeChoice ? 'lens.product.chooseSize' : 'lens.product.chooseColor';
  const sourcePrice = selection.offer.price != null && selection.offer.currency
    ? { amount: selection.offer.price, currency: selection.offer.currency }
    : null;
  const quoteKey = `${product.sourceUrl}|${product.title}|${sourcePrice?.amount ?? ''}|${sourcePrice?.currency ?? ''}`;
  const quote = quoted?.key === quoteKey ? quoted.data : null;

  useEffect(() => {
    if (!sourcePrice) {
      setQuoteBusy(false);
      setQuoteFailed(false);
      return;
    }
    const controller = new AbortController();
    setQuoteBusy(true);
    setQuoteFailed(false);
    quoteCartLine({
      title: product.title,
      sourcePrice: sourcePrice.amount,
      sourceCurrency: sourcePrice.currency,
    }, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setQuoted({ key: quoteKey, data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setQuoteFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuoteBusy(false);
      });
    return () => controller.abort();
  }, [product.title, quoteKey, sourcePrice?.amount, sourcePrice?.currency]);

  const gallery = useMemo(
    () => lensGallery(product, choice.color || null, 'detail'),
    [choice.color, product],
  );
  const galleryKey = gallery.map((item) => item.original).join('|');
  useEffect(() => setActiveImage(0), [galleryKey]);
  const displayedImage = gallery[Math.min(activeImage, Math.max(0, gallery.length - 1))];

  const checkStock = useCallback(async () => {
    const controller = new AbortController();
    setStockBusy(true);
    setMessage(null);
    try {
      const [row] = await refreshLiveStock([product.sourceUrl], product.title, controller.signal);
      if (row) setProduct((current) => mergeLiveStock(current, row));
      else setMessage(t('lens.product.stockFailed'));
    } catch (error) {
      setMessage(error instanceof ApiError && error.message ? error.message : t('lens.product.stockFailed'));
    } finally {
      setStockBusy(false);
    }
  }, [product.sourceUrl, product.title, t]);

  const order = useCallback(async () => {
    setMessage(null);
    if (needsChoice) {
      setMessage(t(choicePromptKey));
      return;
    }
    const payload = buildCartPayload({
      candidate: product,
      selection,
      size: choice.size,
      color: choice.color,
      quantity,
      customerNote: '',
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
  }, [block, choice.color, choice.size, choicePromptKey, needsChoice, product, quantity, queryClient, selection, sessionId, t]);

  const openMerchant = useCallback(() => {
    if (!isOpenableSourceUrl(product.sourceUrl)) return;
    if (onOpenMerchantUrl) onOpenMerchantUrl(product.sourceUrl);
    else void WebBrowser.openBrowserAsync(product.sourceUrl);
  }, [onOpenMerchantUrl, product.sourceUrl]);

  const checkedTime = product.availabilityCheckedAt && Number.isFinite(Date.parse(product.availabilityCheckedAt))
    ? new Date(product.availabilityCheckedAt).toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t('lens.product.back')}
        hitSlop={HIT_SLOP}
        testID="lens-product-back"
        style={[styles.back, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}
      >
        <Ionicons name={theme.isRTL ? 'arrow-forward' : 'arrow-back'} size={theme.iconSize.sm} color={theme.colors.ink} accessibilityElementsHidden />
        <AppText variant="caption">{t('lens.product.back')}</AppText>
      </Pressable>

      <View style={[styles.gallery, { borderColor: theme.colors.line, borderRadius: theme.radius.card, backgroundColor: theme.colors.infoSoft }]}>
        {displayedImage ? (
          <AppImage
            uri={displayedImage.uris[0]}
            fallbackUris={displayedImage.uris.slice(1)}
            contentFit="contain"
            style={styles.heroImage}
            accessibilityLabel={product.title}
            testID="lens-product-image"
          />
        ) : (
          <AppImage style={styles.heroImage} accessibilityLabel={product.title} testID="lens-product-image" />
        )}
      </View>

      {gallery.length > 1 ? (
        <>
          <AppText variant="caption" color={theme.colors.muted} align="center">
            {t('lens.product.imageCount', { current: activeImage + 1, total: gallery.length })}
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.thumbnails, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}
          >
            {gallery.map((item, index) => {
              const thumb = lensMediaChain(item.original, 'thumb');
              const selected = index === activeImage;
              return (
                <Pressable
                  key={item.original}
                  onPress={() => setActiveImage(index)}
                  accessibilityRole="button"
                  accessibilityLabel={t('lens.product.showImage', { number: index + 1 })}
                  accessibilityState={{ selected }}
                  style={[styles.thumbButton, { borderColor: selected ? theme.colors.ink : theme.colors.line, borderRadius: theme.radius.control }]}
                >
                  <AppImage
                    uri={thumb[0]}
                    fallbackUris={thumb.slice(1)}
                    contentFit="contain"
                    style={styles.thumbnail}
                    accessibilityLabel={t('lens.product.showImage', { number: index + 1 })}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      <Card>
        {product.brand ? <AppText variant="caption" weight="bold">{product.brand}</AppText> : null}
        <AppText variant="title">{product.title}</AppText>
        {product.source ? <AppText variant="caption" color={theme.colors.muted}>{t('lens.product.source', { source: product.source })}</AppText> : null}
        <LensPriceBlock candidate={product} quote={quote} />
        {quoteBusy ? <AppText variant="caption" color={theme.colors.muted}>{t('lens.product.priceChecking')}</AppText> : null}
        {quoteFailed ? <AppText variant="caption" color={theme.status.warning.fg}>{t('lens.product.priceCheckFailed')}</AppText> : null}
        {enrichmentBusy ? <AppText variant="caption" color={theme.colors.muted}>{t('lens.product.enriching')}</AppText> : null}
        {backgroundNotice ? <AppText variant="caption" color={theme.status.warning.fg}>{t(backgroundNotice)}</AppText> : null}

        <View style={[styles.statusRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name="shield-checkmark-outline" size={theme.iconSize.sm} color={theme.colors.muted} accessibilityElementsHidden />
          <AppText variant="caption" color={theme.colors.muted}>{t(availabilityKey(product.availability))}</AppText>
        </View>
        {checkedTime ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('lens.product.stockChecked', { time: checkedTime })}</AppText>
        ) : null}
        {product.ratingKind === 'merchant' && product.rating != null ? (
          <View style={[styles.statusRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
            <Ionicons name="star" size={theme.iconSize.sm} color={theme.status.warning.fg} accessibilityElementsHidden />
            <AppText variant="caption">{product.rating.toFixed(1)}{product.ratingCount != null ? ` (${product.ratingCount})` : ''}</AppText>
          </View>
        ) : null}

        <View style={[styles.actionRow, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable
            onPress={checkStock}
            disabled={stockBusy}
            accessibilityRole="button"
            accessibilityLabel={t('lens.product.checkStock')}
            accessibilityState={{ busy: stockBusy, disabled: stockBusy }}
            hitSlop={HIT_SLOP}
            testID="lens-check-stock"
            style={styles.textAction}
          >
            <Ionicons name="refresh-outline" size={theme.iconSize.sm} color={theme.colors.ink} accessibilityElementsHidden />
            <AppText variant="caption" weight="bold">{stockBusy ? t('lens.product.stockChecking') : t('lens.product.checkStock')}</AppText>
          </Pressable>
          <Pressable
            onPress={openMerchant}
            accessibilityRole="button"
            accessibilityLabel={t('catalog.openSource')}
            hitSlop={HIT_SLOP}
            testID="lens-open-merchant"
            style={styles.textAction}
          >
            <Ionicons name="open-outline" size={theme.iconSize.sm} color={theme.colors.ink} accessibilityElementsHidden />
            <AppText variant="caption" weight="bold">{t('catalog.openSource')}</AppText>
          </Pressable>
        </View>
      </Card>

      {product.description ? (
        <Card title={t('lens.product.description')}>
          <AppText color={theme.colors.muted}>{product.description}</AppText>
        </Card>
      ) : null}

      <ChoiceChips label={product.optionLabel || t('lens.product.size')} values={product.sizes} value={sizeValue} onChange={setSize} />
      <ChoiceChips label={t('lens.product.color')} values={product.colors} value={colorValue} onChange={setColor} />

      <View style={[styles.quantity, { flexDirection: theme.isRTL ? 'row-reverse' : 'row', borderColor: theme.colors.line }]}>
        <AppText style={styles.quantityLabel}>{t('lens.product.quantity')}</AppText>
        <Pressable
          onPress={() => setQuantity((value) => Math.max(1, value - 1))}
          disabled={quantity <= 1}
          accessibilityRole="button"
          accessibilityLabel={t('lens.product.less')}
          accessibilityState={{ disabled: quantity <= 1 }}
          hitSlop={HIT_SLOP}
          testID="lens-qty-minus"
          style={styles.quantityButton}
        >
          <Ionicons name="remove-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
        </Pressable>
        <AppText weight="bold">{String(quantity)}</AppText>
        <Pressable
          onPress={() => setQuantity((value) => Math.min(99, value + 1))}
          disabled={quantity >= 99}
          accessibilityRole="button"
          accessibilityLabel={t('lens.product.more')}
          accessibilityState={{ disabled: quantity >= 99 }}
          hitSlop={HIT_SLOP}
          testID="lens-qty-plus"
          style={styles.quantityButton}
        >
          <Ionicons name="add-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
        </Pressable>
      </View>

      {block ? <AppText variant="caption" color={theme.colors.muted}>{t(BLOCK_KEY[block])}</AppText> : null}
      {!block && needsChoice ? <AppText variant="caption" color={theme.colors.muted}>{t(choicePromptKey)}</AppText> : null}
      {message ? <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{message}</AppText> : null}

      {block !== null ? (
        reviewOpen ? (
          <LensReviewForm
            candidate={product}
            desiredSize={choice.size}
            desiredColor={choice.color}
            eventId={eventId}
            sessionId={sessionId}
          />
        ) : (
          <Button label={t('lens.review.open')} onPress={() => setReviewOpen(true)} tone="quiet" block testID="lens-review-open" />
        )
      ) : (
        <Button
          label={orderBusy ? t('lens.product.ordering') : t('lens.product.order')}
          onPress={order}
          busy={orderBusy}
          disabled={!sessionId || needsChoice || quoteBusy}
          block
          testID="lens-order"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  back: { alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' },
  gallery: { width: '100%', aspectRatio: 9 / 13, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  heroImage: { width: '100%', height: '100%' },
  thumbnails: { gap: 8 },
  thumbButton: { width: 72, height: 96, overflow: 'hidden', borderWidth: 2 },
  thumbnail: { width: '100%', height: '100%' },
  statusRow: { alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  actionRow: { alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  textAction: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  choiceBlock: { gap: 6 },
  chips: { flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', paddingHorizontal: 12 },
  quantity: { alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  quantityLabel: { flex: 1 },
  quantityButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
