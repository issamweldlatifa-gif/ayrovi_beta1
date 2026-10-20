/**
 * ورقة الاختيار والإضافة — تُعرض **فوق صفحة التاجر** (أو فوق بطاقة المنتوج).
 *
 * هذا هو مسار «Add to Cart» كما في الأمر الهندسي الدائم
 * (`docs/AYWEBS_ADD_TO_CART_ORDER.md`):
 *
 *   • الورقة تفتح فوراً من الكابتشر المحلّية (`capture`) بلا نداء للخادم: تعرض
 *     المقاسات والألوان المستخرجة من الكابتشر، العنوان، والكمية.
 *   • زرّ التأكيد عندو حالة التحميل الخاصة بيه (spinner)، وباقي عناصر الورقة
 *     غير نشطة وقت التحميل.
 *   • عند الضغط على زرّ التأكيد: نبعثو `url`، `capture`، الخيار المختار (`variant`)،
 *     `store_id`، و`refresh: true` لـ `/product/resolve`، ثمّ `addAyWebsCartItem`
 *     بالتسعير الموقّع (`quoteToken`) اللي رجّعو الخادم.
 *   • أي رفض (`OUT_OF_STOCK`، `VARIANT_NOT_PROVEN`، تغيّر السعر، `CAPTURE_INCOMPLETE`،
 *     `STOCK_UNKNOWN`) يعرض السبب بوضوح بلا إضافة للسلّة.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, Button, KeyValue } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { AppSheet } from '@/design/sheet/AppSheet';
import { SheetHeader } from '@/design/sheet/SheetHeader';
import { useI18n } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { isApiError, userMessage } from '@/api/errors';
import {
  addAyWebsCartItem,
  resolveAyWebsProductWithCapture,
  type AyWebsAddBlockCode,
  type AyWebsCartItem,
  type AyWebsResolveOutcome,
  type AyWebsResolvedProduct,
  type AyWebsVariantGroup,
  type AyWebsVariantOption,
} from '@/api/aywebs';
import {
  extractCaptureSheetData,
  validateConfirmResolution,
  type ConfirmValidationCode,
} from '@/features/aywebs/captureFlow';
import { newAyWebsRequestId } from '@/features/aywebs/requestId';

export interface AddToCartSheetProps {
  visible: boolean;
  sessionId: string;
  /** URL de la fiche produit (utilisée lors de la confirmation serveur). */
  sourceUrl?: string;
  /** Identifiant de la boutique (ex. 'amazon'). */
  storeId?: string;
  /** Titre de secours si la capture n'en porte pas. */
  fallbackTitle?: string;
  /** Produit déjà résolu (optionnel : la feuille s'ouvre d'abord depuis `capture`). */
  product?: AyWebsResolvedProduct | null;
  /** Options de variantes pré-fournies (optionnelles : sinon extraites de `capture`). */
  options?: AyWebsVariantOption[];
  /** Capture WebView locale : fournit titre, tailles, couleurs et preuves. */
  capture?: unknown;
  /** Facture de prix signée si déjà disponible (sinon obtenue à la confirmation). */
  quoteToken?: string;
  onClose: () => void;
  /** Appelé dès que le serveur a validé la fiche au clic sur Confirmer. */
  onResolved?: (outcome: AyWebsResolveOutcome) => void;
  /** Appelé quand la ligne a été ajoutée au panier. */
  onAdded?: (item: AyWebsCartItem) => void;
}

const MAX_QUANTITY = 99;

