import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addAyWebsCartItem,
  fetchAyWebsVariants,
  resolveAyWebsProduct,
  type AyWebsCapture,
  type AyWebsCartAddResult,
  type AyWebsResolvedProduct,
  type AyWebsVariantGroup,
  type AyWebsVariantPrice,
} from '@/api/aywebs';
import { mediaUrl } from '@/api/client';
import { isApiError } from '@/api/errors';
import { AppImage } from '@/design/appImage';
import { AppText, Button } from '@/design/ui';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { veil } from '@/design/tokens.mobile';
import { useI18n, useT } from '@/i18n';
import { ayWebsErrorMessage, ayWebsLinkMessage, ayWebsReadinessMessage } from './errors';
import { ayWebsAddReadiness, ayWebsCaptureForOptions, ayWebsUsesServerVariantCatalog } from './variantLogic';

const MAX_QUANTITY = 99;

function optionValue(variant: AyWebsVariantPrice, attribute: string): string {
  const match = Object.entries(variant.attributes).find(([key]) => key.trim().toLowerCase() === attribute.trim().toLowerCase());
  return match?.[1] ?? '';
}

function confirmedUnavailable(
  group: AyWebsVariantGroup,
  value: string,
  groups: AyWebsVariantGroup[],
  variants: AyWebsVariantPrice[],
  capturedGroups: AyWebsCapture['variantGroups'] = [],
): boolean {
  const capturedGroup = capturedGroups.find((candidate) => candidate.attribute === group.attribute);
  if (capturedGroup) {
    // A value-level twister state may disable a choice, but never stands in for
    // the stock of a complete size/color combination.
    return capturedGroup.valueStates?.find((entry) => entry.value.toLowerCase() === value.toLowerCase())?.state === 'UNAVAILABLE';
  }
  const candidates = variants.filter((variant) => optionValue(variant, group.attribute).toLowerCase() === value.toLowerCase());
  if (!candidates.length) return false;
  // Only a merchant's explicit OUT_OF_STOCK fact disables a value. UNKNOWN is
  // not presented as unavailable; the final add gate still blocks it honestly.
  return candidates.every((variant) => variant.availability === 'OUT_OF_STOCK')
    && groups.some((candidate) => candidate.attribute === group.attribute);
}

