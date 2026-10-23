/**
 * ورقة الإضافة — «اختر ما تريد» فوق صفحة التاجر (نسخة 23/10/2026).
 *
 * الشكل اتّبع نمط الخدمات الوسيطة (Add to Buyee): صورة المنتوج وعنوانه، ثمنه،
 * ثم حقول قليلة تُفتح عند الضغط (المقاس، اللون، النوع، الحجم…)، الكمية، وزرّ
 * واحد كبير. ما فماش أسطر تقنية ولا شروح عن الخادم: المستعمل ما يهمّوش كيفاش
 * نقراو، يهمّه يلقى اللي يختار ويضيف.
 *
 * قواعد ثابتة:
 *   • **قراءة واحدة عند الإضافة**، موش عند كل تبديل لون: المستعمل يبدّل ما
 *     يحبّ، والورقة ما تطلبش من الخادم شي حتى يضغط «Add to Cart». هي التي
 *     تجيب الثمن والتوفّر منشورين في الصفحة، والإضافة تعيد الحكم على الخادم.
 *   • ما نكتبوش ثمن ما شفناهش: قيمة بلا ثمن منشور تبقى بلا ثمن، والقيمة
 *     المنشورة «غير متوفرة» ما تتخيّرش.
 *   • التأكيد مكتوب من **السطر اللي رجّعو الخادم** (نفس مبدأ 03/10).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AppText, Button, KeyValue } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { AppSheet } from '@/design/sheet/AppSheet';
import { useI18n } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { isApiError, userMessage } from '@/api/errors';
import {
  addAyWebsCartItem, fetchAyWebsVariants, resolveAyWebsProductWithCapture,
  type AyWebsAddBlockCode, type AyWebsCartItem, type AyWebsResolvedProduct,
  type AyWebsVariantGroup, type AyWebsVariantOption,
} from '@/api/aywebs';
import { newAyWebsRequestId } from '@/features/aywebs/requestId';
import { variantPageUrlFor } from '@/features/aywebs/variantPage';
import {
  defaultSelectionFromCapture, displayPriceForSelection, localAddReadiness, localVariantsFromCapture,
  pageAvailabilityFromCapture, selectionIsShown, splitMerchantPrice, stockForSelection, valueStatesFromCapture,
  type LocalValueStates,
} from '@/features/aywebs/localProduct';
import { choiceGroupKind, choiceGroupKey } from '@/features/aywebs/choiceGroup';
import { ChoiceField, type ChoiceOption } from '@/features/aywebs/ChoiceField';

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
  /** قراءة صفحة المقاس المختار (WebView مخفي) — تُستعمل مرّة واحدة عند الإضافة. */
  readVariant?: (url: string) => Promise<Record<string, unknown>>;
  /** ورقة من القراءة المحلية (بلا نداء للخادم عند الفتح). */
  local?: boolean;
  onClose: () => void;
  /** للسطر الجديد (يتستعمل في شاشة المتجر باش تحدّث الأثر). */
  onAdded?: (item: AyWebsCartItem) => void;
}

const MAX_QUANTITY = 99;

/**
 * La capture est-elle encore une preuve valable ? Le serveur refuse une capture
 * de plus de 10 minutes ; on garde une marge de 2 minutes.
 */
function captureIsFresh(capture: unknown, now = Date.now()): boolean {
  const at = Date.parse(String((capture as { capturedAt?: unknown } | null | undefined)?.capturedAt ?? ''));
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  return age >= -60_000 && age <= 8 * 60_000;
}

