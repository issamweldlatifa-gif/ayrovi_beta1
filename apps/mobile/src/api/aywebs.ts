/**
 * AYWEBs — عميل الواجهة (P3، الشريحة الأولى: «رابط → تحليل → سعر بالدينار»).
 *
 * ثوابت هذي الطبقة:
 *  • الخادم وحدو يحكم في السعر والتوفّر وتحويل الدينار: هنا نعرضو، ما نحسبوش.
 *  • ما نبعثوش HTML الصفحة أبداً — الخادم يرفضو (`RAW_PAGE_CAPTURE_DISABLED`).
 *    الكابتشر (WebView) يجي في شريحة جاية وبعث «وقائع نصّية» فقط.
 *  • كل ردّ يتحقّق من الشكل قبل ما يولي نوع: غلاف ناجح بمحتوى مغلوط = خطأ
 *    بصوت عالي (`malformed`)، موش شاشة فارغة تدّعي النجاح.
 *  • كل طلب معلّم بـ `x-session-id`: الخادم يرفض بلاها (`SESSION_REQUIRED`).
 *    المعرّف يتولّد مرّة ويتخزّن (`features/aywebs/session`).
 */
import { apiGetData, apiGetText, apiSendData, apiSendEnvelope, type RequestOptions } from './client';
import { ApiError } from './errors';

export const AYWEBS_BASE = '/api/v1/aywebs';

/**
 * مهلة قراءة منتوج: الخادم يقرا الصفحة مرّة أولى (حتى ~25 ثانية على ما قيس في
 * 06/10). مهلة 12 ثانية الافتراضية تقطع القراءة اللي كانت باش تنجح، والمستعمل
 * يشوف «انتهت المهلة» على عملية صحيحة. نعطيوهالو وقت أطول بصراحة، وما نكذّبوش
 * النتيجة.
 */
export const AYWEBS_RESOLVE_TIMEOUT_MS = 30_000;

/* ── أدوات قراءة ───────────────────────────────────────────────────────────── */

/* كائن حقيقي: مصفوفة موش «record» — `typeof [] === 'object'` وهي كذبة كلاسيكية
   تخلّي `[]` يعدّي كـ JSON صالح. الخادم يرجّع كائنات دائماً، وما نقبلوش غيرها. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const bool = (value: unknown): boolean => value === true;
const numOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/**
 * خطأ «شكل مغلوط». الدالة تَرجّع الخطأ (موش ترميه هي): الوقت اللّي ترميه
 * يكون في `throw` ظاهر في مكان القرار، وبذلك TypeScript يضيّق النوع بعد
 * الشرط — والقراءة تبقى واضحة: كل رفض مكتوب في سطرو.
 */
const malformed = (what: string): ApiError =>
  new ApiError('malformed', `Réponse AYWEBs illisible : ${what}`);

/* ── تحليل الرابط (`POST /page/analyze`) ───────────────────────────────────── */

export interface AyWebsPageAnalysis {
  url: string;
  storeId: string;
  storeName: string;
  integrationType: string;
  registered: boolean;
  browseAllowed: boolean;
  captureAllowed: boolean;
  externalCaptureAllowed: boolean;
  pageType: string;
  isProductPage: boolean;
  productDetected: boolean;
  customerActionRequired: boolean;
  browserMode: string;
  fallback: string;
  reason: string;
  analyzedAt: string;
}

export function parseAyWebsPageAnalysis(payload: unknown): AyWebsPageAnalysis {
  if (!isRecord(payload) || !str(payload.url)) throw malformed('analyse de page');
  return {
    url: str(payload.url),
    storeId: str(payload.store_id),
    storeName: str(payload.store_name),
    integrationType: str(payload.integration_type),
    registered: bool(payload.registered),
    browseAllowed: bool(payload.browse_allowed),
    captureAllowed: bool(payload.capture_allowed),
    externalCaptureAllowed: bool(payload.external_capture_allowed),
    pageType: str(payload.page_type),
    isProductPage: bool(payload.is_product_page),
    productDetected: bool(payload.product_detected),
    customerActionRequired: bool(payload.customer_action_required),
    browserMode: str(payload.browser_mode),
    fallback: str(payload.fallback),
    reason: str(payload.reason),
    analyzedAt: str(payload.analyzed_at),
  };
}

/* ── المتاجر (`GET /stores`) ───────────────────────────────────────────────── */

export interface AyWebsStore {
  id: string;
  name: string;
  displayName: string;
  country: string;
  currency: string;
  enabled: boolean;
  captureSupported: boolean;
  /** `true` = القراءة المنتوجية تخدم فعلاً اليوم (مشروع توفّر خادمي). */
  operational: boolean;
  operationalReason: string;
  adapter: string;
  status: string;
  integrationType: string;
  capabilities: string[];
  browserMode: string;
  homeUrl: string;
  purchaseMode: string;
  popular: boolean;
}

export function parseAyWebsStores(payload: unknown): AyWebsStore[] {
  if (!Array.isArray(payload)) throw malformed('liste des boutiques');
  return payload.map((entry) => {
    if (!isRecord(entry) || !str(entry.id)) throw malformed('boutique sans identifiant');
    return {
      id: str(entry.id),
      name: str(entry.name),
      displayName: str(entry.display_name),
      country: str(entry.country),
      currency: str(entry.currency),
      enabled: bool(entry.enabled),
      captureSupported: bool(entry.capture_supported),
      operational: bool(entry.operational),
      operationalReason: str(entry.operational_reason),
      adapter: str(entry.adapter),
      status: str(entry.status),
      integrationType: str(entry.integration_type),
      capabilities: strList(entry.capabilities),
      browserMode: str(entry.browser_mode),
      homeUrl: str(entry.home_url),
      purchaseMode: str(entry.purchase_mode),
      popular: bool(entry.popular),
    };
  });
}

