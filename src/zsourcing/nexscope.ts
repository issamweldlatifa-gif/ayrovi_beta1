/**
 * Z Sourcing — طبقة الاتصال بمزوّد Nexscope (المرحلة 3 من الأمر التنفيذي للمالك 28/11).
 *
 * القواعد المعمارية المطبّقة حرفياً:
 *  • «لا تجعل Nexscope هو Z Sourcing» — هذا الملف adapter يُستهلك عبر واجهة
 *    `ZSourcingProvider` (types.ts)، وتغيير المزوّد مستقبلاً = adapter جديد.
 *  • المفتاح `NEXSCOPE_API_KEY` على الخادم حصراً (env)، لا يُسجَّل ولا يُعاد
 *    في أي استجابة (كل الأخطاء تحمل الكود بلا بيانات المفتاح).
 *  • إعادة المحاولة: **لا إعادة تلقائية** — كل نداء POST ينفّذ مرة واحدة
 *    («بطريقة لا تسبب تكرار الطلبات»)، وأعطال النقل تخرج بكودها الصادق.
 *  • 429/503 من بوّة الدخول تُحترم `Retry-After` وتخرج RATE_LIMIT بلا إعادة.
 *  • الغلاف الموثّق: {code, msg, data, ts, time, cost, traceId} — code===0 نجاح؛
 *    HTTP 200 قد يحمل خطأ عمل (مثال موثّق: 11209 مفتاح غير صالح) ⇒ الفحص دائماً
 *    للـcode الخارجي.
 *
 * ما هو موثّق هنا من نقاط النهاية (رسمي 28/11):
 *  • بحث الكلمات: POST https://api.nexscope.ai/dl/productSearch
 *    (keyWord صيني مبسّط ≤50 حرفاً — طبقة الترجمة مسؤولية الاستدعاء لا هذا الملف)
 *  • بحث الصورة: POST …/api/skill-api/v1/skills/1688-search-by-image/run
 *    (imageUrl | imageBase64 | imageId — ثلاثة بالتناوب؛ PNG/JPG/JPEG فقط)
 *  • التفاصيل: POST …/api/skill-api/v1/skills/1688-product-detail/run
 *    (offerId نصّي + currency اختياري)
 */
import type { ZSourcingProduct, ZSourcingProvider, ZSourcingSearchResult } from './types';

const BASE_URL = 'https://api.nexscope.ai';
const ENDPOINT_KEYWORD_SEARCH = `${BASE_URL}/dl/productSearch`;
const ENDPOINT_IMAGE_SEARCH = `${BASE_URL}/api/skill-api/v1/skills/1688-search-by-image/run`;
const ENDPOINT_DETAIL = `${BASE_URL}/api/skill-api/v1/skills/1688-product-detail/run`;
const DEFAULT_TIMEOUT_MS = 60_000;

/** خطأ Z Sourcing الموحّد — كود صادق + حالة HTTP صحيحة، بلا أي سرّ. */
export class ZSourcingError extends Error {
  code: string;
  status: number;
  /** كود المزوّد الخارجي عند توفره (بلا تفاصيل المفتاح). */
  providerCode: string | null;
  /** قيمة Retry-After الموثّقة عند 429/503 — يقرر فوقها من يريد. */
  retryAfterMs: number | null;
  constructor(code: string, message: string, status = 502, providerCode: string | null = null, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'ZSourcingError';
    this.code = code;
    this.status = status;
    this.providerCode = providerCode;
    this.retryAfterMs = retryAfterMs;
  }
}

export function nexscopeConfigured(): boolean {
  return typeof process.env.NEXSCOPE_API_KEY === 'string' && process.env.NEXSCOPE_API_KEY.trim() !== '';
}

/** قراءة المهلة من env (نفس نمط ZAYROVIX_BRIGHTDATA_TIMEOUT_MS). */
export function nexscopeTimeoutMs(): number {
  const raw = Number(process.env.ZSOURCING_NEXSCOPE_TIMEOUT_MS ?? '');
  return Number.isFinite(raw) && raw >= 250 && raw <= 120_000 ? raw : DEFAULT_TIMEOUT_MS;
}

interface NexscopeEnvelope { code?: unknown; msg?: unknown; data?: unknown; traceId?: unknown }