function moneyText(price: number | null | undefined, currency: string | null | undefined): string {
  if (!(typeof price === 'number' && price > 0)) return '';
  const iso = String(currency || '').trim();
  return iso ? `${price.toFixed(2)} ${iso}` : price.toFixed(2);
}

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
  /** الحقل المفتوح — واحد برك في كل وقت (الورقة تبقى قصيرة). */
  const [openGroup, setOpenGroup] = useState<string | null>(null);
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
   * كل فتح للورقة = نيّة إضافة جديدة: مفتاح جديد، كمية 1، واختيار = **اللي
   * تعرضو الصفحة**. بلا هذا، الورقة تفتح فارغة على منتوج معروض كامل.
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
    setOpenGroup(null);
    // القصد: إعادة الضبط عند **كل فتح** فقط — تبديل المجموعات وسط الورقة ما يمسحش اختيار المستعمل.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /** مجموعات/خيارات من الخادم — أفضل جهد، فقط كي البيانات المحلية ناقصة. */
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

  const captureRecord = useMemo(
    () => (capture && typeof capture === 'object' ? capture as Record<string, unknown> : null),
    [capture],
  );

  /** États/prix publiés POUR CHAQUE VALEUR — نفس القراءة اللي فتحت الورقة. */
  const valueStates = useMemo<LocalValueStates>(
    () => (local && captureRecord ? valueStatesFromCapture(captureRecord) : {}),
    [captureRecord, local],
  );
  const pageAvailability = useMemo(
    () => (local && captureRecord ? pageAvailabilityFromCapture(captureRecord) : 'UNKNOWN'),
    [captureRecord, local],
  );
  const shownSelection = useMemo(
    () => (local && captureRecord ? selectionIsShown(captureRecord, selection) : false),
    [captureRecord, local, selection],
  );
  const selectionComplete = useMemo(
    () => groups.every((group) => Boolean(selection[group.attribute.trim().toLowerCase()])),
    [groups, selection],
  );
  /** الثمن اللي تعرضو الصفحة لهذا الاختيار (نصّ كما كتبتو، موش حساب). */
  const shownPrice = useMemo(
    () => (local && captureRecord ? displayPriceForSelection(captureRecord, selection) : null),
    [captureRecord, local, selection],
  );
  const merchantPrice = useMemo(
    () => (shownPrice ? splitMerchantPrice(shownPrice.text) : { amount: '', note: '' }),
    [shownPrice],
  );
  const priceText = merchantPrice.amount
    || moneyText(product.price, product.currency)
    || '';
  /** Stock annoncé pour ce choix (« plus que 3 »), sinon `null` — nul n'invente. */
  const stock = useMemo(
    () => (local && captureRecord ? stockForSelection(captureRecord, selection) : null),
    [captureRecord, local, selection],
  );
  /** حالة التوفّر المعروضة: غير المعروفة ما تتكتبش (ما نكدّبوش على المستعمل). */
  const availabilityState = useMemo(() => {
    const candidate = local
      ? localAddReadiness({
        groups,
        variants: localVariantsFromCapture(captureRecord ?? {}),
        selection,
        pageInStockText: pageAvailability === 'AVAILABLE',
        pageAvailability,
        pageShowsSelection: shownSelection,
        valueStates,
      }).availability
      : product.availability.state;
    return candidate === 'AVAILABLE' || candidate === 'LOW_STOCK' || candidate === 'OUT_OF_STOCK' ? candidate : null;
  }, [captureRecord, groups, local, pageAvailability, product.availability.state, selection, shownSelection, valueStates]);

  /**
   * حقل واحد لكل مجموعة: القيم كما نشرتها الصفحة، ومع كل قيمة ثمنها وحالتها.
   * القيمة المنشورة «غير متوفرة» ما تتخيّرش (§30: بلا تبديل صامت).
   */
  const fields = useMemo(() => groups.map((group) => {
    const key = group.attribute.trim().toLowerCase();
    const groupName = group.attribute;
    const groupKey = choiceGroupKey(groupName);
    const label = groupKey ? t(groupKey) : groupName;
    const values: ChoiceOption[] = group.values.map((value) => {
      const published = valueStates[key]?.[value.trim().toLowerCase()];
      const availability = variantAvailability(groupName, value, selection, variantOptions);
      const state = published?.state === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : availability ?? published?.state;
      return {
        value,
        price: published?.price || undefined,
        priceFrom: published?.priceFrom === true,
        unavailable: state === 'OUT_OF_STOCK',
        available: state === 'AVAILABLE',
      };
    });
    return { key, groupName, label, kind: choiceGroupKind(groupName), values };
  }), [groups, selection, t, valueStates, variantOptions]);

  /** هل القيمة المختارة معلنة «غير متوفرة»؟ — عندها الزرّ معطّل، بسبب مكتوب. */
  const chosenUnavailable = useMemo(() => Object.entries(selection).some(([name, value]) => {
    const published = valueStates[name.trim().toLowerCase()]?.[String(value).trim().toLowerCase()];
    if (published?.state === 'OUT_OF_STOCK') return true;
    return variantAvailability(name, value, selection, variantOptions) === 'OUT_OF_STOCK';
  }), [selection, valueStates, variantOptions]);

  const blockedCode = useMemo<AyWebsAddBlockCode | ''>(() => {
    if (chosenUnavailable) return 'VARIANT_UNAVAILABLE';
    if (!selectionComplete) return 'VARIANT_REQUIRED';
    return '';
  }, [chosenUnavailable, selectionComplete]);

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

  /** Adresse de la page du choix (Amazon, ASIN différent de la page affichée). */
  const variantPageUrl = useCallback(
    () => variantPageUrlFor({ sourceUrl: product.sourceUrl, storeId: product.storeId, selection, options: variantOptions }),
    [product.sourceUrl, product.storeId, selection, variantOptions],
  );

  /**
   * «Add to Cart» = **القراءة الوحيدة**. المستعمل يبدّل اللون والمقاس كيف ما
   * يحبّ بلا ما نطلب من الخادم شي؛ الضغط هو اللي يقرا (من الكابتشر إذا كانت
   * تحمل ثمن وتوفّر هذا الاختيار، وإلا من صفحة الاختيار مرّة واحدة)، والخادم
   * يعاود يحسب ويسجّل السطر.
   */
  const confirm = useCallback(async () => {
    if (!sessionId || !requestId.current || busy) return;
    if (!selectionComplete || chosenUnavailable) return;
    setBusy(true);
    setError('');
    try {
      const target = variantPageUrl() ?? product.sourceUrl;
      const variant = groups.length ? selection : null;
      let productId = product.productId;
      let sourceUrl = target;
      let cartCapture: unknown = capture;
      let cartQuote = quoteToken || '';

      /* هل الكابتشر تغطّي هذا الاختيار؟ (معروض في الصفحة، ولا كل قيمة عندها
         ثمنها المنشور) — نفس قاعدة الخادم، باش ما نقراوش صفحة بلا لزوم. */
      const provenByCapture = !groups.length
        || shownSelection
        || Object.entries(selection).every(([name, value]) => {
          const state = valueStates[name.trim().toLowerCase()]?.[String(value).trim().toLowerCase()];
          return Boolean(state && state.price && !state.priceFrom);
        });

      if (local) {
        if (!cartCapture || !captureIsFresh(cartCapture) || !provenByCapture) {
          if (!readVariant) throw new Error('variant-reader-missing');
          cartCapture = await readVariant(target);
        }
        const resolved = await resolveAyWebsProductWithCapture(target, {
          sessionId,
          storeId: product.storeId || undefined,
          capture: cartCapture,
          refresh: true,
          variant,
        });
        productId = resolved.product.productId;
        cartQuote = resolved.quoteToken;
      } else if (!cartQuote) {
        /* Chemin serveur : une seule relecture de la page du choix, puis l'ajout. */
        const shot = readVariant ? await readVariant(target) : undefined;
        const resolved = await resolveAyWebsProductWithCapture(target, {
          sessionId, storeId: product.storeId || undefined, capture: shot, refresh: true, variant,
        });
        productId = resolved.product.productId;
        cartCapture = shot;
        cartQuote = resolved.quoteToken;
      }

      const outcome = await addAyWebsCartItem({
        productId,
        sourceUrl,
        storeId: product.storeId || undefined,
        variant,
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
  }, [busy, capture, chosenUnavailable, groups.length, locale, local, onAdded, product.productId, product.sourceUrl,
    product.storeId, quantity, quoteToken, readVariant, selection, selectionComplete, sessionId, shownSelection, t,
    valueStates, variantPageUrl]);

  const availabilityLabel = (state: string): string => {
    if (state === 'AVAILABLE') return t('aywebs.avail.AVAILABLE');
    if (state === 'LOW_STOCK') return t('aywebs.avail.LOW_STOCK');
    if (state === 'OUT_OF_STOCK') return t('aywebs.avail.OUT_OF_STOCK');
    return '';
  };

  const closeButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('sheet.close')}
      onPress={onClose}
      hitSlop={8}
      style={styles.close}
    >
      <Ionicons name="close" size={theme.iconSize.md} color={theme.colors.ink} />
    </Pressable>
  );

  const imageUri = added?.item.images[0] || product.images[0] || '';
  const title = added?.item.title || product.title;

  return (
    <AppSheet
      open={visible}
      onDismiss={onClose}
      header={(
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <AppText variant="lead" weight="bold" align="center" style={styles.headerTitle} numberOfLines={1}>
            {added ? t('aywebs.added') : t('aywebs.pickTitle')}
          </AppText>
          <View style={styles.headerSide}>{closeButton}</View>
        </View>
      )}
    >
      <View style={styles.productRow}>
        {imageUri ? (
          <AppImage
            uri={mediaUrl(imageUri)}
            style={[styles.thumb, { borderRadius: theme.radius.control }]}
            contentFit="cover"
            accessibilityLabel={title}
          />
        ) : (
          <View style={[styles.thumb, { borderRadius: theme.radius.control, borderColor: theme.colors.line, borderWidth: 1 }]} />
        )}
        <View style={styles.productText}>
          <AppText variant="body" weight="semibold" numberOfLines={3}>{title}</AppText>
          {added ? (
            <AppText variant="caption" color={theme.colors.muted}>
              {added.item.variantLabel || ''}
            </AppText>
          ) : priceText ? (
            <AppText variant="title" weight="bold">{priceText}</AppText>
          ) : null}
          {!added && merchantPrice.note ? (
            <AppText variant="caption" color={theme.colors.muted}>{merchantPrice.note}</AppText>
          ) : null}
          {!added && shownPrice?.priceFrom ? (
            <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.priceFromNote')}</AppText>
          ) : null}
        </View>
      </View>

      {added ? (
        <>
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
          <View style={styles.actions}>
            <Button
              label={t('aywebs.goToCart')}
              onPress={() => { onClose(); router.push('/aywebs/cart'); }}
            />
            <Button label={t('aywebs.continueShopping')} tone="quiet" onPress={onClose} />
          </View>
        </>
      ) : (
        <>
          {fields.map((field) => (
            <ChoiceField
              key={field.key}
              label={field.label}
              value={selection[field.key] ?? ''}
              open={openGroup === field.key}
              options={field.values}
              placeholder={t('aywebs.choose')}
              onToggle={() => setOpenGroup((current) => (current === field.key ? null : field.key))}
              onSelect={(value) => {
                setSelection((current) => ({ ...current, [field.key]: value }));
                setOpenGroup(null);
                setError('');
              }}
              testID={`aywebs-choice-${field.key}`}
            />
          ))}

          <View style={styles.quantityRow}>
            <AppText variant="body" weight="semibold">{t('aywebs.quantity')}</AppText>
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('aywebs.quantityLess')}
                disabled={quantity <= 1 || busy}
                onPress={() => setQuantity((value) => Math.max(1, value - 1))}
                style={styles.stepperButton}
                testID="aywebs-quantity-less"
              >
                <Ionicons name="remove" size={theme.iconSize.md} color={quantity <= 1 ? theme.colors.muted : theme.colors.ink} />
              </Pressable>
              <AppText variant="lead" weight="bold">{String(quantity)}</AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('aywebs.quantityMore')}
                disabled={quantity >= MAX_QUANTITY || busy}
                onPress={() => setQuantity((value) => Math.min(MAX_QUANTITY, value + 1))}
                style={styles.stepperButton}
                testID="aywebs-quantity-more"
              >
                <Ionicons name="add" size={theme.iconSize.md} color={quantity >= MAX_QUANTITY ? theme.colors.muted : theme.colors.ink} />
              </Pressable>
            </View>
          </View>

          {availabilityState || stock != null ? (
            <AppText
              variant="caption"
              color={availabilityState === 'OUT_OF_STOCK' ? theme.status.danger.fg : theme.colors.muted}
            >
              {availabilityState ? availabilityLabel(availabilityState) : ''}
              {availabilityState && stock != null ? ' · ' : ''}
              {stock != null ? t('aywebs.stockLeft', { count: stock }) : ''}
            </AppText>
          ) : null}
          {blockedCode ? (
            <AppText variant="caption" color={theme.status.danger.fg}>
              {blockedMessage(blockedCode)}
            </AppText>
          ) : null}
          {error ? (
            <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{error}</AppText>
          ) : null}

          <Button
            label={busy ? t('aywebs.adding') : t('aywebs.addToCart')}
            onPress={confirm}
            busy={busy}
            disabled={Boolean(blockedCode) || !sessionId}
            block
            testID="aywebs-sheet-add"
          />
        </>
      )}
    </AppSheet>
  );
}

/** Disponibilité d'une valeur dans la table des combinaisons du serveur (si elle existe). */
function variantAvailability(
  attribute: string,
  value: string,
  selection: Record<string, string>,
  options: AyWebsVariantOption[],
): string | null {
  if (!options.length) return null;
  const key = attribute.trim().toLowerCase();
  const wanted = Object.entries(selection)
    .filter(([name]) => name !== key)
    .reduce<Record<string, string>>((acc, [name, chosen]) => ({ ...acc, [name]: chosen }), {});
  const probe = { ...wanted, [key]: value };
  const candidate = Object.keys(probe).sort();
  const exact = options.find((option) => {
    const keys = Object.keys(option.attributes).sort();
    return keys.length === candidate.length
      && keys.every((name, index) => name === candidate[index]
        && String(option.attributes[name]).toLowerCase() === String(probe[name]).toLowerCase());
  });
  return exact ? exact.availability : null;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 },
  headerSide: { width: 44, alignItems: 'flex-end' },
  headerTitle: { flex: 1, textAlign: 'center' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  productRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 92, height: 112 },
  productText: { flex: 1, gap: 4 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