/* ── بطاقة المنتوج (`POST /product/resolve`) ───────────────────────────────── */

export interface AyWebsAvailability {
  state: string;
  reason: string;
  checkedAt: string;
  source: string;
  quantityHint: number | null;
}

export interface AyWebsPricingBreakdown {
  convertedSourcePrice: number | null;
  shipping: number | null;
  customs: number | null;
  serviceFee: number | null;
  other: number | null;
}

export interface AyWebsPricing {
  totalTnd: number | null;
  pricingVersion: number | null;
  breakdown: AyWebsPricingBreakdown | null;
}

export interface AyWebsResolvedProduct {
  productId: string;
  storeId: string;
  storeName: string;
  sourceUrl: string;
  sourceDomain: string;
  title: string;
  brand: string;
  images: string[];
  /** سعر المتجر كما نشرو هو (قد يكون `null` إذا الصفحة ما نشرتش سعر). */
  price: number | null;
  currency: string;
  priceVerified: boolean;
  currencyVerified: boolean;
  availability: AyWebsAvailability;
  purchaseMode: string;
  integrationType: string;
  /** الحسبة التونسية — تصدر من الخادم وحدو، صفر حساب هنا. */
  ayroviPricing: AyWebsPricing | null;
  /** المجموعات المنشورة من التاجر (لون، مقاس…) — الخادم يفرض الاختيار عليها (§13). */
  variantGroups: AyWebsVariantGroup[];
  /** الخيارات المنشورة مع سعرها بالدينار — نفس الّي تعرضه الخادم في `variant_details`. */
  variantDetails: AyWebsVariantOption[];
  fromCache: boolean;
  cacheAgeMs: number | null;
}

export function parseAyWebsResolvedProduct(payload: unknown): AyWebsResolvedProduct {
  if (!isRecord(payload) || !str(payload.product_id).trim() || !str(payload.title).trim()) {
    throw malformed('fiche produit');
  }
  const availability = isRecord(payload.availability) ? payload.availability : {};
  const pricing = isRecord(payload.ayrovi_pricing) ? payload.ayrovi_pricing : null;
  const breakdown = pricing && isRecord(pricing.breakdown) ? pricing.breakdown : null;
  return {
    productId: str(payload.product_id),
    storeId: str(payload.store_id),
    storeName: str(payload.store_name),
    sourceUrl: str(payload.source_url),
    sourceDomain: str(payload.source_domain),
    title: str(payload.title),
    brand: str(payload.brand),
    images: strList(payload.images),
    price: numOrNull(payload.price),
    currency: str(payload.currency),
    priceVerified: bool(payload.price_verified),
    currencyVerified: bool(payload.currency_verified),
    availability: {
      state: str(availability.state),
      reason: str(availability.reason),
      checkedAt: str(availability.checked_at),
      source: str(availability.source),
      quantityHint: numOrNull(availability.quantity_hint),
    },
    purchaseMode: str(payload.purchase_mode),
    integrationType: str(payload.integration_type),
    ayroviPricing: pricing
      ? {
        totalTnd: numOrNull(pricing.total_tnd),
        pricingVersion: numOrNull(pricing.pricing_version),
        breakdown: breakdown
          ? {
            convertedSourcePrice: numOrNull(breakdown.converted_source_price),
            shipping: numOrNull(breakdown.shipping),
            customs: numOrNull(breakdown.customs),
            serviceFee: numOrNull(breakdown.service_fee),
            other: numOrNull(breakdown.other),
          }
          : null,
      }
      : null,
    variantGroups: variantGroupList(payload.variant_groups),
    variantDetails: variantOptionList(payload.variant_details),
    fromCache: bool(payload.from_cache),
    cacheAgeMs: numOrNull(payload.cache_age_ms),
  };
}

/* ── النداءات ──────────────────────────────────────────────────────────────── */

export interface AyWebsSessionOptions extends RequestOptions {
  /** معرّف جلسة AYWEBs — إلزامي: الخادم يرفض بلاها. */
  sessionId: string;
}

const sessionHeaders = (sessionId: string): Record<string, string> => ({ 'x-session-id': sessionId });

