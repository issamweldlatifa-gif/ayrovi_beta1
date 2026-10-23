/**
 * ورقة الاختيار من **القراءة المحلية** (20/10/2026) — بلا أي نداء للخادم عند الفتح.
 *
 * (تعليق فقط : إعادة تشغيل بناء APK بعد فشل تنزيل NDK على الـrunner، ليس خطأ في الكود.)
 *
 * المصدر: capture.amazon (الخيارات والمقاسات مع ASIN ودليل التوفّر) وعنوان الصفحة.
 *  • الخادم يبقى الحكم الأخير: يتحقق من الاختيار عند التأكيد، ويعطي السعر والفاتورة.
 *  • التوفّر هنا لازم يكون مُثبتاً من القراءة: «غير معروف» ⇒ لا تأكيد (المبدأ: UNKNOWN لا يذهب للسلة).
 *  • لا سعر هنا: السعر يظهر بعد الفحص عند الخادم، ولا نحسبو شي محلياً.
 */
import type {
  AyWebsAddBlockCode, AyWebsAvailability, AyWebsResolvedProduct, AyWebsVariantGroup, AyWebsVariantOption,
} from '@/api/aywebs';

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const ASIN = /^[A-Z0-9]{10}$/;

export interface LocalVariant {
  asin: string;
  attributes: Record<string, string>;
  availability: 'AVAILABLE' | 'OUT_OF_STOCK' | 'UNKNOWN';
  /** Prix affiché SUR LA CARTE de ce choix (texte tel quel) — jamais un devis. */
  cardPrice: string;
  /** Stock annoncé sur la carte ; `null` quand la page n'en publie pas. */
  stock: number | null;
}

/** Variantes publiées dans la capture Amazon, avec leur ASIN, leurs attributs et leur disponibilité prouvée. */
export function localVariantsFromCapture(capture: Json): LocalVariant[] {
  const amazon = isRecord(capture.amazon) ? capture.amazon : null;
  if (!amazon) return [];
  const evidenceByAsin = new Map<string, string>();
  const cardByAsin = new Map<string, { price: string; stock: number | null }>();
  if (Array.isArray(amazon.options)) {
    for (const option of amazon.options) {
      if (!isRecord(option)) continue;
      const asin = text(option.asin).toUpperCase();
      if (!ASIN.test(asin)) continue;
      evidenceByAsin.set(asin, text(option.availabilityEvidence).toLowerCase());
      const price = text(option.price);
      const stock = Number(option.stock);
      const known = cardByAsin.get(asin);
      const next = {
        price: known?.price || price,
        stock: known?.stock ?? (Number.isFinite(stock) && stock > 0 ? Math.floor(stock) : null),
      };
      if (next.price || next.stock != null) cardByAsin.set(asin, next);
    }
  }
  const out: LocalVariant[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(amazon.variants)) return out;
  for (const variant of amazon.variants) {
    if (!isRecord(variant)) continue;
    const asin = text(variant.asin).toUpperCase();
    if (!ASIN.test(asin) || seen.has(asin)) continue;
    seen.add(asin);
    const attributes: Record<string, string> = {};
    if (Array.isArray(variant.dimensions)) {
      for (const dimension of variant.dimensions) {
        if (!isRecord(dimension)) continue;
        const name = text(dimension.name).toLowerCase();
        const value = text(dimension.value);
        if (name && value) attributes[name] = value;
      }
    }
    const evidence = evidenceByAsin.get(asin) ?? '';
    const availability = evidence === 'available' ? 'AVAILABLE' : evidence === 'unavailable' ? 'OUT_OF_STOCK' : 'UNKNOWN';
    const card = cardByAsin.get(asin);
    out.push({ asin, attributes, availability, cardPrice: card?.price ?? '', stock: card?.stock ?? null });
  }
  return out;
}

/**
 * الاختيار الافتراضي = **اللي تعرضو الصفحة**. الصفحة تفتح على تركيبة معيّنة
 * (Amazon: ASIN الصفحة هو التركيبة المعروضة) ; بلا هذا، الورقة تفتح فارغة
 * والمستعمل يظنّ «التاجر ما نشرش خيارات» ثمّ يلقى زر الإضافة مقفولاً.
 * ما نضيفوش قيمة ما شفناهاش: كل قيمة لازم تكون موجودة في مجموعات الصفحة.
 */
