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
  defaultSelectionFromCapture, displayPriceForSelection, localAddReadiness, localVariantsFromCapture,
  pageAvailabilityFromCapture, priceDependsOnOption, selectionHasPublishedPrice, selectionIsShown,
  splitMerchantPrice, stockForSelection, valueStatesFromCapture,
  type LocalVariant, type LocalValueStates,
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

/**
 * La capture est-elle encore une preuve valable ? Le serveur refuse une capture
 * de plus de 10 minutes ; on garde une marge de 2 minutes, pour ne pas envoyer
 * une capture qui expirera pendant l'aller-retour.
 */
function captureIsFresh(capture: unknown, now = Date.now()): boolean {
  const at = Date.parse(String((capture as { capturedAt?: unknown } | null | undefined)?.capturedAt ?? ''));
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  return age >= -60_000 && age <= 8 * 60_000;
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
  /** Choix relu ET tarifé par le serveur depuis la feuille (23/10/2026). */
  const [verified, setVerified] = useState<{
    key: string; product: AyWebsResolvedProduct; capture: unknown; quoteToken: string; url: string;
  } | null>(null);
  const [verifying, setVerifying] = useState(false);
  /**
   * Devis du serveur pour CE choix précis (prix marchand + total TND + jeton).
   * Depuis le 23/10/2026 le serveur le rend aussi pour une AUTRE couleur que
   * celle affichée, à partir du prix publié sous la pastille : plus besoin de
   * relire la page à chaque changement de couleur.
   */
  const [quote, setQuote] = useState<{
    key: string; productId: string; price: number | null; currency: string;
    totalTnd: number | null; quoteToken: string;
  } | null>(null);
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
    setVerified(null);
    setVerifying(false);
    setQuote(null);
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

  const captureRecord = useMemo(
    () => (capture && typeof capture === 'object' ? capture as Record<string, unknown> : null),
    [capture],
  );
  /** التوفّر كما نشرتو الصفحة (`In Stock` / `Currently unavailable` / بلا شي). */
  const pageAvailability = useMemo(
    () => (local && captureRecord ? pageAvailabilityFromCapture(captureRecord) : 'UNKNOWN'),
    [captureRecord, local],
  );
  /**
   * Variantes LUES dans la capture, indexées par ASIN : elles portent le prix
   * de carte et le stock annoncé (« Only 6 left in stock »). Les options du
   * serveur ne les ont pas — sans cette jointure, la disposition manquait de
   * deux champs et le typage refusait le passage à `localAddReadiness`.
   */
  const captureVariants = useMemo<LocalVariant[]>(
    () => (local && captureRecord ? localVariantsFromCapture(captureRecord) : []),
    [captureRecord, local],
  );
  const captureVariantByAsin = useMemo(
    () => new Map(captureVariants.map((variant) => [variant.asin, variant])),
    [captureVariants],
  );
  /**
   * États/prix publiés POUR CHAQUE VALEUR (23/10/2026) : la feuille les affiche
   * sous chaque pastille, sans réinjecter le lecteur à chaque changement.
   */
  const valueStates = useMemo<LocalValueStates>(
    () => (local && captureRecord ? valueStatesFromCapture(captureRecord) : {}),
    [captureRecord, local],
  );
  /** هل الاختيار هو التركيبة المعروضة؟ دليل الصفحة يخصّها وحدها. */
  const shownSelection = useMemo(
    () => (local && captureRecord ? selectionIsShown(captureRecord, selection) : false),
    [captureRecord, local, selection],
  );
  /** Clé stable du choix : sert à savoir si le devis/la vérification le couvre. */
  const selectionKey = useMemo(
    () => Object.entries(selection).map(([name, value]) => `${name}=${String(value).toLowerCase()}`).sort().join('|'),
    [selection],
  );
  const readiness = useMemo(() => {
    /* Une lecture faite DEPUIS la feuille (appui « vérifier ») fait foi : c'est
       le serveur qui a jugé ce choix précis, pas la page d'une autre couleur. */
    if (verified && verified.key === selectionKey) {
      const state = verified.product.availability.state;
      const ready = state === 'AVAILABLE' || state === 'LOW_STOCK';
      return {
        ready,
        code: (ready ? '' : state === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : 'STOCK_UNKNOWN') as AyWebsAddBlockCode,
        missingAttributes: [] as string[],
        availability: state,
        quotedTotalTnd: verified.product.ayroviPricing?.totalTnd ?? null,
      };
    }
    if (local) {
      const res = localAddReadiness({
        groups,
        variants: variantOptions.map((option) => {
          const shown = captureVariantByAsin.get(option.sourceVariantId);
          return {
            asin: option.sourceVariantId,
            attributes: option.attributes,
            availability: (option.availability === 'AVAILABLE' ? 'AVAILABLE' : option.availability === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : 'UNKNOWN') as LocalVariant['availability'],
            cardPrice: shown?.cardPrice ?? '',
            stock: shown?.stock ?? null,
          };
        }),
        selection,
        pageInStockText: pageAvailability === 'AVAILABLE',
        pageAvailability,
        pageShowsSelection: shownSelection,
        valueStates,
      });
      /* Le stock vient de la capture : une version d'application plus ancienne du
         serveur n'a pas à le connaître pour remplir la feuille. */
      return {
        ready: res.ready, code: res.code, missingAttributes: res.missingAttributes,
        availability: res.availability, quotedTotalTnd: null,
      };
    }
    return ayWebsAddReadiness({
      groups,
      options: variantOptions,
      productAvailability: product.availability.state,
      productQuotedTnd: product.ayroviPricing?.totalTnd ?? null,
      selection,
    });
  }, [captureVariantByAsin, groups, local, pageAvailability, selectionKey, shownSelection, product.availability.state,
    product.ayroviPricing, selection, valueStates, variantOptions, verified]);

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
  /** Fourchette / prix « à partir de » : le prix n'existe qu'une fois l'option choisie. */
  const priceVaries = useMemo(
    () => Boolean(local && captureRecord && priceDependsOnOption(captureRecord)),
    [captureRecord, local],
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

  /**
   * Ce choix peut-il être chiffré DEPUIS la capture, sans relire la page ?
   *
   *   • aucune variante publiée ⇒ le prix de la page décrit le produit ;
   *   • la combinaison est celle AFFICHÉE ⇒ le prix/bouton de la page sont pour
   *     elle, c'est la preuve la plus forte ;
   *   • sinon, chaque valeur choisie publie SON prix ferme (pas un « à partir
   *     de ») ⇒ le serveur sait chiffrer cette couleur (23/10/2026).
   *
   * Hors de ces cas, la feuille ne demande pas de prix : le serveur répondrait
   * celui d'une autre combinaison, et c'est exactement ce qu'on s'interdit.
   */
  const valuePricePublished = useMemo(
    () => (local && captureRecord ? selectionHasPublishedPrice(captureRecord, selection) : false),
    [captureRecord, local, selection],
  );
  const captureQuotesSelection = !groups.length || shownSelection || valuePricePublished;
  const verifiedForSelection = verified && verified.key === selectionKey ? verified : null;
  const quoteForSelection = quote && quote.key === selectionKey ? quote : null;

  useEffect(() => {
    if (!visible || !local || !captureRecord || !sessionId) return;
    if (!readiness.ready || !captureQuotesSelection) return;
    if (quoteForSelection || verifiedForSelection) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      resolveAyWebsProductWithCapture(product.sourceUrl, {
        sessionId,
        storeId: product.storeId || undefined,
        capture: captureRecord,
        refresh: false,
        /* Le choix part AVEC la requête : le serveur chiffre CETTE couleur à
           partir du prix publié pour elle — jamais celui d'une autre. */
        variant: groups.length ? selection : null,
        signal: controller.signal,
      })
        .then((outcome) => {
          if (controller.signal.aborted) return;
          if (!outcome.quoteToken) return; /* pas de devis ⇒ pas de prix inventé */
          setQuote({
            key: selectionKey,
            productId: outcome.product.productId,
            price: outcome.product.price,
            currency: outcome.product.currency,
            totalTnd: outcome.product.ayroviPricing?.totalTnd ?? null,
            quoteToken: outcome.quoteToken,
          });
        })
        .catch(() => { /* la feuille écrit « calculé par le serveur » — aucun prix inventé */ });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [captureQuotesSelection, captureRecord, groups.length, local, product.sourceUrl, product.storeId,
    quoteForSelection, readiness.ready, selection, selectionKey, sessionId, verifiedForSelection, visible]);

  /**
   * « Vérifier ce choix » (23/10/2026) : UNE lecture, à la demande, quand la page
   * ne publie ni le stock ni le prix de la combinaison choisie. Elle se fait
   * DEPUIS la feuille — le client ne ressort pas, ne rappuie pas sur Add, et le
   * résultat (prix + stock + devis) s'affiche ici même.
   */
  const verifySelection = useCallback(async () => {
    if (!sessionId || !readVariant || verifying || !selectionKey) return;
    setVerifying(true);
    setError('');
    try {
      const target = variantPageUrl() ?? product.sourceUrl;
      const fresh = await readVariant(target);
      const outcome = await resolveAyWebsProductWithCapture(target, {
        sessionId,
        storeId: product.storeId || undefined,
        capture: fresh,
        refresh: true,
        variant: selection,
      });
      setVerified({
        key: selectionKey,
        product: outcome.product,
        capture: fresh,
        quoteToken: outcome.quoteToken,
        url: target,
      });
    } catch (caught) {
      setError(isApiError(caught) ? userMessage(caught)[locale] : t('aywebs.captureFailed'));
    } finally {
      setVerifying(false);
    }
  }, [locale, product.sourceUrl, product.storeId, readVariant, selection, selectionKey, sessionId, t, variantPageUrl, verifying]);

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
        /**
         * Ajout depuis la lecture locale.
         *
         * Deux cas, et le second évite une lecture inutile — celle qui a produit
         * « nous n'avons pas pu lire le titre, le prix… » sur le téléphone
         * (23/10) : un WebView caché qui relit la MÊME page peut échouer sans
         * raison, alors que la capture qui vient de remplir la feuille est déjà
         * la preuve du produit affiché.
         *
         *   • le choix EST la combinaison affichée, la capture est fraîche et son
         *     prix est publié ⇒ on envoie cette capture telle quelle (aucune
         *     relecture, le serveur refait le prix et signe le devis) ;
         *   • sinon (autre couleur/taille, capture périmée, prix en fourchette)
         *     ⇒ on relit la page du choix, puis le serveur tranche.
         */
        const target = variantPageUrl() ?? product.sourceUrl;
        /* 1. Une vérification faite DEPUIS la feuille couvre ce choix précis :
              aucune relecture, le serveur a déjà jugé et chiffré. */
        if (verifiedForSelection) {
          productId = verifiedForSelection.product.productId;
          sourceUrl = verifiedForSelection.url;
          cartCapture = verifiedForSelection.capture;
          cartQuote = verifiedForSelection.quoteToken;
        } else if (quoteForSelection && capture && captureIsFresh(capture)) {
          /* 2. Le serveur a DÉJÀ chiffré ce choix à partir de cette capture (prix
                de la pastille ou de la page affichée). Aucune relecture : le
                devis signé porte le montant de la combinaison choisie. */
          productId = quoteForSelection.productId;
          sourceUrl = target;
          cartCapture = capture;
          cartQuote = quoteForSelection.quoteToken;
        } else if (captureQuotesSelection && capture) {
          /* 3. La capture publie de quoi chiffrer ce choix : une seule requête,
                sans relire la page ni réinjecter le lecteur. */
          const resolved = await resolveAyWebsProductWithCapture(target, {
            sessionId, storeId: product.storeId || undefined, capture, refresh: true,
            variant: groups.length ? selection : null,
          });
          productId = resolved.product.productId;
          sourceUrl = target;
          cartCapture = capture;
          cartQuote = resolved.quoteToken;
          if (!cartQuote) throw new Error('variant-quote-missing');
        } else {
          /* 4. La page ne publie ni le prix ni l'état de cette combinaison : une
                lecture de SA page est le seul chemin honnête. */
          if (!readVariant) throw new Error('variant-reader-missing');
          const fresh = await readVariant(target);
          const verified = await resolveAyWebsProductWithCapture(target, {
            sessionId, storeId: product.storeId || undefined, capture: fresh, refresh: true,
            variant: groups.length ? selection : null,
          });
          productId = verified.product.productId;
          sourceUrl = target;
          cartCapture = fresh;
          cartQuote = verified.quoteToken;
        }
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
      if (caught instanceof Error && (caught.message === 'variant-reader-missing' || caught.message === 'variant-quote-missing')) {
        setError(t('aywebs.captureFailed'));
      } else {
        setError(isApiError(caught) ? userMessage(caught)[locale] : t('aywebs.captureFailed'));
      }
    } finally {
      setBusy(false);
    }
  }, [capture, local, locale, onAdded, product.productId, product.sourceUrl, product.storeId, quantity, quoteForSelection,
    quoteToken, readVariant, readiness.ready, selection, selectionKey, sessionId, shownPrice, shownSelection, t,
    variantPageUrl, verifiedForSelection]);

  const availabilityLabel = (state: string | null): string => {
    if (!state) return '';
    if (state === 'AVAILABLE') return t('aywebs.avail.AVAILABLE');
    if (state === 'LOW_STOCK') return t('aywebs.avail.LOW_STOCK');
    if (state === 'OUT_OF_STOCK') return t('aywebs.avail.OUT_OF_STOCK');
    return t('aywebs.avail.UNKNOWN');
  };

  const itemsCount = groups.reduce((sum, group) => sum + group.values.length, 0);
  /** Montant + note : « 12,95 € » d'un côté, « TVA incluse · 150 ml » de l'autre. */
  const merchantPrice = useMemo(
    () => (shownPrice ? splitMerchantPrice(shownPrice.text) : { amount: '', note: '' }),
    [shownPrice],
  );
  /** Total en dinars calculé par le serveur — `null` tant qu'il n'a pas répondu. */
  const serverTotal = verifiedForSelection?.product.ayroviPricing?.totalTnd
    ?? quoteForSelection?.totalTnd
    ?? readiness.quotedTotalTnd
    ?? null;

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
                          /* Ce que la page dit de CETTE valeur (prix, état) — lu
                             une seule fois, dans la capture qui a ouvert la feuille. */
                          const published = valueStates[key]?.[value.toLowerCase()];
                          const state = (published?.state === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : optionAvailability(group.attribute, value))
                            ?? published?.state
                            ?? null;
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
                              {published?.price ? (
                                <AppText variant="caption" color={active ? theme.colors.onAction : theme.colors.muted}>
                                  {published.priceFrom ? `${t('aywebs.priceFrom')} ${published.price}` : published.price}
                                </AppText>
                              ) : null}
                              {unavailable ? (
                                <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.notAvailable')}</AppText>
                              ) : published?.state === 'AVAILABLE' ? (
                                <AppText variant="caption" color={active ? theme.colors.onAction : theme.colors.muted}>
                                  {t('aywebs.valueAvailable')}
                                </AppText>
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
                  <>
                    <KeyValue label={t('aywebs.merchantPrice')} value={merchantPrice.amount} />
                    {merchantPrice.note ? (
                      <AppText variant="caption" color={theme.colors.muted}>{merchantPrice.note}</AppText>
                    ) : null}
                    {shownPrice.priceFrom ? (
                      <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.priceFromNote')}</AppText>
                    ) : null}
                  </>
                ) : null}
                {!shownPrice && priceVaries ? (
                  <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.priceVaries')}</AppText>
                ) : null}
                {/* Le prix qui compte : celui du SERVEUR (produit + livraison),
                    calculé par la formule de prix. Jamais un prix fabriqué ici. */}
                {serverTotal != null ? (
                  <KeyValue label={t('aywebs.serverTotal')} value={`${serverTotal.toFixed(2)} TND`} />
                ) : readiness.ready && local ? (
                  <AppText variant="caption" color={theme.colors.muted}>
                    {captureQuotesSelection ? t('aywebs.quotePending') : t('aywebs.priceNeedsCheck')}
                  </AppText>
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
                {/* La page ne dit rien de CETTE combinaison : une seule lecture, ici. */}
                {local && groups.length > 0
                  && ((!readiness.ready && (readiness.code === 'STOCK_UNKNOWN' || readiness.code === 'VARIANT_UNKNOWN'))
                    /* Disponible mais sans prix ferme publié : c'est la MÊME
                       lecture, depuis la page de CE choix, qui donne le prix. */
                    || (readiness.ready && !captureQuotesSelection)) ? (
                    <Button
                      label={verifying ? t('aywebs.verifying') : t('aywebs.verifyChoice')}
                      tone="quiet"
                      onPress={verifySelection}
                      busy={verifying}
                      disabled={verifying || busy}
                    />
                  ) : null}
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
                {itemsCount === 0 && groups.length === 0 && readiness.ready ? (
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
