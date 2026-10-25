/**
 * ورقة الإضافة — «اختر ما تريد» فوق صفحة التاجر (نسخة 23/10/2026، مراجعة السعر بالدينار).
 *
 * الشكل: صورة المنتوج وعنوانه، **ثمنه بالدينار محسوب في الخادم**، ثم حقول قليلة
 * تُفتح عند الضغط (المقاس، اللون، النوع، الحجم…)، الكمية، وزرّ واحد كبير.
 *
 * قواعد ثابتة:
 *   • **الثمن بالدينار يجي من الخادم**، من ثمن الصفحة أو من ثمن القيمة المنشورة
 *     تحت اللون/المقاس. التطبيق ما يحسبش ثمن، وما يخمّنش: قيمة ما نشرتش ثمنها
 *     تبقى بلا ثمن بالدينار، ونكتب «الثمن وقت الإضافة».
 *   • **قراءة واحدة عند الفتح** (كابتشر الصفحة اللي فتحت الورقة) تجيب: ثمن
 *     التركيبة المعروضة، وثمن كل قيمة، وحالة كل قيمة. تبديل اللون/المقاس ما
 *     يعاودش يقرا ولا يرجع للخادم.
 *   • **الضغط على Add** هو القراءة الوحيدة: إذا الكابتشر ما يغطّيش الاختيار،
 *     تتقرا صفحة الاختيار مرّة واحدة (إذا عندها عنوان)، والخادم هو اللي يحكم.
 *   • ما نكدبوش على المستعمل في التوفّر: قيمة ما نشرتش حالتها تبقى «غير معروفة»،
 *     والزرّ يقول شنوّة لازم يصير — موش «La demande n'a pas abouti».
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
import { addErrorMessage } from '@/features/aywebs/addError';
import {
  addAyWebsCartItem, fetchAyWebsVariants, resolveAyWebsProductWithCapture,
  type AyWebsAddBlockCode, type AyWebsCartItem, type AyWebsResolvedProduct,
  type AyWebsVariantGroup, type AyWebsVariantOption, type AyWebsVariantQuote,
} from '@/api/aywebs';
import { newAyWebsRequestId } from '@/features/aywebs/requestId';
import { variantPageUrlFor } from '@/features/aywebs/variantPage';
import {
  defaultSelectionFromCapture, displayPriceForSelection, localVariantsFromCapture, optionsFromVariants,
  splitMerchantPrice, valueStatesFromCapture,
  type LocalValueStates,
} from '@/features/aywebs/localProduct';
import { choiceGroupKind, choiceGroupKey } from '@/features/aywebs/choiceGroup';
import { ChoiceField, type ChoiceOption } from '@/features/aywebs/ChoiceField';
import { quantityLimit, selectionQuote, type AvailabilityState } from '@/features/aywebs/selectionQuote';
import { formatAmount, formatMoney } from '@/format/money';

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

/** Devise affichée pour le montant marchand (celle de la page, jamais supposée). */
const moneyText = (price: number | null | undefined, currency: string | null | undefined): string => {
  if (!(typeof price === 'number' && price > 0)) return '';
  const iso = String(currency || '').trim();
  return iso ? `${formatAmount(price)} ${iso}` : formatAmount(price);
};

/** Montant en dinars, tel que le serveur l'a calculé. */
const tndText = (value: number | null | undefined): string =>
  (typeof value === 'number' && Number.isFinite(value) && value > 0 ? `${formatMoney(value)}` : '');