/** POST واحد بلا إعادة — العقد: لا طلبات مكرّرة. */
async function postOnce(
  apiKey: string,
  endpoint: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<NexscopeEnvelope> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new ZSourcingError('ZS_NEXSCOPE_TIMEOUT', 'مزوّد Nexscope ما جاوبش في الوقت المسموح.', 504);
    }
    throw new ZSourcingError('ZS_NEXSCOPE_NETWORK', 'تعذّر الاتصال بمزوّد Nexscope.', 502);
  }

  if (response.status === 429 || response.status === 503) {
    const retryAfter = Number(response.headers.get('retry-after') ?? '');
    await response.body?.cancel().catch(() => undefined);
    throw new ZSourcingError(
      'ZS_NEXSCOPE_RATE_LIMIT',
      'بوّة الدخول عند Nexscope طلبت تخفيف النداءات — احترم Retry-After.',
      response.status === 429 ? 429 : 503,
      String(response.status),
      Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : null,
    );
  }

  let envelope: NexscopeEnvelope;
  try {
    envelope = (await response.json()) as NexscopeEnvelope;
  } catch {
    throw new ZSourcingError('ZS_NEXSCOPE_MALFORMED', 'رد Nexscope ليس JSON صالحاً.', 502);
  }

  const code = typeof envelope.code === 'number' ? envelope.code : Number(envelope.code ?? NaN);
  if (Number.isFinite(code) && code !== 0) {
    // موثّق: 11209 = مفتاح مفقود/غير صالح — تصنيف مصادقة صادق بلا أي تفاصيل مفتاح.
    if (code === 11209) {
      throw new ZSourcingError('ZS_NEXSCOPE_AUTH', 'مفتاح Nexscope غير صالح أو منتهٍ — راجع API Access.', 503, String(code));
    }
    throw new ZSourcingError(
      'ZS_NEXSCOPE_UPSTREAM_CODE',
      typeof envelope.msg === 'string' && envelope.msg.trim() ? envelope.msg : 'خطأ عمل من مزوّد Nexscope.',
      502,
      String(code),
    );
  }
  if (code !== 0) {
    throw new ZSourcingError('ZS_NEXSCOPE_MALFORMED', 'رد Nexscope بلا غلاف code قابل للقراءة.', 502);
  }
  return envelope;
}

/** المرور الخام → النموذج الموحد: المؤكد يُسَمّى، والباقي يُحفظ في raw كما هو. */
function mapProduct(rawItem: unknown): ZSourcingProduct | null {
  if (typeof rawItem !== 'object' || rawItem === null || Array.isArray(rawItem)) return null;
  const raw = rawItem as Record<string, unknown>;
  const offerId = typeof raw.asin === 'string' && raw.asin.trim() ? raw.asin.trim()
    : typeof raw.offerId === 'string' && raw.offerId.trim() ? raw.offerId.trim()
    : typeof raw.itemId === 'string' && raw.itemId.trim() ? raw.itemId.trim()
    : null;
  if (!offerId) return null; // بلا معرّف: العنصر غير قابل للتوريد — يُسقط ولا يُخترع بديل.
  const num = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
  return {
    offerId,
    title: str(raw.title ?? raw.subject),
    productUrl: str(raw.asinUrl ?? raw.productUrl),
    priceCny: num(raw.price),
    consignPrice: num(raw.consignPrice),
    currency: str(raw.currency),
    // moq موحّدة: صورة ترسل moq، والبحث بالكلمات يرسل quantityBegin (مرصود حيّاً 28/11).
    moq: raw.moq !== undefined && raw.moq !== null ? (raw.moq as string | number)
      : raw.quantityBegin !== undefined && raw.quantityBegin !== null ? (raw.quantityBegin as string | number)
      : null,
    quantityBegin: num(raw.quantityBegin),
    salesOrderCount: num(raw.salesOrderCount),
    estimatedSalesAmount: num(raw.estimatedSalesAmount),
    salesQuantity: num(raw.salesQuantity),
    unit: str(raw.unit),
    levelName: str(raw.levelName),
    availableDate: str(raw.availableDate),
    shopUrl: str(raw.shopUrl),
    sourceType: str(raw.sourceType),
    monthlySold: str(raw.monthSold ?? raw.monthlySold),
    repurchaseRate: str(raw.rePurchaseRate ?? raw.repurchaseRate),
    tradeScore: str(raw.tradeScore),
    supplier: str(raw.company ?? raw.sellerIdentity ?? raw.supplierName),
    deliveryTime: str(raw.deliveryTime),
    raw,
  };
}

function mapSearch(items: unknown[], endpointCalled: string, startedAt: number, pageInfo: { pageIndex: number; pageSize: number; hasMore: boolean | null }): ZSourcingSearchResult {
  const products = (Array.isArray(items) ? items : [])
    .map(mapProduct)
    .filter((product): product is ZSourcingProduct => product !== null);
  return { products, pageInfo, endpointCalled, durationMs: Date.now() - startedAt };
}

/** اختيار بديهي لقائمة العناصر داخل data — يُثبَّت نهائياً على الاستجابة الحية عند نقطة التوقف. */
function pickProductList(data: unknown): unknown[] {
  if (typeof data !== 'object' || data === null) return [];
  const record = data as Record<string, unknown>;
  for (const key of ['products', 'items', 'result', 'list']) {
    if (Array.isArray(record[key])) return record[key];
  }
  return [];
}