export function defaultSelectionFromCapture(
  capture: Json,
  groups: AyWebsVariantGroup[],
): Record<string, string> {
  const amazon = isRecord(capture.amazon) ? capture.amazon : null;
  if (!amazon || !groups.length) return {};
  const selectedAsin = text(amazon.selectedAsin).toUpperCase();
  const entries = Array.isArray(amazon.variants) ? amazon.variants.filter(isRecord) : [];
  const shown = entries.find((variant) => selectedAsin !== '' && text(variant.asin).toUpperCase() === selectedAsin)
    ?? entries.find((variant) => variant.selected === true);
  const dimensions = shown && Array.isArray(shown.dimensions) ? shown.dimensions.filter(isRecord) : [];
  const selection: Record<string, string> = {};
  for (const group of groups) {
    const key = group.attribute.trim().toLowerCase();
    const match = dimensions.find((dimension) => text(dimension.name).toLowerCase() === key);
    const value = match ? text(match.value) : '';
    if (value && group.values.some((candidate) => candidate.toLowerCase() === value.toLowerCase())) {
      selection[key] = value;
    }
  }
  return selection;
}

/** هل الاختيار يطابق تركيبة منشورة؟ مقارنة تامّة (نفس الأسماء، نفس القيم) — بلا تخمين. */
function matchesSelection(attributes: Record<string, string>, selection: Record<string, string>): boolean {
  const chosen = new Map(Object.entries(selection).map(([name, value]) => [name.trim().toLowerCase(), String(value)]));
  const published = new Map(Object.entries(attributes).map(([name, value]) => [name.trim().toLowerCase(), String(value)]));
  if (!chosen.size || chosen.size !== published.size) return false;
  for (const [name, value] of chosen) {
    const candidate = published.get(name);
    if (candidate == null || candidate.toLowerCase() !== value.toLowerCase()) return false;
  }
  return true;
}

/** سعر واحد فقط من القراءة (كل القراءات تتفق على نفس المبلغ) — وإلاّ لا سعر. */
function pagePriceText(capture: Json): string {
  const candidates = Array.isArray(capture.priceCandidates) ? capture.priceCandidates : [];
  const amounts = new Set<string>();
  let first = '';
  for (const candidate of candidates) {
    const value = isRecord(candidate) ? text(candidate.text) : text(candidate);
    const digits = value.replace(/\D/g, '');
    if (!digits) continue;
    if (!first) first = value;
    amounts.add(digits);
  }
  return amounts.size === 1 ? first : '';
}

/**
 * السعر **المعروض** للاختيار الحالي: سعر بطاقة الاختيار إن نشرتو، وإلاّ سعر
 * الصفحة إن كان الاختيار هو المعروض فيها. نصّ كما كتبتو الصفحة (« $89.99 »)،
 * موش رقم محسوب: المجموع بالدينار يجي من الخادم عند الإضافة.
 */
export function displayPriceForSelection(
  capture: Json,
  selection: Record<string, string>,
): { text: string } | null {
  if (!capture || typeof capture !== 'object') return null;
  const variants = localVariantsFromCapture(capture);
  const chosen = variants.find((variant) => matchesSelection(variant.attributes, selection));
  if (chosen) {
    if (chosen.cardPrice) return { text: chosen.cardPrice };
    const amazon = isRecord(capture.amazon) ? capture.amazon : null;
    const shownAsin = amazon ? text(amazon.selectedAsin).toUpperCase() : '';
    if (shownAsin && shownAsin === chosen.asin) {
      const page = pagePriceText(capture);
      return page ? { text: page } : null;
    }
    return null;
  }
  /* بلا اختيار (أو بلا خيارات منشورة): سعر الصفحة يخصّ المنتوج المعروض. */
  if (Object.keys(selection).length === 0) {
    const page = pagePriceText(capture);
    return page ? { text: page } : null;
  }
  return null;
}

/**
 * المخزون المعلن للاختيار: بطاقة الاختيار أوّلاً، وإلاّ نصّ الصفحة كي الاختيار
 * هو المعروض (« Only 6 left in stock »). `null` = ما نشرش ⇒ ما نمنعوش، الخادم
 * يبقى الحكم على التوفّر.
 */
export function stockForSelection(capture: Json, selection: Record<string, string>): number | null {
  if (!capture || typeof capture !== 'object') return null;
  const variants = localVariantsFromCapture(capture);
  const chosen = variants.find((variant) => matchesSelection(variant.attributes, selection));
  if (chosen?.stock != null) return chosen.stock;
  const amazon = isRecord(capture.amazon) ? capture.amazon : null;
  const shownAsin = amazon ? text(amazon.selectedAsin).toUpperCase() : '';
  const isShown = chosen ? shownAsin !== '' && chosen.asin === shownAsin : Object.keys(selection).length === 0;
  return isShown ? stockFromAvailabilityText(capture.availabilityText) : null;
}