export function AddToCartSheet({
  visible,
  resolved,
  capture,
  sessionId,
  onVariantChange,
  onContinueShopping,
}: {
  visible: boolean;
  resolved: AyWebsResolvedProduct;
  capture: AyWebsCapture | null;
  sessionId: string;
  onVariantChange?: (selection: Record<string, string>) => Promise<void>;
  onContinueShopping: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [added, setAdded] = useState<AyWebsCartAddResult | null>(null);
  const requestId = useRef('');
  const usesServerVariantCatalog = ayWebsUsesServerVariantCatalog(resolved.product.storeId);
  const optionCapture = ayWebsCaptureForOptions(resolved.product.storeId, capture);
  const zalandoResolutionQuery = useQuery({
    queryKey: ['aywebs', 'zalando-options-product', sessionId, resolved.product.sourceUrl],
    enabled: visible && usesServerVariantCatalog && Boolean(sessionId && resolved.product.sourceUrl),
    staleTime: 60_000,
    queryFn: ({ signal }) => resolveAyWebsProduct({
      url: resolved.product.sourceUrl,
      storeId: resolved.product.storeId,
      sessionId,
    }, { signal }),
  });
  const sheetResolved = usesServerVariantCatalog ? (zalandoResolutionQuery.data ?? resolved) : resolved;
  const product = sheetResolved.product;
  const serverVariantDataReady = !usesServerVariantCatalog || Boolean(zalandoResolutionQuery.data);
  const serverVariantDataLoading = usesServerVariantCatalog && visible && !zalandoResolutionQuery.data && zalandoResolutionQuery.isLoading;
  const serverVariantDataFailed = usesServerVariantCatalog && zalandoResolutionQuery.isError;
  const hasFreshCapturedGroups = Boolean(optionCapture?.variantGroups.length);

  const variantsQuery = useQuery({
    queryKey: ['aywebs', 'variants', sessionId, product.productId],
    enabled: visible && serverVariantDataReady && !hasFreshCapturedGroups
      && Boolean(sessionId && product.productId && product.variantGroups.length),
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => fetchAyWebsVariants({ productId: product.productId, sessionId }, { signal }),
  });

  useEffect(() => {
    if (!visible) return;
    setSelected(Object.keys(product.selectedVariant).length
      ? { ...product.selectedVariant }
      : { ...(optionCapture?.selectedVariantAttributes || {}) });
    setQuantity(1);
    setBusy(false);
    setFailure('');
    setAdded(null);
    requestId.current = '';
  }, [optionCapture?.selectedVariantAttributes, product.productId, product.selectedVariant, sheetResolved.captureId, visible]);

  const capturedGroups = useMemo(
    () => (optionCapture?.variantGroups || []).map(({ attribute, values }) => ({ attribute, values })),
    [optionCapture?.variantGroups],
  );
  const groups = useMemo(
    () => !serverVariantDataReady
      ? []
      : hasFreshCapturedGroups
        ? (product.variantGroups.length ? product.variantGroups : capturedGroups)
        : usesServerVariantCatalog
          ? (product.variantGroups.length ? product.variantGroups : variantsQuery.data?.groups || [])
          : (variantsQuery.data?.groups.length ? variantsQuery.data.groups : product.variantGroups),
    [capturedGroups, hasFreshCapturedGroups, product.variantGroups, serverVariantDataReady, usesServerVariantCatalog, variantsQuery.data?.groups],
  );
  const variants = useMemo(
    () => !serverVariantDataReady
      ? []
      : hasFreshCapturedGroups
        ? product.variantPrices
        : usesServerVariantCatalog
          ? (product.variantPrices.length ? product.variantPrices : variantsQuery.data?.variants || [])
          : (variantsQuery.data?.variants.length ? variantsQuery.data.variants : product.variantPrices),
    [hasFreshCapturedGroups, product.variantPrices, serverVariantDataReady, usesServerVariantCatalog, variantsQuery.data?.variants],
  );
  const readiness = useMemo(() => ayWebsAddReadiness({
    product,
    groups,
    variants,
    selected,
    sessionId,
    quoteToken: sheetResolved.quoteToken,
  }), [groups, product, quantity, selected, sessionId, sheetResolved.quoteToken, variants]);
  const readinessMessage = ayWebsReadinessMessage(readiness.reason, t);
  const selectedServerPrice = serverVariantDataReady
    ? readiness.selectedVariant?.priceTnd ?? (!groups.length ? product.ayroviPriceTnd : null)
    : null;
  const selectedSourcePrice = groups.length
    ? (readiness.selectedVariant?.priceVerified ? readiness.selectedVariant.sourcePrice ?? null : null)
    : product.sourcePrice;
  const selectedSourceCurrency = groups.length
    ? (readiness.selectedVariant?.priceVerified ? readiness.selectedVariant.currency || '' : '')
    : product.currency;
  const selectedPriceVerified = groups.length
    ? Boolean(readiness.selectedVariant?.priceVerified && selectedSourcePrice !== null)
    : product.priceVerified && product.currencyVerified;
  const availabilityLabel = t(`aywebs.availability.${readiness.selectedVariant?.availability ?? (serverVariantDataReady && !groups.length ? product.availability : 'UNKNOWN')}` as never);

  const setOption = async (attribute: string, value: string) => {
    if (selected[attribute] === value || busy) return;
    const next = { ...selected, [attribute]: value };
    setSelected(next);
    setFailure('');
    setAdded(null);
    requestId.current = '';
    if (!hasFreshCapturedGroups || !onVariantChange) return;
    setBusy(true);
    try {
      await onVariantChange(next);
    } catch {
      setSelected(Object.keys(product.selectedVariant).length
        ? { ...product.selectedVariant }
        : { ...(optionCapture?.selectedVariantAttributes || {}) });
      setFailure(t('aywebs.variant.refreshFailed'));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!readiness.ready || busy || !sessionId) return;
    setBusy(true);
    setFailure('');
    if (!requestId.current) requestId.current = Crypto.randomUUID();
    try {
      // Mint a quote for this exact option and quantity. The server remains the
      // only authority for price, currency, availability and the final line.
      const fresh = await resolveAyWebsProduct({
        url: product.sourceUrl,
        storeId: product.storeId,
        sessionId,
        variant: selected,
        quantity,
        capture: optionCapture,
        refresh: true,
      });
      if (!fresh.quoteToken || !fresh.product.priceVerified || !fresh.product.currencyVerified) throw new Error('QUOTE_MISSING');
      if ((optionCapture || usesServerVariantCatalog) && !['AVAILABLE', 'LOW_STOCK'].includes(fresh.product.availability)) {
        throw new Error('AVAILABILITY_UNKNOWN');
      }
      if ((optionCapture?.variantGroups.length || (usesServerVariantCatalog && groups.length)) && !groups.every((group) => (
        Boolean(selected[group.attribute]?.trim())
        && selected[group.attribute].trim().toLowerCase() === String(fresh.product.selectedVariant[group.attribute] || '').trim().toLowerCase()
      ))) throw new Error('VARIANT_UNVERIFIED');
      const result = await addAyWebsCartItem({
        productId: fresh.product.productId,
        sourceUrl: fresh.product.sourceUrl,
        storeId: fresh.product.storeId,
        sessionId,
        variant: selected,
        quantity,
        quoteToken: fresh.quoteToken,
        capture: optionCapture,
        requestId: requestId.current,
      });
      setAdded(result);
      requestId.current = '';
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      void queryClient.invalidateQueries({ queryKey: ['aywebs', 'home'] });
      void queryClient.invalidateQueries({ queryKey: ['aywebs', 'cart'] });
    } catch (error) {
      if (isApiError(error) && error.isAborted) return;
      setFailure(ayWebsErrorMessage(error, locale, t));
    } finally {
      setBusy(false);
    }
  };

  const goToCart = () => {
    onContinueShopping();
    router.push('/(tabs)/cart' as never);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => { if (!busy) onContinueShopping(); }}
      testID="aywebs-add-sheet"
    >
      <View style={StyleSheet.absoluteFill}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          disabled={busy}
          onPress={onContinueShopping}
          style={[StyleSheet.absoluteFill, { backgroundColor: veil(0.48) }]}
        />
        <View
          style={[
            styles.sheet,
            {
              maxHeight: height * 0.88,
              paddingBottom: Math.max(insets.bottom, theme.space[2]) + theme.space[2],
              backgroundColor: theme.colors.canvas,
              borderTopLeftRadius: theme.radius.sheet,
              borderTopRightRadius: theme.radius.sheet,
              borderColor: theme.colors.line,
            },
          ]}
          accessibilityViewIsModal
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.lineControl }]} />
          {added ? (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={[styles.successIcon, { backgroundColor: theme.status.success.soft }]}>
                <Ionicons name="checkmark" size={24} color={theme.status.success.fg} accessibilityElementsHidden />
              </View>
              <AppText variant="title" align="center">{t('aywebs.add.successTitle')}</AppText>
              <AppText variant="body" color={theme.colors.muted} align="center">{added.item.title}</AppText>
              {added.item.variantLabel ? (
                <AppText variant="caption" color={theme.colors.muted} align="center">{added.item.variantLabel}</AppText>
              ) : null}
              <AppText variant="caption" align="center">
                {t('aywebs.add.serverLine', {
                  quantity: String(added.item.quantity),
                  price: added.item.unitPrice === null ? t('aywebs.price.unavailable') : added.item.unitPrice.toFixed(2),
                  currency: added.item.currency || '—',
                  total: added.item.lineTotalTnd === null ? t('aywebs.price.unavailable') : `${added.item.lineTotalTnd.toFixed(2)} TND`,
                })}
              </AppText>
              <AppText
                variant="caption"
                color={added.linkedToAyrovi ? theme.status.success.fg : theme.status.warning.fg}
                align="center"
              >
                {ayWebsLinkMessage(added.linkedToAyrovi, added.linkReason, t)}
              </AppText>
              <Button label={t('aywebs.add.continue')} tone="quiet" block onPress={onContinueShopping} />
              <Button label={t('aywebs.add.viewCart')} tone="main" block onPress={goToCart} />
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <AppText variant="title">{t('aywebs.add.sheetTitle')}</AppText>
              <View style={[styles.productRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
                {product.images[0] ? (
                  <AppImage uri={mediaUrl(product.images[0])} style={styles.image} contentFit="contain" accessibilityLabel={product.title} />
                ) : null}
                <View style={styles.productCopy}>
                  <AppText variant="label" weight="bold" numberOfLines={2}>{product.title}</AppText>
                  <AppText variant="caption" color={theme.colors.muted}>{product.storeName}</AppText>
                  <AppText variant="caption" color={theme.colors.muted}>
                    {!serverVariantDataReady || selectedSourcePrice === null || (groups.length > 0 && !selectedPriceVerified)
                      ? t('aywebs.price.unavailable')
                      : `${selectedSourcePrice.toFixed(2)} ${selectedSourceCurrency || '—'}`}
                  </AppText>
                </View>
              </View>

              <AppText variant="caption" color={serverVariantDataReady && selectedPriceVerified ? theme.status.success.fg : theme.status.warning.fg}>
                {serverVariantDataReady && selectedPriceVerified ? t('aywebs.price.verified') : t('aywebs.price.unverified')}
              </AppText>
              <AppText variant="caption" color={theme.colors.muted}>
                {t('aywebs.price.estimatedTnd', {
                  price: selectedServerPrice === null ? t('aywebs.price.unavailable') : `${selectedServerPrice.toFixed(2)} TND`,
                })}
              </AppText>
              <AppText variant="caption" color={theme.colors.muted}>
                {t('aywebs.availability.label')}: {availabilityLabel}
              </AppText>

              {serverVariantDataLoading ? <AppText variant="caption" color={theme.colors.muted}>{t('loading.server')}</AppText> : null}
              {serverVariantDataFailed ? (
                <AppText variant="caption" color={theme.status.warning.fg} accessibilityRole="alert">
                  {t('aywebs.variant.refreshFailed')}
                </AppText>
              ) : null}

              {groups.map((group) => (
                <View key={group.attribute} style={styles.group}>
                  <AppText variant="label" weight="bold">{t('aywebs.variant.choose', {
                    attribute: optionCapture?.variantGroups.find((candidate) => candidate.attribute === group.attribute)?.label
                      || (group.attribute.toLowerCase() === 'size' ? t('lens.product.size')
                        : group.attribute.toLowerCase() === 'color' ? t('lens.product.color') : group.attribute),
                  })}</AppText>
                  <View style={styles.options}>
                    {group.values.map((value) => {
                      const active = selected[group.attribute] === value;
                      const unavailable = confirmedUnavailable(group, value, groups, variants, optionCapture?.variantGroups || []);
                      return (
                        <Pressable
                          key={`${group.attribute}-${value}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active, disabled: unavailable || busy || (hasFreshCapturedGroups && !onVariantChange) }}
                          disabled={unavailable || busy || (hasFreshCapturedGroups && !onVariantChange)}
                          onPress={() => { void setOption(group.attribute, value); }}
                          style={[
                            styles.option,
                            {
                              minHeight: theme.geometry.minTarget,
                              borderColor: active ? theme.colors.action : theme.colors.lineControl,
                              backgroundColor: active ? theme.colors.accentSoft : theme.colors.surface,
                              borderRadius: theme.radius.control,
                              opacity: unavailable ? 0.45 : 1,
                            },
                          ]}
                        >
                          <AppText variant="caption" weight={active ? 'bold' : 'regular'} color={active ? theme.colors.accentText : theme.colors.ink}>
                            {value}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}

              <View style={[styles.quantityRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
                <AppText variant="label" weight="bold">{t('aywebs.quantity')}</AppText>
                <View style={[styles.stepper, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('aywebs.quantity.decrease')}
                    accessibilityState={{ disabled: quantity <= 1 || busy }}
                    disabled={quantity <= 1 || busy}
                    onPress={() => { setQuantity((value) => Math.max(1, value - 1)); setAdded(null); requestId.current = ''; }}
                    style={[styles.step, { borderColor: theme.colors.lineControl, borderRadius: theme.radius.control, minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget, opacity: quantity <= 1 ? 0.4 : 1 }]}
                  >
                    <AppText variant="title">−</AppText>
                  </Pressable>
                  <AppText variant="label" weight="bold">{String(quantity)}</AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('aywebs.quantity.increase')}
                    accessibilityState={{ disabled: quantity >= MAX_QUANTITY || busy }}
                    disabled={quantity >= MAX_QUANTITY || busy}
                    onPress={() => { setQuantity((value) => Math.min(MAX_QUANTITY, value + 1)); setAdded(null); requestId.current = ''; }}
                    style={[styles.step, { borderColor: theme.colors.lineControl, borderRadius: theme.radius.control, minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget, opacity: quantity >= MAX_QUANTITY ? 0.4 : 1 }]}
                  >
                    <AppText variant="title">+</AppText>
                  </Pressable>
                </View>
              </View>

              {variantsQuery.isError ? (
                <AppText variant="caption" color={theme.status.warning.fg}>{t('aywebs.variant.refreshFailed')}</AppText>
              ) : null}
              {readinessMessage ? <AppText variant="caption" color={theme.status.warning.fg} accessibilityRole="alert">{readinessMessage}</AppText> : null}
              {failure ? <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{failure}</AppText> : null}

              <Button
                label={t('aywebs.addToCart')}
                busy={busy}
                disabled={!readiness.ready || !serverVariantDataReady || serverVariantDataFailed || serverVariantDataLoading || variantsQuery.isLoading}
                tone="main"
                block
                onPress={() => { void add(); }}
                testID="aywebs-add-to-cart"
              />
              <Button label={t('common.cancel')} tone="quiet" block disabled={busy} onPress={onContinueShopping} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { marginTop: 'auto', paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  content: { gap: 12, paddingBottom: 8 },
  productRow: { alignItems: 'center', gap: 12 },
  productCopy: { flex: 1, gap: 4 },
  image: { width: 60, height: 60, borderRadius: 8 },
  group: { gap: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1 },
  quantityRow: { alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepper: { alignItems: 'center', gap: 12 },
  step: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  successIcon: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 24 },
});