export function AddToCartSheet({
  visible,
  sessionId,
  sourceUrl,
  storeId,
  fallbackTitle,
  product = null,
  options,
  capture,
  quoteToken = '',
  onClose,
  onResolved,
  onAdded,
}: AddToCartSheetProps) {
  const theme = useTheme();
  const { t, locale } = useI18n();

  const localData = useMemo(() => extractCaptureSheetData(capture), [capture]);

  const [resolvedProduct, setResolvedProduct] = useState<AyWebsResolvedProduct | null>(product);
  const [resolvedQuoteToken, setResolvedQuoteToken] = useState<string>(quoteToken);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<{ item: AyWebsCartItem; linked: boolean; reason: string } | null>(null);
  const requestId = useRef('');

  const groups = useMemo<AyWebsVariantGroup[]>(() => {
    if (localData.groups.length > 0) return localData.groups;
    return resolvedProduct?.variantGroups ?? [];
  }, [localData.groups, resolvedProduct]);

  const variantOptions = useMemo<AyWebsVariantOption[]>(() => {
    if (options?.length) return options;
    if (localData.options.length > 0) return localData.options;
    return resolvedProduct?.variantDetails ?? [];
  }, [localData.options, options, resolvedProduct]);

  const targetKey = sourceUrl || localData.url || product?.productId || product?.sourceUrl || '';

  /** كل فتح للورقة = نيّة إضافة جديدة: مفتاح جديد، اختيار مبدئي من الكابتشر، كمية 1. */
  useEffect(() => {
    if (!visible) return;
    requestId.current = newAyWebsRequestId();
    setResolvedProduct(product);
    setResolvedQuoteToken(quoteToken);
    const initial: Record<string, string> = { ...localData.initialSelection };
    const activeGroups = localData.groups.length > 0 ? localData.groups : (product?.variantGroups ?? []);
    for (const group of activeGroups) {
      const key = group.attribute.trim().toLowerCase();
      if (!initial[key] && group.values.length === 1) {
        initial[key] = group.values[0]!;
      }
    }
    setSelection(initial);
    setQuantity(1);
    setError('');
    setAdded(null);
    setBusy(false);
  }, [visible, targetKey, capture]);

  /** هل هذا الخيار متوفّر؟ (غير المتوفّر يتعطّل ولا يتخيّرش أبداً — §30) */
  const optionAvailability = useCallback((attribute: string, value: string): string | null => {
    if (!variantOptions.length) return null;
    const key = attribute.trim().toLowerCase();
    // Si les options portent une seule dimension (ex. options Amazon par dimension),
    // on vérifie directement l'option de cette dimension.
    const singleDimMatch = variantOptions.find((option) => {
      const keys = Object.keys(option.attributes);
      return keys.length === 1
        && keys[0]!.toLowerCase() === key
        && String(option.attributes[keys[0]!]).toLowerCase() === value.trim().toLowerCase();
    });
    const wanted = Object.entries(selection)
      .filter(([name]) => name.toLowerCase() !== key)
      .reduce<Record<string, string>>((acc, [name, chosen]) => ({ ...acc, [name.toLowerCase()]: chosen }), {});
    const probe = { ...wanted, [key]: value };
    const candidate = Object.keys(probe).sort();
    const exact = variantOptions.find((option) => {
      const keys = Object.keys(option.attributes).map((k) => k.toLowerCase()).sort();
      return keys.length === candidate.length
        && keys.every((name, index) => name === candidate[index]
          && String(option.attributes[name] ?? '').toLowerCase() === String(probe[name]).toLowerCase());
    });
    if (exact) return exact.availability;
    if (singleDimMatch) return singleDimMatch.availability;
    return null;
  }, [selection, variantOptions]);

  const localReadiness = useMemo((): {
    ready: boolean;
    code: AyWebsAddBlockCode | ConfirmValidationCode | '';
    quotedTotalTnd: number | null;
    availability: string | null;
  } => {
    const quotedTotalTnd = resolvedProduct?.ayroviPricing?.totalTnd ?? null;
    const availability = resolvedProduct?.availability.state ?? null;

    for (const group of groups) {
      const key = group.attribute.trim().toLowerCase();
      const picked = selection[key] ?? selection[group.attribute] ?? '';
      if (!picked.trim()) {
        return { ready: false, code: 'VARIANT_REQUIRED', quotedTotalTnd, availability };
      }
      const state = optionAvailability(group.attribute, picked);
      if (state === 'OUT_OF_STOCK') {
        return { ready: false, code: 'VARIANT_UNAVAILABLE', quotedTotalTnd, availability };
      }
    }

    if (resolvedProduct && resolvedProduct.availability.state === 'OUT_OF_STOCK') {
      return { ready: false, code: 'OUT_OF_STOCK', quotedTotalTnd, availability };
    }

    return { ready: true, code: '', quotedTotalTnd, availability };
  }, [groups, optionAvailability, resolvedProduct, selection]);

  const blockedMessage = (code: AyWebsAddBlockCode | ConfirmValidationCode | ''): string => {
    switch (code) {
      case 'VARIANT_REQUIRED': return t('aywebs.block.VARIANT_REQUIRED');
      case 'VARIANT_UNKNOWN': return t('aywebs.block.VARIANT_UNKNOWN');
      case 'VARIANT_NOT_PROVEN': return t('aywebs.block.VARIANT_NOT_PROVEN');
      case 'VARIANT_UNAVAILABLE': return t('aywebs.block.VARIANT_UNAVAILABLE');
      case 'OUT_OF_STOCK': return t('aywebs.block.OUT_OF_STOCK');
      case 'STOCK_UNKNOWN': return t('aywebs.block.STOCK_UNKNOWN');
      case 'PRICE_CHANGED': return t('aywebs.block.PRICE_CHANGED');
      case 'PRICE_UNAVAILABLE': return t('aywebs.block.PRICE_UNAVAILABLE');
      default: return '';
    }
  };

  const formatCaughtError = useCallback((caught: unknown): string => {
    if (isApiError(caught)) {
      if (caught.code === 'OUT_OF_STOCK' || caught.code === 'PRODUCT_UNAVAILABLE') {
        return t('aywebs.block.OUT_OF_STOCK');
      }
      if (caught.code === 'VARIANT_NOT_PROVEN' || caught.code === 'VARIANT_UNKNOWN') {
        return t('aywebs.block.VARIANT_NOT_PROVEN');
      }
      if (caught.code === 'VARIANT_UNAVAILABLE') {
        return t('aywebs.block.VARIANT_UNAVAILABLE');
      }
      if (caught.code === 'VARIANT_REQUIRED') {
        return t('aywebs.block.VARIANT_REQUIRED');
      }
      if (caught.code === 'PRICE_CHANGED' || caught.code === 'PRICE_AMBIGUOUS') {
        return t('aywebs.block.PRICE_CHANGED');
      }
      if (caught.code === 'STOCK_UNKNOWN') {
        return t('aywebs.block.STOCK_UNKNOWN');
      }
      if (caught.code === 'PRICE_UNAVAILABLE') {
        return t('aywebs.block.PRICE_UNAVAILABLE');
      }
      return userMessage(caught)[locale];
    }
    return t('aywebs.captureFailed');
  }, [locale, t]);

  const confirm = useCallback(async () => {
    if (!sessionId || !requestId.current || !localReadiness.ready || busy) return;
    setBusy(true);
    setError('');
    const chosenVariant = Object.keys(selection).length ? selection : null;
    const resolveUrl = sourceUrl || localData.url || resolvedProduct?.sourceUrl || '';
    const resolveStoreId = storeId || resolvedProduct?.storeId || undefined;

    try {
      let currentProduct = resolvedProduct;
      let currentQuoteToken = resolvedQuoteToken;

      // Étape 1 : validation serveur de la fiche et de la variante choisie avec la capture.
      if (capture !== undefined && capture !== null) {
        const resolved = await resolveAyWebsProductWithCapture(resolveUrl, {
          sessionId,
          storeId: resolveStoreId,
          capture,
          variant: chosenVariant,
          quantity,
          refresh: true,
        });
        currentProduct = resolved.product;
        currentQuoteToken = resolved.quoteToken;
        setResolvedProduct(resolved.product);
        setResolvedQuoteToken(resolved.quoteToken);
        onResolved?.(resolved);

        const verdict = validateConfirmResolution(resolved, chosenVariant);
        if (!verdict.ok) {
          if (verdict.code === 'CAPTURE_INCOMPLETE') {
            setError(userMessage({
              name: 'ApiError',
              kind: 'http',
              status: 422,
              code: 'CAPTURE_INCOMPLETE',
              missingFields: verdict.missingFields ?? ['title', 'price'],
              retryAfterMs: 0,
              message: '',
            })[locale]);
          } else {
            setError(blockedMessage(verdict.code));
          }
          return;
        }
      } else if (currentProduct) {
        const syntheticOutcome: AyWebsResolveOutcome = {
          product: currentProduct,
          capture: null,
          priceRejection: null,
          missing: [],
          quoteToken: currentQuoteToken,
        };
        const verdict = validateConfirmResolution(syntheticOutcome, chosenVariant);
        if (!verdict.ok) {
          setError(blockedMessage(verdict.code));
          return;
        }
      } else {
        setError(t('aywebs.block.PRICE_UNAVAILABLE'));
        return;
      }

      // Étape 2 : ajout au panier avec le devis signé validé par le serveur.
      const outcome = await addAyWebsCartItem({
        productId: currentProduct.productId,
        sourceUrl: currentProduct.sourceUrl || resolveUrl,
        storeId: currentProduct.storeId || resolveStoreId,
        variant: chosenVariant,
        quantity,
        capture,
        quoteToken: currentQuoteToken,
        requestId: requestId.current,
      }, { sessionId });

      if (outcome.item.status === 'PRICE_CHANGED') {
        setError(t('aywebs.block.PRICE_CHANGED'));
        return;
      }

      setAdded({
        item: outcome.item,
        linked: outcome.ayrovi?.linked === true,
        reason: outcome.ayrovi?.reason || '',
      });
      onAdded?.(outcome.item);
    } catch (caught) {
      setError(formatCaughtError(caught));
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    capture,
    formatCaughtError,
    localData.url,
    localReadiness.ready,
    locale,
    onAdded,
    onResolved,
    quantity,
    resolvedProduct,
    resolvedQuoteToken,
    selection,
    sessionId,
    sourceUrl,
    storeId,
    t,
  ]);

  const availabilityLabel = (state: string | null): string => {
    if (!state) return '';
    if (state === 'AVAILABLE') return t('aywebs.avail.AVAILABLE');
    if (state === 'LOW_STOCK') return t('aywebs.avail.LOW_STOCK');
    if (state === 'OUT_OF_STOCK') return t('aywebs.avail.OUT_OF_STOCK');
    return t('aywebs.avail.UNKNOWN');
  };

  const displayTitle = localData.title || resolvedProduct?.title || fallbackTitle || '';
  const itemsCount = groups.reduce((sum, group) => sum + group.values.length, 0);

  return (
    <AppSheet
      open={visible}
      onDismiss={busy ? () => {} : onClose}
      header={(
        <SheetHeader
          title={added ? t('aywebs.added') : t('aywebs.sheetTitle')}
          subtitle={added ? undefined : (displayTitle || undefined)}
          onClose={busy ? () => {} : onClose}
        />
      )}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {added ? (
          <>
            {added.item.images[0] ? (
              <AppImage
                uri={mediaUrl(added.item.images[0])}
                style={styles.image}
                contentFit="contain"
                accessibilityLabel={added.item.title}
              />
            ) : null}
            <AppText variant="lead" weight="bold">{added.item.title}</AppText>
            {added.item.variantLabel ? (
              <KeyValue label={t('aywebs.variant')} value={added.item.variantLabel} />
            ) : null}
            <KeyValue label={t('aywebs.quantity')} value={String(added.item.quantity)} />
            <KeyValue
              label={t('aywebs.sourcePrice')}
              value={added.item.unitPrice != null
                ? `${added.item.unitPrice} ${added.item.currency}`.trim()
                : t('aywebs.noPrice')}
            />
            {added.item.lineTotalTnd != null ? (
              <KeyValue label={t('aywebs.totalTnd')} value={`${added.item.lineTotalTnd.toFixed(2)} TND`} />
            ) : null}
            <AppText variant="caption" color={theme.colors.muted}>
              {added.linked ? t('aywebs.addedLinked') : t('aywebs.addedUnlinked')}
            </AppText>
            {!added.linked && added.reason ? (
              <KeyValue label={t('aywebs.linkReason')} value={added.reason} />
            ) : null}
            <View style={styles.row}>
              <Button
                label={t('aywebs.goToCart')}
                onPress={() => { onClose(); router.push('/aywebs/cart'); }}
              />
              <Button
                label={t('aywebs.continueShopping')}
                tone="quiet"
                onPress={onClose}
              />
            </View>
          </>
        ) : (
          <>
            {displayTitle ? (
              <AppText variant="lead" weight="bold" numberOfLines={2}>
                {displayTitle}
              </AppText>
            ) : null}

            {groups.map((group) => {
              const key = group.attribute.trim().toLowerCase();
              const chosen = selection[key] ?? '';
              return (
                <View key={group.attribute} style={styles.group}>
                  <AppText variant="label">
                    {group.attribute}{chosen ? ` : ${chosen}` : ''}
                  </AppText>
                  <View style={styles.chips}>
                    {group.values.map((value) => {
                      const state = optionAvailability(group.attribute, value);
                      const unavailable = state === 'OUT_OF_STOCK';
                      const chipDisabled = unavailable || busy;
                      const active = chosen.toLowerCase() === value.toLowerCase();
                      return (
                        <Pressable
                          key={value}
                          testID={`aywebs-option-${key}-${value}`}
                          disabled={chipDisabled}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active, disabled: chipDisabled }}
                          onPress={() => {
                            if (busy) return;
                            setSelection((current) => ({ ...current, [key]: value }));
                            setError('');
                            requestId.current = newAyWebsRequestId();
                          }}
                          style={[
                            styles.chip,
                            {
                              borderColor: active ? theme.colors.action : theme.colors.line,
                              backgroundColor: active ? theme.colors.action : theme.colors.canvas,
                              borderRadius: theme.radius.control,
                              minHeight: theme.geometry.minTarget,
                            },
                            chipDisabled ? styles.chipDisabled : null,
                          ]}
                        >
                          <AppText variant="label" color={active ? theme.colors.onAction : theme.colors.ink}>
                            {value}
                          </AppText>
                          {unavailable ? (
                            <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.notAvailable')}</AppText>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            <View style={styles.group}>
              <AppText variant="label">{t('aywebs.quantity')}</AppText>
              <View style={styles.row}>
                <Button
                  label="−"
                  tone="quiet"
                  disabled={quantity <= 1 || busy}
                  onPress={() => {
                    if (busy) return;
                    setQuantity((value) => Math.max(1, value - 1));
                    setError('');
                    requestId.current = newAyWebsRequestId();
                  }}
                />
                <AppText variant="lead" weight="bold">{String(quantity)}</AppText>
                <Button
                  label="+"
                  tone="quiet"
                  disabled={quantity >= MAX_QUANTITY || busy}
                  onPress={() => {
                    if (busy) return;
                    setQuantity((value) => Math.min(MAX_QUANTITY, value + 1));
                    setError('');
                    requestId.current = newAyWebsRequestId();
                  }}
                />
              </View>
            </View>

            {localReadiness.quotedTotalTnd != null ? (
              <KeyValue
                label={t('aywebs.totalTnd')}
                value={`${localReadiness.quotedTotalTnd.toFixed(2)} TND`}
              />
            ) : null}
            {localReadiness.availability ? (
              <KeyValue
                label={t('aywebs.availability')}
                value={availabilityLabel(localReadiness.availability)}
              />
            ) : null}
            <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.quoteServer')}</AppText>

            {localReadiness.ready ? null : (
              <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">
                {blockedMessage(localReadiness.code)}
              </AppText>
            )}
            {error ? (
              <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">
                {error}
              </AppText>
            ) : null}

            <View style={styles.row}>
              <Button
                testID="aywebs-sheet-confirm"
                label={busy ? t('aywebs.adding') : t('aywebs.addToCart')}
                onPress={confirm}
                busy={busy}
                disabled={!localReadiness.ready || !sessionId || busy}
              />
              <Button
                label={t('common.cancel')}
                tone="quiet"
                onPress={onClose}
                disabled={busy}
              />
            </View>
            {itemsCount === 0 && groups.length === 0 ? (
              <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.sheetNoOptions')}</AppText>
            ) : null}
          </>
        )}
      </ScrollView>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  image: { width: '100%', height: 160, marginBottom: 4 },
  group: { gap: 6, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 64,
  },
  chipDisabled: { opacity: 0.45 },
});