/** « Only 6 left in stock », « plus que 3 », « nur noch 2 auf Lager » ⇒ nombre borné. */
export function stockFromAvailabilityText(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const match = /(?:only\s+)?(\d{1,3})\s+(?:left in stock|remaining|available)/i.exec(raw)
    ?? /(?:il ne reste plus que|plus que)\s*(\d{1,3})/i.exec(raw)
    ?? /(?:nur noch|noch)\s*(\d{1,3})\s*(?:auf lager|verfügbar|verfuegbar)/i.exec(raw)
    ?? /(?:بقي|متبقي)\s*(\d{1,3})/.exec(raw);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isInteger(count) && count > 0 && count <= 999 ? count : null;
}

/** Groupes d'attributs (taille, couleur…) dans l'ordre de la page. */
export function groupsFromVariants(variants: LocalVariant[]): AyWebsVariantGroup[] {
  const groups = new Map<string, string[]>();
  for (const variant of variants) {
    for (const [name, value] of Object.entries(variant.attributes)) {
      const values = groups.get(name) ?? [];
      if (!values.includes(value)) values.push(value);
      groups.set(name, values);
    }
  }
  return [...groups.entries()].map(([attribute, values]) => ({ attribute, values }));
}

/** Options pour la feuille : l'ASIN est le `sourceVariantId` (même convention que le serveur). */
export function optionsFromVariants(variants: LocalVariant[]): AyWebsVariantOption[] {
  return variants.map((variant) => ({
    sourceVariantId: variant.asin,
    attributes: variant.attributes,
    label: Object.values(variant.attributes).join(' / '),
    price: null,
    currency: '',
    quotedPrice: null,
    quotedCurrency: '',
    priceSource: 'UNKNOWN',
    availability: variant.availability,
    availabilityReason: '',
    image: '',
    totalTnd: null,
  }));
}

/** Titre, image et boutique depuis la capture — sans prix (le prix vient du serveur à l'ajout). */
export function productFromCapture(capture: Json, url: string, storeId: string, storeName: string): AyWebsResolvedProduct {
  const amazon = isRecord(capture.amazon) ? capture.amazon : null;
  const pageAsin = amazon ? text(amazon.pageAsin).toUpperCase() : '';
  const images = Array.isArray(capture.images)
    ? capture.images.map((item) => (isRecord(item) ? text(item.url) : text(item))).filter((item) => item.startsWith('http'))
    : [];
  let domain = '';
  try { domain = new URL(url).host; } catch { domain = ''; }
  const unknown: AyWebsAvailability = { state: 'UNKNOWN', reason: '', checkedAt: '', source: 'capture', quantityHint: null };
  return {
    productId: pageAsin,
    storeId,
    storeName,
    sourceUrl: url,
    sourceDomain: domain,
    title: text(capture.title),
    brand: text(capture.brand),
    images,
    price: null,
    currency: '',
    priceVerified: false,
    currencyVerified: false,
    availability: unknown,
    purchaseMode: '',
    integrationType: '',
    ayroviPricing: null,
    variantGroups: [],
    variantDetails: [],
    fromCache: false,
    cacheAgeMs: null,
  };
}

/**
 * Prêt à confirmer ? Règles locales (plus strictes que « rien de connu ») :
 *  • des attributs publiés ⇒ il faut un choix complet ;
 *  • le choix doit correspondre à une variante avec une disponibilité PROUVÉE ;
 *  • sans variante : disponibilité prouvée par le texte de la page, sinon refus.
 */
export function localAddReadiness(input: {
  groups: AyWebsVariantGroup[];
  variants: LocalVariant[];
  selection: Record<string, string>;
  pageInStockText: boolean;
}): { ready: boolean; code: AyWebsAddBlockCode; missingAttributes: string[] } {
  const missingAttributes = input.groups
    .filter((group) => !input.selection[group.attribute.toLowerCase()])
    .map((group) => group.attribute);
  if (input.groups.length && missingAttributes.length) {
    return { ready: false, code: 'VARIANT_REQUIRED', missingAttributes };
  }
  if (!input.groups.length) {
    return input.pageInStockText
      ? { ready: true, code: '', missingAttributes: [] }
      : { ready: false, code: 'STOCK_UNKNOWN', missingAttributes: [] };
  }
  const chosen = Object.entries(input.selection).map(([k, v]) => `${k}=${v.toLowerCase()}`).sort().join('|');
  const match = input.variants.find((variant) => Object.entries(variant.attributes)
    .map(([k, v]) => `${k}=${v.toLowerCase()}`).sort().join('|') === chosen);
  if (!match) return { ready: false, code: 'VARIANT_UNKNOWN', missingAttributes: [] };
  if (match.availability === 'OUT_OF_STOCK') return { ready: false, code: 'VARIANT_UNAVAILABLE', missingAttributes: [] };
  if (match.availability !== 'AVAILABLE') return { ready: false, code: 'STOCK_UNKNOWN', missingAttributes: [] };
  return { ready: true, code: '', missingAttributes: [] };
}