export async function analyzeAyWebsPage(url: string, options: AyWebsSessionOptions): Promise<AyWebsPageAnalysis> {
  const data = await apiSendData<unknown>('POST', `${AYWEBS_BASE}/page/analyze`, {
    body: { url },
    headers: sessionHeaders(options.sessionId),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  return parseAyWebsPageAnalysis(data);
}

export interface ResolveAyWebsProductOptions extends AyWebsSessionOptions {
  /** من التحليل: يمنع تحليل ثاني ويوجّه القارئ للمتجر الصحيح. */
  storeId?: string;
  quantity?: number;
  /** إعادة قراءة طازجة بطلب صريح من المستعمل. */
  refresh?: boolean;
}


export async function fetchAyWebsStores(options: RequestOptions = {}): Promise<AyWebsStore[]> {
  const data = await apiGetData<unknown>(`${AYWEBS_BASE}/stores`, options);
  return parseAyWebsStores(data);
}


/* ── سكريبت الكابتشر + الجسر (WebView) ─────────────────────────────────────── */

export const AYWEBS_CAPTURE_SCRIPT_PATH = '/api/v1/aywebs/capture/script.js';

/** نفس المهلة متاع `Cache-Control: public, max-age=300` متاع الخادم. */
const CAPTURE_SCRIPT_TTL_MS = 5 * 60_000;
let captureScriptCache: { text: string; fetchedAt: number } | null = null;

/**
 * يقرا سكريبت الكابتشر من الخادم (يُحقن في صفحة المتجر داخل WebView).
 *
 * السكريبت **يجي من الخادم**، موش مدمج في التطبيق: كي يتبدّل sélecteur في
 * متجر، التصليح يخرج كتحديث خادم بلا نسخة تطبيق جديدة. مخزّن 5 دقائق (نفس
 * مهلة الـ cache متاع الخادم) باش ما نطلبوهش مع كل صفحة.
 */
export async function fetchAyWebsCaptureScript(options: RequestOptions = {}): Promise<string> {
  const now = Date.now();
  if (captureScriptCache && now - captureScriptCache.fetchedAt < CAPTURE_SCRIPT_TTL_MS) {
    return captureScriptCache.text;
  }
  const text = await apiGetText(AYWEBS_CAPTURE_SCRIPT_PATH, options);
  captureScriptCache = { text, fetchedAt: Date.now() };
  return text;
}

/** للاختبارات: تُفرّغ الذاكرة. */
export function resetAyWebsCaptureScriptCache(): void {
  captureScriptCache = null;
}

/**
 * حدّ صحي على جسر WebView (بالرموز — أصغر من العدّ بالبايتات، فما نسمحوش
 * بزيادة صامتة). الحدّ الحقيقي ملك الخادم: `AYWEBS_CAPTURE_LIMITS.maxBytes`.
 */
export const AYWEBS_CAPTURE_MESSAGE_MAX_CHARS = 64_000;

/**
 * يبني جافاسكريبت الحقن من نصّ السكريبت.
 *
 * السكريبت تعبير ES5 يرجّع نصّ JSON؛ نغلّفو باش نبعثوه للجسر، وكل غلطة
 * تولّي رسالة صريحة (`__aywebs_error`) — كي ما يجي شي، الشاشة تعرف وتقول
 * «ما نجّمناش نقراو الصفحة»، موش تبقى تستنّى للأبد.
 */
export function buildAyWebsCaptureInjection(script: string): string {
  if (!script || !script.trim()) {
    throw new ApiError('malformed', 'Script de capture vide : rien à injecter');
  }
  return [
    '(function () {',
    '  try {',
    '    var payload = (' + script + ');',
    "    window.ReactNativeWebView.postMessage(String(payload));",
    '  } catch (error) {',
    "    window.ReactNativeWebView.postMessage(JSON.stringify({ __aywebs_error: String((error && error.message) || error) }));",
    '  }',
    '})(); true;',
  ].join('\n');
}

export type AyWebsCaptureMessage =
  | { ok: true; capture: Record<string, unknown> }
  | { ok: false; reason: 'EMPTY' | 'TOO_LARGE' | 'NOT_JSON' | 'NOT_OBJECT' | 'SCRIPT_ERROR' };

/**
 * يقرا رسالة الجسر. ما نحكموش على المحتوى — الخادم هو الحاكم — غير نتأكّدو
 * أنها كائن JSON في حدود المعقول، ونفرّقو غلطة السكريبت عن غلطة الشكل.
 */
export function parseAyWebsCaptureMessage(raw: unknown): AyWebsCaptureMessage {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { ok: false, reason: 'EMPTY' };
  if (text.length > AYWEBS_CAPTURE_MESSAGE_MAX_CHARS) return { ok: false, reason: 'TOO_LARGE' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'NOT_JSON' };
  }
  if (!isRecord(parsed)) return { ok: false, reason: 'NOT_OBJECT' };
  if (typeof parsed.__aywebs_error === 'string') return { ok: false, reason: 'SCRIPT_ERROR' };
  return { ok: true, capture: parsed };
}

/* ── قراءة المنتوج بكابتشر العميل ──────────────────────────────────────────── */

export interface AyWebsCaptureVerdict {
  used: boolean;
  fingerprint: string;
  priceSource: string;
  corroborated: boolean;
  rejection: string;
}

export interface AyWebsResolveOutcome {
  product: AyWebsResolvedProduct;
  /** قرار الخادم في الكابتشر — `null` كي ما تجاش كابتشر مع الطلب. */
  capture: AyWebsCaptureVerdict | null;
  /** سبب رفض مبلغ مقروء (Phase 0) — يتعرض كما هو، بلا تفسير. */
  priceRejection: string | null;
  /**
   * ما نقص باش الطلب يولي كامل (أسماء الحقول). الخادم يقولو بصراحة، والعرض
   * يستعملها باش ما يوعدش بالّي ما ينجّمش.
   */
  missing: string[];
  /**
   * فاتورة السعر الموقّعة. تُعاد كما هي إلى `POST /cart/items` باش الإضافة ما
   * تعاودش تقرا صفحة التاجر (15–22 ثانية → ميلي ثواني). الخادم يبقى الحاكم:
   * فاتورة باطلة ولا قديمة ⇒ قراءة كاملة من جديد.
   */
  quoteToken: string;
}

/**
 * `POST /product/resolve` بكابتشر العميل.
 *
 * نبعثو `capture` كما رجّعها السكريبت **بلا أي تصرّف**: لا تعديل لا تلخيص.
 * الخادم هو اللي يقبل/يرفض ويحسب السعر — وهنا نقراو قراره باش نعرضوه.
 */
export async function resolveAyWebsProductWithCapture(
  url: string,
  options: AyWebsSessionOptions & { storeId?: string; quantity?: number; refresh?: boolean; capture?: unknown },
): Promise<AyWebsResolveOutcome> {
  const body: Record<string, unknown> = { url };
  if (options.storeId) body.store_id = options.storeId;
  if (typeof options.quantity === 'number' && options.quantity > 0) body.quantity = options.quantity;
  if (options.refresh === true) body.refresh = true;
  if (options.capture !== undefined && options.capture !== null) body.capture = options.capture;
  const envelope = await apiSendEnvelope<Record<string, unknown>>('POST', `${AYWEBS_BASE}/product/resolve`, {
    body,
    headers: sessionHeaders(options.sessionId),
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? AYWEBS_RESOLVE_TIMEOUT_MS,
  });

  const product = parseAyWebsResolvedProduct(envelope.data);
  const rawCapture = isRecord(envelope.capture) ? envelope.capture : null;
  return {
    product,
    capture: rawCapture
      ? {
        used: bool(rawCapture.used),
        fingerprint: str(rawCapture.fingerprint),
        priceSource: str(rawCapture.price_source),
        corroborated: bool(rawCapture.corroborated),
        rejection: str(rawCapture.rejection),
      }
      : null,
    priceRejection: typeof envelope.price_rejection === 'string' ? envelope.price_rejection : null,
    missing: strList(envelope.missing),
    quoteToken: str(envelope.quote_token),
  };
}

/**
 * نفس النداء، بلا كابتشر: يرجّع البطاقة وحدها.
 * (`resolveAyWebsProductWithCapture` هي المصدر الوحيد للنداء — لا نسختين.)
 */
export async function resolveAyWebsProduct(
  url: string,
  options: ResolveAyWebsProductOptions,
): Promise<AyWebsResolvedProduct> {
  return (await resolveAyWebsProductWithCapture(url, options)).product;
}

/* ══════════════════════════════════════════════════════════════════════════ *
 * P3 — الشريحة 3: الخيارات، التوفّر، سلّة AYWEBs، والجسر إلى سلّة AYROVI.
 *
 * قواعد ثابتة (من الأمر الهندسي الدائم `docs/AYWEBS_ADD_TO_CART_ORDER.md`):
 *  • «Add to Cart» = عملية إضافة حقيقية، موش فتح صفحة. والاختيار يجي فوق صفحة
 *    التاجر، والمستعمل **ما يخرجش** من المتجر.
 *  • العميل يبعث **نيّة** فقط: لا سعر، لا عملة، لا حالة، لا توفّر. الخادم يعيد
 *    قراءة كل شي ويحسب الثمن (`price_snapshot` ملزوق بالسطر، §45).
 *  • الكمية **تُضبط** (رقم مطلق)، ما تتجمعش أبداً — نفس القاعدة في الجسر.
 *  • «غير جاهز» يتقال بالسبب: زر ما ينجمش ينجح ما يتفعّلش.
 * ══════════════════════════════════════════════════════════════════════════ */

/* ── الخيارات ─────────────────────────────────────────────────────────────── */

export interface AyWebsVariantGroup {
  attribute: string;
  values: string[];
}

export interface AyWebsVariantOption {
  sourceVariantId: string;
  attributes: Record<string, string>;
  label: string;
  /** السعر المنشور من التاجر لهذا الخيار (قد لا يكون منشوراً). */
  price: number | null;
  currency: string;
  quotedPrice: number | null;
  quotedCurrency: string;
  /** `VARIANT` (سعر خاص بالخيار) أو `PRODUCT` (سعر المنتوج) أو `UNKNOWN`. */
  priceSource: string;
  availability: string;
  availabilityReason: string;
  image: string;
  /** السعر بالدينار لهذا الخيار — يصدر من الخادم، `null` كي ما حسبش. */
  totalTnd: number | null;
}

/** مفتاح الخصائص كما يفهمه الخادم: حروف صغيرة، بلا فراغات ولا محارف غريبة. */
const attributeKey = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);

