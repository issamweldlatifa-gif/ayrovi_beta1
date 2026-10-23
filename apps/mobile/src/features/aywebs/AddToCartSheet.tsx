/**
 * ورقة الاختيار والإضافة — تُعرض **فوق صفحة التاجر** (أو فوق بطاقة المنتوج).
 *
 * هذا هو مسار «Add to Cart» كما في الأمر الهندسي الدائم
 * (`docs/AYWEBS_ADD_TO_CART_ORDER.md`):
 *
 *   • الإضافة عملية حقيقية على الخادم (سطر ينكتب في `ayweb_cart_items`)، موش
 *     فتح صفحة ولا بطاقة منتوج كبيرة.
 *   • المستعمل **ما يخرجش** من المتجر: الورقة تتسدّ، ونرجعو للصفحة.
 *   • ما نبعثوش سعراً ولا عملة ولا حالة: نيّة إضافة فقط — الخادم يعيد القراءة
 *     ويحسب الثمن، والسطر يحمل لقطة السعر (§45).
 *   • «Add to Cart» ما يتفعّلش إلا كي الخادم فعلاً باش يقبل (نفس شروطه: اختيار
 *     كامل، توفّر مؤكّد، تسعير خادمي) — وإلا السبب يتقال بالكلمات.
 *   • التأكيد مكتوب من **السطر اللي رجّعو الخادم**، موش من عندنا.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
  addAyWebsCartItem, ayWebsAddReadiness, fetchAyWebsVariants, resolveAyWebsProductWithCapture,
  type AyWebsAddBlockCode, type AyWebsCartItem, type AyWebsResolvedProduct,
  type AyWebsVariantGroup, type AyWebsVariantOption,
} from '@/api/aywebs';
import { newAyWebsRequestId } from '@/features/aywebs/requestId';
import { variantPageUrlFor } from '@/features/aywebs/variantPage';
import {
  defaultSelectionFromCapture, displayPriceForSelection, localAddReadiness, stockForSelection,
} from '@/features/aywebs/localProduct';

export interface AddToCartSheetProps {
  visible: boolean;
  sessionId: string;
  product: AyWebsResolvedProduct;
  /** بطاقات الخيارات — كي ما تجيش، نطلبوها من الخادم (أفضل جهد، ما تسقطش الورقة). */
  options?: AyWebsVariantOption[];
  /** كابتشر WebView: يجي كان من شاشة المتجر. ما يتعدّلش وما يتلخّصش. */
  capture?: unknown;
  /** فاتورة السعر الموقّعة من `/product/resolve` — تمنع إعادة قراءة التاجر. */
  quoteToken?: string;
  /** قراءة صفحة المقاس المختار (WebView مخفي). مطلوب لأمازون عند اختيار مقاس غير المعروض. */
  readVariant?: (url: string) => Promise<Record<string, unknown>>;
  /** ورقة من القراءة المحلية (بلا نداء للخادم عند الفتح). التأكيد يعيد قراءة الاختيار ثم يسأل الخادم. */
  local?: boolean;
  onClose: () => void;
  /** للسطر الجديد (يتستعمل في شاشة المتجر باش تحدّث الأثر). */
  onAdded?: (item: AyWebsCartItem) => void;
}

const MAX_QUANTITY = 99;