/** Ce que la feuille sait du choix courant, à partir du devis serveur. */
interface PageQuote {
  selection: Record<string, string>;
  unitTnd: number | null;
  availability: AvailabilityState;
  stock: number | null;
  sourcePrice: number | null;
  sourceCurrency: string;
  quotes: AyWebsVariantQuote[];
  quoteToken: string;
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
  const [pageQuote, setPageQuote] = useState<PageQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  /** الحقل المفتوح — واحد برك في كل وقت (الورقة تبقى قصيرة). */
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const requestId = useRef('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const groups = useMemo<AyWebsVariantGroup[]>(
    () => (product.variantGroups.length ? product.variantGroups : (fetchedGroups ?? [])),
    [fetchedGroups, product.variantGroups],
  );
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const variantOptions = useMemo<AyWebsVariantOption[]>(() => {
    const given = options?.length ? options : product.variantDetails;
    return given.length ? given : fetched;
  }, [fetched, options, product.variantDetails]);

  const captureRecord = useMemo(
    () => (capture && typeof capture === 'object' ? capture as Record<string, unknown> : null),
    [capture],
  );
  /** États/prix publiés POUR CHAQUE VALEUR — نفس القراءة اللي فتحت الورقة. */
  const valueStates = useMemo<LocalValueStates>(
    () => (local && captureRecord ? valueStatesFromCapture(captureRecord) : {}),
    [captureRecord, local],
  );

  /**
   * النداء الوحيد اللي يجي مع فتح الورقة: كابتشر الصفحة + الاختيار المعروض.
   * يرجّع ثمن التركيبة المعروضة **بالدينار**، وثمن كل قيمة، وحالة كل قيمة.
   * ما يعاودش يتسمّى عند تبديل اللون: النتائج تتخزّن هنا.
   */
  const loadQuote = useCallback(async (captureToUse: unknown, picked: Record<string, string>) => {
    if (!sessionId || !captureToUse) return;
    setQuoting(true);
    try {
      const resolved = await resolveAyWebsProductWithCapture(product.sourceUrl, {
        sessionId,
        storeId: product.storeId || undefined,
        capture: captureToUse,
        refresh: false,
        variant: Object.keys(picked).length ? picked : null,
      });
      if (!alive.current) return;
      setPageQuote({
        selection: picked,
        unitTnd: resolved.product.ayroviPricing?.totalTnd ?? null,
        availability: stateOf(resolved.product.availability.state),
        stock: resolved.product.availability.quantityHint ?? null,
        sourcePrice: resolved.product.price,
        sourceCurrency: resolved.product.currency,
        quotes: resolved.product.variantQuotes,
        quoteToken: resolved.quoteToken,
      });
    } catch {
      /* أفضل جهد: بلا خادم، الورقة تعرض ثمن الصفحة وتقول إن الدينار يجي وقت الإضافة. */
      if (alive.current) setPageQuote(null);
    } finally {
      if (alive.current) setQuoting(false);
    }
  }, [product.sourceUrl, product.storeId, sessionId]);