const attributesOf = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const name = attributeKey(rawKey);
    const text = typeof rawValue === 'string' ? rawValue.trim().slice(0, 120) : '';
    if (name && text) out[name] = text;
  }
  return out;
};

/** مفتاح الهوية: نفس حساب الخادم (`ayWebsVariantKey`) — ترتيب ثم قيمة صغيرة. */
export function ayWebsVariantKey(attributes: Record<string, string> | null | undefined): string {
  if (!attributes) return '';
  return Object.keys(attributes)
    .sort()
    .map((key) => `${key}:${String(attributes[key] ?? '').trim().toLowerCase()}`)
    .join('|');
}

export function parseAyWebsVariantOption(entry: unknown): AyWebsVariantOption {
  if (!isRecord(entry)) throw malformed('option de variante');
  const pricing = isRecord(entry.ayrovi_pricing) ? entry.ayrovi_pricing : null;
  return {
    sourceVariantId: str(entry.source_variant_id),
    attributes: attributesOf(entry.attributes),
    label: str(entry.label),
    price: numOrNull(entry.price),
    currency: str(entry.currency),
    quotedPrice: numOrNull(entry.quoted_price),
    quotedCurrency: str(entry.quoted_currency),
    priceSource: str(entry.price_source),
    availability: str(entry.availability),
    availabilityReason: str(entry.availability_reason),
    image: str(entry.image),
    totalTnd: pricing ? numOrNull(pricing.total_tnd) : null,
  };
}

/* قائمة اختيارية: مفتاح غايب = «ما عندناش» (قائمة فارغة)، أمّا كائن/نصّ في
   بلاصة قائمة = عقد مكسور ⇒ خطأ بصوت عالي. الصمت ما يولّدش شاشة ناقصة. */
function variantGroupList(value: unknown): AyWebsVariantGroup[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw malformed('groupes de variantes');
  return value.map((group) => {
    if (!isRecord(group) || !str(group.attribute)) throw malformed('groupe de variantes');
    return { attribute: str(group.attribute), values: strList(group.values) };
  });
}

function variantOptionList(value: unknown): AyWebsVariantOption[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw malformed('options de variantes');
  return value.map(parseAyWebsVariantOption);
}

export interface AyWebsVariantsPayload {
  productId: string;
  storeId: string;
  sourceUrl: string;
  variantGroups: AyWebsVariantGroup[];
  variants: AyWebsVariantOption[];
  /** الخادم يقول: التاجر ينشر خصائص ⇒ الاختيار إلزامي. */
  selectionRequired: boolean;
  availability: string;
  availabilityReason: string;
  resolvedAt: string;
}