export function AddToCartSheet({
  visible, sessionId, product, options, capture, quoteToken, readVariant, local = false, onClose, onAdded,
}: AddToCartSheetProps) {
  const theme = useTheme();
  const { t, locale } = useI18n();

  const [selection, setSelection] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<{ item: AyWebsCartItem; linked: boolean; reason: string } | null>(null);
  const [fetched, setFetched] = useState<AyWebsVariantOption[]>([]);
  const [fetchedGroups, setFetchedGroups] = useState<AyWebsVariantGroup[] | null>(null);
  const requestId = useRef('');

  const groups = useMemo<AyWebsVariantGroup[]>(
    () => (product.variantGroups.length ? product.variantGroups : (fetchedGroups ?? [])),
    [fetchedGroups, product.variantGroups],
  );
  const variantOptions = useMemo<AyWebsVariantOption[]>(() => {
    const given = options?.length ? options : product.variantDetails;
    return given.length ? given : fetched;
  }, [fetched, options, product.variantDetails]);

  /**
   * كل فتح للورقة = نيّة إضافة جديدة: مفتاح جديد، كمية 1.
   *
   * الاختيار ما يبداش فارغاً: الصفحة مفتوحة على تركيبة معيّنة (لون ومقاس
   * معروضين)، والورقة تعرضها مختارة. بلا هذا، ورقةٌ على فصلةٍ بمجموعات
   * فارغة تبدو «التاجر ما نشر حتى خيار» وزرّ الإضافة يبقى مقفولاً على منتوج
   * معروض كامل. الاختيار يبقى **من الصفحة فقط**: ما نخترعوش قيمة.
   */
  useEffect(() => {
    if (!visible) return;
    requestId.current = newAyWebsRequestId();
    setSelection(local && capture ? defaultSelectionFromCapture(capture as Record<string, unknown>, groups) : {});
    setQuantity(1);
    setError('');
    setAdded(null);
    setBusy(false);
    setFetched([]);
    setFetchedGroups(null);
    // القصد: نعيد الضبط عند **كل فتح** فقط — تبديل المجموعات وسط الورقة ما يمسحش اختيار المستعمل.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);


  /**
   * بطاقات الخيارات من الخادم — **أفضل جهد** فقط: كان الطلب فشل، الورقة تبقى
   * مفتوحة بالبيانات اللي عندنا. نفس سلوك الويب بالضبط.
   */
  useEffect(() => {
    if (!visible || !sessionId || local) return;
    const needsGroups = product.variantGroups.length === 0;
    const needsOptions = !(options?.length || product.variantDetails.length);
    if (!needsGroups && !needsOptions) return;
    let alive = true;
    fetchAyWebsVariants(
      { productId: product.productId, url: product.sourceUrl, storeId: product.storeId || undefined },
      { sessionId },
    )
      .then((payload) => {
        if (!alive) return;
        setFetched(payload.variants);
        setFetchedGroups(payload.variantGroups);
      })
      .catch(() => { /* أفضل جهد: الفشل ما يمنعش الإضافة */ });
    return () => { alive = false; };
  }, [local, options, product.productId, product.sourceUrl, product.storeId, product.variantDetails.length, product.variantGroups.length, sessionId, visible]);

  const pageInStock = /in stock|en stock|disponible|auf lager/i.test(
    String((capture as { availabilityText?: unknown } | null | undefined)?.availabilityText ?? ''),
  );
  const readiness = useMemo(() => {
    if (local) {
      const res = localAddReadiness({
        groups,
        variants: variantOptions.map((option) => ({
          asin: option.sourceVariantId,
          attributes: option.attributes,
          availability: option.availability === 'AVAILABLE' ? 'AVAILABLE' : option.availability === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : 'UNKNOWN',
        })),
        selection,
        pageInStockText: pageInStock,
      });
      return { ready: res.ready, code: res.code, missingAttributes: res.missingAttributes, availability: '', quotedTotalTnd: null };
    }
    return ayWebsAddReadiness({
      groups,
      options: variantOptions,
      productAvailability: product.availability.state,
      productQuotedTnd: product.ayroviPricing?.totalTnd ?? null,
      selection,
    });
  }, [groups, local, pageInStock, product.availability.state, product.ayroviPricing, selection, variantOptions]);

  /**
   * الكمية المتوفّرة المعلنة لهذا الاختيار، إن نشرتها الصفحة (« Only 6 left in
   * stock »). ما نستنبطوهاش: `null` = غير معلنة، والسقف يبقى سقف التطبيق.
   */
  const stock = useMemo(
    () => (local && capture ? stockForSelection(capture as Record<string, unknown>, selection) : null),
    [capture, local, selection],
  );
  const maxQuantity = useMemo(
    () => (stock != null ? Math.max(1, Math.min(MAX_QUANTITY, stock)) : MAX_QUANTITY),
    [stock],
  );
  /* الكمية ما تفوتش المخزون المعلن: كي المستعمل ينقص اللون لمخزون أقل، الكمية ترجع للسقف. */
  useEffect(() => {
    setQuantity((current) => Math.min(current, maxQuantity));
  }, [maxQuantity]);
  /**
   * السعر **المعروض**: نصّ الصفحة (« $89.99 ») أو سعر بطاقة الاختيار. موش
   * حساب: التحويل للدينار والمجموع يجي من الخادم لحظة الإضافة (الفاتورة).
   */
  const shownPrice = useMemo(
    () => (local && capture ? displayPriceForSelection(capture as Record<string, unknown>, selection) : null),
    [capture, local, selection],
  );

  /** الاختيار الوحيد يُملأ تلقائياً: قيمة واحدة = بيانات، موش خيار. */
  const singleValueGroups = useMemo(
    () => groups.filter((group) => group.values.length === 1),
    [groups],
  );
  useEffect(() => {
    if (!visible || !singleValueGroups.length) return;
    setSelection((current) => {
      const next = { ...current };
      for (const group of singleValueGroups) {
        const key = group.attribute.trim().toLowerCase();
        if (!next[key]) next[key] = group.values[0];
      }
      return next;
    });
  }, [singleValueGroups, visible]);

  const blockedMessage = (code: AyWebsAddBlockCode): string => {
    switch (code) {
      case 'VARIANT_REQUIRED': return t('aywebs.block.VARIANT_REQUIRED');
      case 'VARIANT_UNKNOWN': return t('aywebs.block.VARIANT_UNKNOWN');
      case 'VARIANT_UNAVAILABLE': return t('aywebs.block.VARIANT_UNAVAILABLE');
      case 'OUT_OF_STOCK': return t('aywebs.block.OUT_OF_STOCK');
      case 'STOCK_UNKNOWN': return t('aywebs.block.STOCK_UNKNOWN');
      case 'PRICE_UNAVAILABLE': return t('aywebs.block.PRICE_UNAVAILABLE');
      default: return '';
    }
  };

  /** هل هذا الخيار متوفّر؟ (غير المتوفّر يتعطّل ولا يتخيّرش أبداً — §30) */
  const optionAvailability = useCallback((attribute: string, value: string): string | null => {
    if (!variantOptions.length) return null;
    const key = attribute.trim().toLowerCase();
    const wanted = Object.entries(selection)
      .filter(([name]) => name !== key)
      .reduce<Record<string, string>>((acc, [name, chosen]) => ({ ...acc, [name]: chosen }), {});
    const probe = { ...wanted, [key]: value };
    const candidate = Object.keys(probe).sort();
    const exact = variantOptions.find((option) => {
      const keys = Object.keys(option.attributes).sort();
      return keys.length === candidate.length
        && keys.every((name, index) => name === candidate[index]
          && String(option.attributes[name]).toLowerCase() === String(probe[name]).toLowerCase());
    });
    return exact ? exact.availability : null;
  }, [selection, variantOptions]);

  /** Adresse de la page du choix (Amazon, ASIN différent de la page affichée), sinon `null`. */
  const variantPageUrl = useCallback(
    () => variantPageUrlFor({ sourceUrl: product.sourceUrl, storeId: product.storeId, selection, options: variantOptions }),
    [product.sourceUrl, product.storeId, selection, variantOptions],
  );

  const confirm = useCallback(async () => {
    if (!sessionId || !requestId.current || !readiness.ready) return;
    setBusy(true);
    setError('');
    try {
      let productId = product.productId;
      let sourceUrl = product.sourceUrl;
      let cartCapture = capture;
      let cartQuote = quoteToken;
      if (local) {
        /* Ajout depuis la lecture locale : on relit la page du choix, puis le serveur fixe le prix et le devis. */
        if (!readVariant) throw new Error('variant-reader-missing');
        const target = variantPageUrl() ?? product.sourceUrl;
        const fresh = await readVariant(target);
        const verified = await resolveAyWebsProductWithCapture(target, {
          sessionId, storeId: product.storeId || undefined, capture: fresh, refresh: true,
        });
        productId = verified.product.productId;
        sourceUrl = target;
        cartCapture = fresh;
        cartQuote = verified.quoteToken;
      } else {
        /* Ancien chemin (page sans lecture locale) : même vérification de la variante choisie. */
        const variantUrl = variantPageUrl();
        if (variantUrl) {
          if (!readVariant) throw new Error('variant-reader-missing');
          const variantCapture = await readVariant(variantUrl);
          const verified = await resolveAyWebsProductWithCapture(variantUrl, {
            sessionId, storeId: product.storeId || undefined, capture: variantCapture, refresh: true,
          });
          productId = verified.product.productId;
          sourceUrl = variantUrl;
          cartCapture = variantCapture;
          cartQuote = verified.quoteToken;
        }
      }
      const outcome = await addAyWebsCartItem({
        productId,
        sourceUrl,
        storeId: product.storeId || undefined,
        variant: Object.keys(selection).length ? selection : null,
        quantity,
        capture: cartCapture,
        quoteToken: cartQuote,
        requestId: requestId.current,
      }, { sessionId });
      setAdded({
        item: outcome.item,
        linked: outcome.ayrovi?.linked === true,
        reason: outcome.ayrovi?.reason || '',
      });
      onAdded?.(outcome.item);
    } catch (caught) {
      if (caught instanceof Error && caught.message === 'variant-reader-missing') {
        setError(t('aywebs.captureFailed'));
      } else {
        setError(isApiError(caught) ? userMessage(caught)[locale] : t('aywebs.captureFailed'));
      }
    } finally {
      setBusy(false);
    }
  }, [capture, local, locale, onAdded, product.productId, product.sourceUrl, product.storeId, quantity, quoteToken,
    readVariant, readiness.ready, selection, sessionId, t, variantPageUrl]);

  const availabilityLabel = (state: string | null): string => {
    if (!state) return '';
    if (state === 'AVAILABLE') return t('aywebs.avail.AVAILABLE');
    if (state === 'LOW_STOCK') return t('aywebs.avail.LOW_STOCK');
    if (state === 'OUT_OF_STOCK') return t('aywebs.avail.OUT_OF_STOCK');
    return t('aywebs.avail.UNKNOWN');
  };

  const itemsCount = groups.reduce((sum, group) => sum + group.values.length, 0);

  return (
    <AppSheet
      open={visible}
      onDismiss={onClose}
      header={(
        <SheetHeader
          title={added ? t('aywebs.added') : t('aywebs.sheetTitle')}
          subtitle={added ? undefined : product.title}
          onClose={onClose}
        />
      )}
    >
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {added ? (
              <>
                {added.item.images[0] ? (
                  <AppImage uri={mediaUrl(added.item.images[0])} style={styles.image} contentFit="contain" accessibilityLabel={added.item.title} />
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
                          const active = chosen.toLowerCase() === value.toLowerCase();
                          return (
                            <Pressable
                              key={value}
                              disabled={unavailable}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active, disabled: unavailable }}
                              onPress={() => setSelection((current) => ({ ...current, [key]: value }))}
                              style={[
                                styles.chip,
                                {
                                  borderColor: active ? theme.colors.action : theme.colors.line,
                                  backgroundColor: active ? theme.colors.action : theme.colors.canvas,
                                  borderRadius: theme.radius.control,
                                  minHeight: theme.geometry.minTarget,
                                },
                                unavailable ? styles.chipDisabled : null,
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
                      onPress={() => setQuantity((value) => Math.max(1, value - 1))}
                    />
                    <AppText variant="lead" weight="bold">{String(quantity)}</AppText>
                    <Button
                      label="+"
                      tone="quiet"
                      disabled={quantity >= maxQuantity || busy}
                      onPress={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                    />
                  </View>
                </View>

                {shownPrice ? (
                  <KeyValue label={t('aywebs.merchantPrice')} value={shownPrice.text} />
                ) : null}
                {readiness.quotedTotalTnd != null ? (
                  <KeyValue
                    label={t('aywebs.totalTnd')}
                    value={`${readiness.quotedTotalTnd.toFixed(2)} TND`}
                  />
                ) : null}
                <KeyValue
                  label={t('aywebs.availability')}
                  value={availabilityLabel(readiness.availability)}
                />
                {stock != null ? (
                  <AppText variant="caption" color={theme.colors.muted}>
                    {t('aywebs.stockLeft', { count: stock })}
                  </AppText>
                ) : null}
                <AppText variant="caption" color={theme.colors.muted}>
                  {local ? t('aywebs.priceServerNote') : t('aywebs.quoteServer')}
                </AppText>

                {readiness.ready ? null : (
                  <AppText variant="caption" color={theme.status.danger.fg}>
                    {blockedMessage(readiness.code)}
                  </AppText>
                )}
                {error ? (
                  <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{error}</AppText>
                ) : null}

                <View style={styles.row}>
                  <Button
                    label={t('aywebs.addToCart')}
                    onPress={confirm}
                    busy={busy}
                    disabled={!readiness.ready || !sessionId}
                  />
                  <Button label={t('common.cancel')} tone="quiet" onPress={onClose} disabled={busy} />
                </View>
                {busy ? (
                  <View style={styles.row}>
                    <ActivityIndicator />
                    <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.adding')}</AppText>
                  </View>
                ) : null}
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
