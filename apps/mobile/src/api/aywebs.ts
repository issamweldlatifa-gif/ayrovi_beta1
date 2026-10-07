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
import { apiGetData, apiSendData, type RequestOptions } from './client';
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
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

export async function resolveAyWebsProduct(
  url: string,
  options: ResolveAyWebsProductOptions,
): Promise<AyWebsResolvedProduct> {
  const body: Record<string, unknown> = { url };
  if (options.storeId) body.store_id = options.storeId;
  if (typeof options.quantity === 'number' && options.quantity > 0) body.quantity = options.quantity;
  if (options.refresh === true) body.refresh = true;
  const data = await apiSendData<unknown>('POST', `${AYWEBS_BASE}/product/resolve`, {
    body,
    headers: sessionHeaders(options.sessionId),
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? AYWEBS_RESOLVE_TIMEOUT_MS,
  });
  return parseAyWebsResolvedProduct(data);
}

export async function fetchAyWebsStores(options: RequestOptions = {}): Promise<AyWebsStore[]> {
  const data = await apiGetData<unknown>(`${AYWEBS_BASE}/stores`, options);
  return parseAyWebsStores(data);
}