export function parseAyWebsVariants(payload: unknown): AyWebsVariantsPayload {
  if (!isRecord(payload) || !str(payload.product_id).trim()) throw malformed('variantes');
  return {
    productId: str(payload.product_id),
    storeId: str(payload.store_id),
    sourceUrl: str(payload.source_url),
    variantGroups: variantGroupList(payload.variant_groups),
    variants: variantOptionList(payload.variants),
    selectionRequired: bool(payload.selection_required),
    availability: str(payload.availability),
    availabilityReason: str(payload.availability_reason),
    resolvedAt: str(payload.resolved_at),
  };
}

/**
 * بطاقات الخيارات من الخادم (`POST /product/variants`).
 *
 * نداء **أفضل جهد** كما في الويب: فشلو ما يمنعش فتح الورقة — البيانات اللي
 * عندنا من `product/resolve` تكفي، وما ندّعوش اللي ما عندناش.
 */
export async function fetchAyWebsVariants(
  input: { productId?: string; url?: string; storeId?: string },
  options: AyWebsSessionOptions,
): Promise<AyWebsVariantsPayload> {
  const body: Record<string, unknown> = {};
  if (input.productId) body.product_id = input.productId;
  if (input.url) body.url = input.url;
  if (input.storeId) body.store = input.storeId;
  const data = await apiSendData<unknown>('POST', `${AYWEBS_BASE}/product/variants`, {
    body,
    headers: sessionHeaders(options.sessionId),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  return parseAyWebsVariants(data);
}

export interface AyWebsAvailabilityReading {
  productId: string;
  availability: AyWebsAvailability;
  variant: Record<string, string> | null;
  /** قراءة محفوظة ⇒ «ما تتأكّدش لحظة الشراء» (§51) — نقولوها، ما نغطّيوهاش. */
  fromCache: boolean;
}

export async function fetchAyWebsAvailability(
  productId: string,
  options: AyWebsSessionOptions & { variant?: Record<string, string> },
): Promise<AyWebsAvailabilityReading> {
  const query = options.variant && Object.keys(options.variant).length
    ? `?variant=${encodeURIComponent(Object.entries(options.variant).map(([key, value]) => `${key}:${value}`).join(','))}`
    : '';
  const data = await apiGetData<unknown>(
    `${AYWEBS_BASE}/product/${encodeURIComponent(productId)}/availability${query}`,
    { signal: options.signal, timeoutMs: options.timeoutMs },
  );
  if (!isRecord(data) || !str(data.product_id)) throw malformed('disponibilité');
  const availability = isRecord(data.availability) ? data.availability : {};
  return {
    productId: str(data.product_id),
    availability: {
      state: str(availability.state),
      reason: str(availability.reason),
      checkedAt: str(availability.checked_at),
      source: str(availability.source),
      quantityHint: numOrNull(availability.quantity_hint),
    },
    variant: isRecord(data.variant) ? attributesOf(data.variant) : null,
    fromCache: bool(data.from_cache),
  };
}

/* ── هل الإضافة ممكنة؟ (نفس شروط الخادم، بلا تقليد أعمى) ───────────────────── */

export type AyWebsAddBlockCode =
  | 'VARIANT_REQUIRED'
  | 'VARIANT_UNKNOWN'
  | 'VARIANT_UNAVAILABLE'
  | 'OUT_OF_STOCK'
  | 'STOCK_UNKNOWN'
  | 'PRICE_UNAVAILABLE'
  | '';

export interface AyWebsAddReadiness {
  ready: boolean;
  /** فارغ = جاهز. غير ذلك: نفس رمز الخادم اللي كان باش يرفض الإضافة. */
  code: AyWebsAddBlockCode;
  /** الخصائص المطلوبة اللي مازال ما تخيّرتش (بالأسماء كما نشرها التاجر). */
  missingAttributes: string[];
  /** التوفّر اللي باش يوصلو الخادم بعد هذا الاختيار. */
  availability: string;
  /** السعر بالدينار للاختيار الحالي — رقم الخادم، `null` كي ما حسبش. */
  quotedTotalTnd: number | null;
}

/**
 * يجيب قرار «الاختيار الحالي جاهز للإضافة؟» بلا ما يبعث شي.
 *
 * المنطق محاكاة دقيقة لـ `selectVariant()` في `src/aywebs/cart.ts`:
 *  1. التاجر ينشر مجموعات ⇒ كل مجموعة منها إلزامية (`VARIANT_REQUIRED`).
 *  2. تركيبة غير منشورة ⇒ `VARIANT_UNKNOWN` (بلا استبدال صامت).
 *  3. خيار غير متوفّر ⇒ `VARIANT_UNAVAILABLE`؛ توفّر مجهول ⇒ `STOCK_UNKNOWN`
 *     (الخادم يرفض الإضافة على توفّر مجهول — نقولوها قبل، موش بعد).
 *  4. بلا سعر من الخادم ⇒ `PRICE_UNAVAILABLE`.
 *
 * هكذا «Add to Cart» يتفعّل كان وقت اللي الخادم فعلاً يقبل — والسبب يتقال
 * بالكلمات كي ما يتفعّلش.
 */
export function ayWebsAddReadiness(input: {
  groups: AyWebsVariantGroup[];
  options: AyWebsVariantOption[];
  productAvailability: string;
  /** سعر المنتوج بالدينار من الخادم (بلا خيار محدّد). */
  productQuotedTnd: number | null;
  /** الاختيار الحالي: خاصية → قيمة (كما نشرها التاجر). */
  selection: Record<string, string>;
}): AyWebsAddReadiness {
  const selection = attributesOf(input.selection);
  const groups = input.groups.filter((group) => group.values.length > 0 && attributeKey(group.attribute));
  const missingAttributes = groups
    .filter((group) => !selection[attributeKey(group.attribute)])
    .map((group) => group.attribute);

  const base: AyWebsAddReadiness = {
    ready: false,
    code: '',
    missingAttributes,
    availability: input.productAvailability,
    quotedTotalTnd: input.productQuotedTnd,
  };

  if (groups.length && missingAttributes.length) {
    return { ...base, code: 'VARIANT_REQUIRED' };
  }
  if (!groups.length) {
    return finalizeReadiness(base, input.productAvailability, input.productQuotedTnd);
  }

  const publishedKeys = new Set<string>();
  for (const group of groups) publishedKeys.add(attributeKey(group.attribute));
  for (const option of input.options) for (const key of Object.keys(option.attributes)) publishedKeys.add(key);

  const matching: Record<string, string> = {};
  for (const [key, value] of Object.entries(selection)) if (publishedKeys.has(key)) matching[key] = value;

  const wanted = ayWebsVariantKey(matching);
  const match = wanted
    ? input.options.find((option) => ayWebsVariantKey(option.attributes) === wanted) || null
    : null;

  if (!match) return { ...base, code: 'VARIANT_UNKNOWN' };

  const availability = match.availability || 'UNKNOWN';
  if (availability === 'OUT_OF_STOCK') {
    return { ...base, code: 'VARIANT_UNAVAILABLE', availability };
  }
  return finalizeReadiness(
    { ...base, availability },
    availability,
    match.totalTnd ?? input.productQuotedTnd,
  );
}

function finalizeReadiness(
  draft: AyWebsAddReadiness,
  availability: string,
  quotedTotalTnd: number | null,
): AyWebsAddReadiness {
  const withQuote = { ...draft, availability, quotedTotalTnd };
  if (availability === 'OUT_OF_STOCK') return { ...withQuote, code: 'OUT_OF_STOCK' };
  if (availability !== 'AVAILABLE' && availability !== 'LOW_STOCK') {
    return { ...withQuote, code: 'STOCK_UNKNOWN' };
  }
  if (!(typeof quotedTotalTnd === 'number' && quotedTotalTnd > 0)) {
    return { ...withQuote, code: 'PRICE_UNAVAILABLE' };
  }
  return { ...withQuote, ready: true, code: '' };
}

/* ── سلّة AYWEBs ──────────────────────────────────────────────────────────── */

export interface AyWebsCartItem {
  id: string;
  itemNumber: string;
  productId: string;
  storeId: string;
  storeName: string;
  sourceUrl: string;
  title: string;
  images: string[];
  unitPrice: number | null;
  currency: string;
  variantLabel: string;
  quantity: number;
  availability: string;
  status: string;
  statusReason: string;
  customerNote: string;
  purchaseMode: string;
  checkoutReady: boolean;
  /** مجموع السطر بالدينار — من الخادم. */
  lineTotalTnd: number | null;
  /** `true` = نفس السطر موجود في سلّة AYROVI (جسر idempotent، بلا مضاعفة). */
  linkedToAyrovi: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface AyWebsCartGroup {
  storeId: string;
  storeName: string;
  integrationType: string;
  subtotalTnd: number | null;
  blockedItems: number;
  items: AyWebsCartItem[];
}

export interface AyWebsCartTotals {
  units: number;
  productSubtotalTnd: number | null;
  currency: string;
  blockedItems: number;
  checkoutReady: boolean;
  /** وحدات مازالت **موش** في سلّة AYROVI — العميل يجمع الزوز بلا ما يضاعف. */
  unlinkedUnits: number | null;
}

export interface AyWebsCartBlocker {
  itemId: string;
  code: string;
  message: string;
  action: string;
}

export interface AyWebsCart {
  /** `false` = ما فماش سلّة أصلاً (جلسة جديدة) — موش «سلّة فارغة». */
  hasCart: boolean;
  items: AyWebsCartItem[];
  groups: AyWebsCartGroup[];
  totals: AyWebsCartTotals;
  blockers: AyWebsCartBlocker[];
}

export function parseAyWebsCartItem(entry: unknown): AyWebsCartItem {
  if (!isRecord(entry) || !str(entry.id)) throw malformed('ligne de panier');
  return {
    id: str(entry.id),
    itemNumber: str(entry.item_number),
    productId: str(entry.product_id),
    storeId: str(entry.store_id),
    storeName: str(entry.store_name),
    sourceUrl: str(entry.source_url),
    title: str(entry.title),
    images: strList(entry.images),
    unitPrice: numOrNull(entry.unit_price),
    currency: str(entry.currency),
    variantLabel: str(entry.variant_label),
    quantity: numOrNull(entry.quantity) ?? 0,
    availability: str(entry.availability),
    status: str(entry.status),
    statusReason: str(entry.status_reason),
    customerNote: str(entry.customer_note),
    purchaseMode: str(entry.purchase_mode),
    checkoutReady: bool(entry.checkout_ready),
    lineTotalTnd: numOrNull(entry.line_total_tnd),
    linkedToAyrovi: typeof entry.linked_to_ayrovi === 'boolean' ? entry.linked_to_ayrovi : null,
    createdAt: str(entry.created_at),
    updatedAt: str(entry.updated_at),
  };
}

export function parseAyWebsCart(payload: unknown): AyWebsCart {
  if (!isRecord(payload)) throw malformed('panier');
  const totals = isRecord(payload.totals) ? payload.totals : {};
  const groups = payload.groups === undefined || payload.groups === null
    ? []
    : Array.isArray(payload.groups)
      ? payload.groups.map((group) => {
        if (!isRecord(group) || !str(group.store_id)) throw malformed('groupe de panier');
        return {
          storeId: str(group.store_id),
          storeName: str(group.store_name),
          integrationType: str(group.integration_type),
          subtotalTnd: numOrNull(group.subtotal_tnd),
          blockedItems: numOrNull(group.blocked_items) ?? 0,
          items: Array.isArray(group.items) ? group.items.map(parseAyWebsCartItem) : [],
        };
      })
      : (() => { throw malformed('groupes de panier'); })();
  const blockers = payload.blockers === undefined || payload.blockers === null
    ? []
    : Array.isArray(payload.blockers)
      ? payload.blockers.map((blocker) => {
        if (!isRecord(blocker)) throw malformed('blocage de panier');
        return {
          itemId: str(blocker.itemId ?? blocker.item_id),
          code: str(blocker.code),
          message: str(blocker.message),
          action: str(blocker.action),
        };
      })
      : (() => { throw malformed('blocages de panier'); })();
  return {
    hasCart: isRecord(payload.cart),
    items: payload.items === undefined || payload.items === null
      ? []
      : Array.isArray(payload.items)
        ? payload.items.map(parseAyWebsCartItem)
        : (() => { throw malformed('lignes de panier'); })(),
    groups,
    totals: {
      units: numOrNull(totals.units) ?? 0,
      productSubtotalTnd: numOrNull(totals.product_subtotal_tnd),
      currency: str(totals.currency),
      blockedItems: numOrNull(totals.blocked_items) ?? 0,
      checkoutReady: bool(totals.checkout_ready),
      unlinkedUnits: numOrNull(totals.unlinked_units),
    },
    blockers,
  };
}

export async function fetchAyWebsCart(options: AyWebsSessionOptions): Promise<AyWebsCart> {
  const data = await apiGetData<unknown>(`${AYWEBS_BASE}/cart`, {
    headers: sessionHeaders(options.sessionId),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  return parseAyWebsCart(data);
}

/* ── الإضافة، التعديل، الحذف، القبول، التحقّق، الجسر ─────────────────────── */

export interface AyWebsAddOutcome {
  item: AyWebsCartItem;
  cart: AyWebsCart;
  duplicate: boolean;
  idempotentReplay: boolean;
  /** `null` = الخادم ما رجّعش خبر الجسر (نسخة خادم قديمة) — ما نخمّنوش. */
  ayrovi: { linked: boolean; cartItemId: string | null; quantity: number | null; reason: string } | null;
  quoteUsed: boolean;
  sourceReread: boolean;
  rereadReason: string | null;
}

const parseAyroviLink = (raw: unknown): AyWebsAddOutcome['ayrovi'] => {
  if (!isRecord(raw)) return null;
  return {
    linked: bool(raw.linked),
    cartItemId: typeof raw.cart_item_id === 'string' ? raw.cart_item_id : null,
    quantity: numOrNull(raw.quantity),
    reason: str(raw.reason),
  };
};

/**
 * إضافة حقيقية للسطر (`POST /cart/items`).
 *
 * الجسم: هوية + كمية + اختيار + فاتورة السعر + الكابتشر (كي كان). **بلا سعر
 * وبلا عملة وبلا حالة** — الخادم يعيد قراءة كل شي ويحسب الثمن.
 * `requestId` ثابت لعملية الضغط هذي (يعاود يستعمل في إعادة المحاولة)، ويتغيّر
 * في كل عملية جديدة: هكذا إعادة الإرسال ما تولّدش سطراً ثاني (`idempotent_replay`).
 */
export async function addAyWebsCartItem(
  input: {
    productId?: string;
    sourceUrl?: string;
    storeId?: string;
    variant?: Record<string, string> | null;
    quantity?: number;
    customerNote?: string;
    capture?: unknown;
    quoteToken?: string;
    requestId: string;
  },
  options: AyWebsSessionOptions,
): Promise<AyWebsAddOutcome> {
  const body: Record<string, unknown> = { request_id: input.requestId };
  if (input.productId) body.product_id = input.productId;
  if (input.sourceUrl) body.source_url = input.sourceUrl;
  if (input.storeId) body.store_id = input.storeId;
  if (input.variant && Object.keys(input.variant).length) body.variant_attributes = input.variant;
  if (typeof input.quantity === 'number' && input.quantity > 0) body.quantity = input.quantity;
  if (input.customerNote) body.customer_note = input.customerNote;
  if (input.capture !== undefined && input.capture !== null) body.capture = input.capture;
  if (input.quoteToken) body.quote_token = input.quoteToken;

  const envelope = await apiSendEnvelope<Record<string, unknown>>('POST', `${AYWEBS_BASE}/cart/items`, {
    body,
    headers: sessionHeaders(options.sessionId),
    signal: options.signal,
    // الإضافة بلا فاتورة تعاود تقرا صفحة التاجر: نفس مهلة القراءة، بصراحة.
    timeoutMs: options.timeoutMs ?? AYWEBS_RESOLVE_TIMEOUT_MS,
  });
  const data = isRecord(envelope.data) ? envelope.data : null;
  if (!data) throw malformed('ajout au panier');
  return {
    item: parseAyWebsCartItem(data.item),
    cart: parseAyWebsCart(data.cart ?? envelope.cart),
    duplicate: bool(data.duplicate),
    idempotentReplay: bool(data.idempotent_replay),
    ayrovi: parseAyroviLink(data.ayrovi),
    quoteUsed: bool(data.quote_used),
    sourceReread: bool(data.source_reread),
    rereadReason: typeof data.reread_reason === 'string' ? data.reread_reason : null,
  };
}

/**
 * تعديل سطر: الكمية **رقم مطلق**، موش زيادة (`quantity: 3` = ثلاث قطع، موش +3).
 * الخادم يوصل نفس الرقم لسلّة AYROVI (مزامنة، بلا جمع) — وهذا اللي يمنع
 * المضاعفة اللي صارت في التطبيق القديم.
 */
export async function updateAyWebsCartItem(
  itemId: string,
  changes: { quantity?: number; variant?: Record<string, string> | null; customerNote?: string },
  options: AyWebsSessionOptions,
): Promise<{ item: AyWebsCartItem | null; removed: boolean; cart: AyWebsCart }> {
  const body: Record<string, unknown> = {};
  if (typeof changes.quantity === 'number') body.quantity = changes.quantity;
  if (changes.variant) body.variant_attributes = changes.variant;
  if (changes.customerNote !== undefined) body.customer_note = changes.customerNote;
  const envelope = await apiSendEnvelope<Record<string, unknown>>(
    'PATCH',
    `${AYWEBS_BASE}/cart/items/${encodeURIComponent(itemId)}`,
    { body, headers: sessionHeaders(options.sessionId), signal: options.signal, timeoutMs: options.timeoutMs },
  );
  const data = isRecord(envelope.data) ? envelope.data : {};
  return {
    item: isRecord(data.item) ? parseAyWebsCartItem(data.item) : null,
    removed: bool(data.removed),
    cart: parseAyWebsCart(data.cart ?? envelope.cart),
  };
}

export async function removeAyWebsCartItem(itemId: string, options: AyWebsSessionOptions): Promise<AyWebsCart> {
  const envelope = await apiSendEnvelope<Record<string, unknown>>(
    'DELETE',
    `${AYWEBS_BASE}/cart/items/${encodeURIComponent(itemId)}`,
    { headers: sessionHeaders(options.sessionId), signal: options.signal, timeoutMs: options.timeoutMs },
  );
  return parseAyWebsCart(envelope.cart);
}

/** §29: المستعمل يقبل السعر الجديد بنفسو. ما فماش قبول تلقائي. */
export async function acceptAyWebsCartPriceChange(
  itemId: string,
  options: AyWebsSessionOptions,
): Promise<{ item: AyWebsCartItem; cart: AyWebsCart }> {
  const envelope = await apiSendEnvelope<Record<string, unknown>>(
    'POST',
    `${AYWEBS_BASE}/cart/items/${encodeURIComponent(itemId)}/accept-price`,
    { body: {}, headers: sessionHeaders(options.sessionId), signal: options.signal, timeoutMs: options.timeoutMs },
  );
  const data = isRecord(envelope.data) ? envelope.data : {};
  return { item: parseAyWebsCartItem(data.item), cart: parseAyWebsCart(envelope.cart) };
}

export interface AyWebsCartChange {
  itemId: string;
  code: string;
  message: string;
}

/** §18/§29/§30: recontrôle السعر والخيارات. `recheckSource` = قراءة جديدة من التاجر. */
export async function verifyAyWebsCart(
  options: AyWebsSessionOptions & { recheckSource?: boolean },
): Promise<{ changes: AyWebsCartChange[]; cart: AyWebsCart }> {
  const envelope = await apiSendEnvelope<Record<string, unknown>>('POST', `${AYWEBS_BASE}/cart/verify`, {
    body: { recheck_source: options.recheckSource === true },
    headers: sessionHeaders(options.sessionId),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  const data = isRecord(envelope.data) ? envelope.data : {};
  const changes = Array.isArray(data.changes)
    ? data.changes.filter(isRecord).map((change) => ({
      itemId: str(change.itemId ?? change.item_id),
      code: str(change.code),
      message: str(change.message),
    }))
    : [];
  return { changes, cart: parseAyWebsCart(envelope.cart) };
}

export interface AyWebsBridgeOutcome {
  moved: Array<{
    aywebsItemId: string; aywebsItemNumber: string; cartItemId: string; store: string;
    title: string; quantity: number; priceTnd: number | null; duplicate: boolean; synced: boolean;
  }>;
  skipped: Array<{ aywebsItemId: string; code: string; message: string }>;
  totalItemsCount: number;
  totalTnd: number | null;
  message: string;
}

/**
 * الجسر إلى سلّة AYROVI (`POST /cart/bridge-to-ayrovi`).
 *
 * الخادم يعيد التحقّق من المصدر قبل أي مزامنة؛ إذا لقى تغييراً يرجّع `409`
 * بالرمز `AYWEBS_SOURCE_VERIFICATION_REQUIRED` — والعرض يعرض السبب ويعاود
 * يقرا السلّة، ما يكمّلش على حالة قديمة.
 */
export async function bridgeAyWebsCartToAyrovi(
  options: AyWebsSessionOptions & { itemIds?: string[] },
): Promise<AyWebsBridgeOutcome> {
  const envelope = await apiSendEnvelope<Record<string, unknown>>('POST', `${AYWEBS_BASE}/cart/bridge-to-ayrovi`, {
    body: { item_ids: options.itemIds ?? [] },
    headers: sessionHeaders(options.sessionId),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  const data = isRecord(envelope.data) ? envelope.data : {};
  const moved = Array.isArray(data.moved) ? data.moved.filter(isRecord).map((line) => ({
    aywebsItemId: str(line.aywebsItemId ?? line.aywebs_item_id),
    aywebsItemNumber: str(line.aywebsItemNumber ?? line.aywebs_item_number),
    cartItemId: str(line.cartItemId ?? line.cart_item_id),
    store: str(line.store),
    title: str(line.title),
    quantity: numOrNull(line.quantity) ?? 0,
    priceTnd: numOrNull(line.priceTnd ?? line.price_tnd),
    duplicate: bool(line.duplicate),
    synced: bool(line.synced),
  })) : [];
  const skipped = Array.isArray(data.skipped) ? data.skipped.filter(isRecord).map((line) => ({
    aywebsItemId: str(line.aywebsItemId ?? line.aywebs_item_id),
    code: str(line.code),
    message: str(line.message),
  })) : [];
  return {
    moved,
    skipped,
    totalItemsCount: numOrNull(data.totalItemsCount ?? data.total_items_count) ?? 0,
    totalTnd: numOrNull(data.totalTnd ?? data.total_tnd),
    message: str(data.message),
  };
}

/** رمز «التحقّق من المصدر مطلوب» (409) — العرض يعرضه بالكلمات، ما يكمّلش. */
export const AYWEBS_SOURCE_VERIFICATION_REQUIRED = 'AYWEBS_SOURCE_VERIFICATION_REQUIRED';
