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
 *   • القراءة عند الفتح تجيب الكابتشر وثمن التركيبة المعروضة وثمن القيم المنشورة.
 *     إذا تركيبة اللون/المقاس المختارة ما عندهاش تسعيرة ثابتة، نطلب تسعيرها
 *     من الخادم انطلاقاً من نفس الكابتشر؛ والردود القديمة ما تبدّلش اختيار أحدث.
 *   • **الضغط على Add** يثبت الاختيار والتوفّر نهائياً: إذا الكابتشر ما تغطيش
 *     الاختيار، تتقرا صفحة الاختيار مرّة واحدة (إذا عندها عنوان)، والخادم يحكم.
 *   • ما نكدبوش على المستعمل في التوفّر: قيمة ما نشرتش حالتها تبقى «غير معروفة»،
 *     والزرّ يقول شنوّة لازم يصير — موش «La demande n'a pas abouti».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AppText, Button, KeyValue } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { COMMERCE } from '@/design/tokens.mobile';
import { rowDirectionFor } from '@/design/layoutLogic';
import { AppImage } from '@/design/appImage';
import { AppSheet } from '@/design/sheet/AppSheet';
import { useI18n } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { addErrorMessage } from '@/features/aywebs/addError';
import {
  addAyWebsCartItem, fetchAyWebsVariants, resolveAyWebsProductWithCapture,
  type AyWebsAddBlockCode, type AyWebsCart, type AyWebsCartItem, type AyWebsResolvedProduct,
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
import { VariantOptionChips } from '@/features/aywebs/VariantOptionChips';
import { imageForSelectedColor } from '@/features/aywebs/variantImage';
import { quantityLimit, selectionQuote, type AvailabilityState } from '@/features/aywebs/selectionQuote';
import { lacksServerQuote, preferServerQuote, quoteReadPlan } from '@/features/aywebs/priceFallback';
import { ayWebsSameAttribute as sameAttribute } from '@/features/aywebs/attributeKeys';
import { alignSelection, mergeVariantGroups, missingAttributes } from '@/features/aywebs/groupMerge';
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
  /** السطر والسلّة المحدّثة من الخادم لمزامنة العداد والأثر البصري في الشاشة الأم. */
  onAdded?: (item: AyWebsCartItem, cart: AyWebsCart) => void;
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

/** Stable identity for one exact selection; used to discard stale quote replies. */
function selectionKeyOf(selection: Record<string, string>): string {
  return Object.entries(selection)
    .filter(([, value]) => String(value ?? '').trim())
    .map(([key, value]) => [key.trim().toLowerCase(), String(value).trim().toLowerCase()] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

/** Ce que la feuille sait du choix courant, à partir du devis serveur. */
interface PageQuote {
  selection: Record<string, string>;
  unitTnd: number | null;
  availability: AvailabilityState;
  stock: number | null;
  sourcePrice: number | null;
  sourceCurrency: string;
  quotes: AyWebsVariantQuote[];
  /** Combinaisons publiées par la LECTURE SERVEUR (`variant_details`) — même
      source que les cartes du web ; `total_tnd` محسوب في الخادم. */
  details: AyWebsVariantOption[];
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
  /** رموز تشخيص قصيرة (رفض الكابتشر، رفض الثمن) — تظهر كان كي فمّة رفض. */
  const [diagnostic, setDiagnostic] = useState('');
  const [added, setAdded] = useState<{ item: AyWebsCartItem; linked: boolean; reason: string } | null>(null);
  const [fetched, setFetched] = useState<AyWebsVariantOption[]>([]);
  const [fetchedGroups, setFetchedGroups] = useState<AyWebsVariantGroup[] | null>(null);
  /** Groupes publiés par le SERVEUR (lecture de la page) — noms de référence. */
  const [serverGroups, setServerGroups] = useState<AyWebsVariantGroup[]>([]);
  const [pageQuote, setPageQuote] = useState<PageQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  /** الحقل المفتوح — واحد برك في كل وقت (الورقة تبقى قصيرة). */
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const requestId = useRef('');
  /** Exact-option quote request; old replies must not overwrite a newer choice. */
  const selectionQuoteRequest = useRef(0);
  const lastSelectionQuoteKey = useRef('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /* Les choix affichés = union des deux lectures, sous le NOM DU SERVEUR : c'est
     lui qui juge l'ajout, et une sélection partielle (« taille » seule alors que
     la page publie aussi la couleur) était refusée (26/10/2026). */
  const groups = useMemo<AyWebsVariantGroup[]>(() => {
    const local = product.variantGroups.length ? product.variantGroups : (fetchedGroups ?? []);
    return mergeVariantGroups(local, serverGroups);
  }, [fetchedGroups, product.variantGroups, serverGroups]);
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
   * قراءة الفتح: كابتشر الصفحة + الاختيار المعروض؛ ترجع ثمن التركيبة بالدينار
   * وثمن القيم وحالتها. إذا تركيبة مختارة لاحقاً ما عندهاش دفي ثابت، effect
   * منفصل يطلب دفيها من الخادم ويرفض الردود القديمة.
   */
  const loadQuote = useCallback(async (captureToUse: unknown, picked: Record<string, string>) => {
    if (!sessionId || !captureToUse) return;
    setQuoting(true);
    try {
      /* Devis en dinars : on suit le PLAN (`quoteReadPlan`) — capture + variante,
         puis capture seule, puis la requête EXACTE du web. On s'arrête dès qu'un
         devis existe. Avant, une seule relecture forcée AVEC la variante était
         tentée : sur Zalando elle ne rendait aucun devis, et l'application
         affichait « Prix en dinars calculé à l'ajout. » là où le web écrivait
         « ≈ 411.69 DT » pour la même fiche (26/10/2026). */
      const plan = quoteReadPlan({
        hasCapture: Boolean(captureToUse),
        hasSelection: Object.keys(picked).length > 0,
      });
      let productForQuote: AyWebsResolvedProduct | null = null;
      let pageSelection: Record<string, string> = {};
      let quoteTokenForQuote = '';
      const diagnostics: string[] = [];
      for (const attempt of plan) {
        try {
          const read = await resolveAyWebsProductWithCapture(product.sourceUrl, {
            sessionId,
            storeId: product.storeId || undefined,
            ...(attempt.capture ? { capture: captureToUse } : {}),
            ...(attempt.withVariant && Object.keys(picked).length ? { variant: picked } : {}),
            refresh: attempt.refresh,
          });
          if (!alive.current) return;
          diagnostics.push(
            read.capture?.rejection ? `capture:${read.capture.rejection}` : '',
            read.priceRejection ? `price:${read.priceRejection}` : '',
          );
          /* Le premier résultat avec un devis gagne ; sinon on garde le plus
             informatif (celui qui a un prix marchand) pour l'affichage. */
          /* Fusionner CHAQUE résultat, même quand aucun devis de page n'existe :
             le serveur peut apporter `variant_details` (combinaison exacte), ce
             que l'application utilisera avant d'abandonner. */
          productForQuote = productForQuote ? preferServerQuote(productForQuote, read.product) : read.product;
          /* Une capture décrit la combinaison affichée (et un resolve avec
             variante décrit explicitement celle demandée). La requête du web
             sans capture/variante décrit juste le produit — son prix de page
             ne doit PAS être attribué à un autre choix. `variant_details`
             pourra tout de même fournir le prix exact de la combinaison. */
          pageSelection = attempt.capture || attempt.withVariant ? { ...picked } : {};
          if (!lacksServerQuote(read.product)) {
            quoteTokenForQuote = read.quoteToken;
            break;
          }
        } catch (error) {
          /* Un refus n'arrête pas le plan : l'essai suivant est justement la
             lecture que le web reçoit. Garder le code métier (pas seulement
             «rejected») pour que le diagnostic téléphone dise la vraie cause. */
          const code = error && typeof error === 'object' && 'code' in error
            ? String((error as { code?: unknown }).code || 'failed')
            : 'failed';
          diagnostics.push(`${attempt.capture ? 'capture' : 'server'}:${code}`);
        }
      }
      if (!productForQuote) {
        diagnostics.push('quote:unavailable');
        setDiagnostic(diagnostics.filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(' · '));
        setPageQuote(null);
        return;
      }
      const pickedQuote = selectionQuote({
        page: productForQuote.ayroviPricing?.totalTnd != null
          ? {
            selection: pageSelection,
            unitTnd: productForQuote.ayroviPricing.totalTnd,
            availability: stateOf(productForQuote.availability.state),
            stock: productForQuote.availability.quantityHint ?? null,
            sourcePrice: productForQuote.price,
            sourceCurrency: productForQuote.currency,
          }
          : null,
        quotes: productForQuote.variantQuotes,
        combinations: productForQuote.variantDetails.map((option) => ({
          attributes: option.attributes,
          totalTnd: option.totalTnd,
          quotedPrice: option.quotedPrice,
          quotedCurrency: option.quotedCurrency,
          availability: option.availability,
        })),
        selection: picked,
      });
      if (pickedQuote.unitTnd == null) diagnostics.push('quote:unavailable');
      setDiagnostic(diagnostics.filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(' · '));
      setServerGroups(productForQuote.variantGroups || []);
      setPageQuote({
        selection: pageSelection,
        unitTnd: productForQuote.ayroviPricing?.totalTnd ?? null,
        availability: stateOf(productForQuote.availability.state),
        stock: productForQuote.availability.quantityHint ?? null,
        sourcePrice: productForQuote.price,
        sourceCurrency: productForQuote.currency,
        quotes: productForQuote.variantQuotes,
        details: productForQuote.variantDetails,
        quoteToken: quoteTokenForQuote,
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
    setDiagnostic('');
    setAdded(null);
    setBusy(false);
    setFetched([]);
    setFetchedGroups(null);
    setServerGroups([]);
    setPageQuote(null);
    setQuoting(false);
    lastSelectionQuoteKey.current = '';
    selectionQuoteRequest.current += 1;
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

  /* Quand les groupes changent de nom (serveur), la sélection suit : sinon la
     feuille afficherait « 36 » et enverrait une clé que le serveur ignore. */
  useEffect(() => {
    setSelection((current) => {
      const aligned = alignSelection(groups, current);
      const same = Object.keys(aligned).length === Object.keys(current).length
        && Object.entries(aligned).every(([key, value]) => current[key] === value);
      return same ? current : aligned;
    });
  }, [groups]);

  const selectionComplete = useMemo(
    () => groups.every((group) => Boolean(selection[group.attribute.trim().toLowerCase()])),
    [groups, selection],
  );
  /** Ce qui manque, NOMMÉ (le serveur refuse un ajout sans choix explicite). */
  const missing = useMemo(() => missingAttributes(groups, selection), [groups, selection]);

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
    /* la table des combinaisons du serveur — celle que le web affiche */
    combinations: (pageQuote?.details?.length ? pageQuote.details : variantOptions).map((option) => ({
      attributes: option.attributes,
      totalTnd: option.totalTnd,
      quotedPrice: option.quotedPrice,
      quotedCurrency: option.quotedCurrency,
      availability: option.availability,
    })),
    selection,
  }), [pageQuote, selection, variantOptions]);

  /**
   * Changing a color/size/type can select a different merchant SKU and price.
   * Per-value quotes cannot prove every cross-product combination, so when the
   * current evidence has no TND quote, ask the server to price THIS exact choice
   * from the already captured page. No client-side currency/price calculation.
   */
  useEffect(() => {
    const key = selectionKeyOf(selection);
    if (!visible || !local || !capture || !pageQuote || !sessionId || !groups.length) return;
    if (!selectionComplete || !key) {
      setQuoting(false);
      return;
    }
    if (quote.unitTnd != null) {
      lastSelectionQuoteKey.current = '';
      setQuoting(false);
      return;
    }
    if (lastSelectionQuoteKey.current === key) return;
    lastSelectionQuoteKey.current = key;
    const requestNumber = ++selectionQuoteRequest.current;
    const picked = { ...selection };
    setQuoting(true);
    const timer = setTimeout(() => {
      void resolveAyWebsProductWithCapture(product.sourceUrl, {
        sessionId,
        storeId: product.storeId || undefined,
        capture,
        variant: picked,
        refresh: false,
      }).then((read) => {
        if (!alive.current || selectionQuoteRequest.current !== requestNumber) return;
        const totalTnd = read.product.ayroviPricing?.totalTnd ?? null;
        if (totalTnd != null && Number.isFinite(totalTnd) && totalTnd > 0) {
          setPageQuote({
            selection: picked,
            unitTnd: totalTnd,
            availability: stateOf(read.product.availability.state),
            stock: read.product.availability.quantityHint ?? null,
            sourcePrice: read.product.price,
            sourceCurrency: read.product.currency,
            quotes: read.product.variantQuotes,
            details: read.product.variantDetails,
            quoteToken: read.quoteToken,
          });
          setDiagnostic('');
        } else {
          setDiagnostic(read.priceRejection ? `price:${read.priceRejection}` : 'quote:selection_unavailable');
        }
      }).catch((error: unknown) => {
        if (!alive.current || selectionQuoteRequest.current !== requestNumber) return;
        const code = error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code || 'failed')
          : 'failed';
        setDiagnostic(`quote:${code}`);
      }).finally(() => {
        if (alive.current && selectionQuoteRequest.current === requestNumber) setQuoting(false);
      });
    }, 100);
    return () => {
      clearTimeout(timer);
      if (selectionQuoteRequest.current === requestNumber) selectionQuoteRequest.current += 1;
    };
  }, [capture, groups.length, local, pageQuote, product.sourceUrl, product.storeId, quote.unitTnd,
    selection, selectionComplete, sessionId, visible]);

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
      /* Le groupe serveur peut porter l'autre nom de la même dimension
         (« size » vs « Taille ») : on compare la DIMENSION, pas la chaîne. */
      const serverQuote = pageQuote?.quotes.find((entry) => sameAttribute(entry.group, groupName)
        && entry.value.trim().toLowerCase() === value.trim().toLowerCase());
      const optionImage = variantOptions.find((option) => Object.entries(option.attributes).some(([attribute, optionValue]) =>
        sameAttribute(attribute, groupName) && optionValue.trim().toLowerCase() === value.trim().toLowerCase()))?.image;
      const availability = variantAvailability(groupName, value, selection, variantOptions);
      const unavailable = published?.state === 'OUT_OF_STOCK'
        || serverQuote?.availability === 'OUT_OF_STOCK'
        || availability === 'OUT_OF_STOCK';
      return {
        value,
        image: optionImage || undefined,
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
   * «Add to Cart» = التحقق النهائي. تسعير تركيبة بلا دفي موثوق قد يصير قبلها
   * من نفس الكابتشر؛ الضغط يثبت الاختيار والتوفّر عند الخادم، وإذا الكابتشر ما
   * تغطيش الاختيار تتقرا صفحة الاختيار مرّة واحدة (كي عندها عنوان). الخادم
   * يسجّل السطر ويثبت الثمن النهائي.
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
        onAdded?.(fast.item, fast.cart);
        return;
      }

      /* 1. الحكم الأوّل: الكابتشر الحالية + هذا الاختيار (بلا قراءة تاجر).
         إذا الكابتشر ترفضت أو النداء فشل، ما نوقفوش هنا: نكمّلو بقراية
         الخادم (كيما الويب) — وهذا هو الفرق اللي كان يخلّي لون يخدم ولون لا. */
      let resolved: Awaited<ReturnType<typeof resolveAyWebsProductWithCapture>> | null = null;
      let failedCode = '';
      try {
        resolved = await resolveAyWebsProductWithCapture(target, {
          sessionId,
          storeId: product.storeId || undefined,
          capture: captureToUse,
          refresh: false,
          variant,
        });
      } catch {
        resolved = null;
        failedCode = 'capture:rejected';
      }

      /* 2. الخادم ما قدرش يثبّت التوفّر لهذا الاختيار ⇒ نقراو صفحات الاختيار،
         وحدة بعد الأخرى (زوز كحدّ أقصى)، وكل مرّة الخادم يعاود يحكم.
         علاش: على Amazon، ASIN اللون هو «هذا اللون بالمقاس المعروض»، وASIN
         المقاس هو «هذا المقاس باللون المعروض». تبديل اللون برك ⇒ قراية وحدة.
         تبديل اللون والمقاس ⇒ قراية اللون، ومن صفحتها عنوان المقاس. */
      let reads = 0;
      let seenUrl = target;
      while (reads < 2 && local && readVariant && resolved
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

      /* تشخيص: علاش الخادم ما قدرش ينشر الثمن؟ الرموز تجي منو (رفض الكابتشر،
         رفض الثمن) — تتكتب في الورقة باش المشكل يتشخّص من التيليفون. */
      setDiagnostic([
        failedCode,
        resolved?.capture?.rejection ? `capture:${resolved.capture.rejection}` : '',
        resolved?.priceRejection ? `price:${resolved.priceRejection}` : '',
      ].filter(Boolean).join(' · '));

      /* 2 bis. بلا دفي بالدينار من الكابتشر ⇒ الخادم يعاود يقرا الصفحة (كيما
         الويب). هذا هو الفرق اللي كان يخلّي لون يخدم ولون لا: نفس الفيشة،
         كابتشر ما فيهاش ثمن مُثبَّت. الكابتشر تبقى مرسلة مع الإضافة: الخادم
         يشوف نفس الأسماء اللي شافها العميل (وإلا يرفض بالـVARIANT_REQUIRED). */
      if (!resolved || lacksServerQuote(resolved.product)) {
        try {
          const reread = await resolveAyWebsProductWithCapture(target, {
            sessionId,
            storeId: product.storeId || undefined,
            refresh: true,
            variant,
          });
          if (!alive.current) return;
          resolved = resolved
            ? { ...resolved, product: preferServerQuote(resolved.product, reread.product) }
            : reread;
          if (lacksServerQuote(reread.product)) {
            /* لا دفي حتى من القراية: نوقف هنا بجواب صريح بدل ما نبعتو إضافة
               يعرفو الخادم أنّه باش يرفضها. */
            setDiagnostic([
              failedCode,
              reread.capture?.rejection ? `capture:${reread.capture.rejection}` : '',
              reread.priceRejection ? `price:${reread.priceRejection}` : '',
            ].filter(Boolean).join(' · '));
            setError(t('aywebs.block.PRICE_UNAVAILABLE'));
            return;
          }
          resolved.quoteToken = reread.quoteToken;
        } catch (caught) {
          if (!alive.current) return;
          if (!resolved) {
            setError(addErrorMessage(caught, locale, t));
            return;
          }
        }
      }

      /* 3. ما نطلبوش من الخادم إضافة يعرف أنّه باش يرفضها: السبب يتكتب للمستعمل. */
      if (missing.length) {
        setError(t('aywebs.block.VARIANT_REQUIRED'));
        return;
      }
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
      onAdded?.(outcome.item, outcome.cart);
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
  const selectedColorImage = imageForSelectedColor(fields, selection);
  /* الصورة الرئيسية تتبع لون المنتج المختار داخل نفس الورقة؛ fallback للصورة
     الأصلية فقط إذا التاجر ما نشرش صورة مرتبطة باللون. */
  const imageUri = selectedColorImage || added?.item.images[0] || product.images[0] || '';

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
      presentation="bottom"
      footer={added ? undefined : (
        <View style={styles.stickyFooter}>
          <View style={[styles.stickyPrice, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
            <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.quantity')}: {quantity}</AppText>
            <AppText variant="title" weight="bold">
              {quote.unitTnd != null ? (quantity > 1 ? totalLine : sourceLine) : quoting ? t('aywebs.pricePending') : t('aywebs.priceAtAdd')}
            </AppText>
          </View>
          <Button
            label={busy ? t('aywebs.adding') : t('aywebs.addToCart')}
            tone="commerce"
            leading={<Ionicons name="bag-add-outline" size={20} color={COMMERCE.onAction} />}
            onPress={confirm}
            busy={busy}
            disabled={Boolean(blockedCode) || !sessionId}
            block
            testID="aywebs-sheet-add"
          />
        </View>
      )}
      header={(
        <View style={[styles.header, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          <View style={styles.headerSide} />
          <AppText variant="lead" weight="bold" align="center" style={styles.headerTitle} numberOfLines={1}>
            {added ? t('aywebs.added') : t('aywebs.pickTitle')}
          </AppText>
          <View style={styles.headerSide}>{closeButton}</View>
        </View>
      )}
    >
      <View style={[styles.productCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderRadius: theme.radius.card, flexDirection: rowDirectionFor(theme.isRTL) }]}>
        {imageUri ? (
          <AppImage
            uri={mediaUrl(imageUri)}
            style={[styles.productHero, { borderRadius: theme.radius.control }]}
            contentFit="cover"
            accessibilityLabel={title}
            testID="aywebs-sheet-product-image"
          />
        ) : (
          <View style={[styles.productHero, { borderRadius: theme.radius.control, borderColor: theme.colors.line, borderWidth: 1, backgroundColor: theme.colors.disabled, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="image-outline" size={theme.iconSize.lg} color={theme.colors.muted} />
          </View>
        )}
        <View style={styles.productText}>
          <AppText variant="body" weight="semibold" numberOfLines={3}>{title}</AppText>
          {added ? null : (
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
        <View style={[styles.successBanner, { flexDirection: rowDirectionFor(theme.isRTL), backgroundColor: theme.status.success.soft, borderColor: theme.status.success.border }]}>
          <View style={[styles.successIcon, { backgroundColor: theme.status.success.fg }]}>
            <Ionicons name="checkmark" size={22} color={theme.colors.canvas} />
          </View>
          <View style={styles.successCopy}>
            {added.item.variantLabel ? (
              <AppText variant="caption" color={theme.colors.muted}>{added.item.variantLabel}</AppText>
            ) : null}
          </View>
        </View>
      ) : null}

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
          <View style={[styles.actions, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
            <Button
              label={t('aywebs.goToCart')}
              tone="commerce"
              leading={<Ionicons name="cart-outline" size={19} color={COMMERCE.onAction} />}
              style={{ flex: 1 }}
              /* Un seul panier visible pour le client : le panier principal. */
              onPress={() => { onClose(); router.push('/cart'); }}
            />
            <Button label={t('aywebs.continueShopping')} tone="quiet" style={{ flex: 1 }} onPress={onClose} />
          </View>
        </>
      ) : (
        <>
          {fields.map((field) => field.kind === 'color' || field.kind === 'size' ? (
            <VariantOptionChips
              key={field.key}
              kind={field.kind}
              label={field.label}
              value={selection[field.key] ?? ''}
              options={field.values}
              onSelect={(value) => {
                setSelection((current) => ({ ...current, [field.key]: value }));
                setError('');
              }}
            />
          ) : (
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

          <View style={[styles.quantityRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
            <AppText variant="body" weight="semibold">{t('aywebs.quantity')}</AppText>
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('aywebs.quantityLess')}
                disabled={quantity <= 1 || busy}
                onPress={() => setQuantity((value) => Math.max(1, value - 1))}
                style={[styles.stepperButton, { borderColor: theme.colors.line, backgroundColor: theme.colors.surface, borderRadius: theme.radius.control, borderWidth: 1, minWidth: theme.geometry.minTarget, minHeight: theme.geometry.minTarget }]}
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
                style={[styles.stepperButton, { borderColor: theme.colors.line, backgroundColor: theme.colors.surface, borderRadius: theme.radius.control, borderWidth: 1, minWidth: theme.geometry.minTarget, minHeight: theme.geometry.minTarget }]}
                testID="aywebs-quantity-more"
              >
                <Ionicons name="add" size={theme.iconSize.md} color={quantity >= maxQuantity ? theme.colors.muted : theme.colors.ink} />
              </Pressable>
            </View>
          </View>

          {quote.unitTnd != null && quantity > 1 ? (
            <View style={[styles.totalRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
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
          {/* Le diagnostic s'affiche aussi quand le DEVIS MANQUE : « pas de prix
              en dinars » sans motif obligeait le support à deviner (26/10/2026). */}
          {diagnostic && (error || !sourceLine || quote.unitTnd == null) && !quoting ? (
            <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.diagnosticLine', { code: diagnostic })}</AppText>
          ) : null}

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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 4 },
  headerSide: { width: 44, alignItems: 'flex-end' },
  headerTitle: { flex: 1, textAlign: 'center' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  productCard: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  productHero: { width: 88, height: 88, borderRadius: 12 },
  productText: { flex: 1, gap: 4 },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 16 },
  successIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  successCopy: { flex: 1, gap: 2 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stickyFooter: { gap: 8 },
  stickyPrice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