  /**
   * كل فتح للورقة = نيّة إضافة جديدة: مفتاح جديد، كمية 1، واختيار = **اللي
   * تعرضو الصفحة**.بلا هذا، الورقة تفتح فارغة على منتوج معروض كامل.
   */
  useEffect(() => {
    if (!visible) return;
    alive.current = true;
    requestId.current = newAyWebsRequestId();
    const initial = local && capture ? defaultSelectionFromCapture(capture as Record<string, unknown>, groupsRef.current) : {};
    setSelection(initial);
    setQuantity(1);
    setError('');
    setAdded(null);
    setBusy(false);
    setFetched([]);
    setFetchedGroups(null);
    setPageQuote(null);
    setOpenGroup(null);
    if (local && capture) void loadQuote(capture, initial);
    // القصد: إعادة الضبط عند **كل فتح** فقط.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /** مجموعات/خيارات من الخادم — أفضل جهد، فقط كي البيانات المحلية ناقصة. */
  useEffect(() => {
    if (!visible || !sessionId || local) return;
    const needsGroups = product.variantGroups.length === 0;
    const needsOptions = !(options?.length || product.variantDetails.length);
    if (!needsGroups && !needsOptions) return;
    let on = true;
    fetchAyWebsVariants(
      { productId: product.productId, url: product.sourceUrl, storeId: product.storeId || undefined },
      { sessionId },
    )
      .then((payload) => {
        if (!on) return;
        setFetched(payload.variants);
        setFetchedGroups(payload.variantGroups);
      })
      .catch(() => { /* أفضل جهد: الفشل ما يمنعش الإضافة */ });
    return () => { on = false; };
  }, [local, options, product.productId, product.sourceUrl, product.storeId, product.variantDetails.length, product.variantGroups.length, sessionId, visible]);

  const selectionComplete = useMemo(
    () => groups.every((group) => Boolean(selection[group.attribute.trim().toLowerCase()])),
    [groups, selection],
  );

  /** الثمن والتوفّر لهذا الاختيار — كيما نشروهم الخادم، بلا حساب هنا. */
  const quote = useMemo(() => selectionQuote({
    page: pageQuote
      ? {
        selection: pageQuote.selection,
        unitTnd: pageQuote.unitTnd,
        availability: pageQuote.availability,
        stock: pageQuote.stock,
        sourcePrice: pageQuote.sourcePrice,
        sourceCurrency: pageQuote.sourceCurrency,
      }
      : null,
    quotes: pageQuote?.quotes ?? [],
    selection,
  }), [pageQuote, selection]);

  /**
   * سقف الكمية: اللي تنشرو الصفحة هو السقف — منتوج فيه 5 ما نخلّيوش 20.
   * كي المخزون ما معروفش، ما نخترعوش سقف؛ و«99» برك حدّ الواجهة.
   */
  const maxQuantity = useMemo(() => quantityLimit({ stock: quote.stock }), [quote.stock]);

  /* كي يتبدّل الاختيار وينقص المخزون، الكمية تنزل للسقف — بلا رسالة خطأ. */
  useEffect(() => {
    setQuantity((value) => (value > maxQuantity ? maxQuantity : value));
  }, [maxQuantity]);

  /** ثمن القيمة المنشور على الصفحة (نصّها كما كتبتو) — كي ما فماش دينار. */
  const merchantShown = useMemo(
    () => (local && captureRecord ? displayPriceForSelection(captureRecord, selection) : null),
    [captureRecord, local, selection],
  );
  const merchantPrice = useMemo(
    () => (merchantShown ? splitMerchantPrice(merchantShown.text) : { amount: '', note: '' }),
    [merchantShown],
  );
  /**
   * سطر المتجر: المبلغ المنشور على الصفحة (دولار/أورو…) — دليل على الثمن، موش
   * الثمن اللي يخلّصو المستعمل. « à partir de » تتكتب كيف ما هي.
   */
  const merchantLine = useMemo(() => {
    const fromQuote = moneyText(quote.sourcePrice, quote.sourceCurrency);
    if (fromQuote) return merchantShown?.priceFrom || quote.priceFrom
      ? `${t('aywebs.priceFrom')} ${fromQuote}`
      : fromQuote;
    if (merchantPrice.amount) {
      return merchantShown?.priceFrom
        ? `${t('aywebs.priceFrom')} ${merchantPrice.amount}`
        : merchantPrice.amount;
    }
    return moneyText(product.price, product.currency);
  }, [merchantPrice.amount, merchantShown?.priceFrom, product.currency, product.price, quote.priceFrom, quote.sourceCurrency, quote.sourcePrice, t]);

  const availabilityLabel = useCallback((state: AvailabilityState): string => {
    if (state === 'AVAILABLE') return t('aywebs.avail.AVAILABLE');
    if (state === 'LOW_STOCK') return t('aywebs.avail.LOW_STOCK');
    if (state === 'OUT_OF_STOCK') return t('aywebs.avail.OUT_OF_STOCK');
    return t('aywebs.availUnknownTitle');
  }, [t]);

  /**
   * حقل واحد لكل مجموعة: القيم كما نشرتها الصفحة، ومع كل قيمة ثمنها بالدينار
   * (من الخادم) وحالتها. القيمة المنشورة «غير متوفرة» ما تتخيّرش (§30).
   */
  const fields = useMemo(() => groups.map((group) => {
    const key = group.attribute.trim().toLowerCase();
    const groupName = group.attribute;
    const groupKey = choiceGroupKey(groupName);
    const label = groupKey ? t(groupKey) : groupName;
    const values: ChoiceOption[] = group.values.map((value) => {
      const published = valueStates[key]?.[value.trim().toLowerCase()];
      const serverQuote = pageQuote?.quotes.find((entry) => entry.group.trim().toLowerCase() === key
        && entry.value.trim().toLowerCase() === value.trim().toLowerCase());
      const availability = variantAvailability(groupName, value, selection, variantOptions);
      const unavailable = published?.state === 'OUT_OF_STOCK'
        || serverQuote?.availability === 'OUT_OF_STOCK'
        || availability === 'OUT_OF_STOCK';
      return {
        value,
        price: serverQuote?.totalTnd != null ? tndText(serverQuote.totalTnd) : (published?.price || undefined),
        priceFrom: published?.priceFrom === true || serverQuote?.priceFrom === true,
        unavailable,
        available: published?.state === 'AVAILABLE' || serverQuote?.availability === 'AVAILABLE' || availability === 'AVAILABLE',
      };
    });
    return { key, groupName, label, kind: choiceGroupKind(groupName), values };
  }), [groups, pageQuote, selection, t, valueStates, variantOptions]);

  /** هل القيمة المختارة معلنة «غير متوفرة»؟ — عندها الزرّ معطّل، بسبب مكتوب. */
  const chosenUnavailable = useMemo(() => {
    if (quote.availability === 'OUT_OF_STOCK') return true;
    return Object.entries(selection).some(([name, value]) => {
      const published = valueStates[name.trim().toLowerCase()]?.[String(value).trim().toLowerCase()];
      if (published?.state === 'OUT_OF_STOCK') return true;
      return variantAvailability(name, value, selection, variantOptions) === 'OUT_OF_STOCK';
    });
  }, [quote.availability, selection, valueStates, variantOptions]);

  const blockedCode = useMemo<AyWebsAddBlockCode | ''>(() => {
    if (chosenUnavailable) return 'VARIANT_UNAVAILABLE';
    if (!selectionComplete) return 'VARIANT_REQUIRED';
    return '';
  }, [chosenUnavailable, selectionComplete]);

  const blockedMessage = useCallback((code: AyWebsAddBlockCode): string => {
    switch (code) {
      case 'VARIANT_REQUIRED': return t('aywebs.block.VARIANT_REQUIRED');
      case 'VARIANT_UNKNOWN': return t('aywebs.block.VARIANT_UNKNOWN');
      case 'VARIANT_UNAVAILABLE': return t('aywebs.block.VARIANT_UNAVAILABLE');
      case 'OUT_OF_STOCK': return t('aywebs.block.OUT_OF_STOCK');
      case 'STOCK_UNKNOWN': return t('aywebs.block.STOCK_UNKNOWN');
      case 'PRICE_UNAVAILABLE': return t('aywebs.block.PRICE_UNAVAILABLE');
      default: return '';
    }
  }, [t]);

  /**
   * «Add to Cart» = **القراءة الوحيدة**. المستعمل يبدّل اللون والمقاس كيف ما
   * يحبّ بلا ما نطلب من الخادم شي؛ الضغط هو اللي يحلّ الاختيار عند الخادم من
   * نفس الكابتشر، وإذا الكابتشر ما يغطّيش الاختيار تتقرا صفحة الاختيار مرّة
   * واحدة (كي عندها عنوان). والخادم هو اللي يسجّل السطر ويثبّت الثمن.
   */
  const confirm = useCallback(async () => {
    if (!sessionId || !requestId.current || busy) return;
    if (!selectionComplete || chosenUnavailable) return;
    setBusy(true);
    setError('');
    try {
      const variant = groups.length ? selection : null;
      /* Le premier jugement porte sur la page que la capture décrit — jamais sur
         une autre URL : sinon la preuve et l'adresse ne parlent pas du même
         article. Les pages des autres valeurs sont lues ensuite, une par une. */
      let target = product.sourceUrl;
      let captureToUse: unknown = capture;

      /* الورقة اللي تجي من قراءة الخادم (بلا كابتشر) وعندها فاتورة موقّعة على
         التركيبة كاملة: ما نعاودوش نقراو التاجر — الإضافة تستعمل الفاتورة. */
      if (!local && quoteToken && !groups.length) {
        const fast = await addAyWebsCartItem({
          productId: product.productId,
          sourceUrl: product.sourceUrl,
          storeId: product.storeId || undefined,
          variant,
          quantity,
          quoteToken,
          requestId: requestId.current,
        }, { sessionId });
        if (!alive.current) return;
        setAdded({ item: fast.item, linked: fast.ayrovi?.linked === true, reason: fast.ayrovi?.reason || '' });
        onAdded?.(fast.item);
        return;
      }

      /* 1. الحكم الأوّل: الكابتشر الحالية + هذا الاختيار (بلا قراءة تاجر). */
      let resolved = await resolveAyWebsProductWithCapture(target, {
        sessionId,
        storeId: product.storeId || undefined,
        capture: captureToUse,
        refresh: false,
        variant,
      });

      /* 2. الخادم ما قدرش يثبّت التوفّر لهذا الاختيار ⇒ نقراو صفحات الاختيار،
         وحدة بعد الأخرى (زوز كحدّ أقصى)، وكل مرّة الخادم يعاود يحكم.
         علاش: على Amazon، ASIN اللون هو «هذا اللون بالمقاس المعروض»، وASIN
         المقاس هو «هذا المقاس باللون المعروض». تبديل اللون برك ⇒ قراية وحدة.
         تبديل اللون والمقاس ⇒ قراية اللون، ومن صفحتها عنوان المقاس. */
      let reads = 0;
      let seenUrl = target;
      while (reads < 2 && local && readVariant
        && (resolved.product.availability.state === 'UNKNOWN' || resolved.product.ayroviPricing?.totalTnd == null)) {
        const optionsNow = optionsFromVariants(localVariantsFromCapture(
          (captureToUse && typeof captureToUse === 'object' ? captureToUse : {}) as Record<string, unknown>,
        ));
        const nextUrl = variantPageUrlFor({
          sourceUrl: seenUrl, storeId: product.storeId, selection, options: optionsNow,
        });
        if (!nextUrl || nextUrl === seenUrl || reads >= 2) break;
        reads += 1;
        try {
          const fresh = await readVariant(nextUrl);
          if (!fresh) break;
          captureToUse = fresh;
          target = nextUrl;
          seenUrl = nextUrl;
          resolved = await resolveAyWebsProductWithCapture(target, {
            sessionId,
            storeId: product.storeId || undefined,
            capture: fresh,
            refresh: false,
            variant,
          });
        } catch {
          /* القراءة فشلت: نكمّل بالحكم الأخير — والخادم يقول كلمتو. */
          break;
        }
      }

      /* 3. ما نطلبوش من الخادم إضافة يعرف أنّه باش يرفضها: السبب يتكتب للمستعمل. */
      if (resolved.product.availability.state === 'UNKNOWN') {
        setError(t('aywebs.selectionUnverified'));
        return;
      }

      const outcome = await addAyWebsCartItem({
        productId: resolved.product.productId || product.productId,
        sourceUrl: target,
        storeId: product.storeId || undefined,
        variant,
        quantity,
        capture: captureToUse,
        quoteToken: resolved.quoteToken,
        requestId: requestId.current,
      }, { sessionId });
      if (!alive.current) return;
      setAdded({
        item: outcome.item,
        linked: outcome.ayrovi?.linked === true,
        reason: outcome.ayrovi?.reason || '',
      });
      onAdded?.(outcome.item);
    } catch (caught) {
      if (!alive.current) return;
      setError(addErrorMessage(caught, locale, t));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, capture, chosenUnavailable, groups.length, local, locale, onAdded, product.productId,
    product.sourceUrl, product.storeId, quantity, quoteToken, readVariant, selection, selectionComplete, sessionId, t]);

  const sourceLine = tndText(quote.unitTnd);
  const totalLine = quote.unitTnd != null ? tndText(quote.unitTnd * quantity) : '';
  const title = added?.item.title || product.title;
  const imageUri = added?.item.images[0] || product.images[0] || '';

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
          ) : (
            <>
              {/* الثمن اللي يهمّ المستعمل: بالدينار، محسوب في الخادم. */}
              {/* الرقم الكبير بالدينار برك. المبلغ بالدولار/الأورو يمشي سطر صغير
                  تحت كدليل على ثمن المتجر — ماعادش يتقرا كثمن نهائي (23/10). */}
              {sourceLine ? (
                <AppText variant="title" weight="bold">{sourceLine}</AppText>
              ) : quoting ? (
                <AppText variant="title" weight="bold" color={theme.colors.muted}>
                  {t('aywebs.pricePending')}
                </AppText>
              ) : (
                <AppText variant="title" weight="bold" color={theme.colors.muted}>
                  {t('aywebs.priceAtAdd')}
                </AppText>
              )}
              {merchantLine ? (
                <AppText variant="caption" color={theme.colors.muted}>
                  {t('aywebs.merchantPriceLine', { price: merchantLine })}
                </AppText>
              ) : null}
              {!sourceLine && !merchantLine && merchantPrice.note ? (
                <AppText variant="caption" color={theme.colors.muted}>{merchantPrice.note}</AppText>
              ) : null}
            </>
          )}
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
            <KeyValue label={t('aywebs.totalTnd')} value={tndText(added.item.lineTotalTnd)} />
          ) : null}
          <AppText variant="caption" color={theme.colors.muted}>
            {added.linked ? t('aywebs.addedLinked') : t('aywebs.addedUnlinked')}
          </AppText>
          <View style={styles.actions}>
            <Button
              label={t('aywebs.goToCart')}
              /* Un seul panier visible pour le client : le panier principal. */
              onPress={() => { onClose(); router.push('/cart'); }}
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
                disabled={quantity >= maxQuantity || busy}
                onPress={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                style={styles.stepperButton}
                testID="aywebs-quantity-more"
              >
                <Ionicons name="add" size={theme.iconSize.md} color={quantity >= maxQuantity ? theme.colors.muted : theme.colors.ink} />
              </Pressable>
            </View>
          </View>

          {quote.unitTnd != null && quantity > 1 ? (
            <View style={styles.totalRow}>
              <AppText variant="body" weight="semibold">{t('aywebs.estimatedTotal')}</AppText>
              <AppText variant="body" weight="bold">{totalLine}</AppText>
            </View>
          ) : null}

          <AppText
            variant="caption"
            color={quote.availability === 'OUT_OF_STOCK' ? theme.status.danger.fg : theme.colors.muted}
          >
            {quote.availability === 'UNKNOWN'
              ? t('aywebs.availUnknown')
              : `${availabilityLabel(quote.availability)}${quote.stock != null ? ` · ${t('aywebs.stockLeft', { count: quote.stock })}` : ''}`}
          </AppText>

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

const stateOf = (value: string | undefined): AvailabilityState => {
  if (value === 'AVAILABLE' || value === 'LOW_STOCK' || value === 'OUT_OF_STOCK') return value;
  return 'UNKNOWN';
};

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
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