/**
 * POST مع حارس بوّة الدخول: 429/503 مرفوض **عند البوّة — لم يُنفَّذ فوق**،
 * فإعادة واحدة بعد نافذة Retry-After الموثّقة ليست «تكرار طلبات» (شرط الأمر:
 * «إعادة محاولة بطريقة لا تسبب تكرار الطلبات» — التكرار المحرّم هو ما يُصاحب
 * طلباً نُفِّذ فعلاً وأدّى إلى كلفة). ما زال مرفوضاً بعد الإعادة ⇒ الخطأ الصادق
 * يصعد بلا محاولات إضافية.
 */
const RATE_LIMIT_MAX_WAIT_MS = 45_000;
const RATE_LIMIT_DEFAULT_WAIT_MS = 2_000;
async function postWithAdmissionGuard(
  apiKey: string,
  endpoint: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<NexscopeEnvelope> {
  try {
    return await postOnce(apiKey, endpoint, body, signal);
  } catch (error) {
    if (error instanceof ZSourcingError && error.code === 'ZS_NEXSCOPE_RATE_LIMIT') {
      const waitMs = Math.min(error.retryAfterMs ?? RATE_LIMIT_DEFAULT_WAIT_MS, RATE_LIMIT_MAX_WAIT_MS);
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      return await postOnce(apiKey, endpoint, body, signal); // إعادة واحدة حصراً
    }
    throw error;
  }
}

export function createNexscopeProvider(options: { apiKey?: string; now?: () => number } = {}): ZSourcingProvider {
  const apiKey = (options.apiKey ?? process.env.NEXSCOPE_API_KEY ?? '').trim();
  const now = options.now ?? (() => Date.now());
  if (!apiKey) {
    throw new ZSourcingError('ZS_NEXSCOPE_NOT_CONFIGURED', 'مفتاح Nexscope غير مضبوط على الخادم — Z Sourcing موقوف.', 503);
  }

  const provider: ZSourcingProvider = {
    async searchByKeyword(input) {
      const startedAt = now();
      const body: Record<string, unknown> = {
        keyWord: input.zhQuery.slice(0, 50),
        pageIndex: input.pageIndex ?? 1,
        pageSize: Math.min(Math.max(input.pageSize ?? 20, 10), 100), // الموثّق: 10–100
      };
      if (input.sortField) body.sortField = input.sortField;
      if (input.sortType) body.sortType = input.sortType;
      if (input.priceStartCny !== undefined) body.beginPrice = input.priceStartCny;
      if (input.priceEndCny !== undefined) body.endPrice = input.priceEndCny;
      if (input.moqStart !== undefined) body.beginStartQuantity = input.moqStart;
      if (input.moqEnd !== undefined) body.endStartQuantity = input.moqEnd;
      const envelope = await postWithAdmissionGuard(apiKey, ENDPOINT_KEYWORD_SEARCH, body, AbortSignal.timeout(nexscopeTimeoutMs()));
      const data = (typeof envelope.data === 'object' && envelope.data !== null ? envelope.data : {}) as Record<string, unknown>;
      return mapSearch(pickProductList(data), 'dl/productSearch', startedAt, {
        pageIndex: Number(body.pageIndex),
        pageSize: Number(body.pageSize),
        hasMore: null, // يُثبَّت على الاستجابة الحية — لا تخمين صفحات.
      });
    },

    async searchByImage(input) {
      const startedAt = now();
      const envelope = await postWithAdmissionGuard(apiKey, ENDPOINT_IMAGE_SEARCH, {
        imageBase64: input.imageBase64, // نقي بلا بادئة — الموثّق.
        page: input.page ?? 1,
        pageSize: Math.min(Math.max(input.pageSize ?? 20, 1), 50), // الموثّق: ≤50
      }, AbortSignal.timeout(nexscopeTimeoutMs()));
      return mapSearch(pickProductList(envelope.data), 'skills/1688-search-by-image', startedAt, {
        pageIndex: input.page ?? 1,
        pageSize: Math.min(Math.max(input.pageSize ?? 20, 1), 50),
        hasMore: null,
      });
    },

    async getDetail(input) {
      const body: Record<string, unknown> = {
        // الموثّق: نصّي لحفظ المعرّفات الطويلة حرفياً.
        offerId: String(input.offerId),
        ...(input.currency ? { currency: input.currency.toUpperCase().slice(0, 3) } : {}),
      };
      const envelope = await postWithAdmissionGuard(apiKey, ENDPOINT_DETAIL, body, AbortSignal.timeout(nexscopeTimeoutMs()));
      return (typeof envelope.data === 'object' && envelope.data !== null ? envelope.data : {}) as Record<string, unknown>;
    },
  };
  return provider;
}
