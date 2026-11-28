/**
 * S Base — مزوّد Apify (1688) — خادم فقط.
 *
 * المفتاح (`APIFY_TOKEN`) ما يخرج من هنا أبداً: التطبيق ما يشوفش لا المفتاح
 * لا الـendpoints. كل نداء يمشي بـ`Authorization: Bearer` من الخادم.
 *
 * الحقائق أدناه مأخوذة من صفحات Apify (قُرأت 2026‑11‑26):
 *
 *  • كلمة/تفاصيل — actor `sourabhbgp/1688-scraper` ($3.99/1000 صفّ + $0.005/run):
 *      – بحث: `mode: 'search'` + `keywords[]` (إنجليزي أو صيني) + `sortType`
 *        (`normal` هو الموصى به) + `maxItems`. **بلا proxy**.
 *      – صفّ البحث الموثّق: offerId, title (إنجليزي), priceUsd, priceCny,
 *        minOrderQuantity, salesCount, supplierName, supplierYearsOnPlatform,
 *        isAd, url — والـREADME يقول إن الصف يضم صوراً.
 *      – تفاصيل: `mode: 'product_detail'` + `offerIds[]` (معرّف **ولا رابط**)
 *        + `includeSkuDetails` — **يحتاج proxy** (`proxyConfiguration.useApifyProxy`)
 *        وإلا ما يقراش صفحة المنتج (حدّ موثّق من الـactor).
 *      – صفّ التفاصيل الموثّق: priceCny, priceTiers (سلّم MOQ), currency:'CNY',
 *        minOrderQuantity, stock, specs (كائن), supplierName, url, و`variants[]`
 *        (لكل SKU: specAttributes, priceCny, stock, imageUrl, **weightGrams**
 *        وlengthCm/widthCm/heightCm) — الوزن والحجم **ضروريان لمحرّك السعر**.
 *
 *  • صورة — actor `topapi/image-search-1688-api` (Server actor، $0.20/1000
 *    نتيجة، **مجّاناً إذا 0 نتيجة**): POST واحد إلى
 *    `https://<user>--<actor>.apify.actor/search` بـ`{ imageBase64, maxResults,
 *    excludeAds }` — الردّ `{ ok, count, items[], meta }` والحقول الموثّقة:
 *    offerId, title, titleEn, detailUrl, image, price (CNY), currency:'CNY',
 *    minOrderQuantity, similarityScore, isAd, supplier.companyName.
 *    **حدّ موثّق**: جسم الطلب ≤ 1,000,000 بايت (صورة ≈ 700KB) — نضغط قبل الإرسال.
 *
 * الشكل: الـscraper run-based (POST /v2/acts/{actor}/runs ثم poll على
 * /v2/actor-runs/{runId} حتى SUCCEEDED ثم /v2/datasets/{datasetId}/items)،
 * وactor الصورة request واحد مباشر. الترجمة تُحفظ هنا: كل صفّ Apify يتحوّل إلى
 * **الشكل الداخلي المعروف** (شكل 1688 الموحّد) — هكذا طبقة الاستخراج
 * (`extract.ts`/`detail.ts`) والشاشة ما تتبدّلش إطلاقاً، وما نخترعش حقولاً:
 * كل حقل ناقص يبقى ناقصاً (`missing`).
 */
import sharp from 'sharp';

import { SbaseError } from './errors';
import { normalizeUploadedImage } from '../services/imageValidation';

export const APIFY_API_BASE = 'https://api.apify.com';
export const APIFY_DEFAULT_1688_ACTOR = 'sourabhbgp~1688-scraper';
export const APIFY_DEFAULT_IMAGE_ACTOR = 'topapi~image-search-1688-api';
/** صورة AliExpress: actor موثّق يقبل base64 — 0.02$/صورة، ومجّانية إذا 0 نتيجة/فشل. */
export const APIFY_DEFAULT_ALIEXPRESS_IMAGE_ACTOR = 'piotrv1001~aliexpress-image-search-scraper';
export const APIFY_ALIEXPRESS_IMAGE_COST_USD = 0.02;
export const APIFY_ALIEXPRESS_SHIP_TO = 'US';
export const APIFY_ALIEXPRESS_CURRENCY = 'USD';

/**
 * الأزمنة — مضبوطة على **القياس الحيّ** لا على التخمين (26/11/2026، خادم المالك):
 * صورة = 31 ثانية فعلياً، وبحث بالكلمة قارب 42 ثانية — السقوف القديمة (30/40 ثانية)
 * كانت تقطع نداءات **ناجحة** بينما الـrun عند المزوّد يكمل ويُحتسب. تفاصيل المنتج
 * تقرأ صفحة 1688 (15–90 ثانية للمنتج حسب الـREADME) فسقفها أوسع أصلاً.
 * تجاوز السقف يبقى APIFY_TIMEOUT صريحاً — الفشل يُقال، ولا يُتنكّر «لا نتائج».
 */
export const APIFY_TOTAL_TIMEOUT_MS = 90_000;
export const APIFY_DETAIL_TIMEOUT_MS = 100_000;
export const APIFY_IMAGE_TIMEOUT_MS = 75_000;
export const APIFY_POLL_INTERVAL_MS = 1_000;

/** أثمنة منشورة على صفحات Apify (قُرأت 2026‑11‑26) — للمعلومة، موش للفاتورة. */
export const APIFY_PRICE_PER_1000_RESULTS_USD = 3.99;
export const APIFY_RUN_FEE_USD = 0.005;
export const APIFY_IMAGE_PRICE_PER_1000_USD = 0.2;
/**
 * حدّ نتائج بحث الصورة — قرار المالك (26/11 عصراً): **4–5 نتائج لكل actor**
 * تكفي — قوالب منظّمة لا متصفّح مئات النتائج. الافتراضي 5، قابل للضبط بمتغيّر
 * البيئة APIFY_IMAGE_MAX_RESULTS (مقطوع 1–50 حسب موثّق الـactor). يُطبَّق على
 * مخزني الصورة معاً: 1688 (maxResults) وAliExpress (maxResultsPerImage) —
 * وأثمنة العرض مشتقّة منه لا مكتوبة يدوياً.
 */
const APIFY_IMAGE_MAX_RESULTS_ENV = Number(process.env.APIFY_IMAGE_MAX_RESULTS);
export const APIFY_IMAGE_MAX_RESULTS = Number.isFinite(APIFY_IMAGE_MAX_RESULTS_ENV) && APIFY_IMAGE_MAX_RESULTS_ENV >= 1
  ? Math.min(50, Math.floor(APIFY_IMAGE_MAX_RESULTS_ENV))
  : 5;
/**
 * حدّ نتائج البحث بالكلمة لكل actor — نفس قرار المالك (4–5 قوالب منظّمة).
 * APIFY_SEARCH_MAX_ITEMS للتجاوز (مقطوع 1–50 حسب موثّق الـactor).
 */
const APIFY_SEARCH_MAX_ITEMS_ENV = Number(process.env.APIFY_SEARCH_MAX_ITEMS);
export const APIFY_SEARCH_MAX_ITEMS = Number.isFinite(APIFY_SEARCH_MAX_ITEMS_ENV) && APIFY_SEARCH_MAX_ITEMS_ENV >= 1
  ? Math.min(50, Math.floor(APIFY_SEARCH_MAX_ITEMS_ENV))
  : 5;
/** بحث = run + 5 صفوف: 0.005 + 5×3.99/1000 = 0.02495$ — من الأثمنة المنشورة على صفحة الـactor. */
export const APIFY_SEARCH_COST_USD = Number((APIFY_RUN_FEE_USD + (APIFY_SEARCH_MAX_ITEMS / 1000) * APIFY_PRICE_PER_1000_RESULTS_USD).toFixed(5));
/** تفاصيل = run + صفّ واحد: 0.005 + 3.99/1000 = 0.00899$. */
export const APIFY_DETAIL_COST_USD = Number((APIFY_RUN_FEE_USD + (1 / 1000) * APIFY_PRICE_PER_1000_RESULTS_USD).toFixed(5));
/** صورة = 5 نتائج × 0.20/1000 = 0.001$ — والمصدر ما يفوتر إذا 0 نتيجة. */
export const APIFY_IMAGE_COST_USD = Number(((APIFY_IMAGE_MAX_RESULTS / 1000) * APIFY_IMAGE_PRICE_PER_1000_USD).toFixed(5));

/** حدّ جسم الطلب الموثّق لactor الصورة (بايت) — نتجاوزه بضغط محلي مجّاني. */
export const APIFY_IMAGE_BODY_LIMIT_BYTES = 1_000_000;
/** ميزانية base64 داخل الجسم (مساحة للـJSON حوله). */
export const APIFY_IMAGE_BASE64_BUDGET = 900_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asText = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

const asPositiveNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[^\d.]/g, '')) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

// ── الإعداد ──────────────────────────────────────────────────────────────────

export function apifyToken(): string {
  return String(process.env.APIFY_TOKEN ?? '').trim();
}

export function apifyConfigured(): boolean {
  return apifyToken().length > 0;
}

/** `username/actor` أو `username~actor` ⇒ `username~actor` (شكل مسار Apify API). */
export function normalizeApifyActor(raw: string): string {
  return raw.trim().replace(/^@/, '').replace('/', '~');
}

export function apify1688Actor(): string {
  const raw = String(process.env.APIFY_1688_ACTOR ?? '').trim();
  return normalizeApifyActor(raw || APIFY_DEFAULT_1688_ACTOR);
}

export function apifyImageActor(): string {
  const raw = String(process.env.APIFY_IMAGE_ACTOR ?? '').trim();
  return normalizeApifyActor(raw || APIFY_DEFAULT_IMAGE_ACTOR);
}

/**
 * نقطة نهاية Server actor للصورة: `user~actor` ⇒ `https://user--actor.apify.actor/search`
 * (الشكل الموثّق على صفحة الـactor).
 */
/**
 * عَلَم مسار Apify القديم (أمر المالك 28/11 — المرحلة 2 من أمر Z Sourcing):
 * `SBASE_APIFY_DISABLED` truthy ⇒ كل نداءات Apify في sbase تُرفض **قبل أي
 * استهلاك** بكود صادق، والكود والإعدادات تبقى سليمة للرجوع والمقارنة
 * («ممنوع حذف Apify نهائياً في هذه المرحلة»). الافتراضي: المسار القديم نشط —
 * لا شيء يتغير حتى يقرر المالك قلب العلم عند إطلاق Z Sourcing/Nexscope.
 */
export function isApifyLegacyDisabled(): boolean {
  const raw = (process.env.SBASE_APIFY_DISABLED ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function apifyImageEndpoint(): string {
  return `https://${apifyImageActor().replace('~', '--')}.apify.actor/search`;
}

export function apifyAliexpressImageActor(): string {
  const raw = String(process.env.APIFY_ALIEXPRESS_IMAGE_ACTOR ?? '').trim();
  return normalizeApifyActor(raw || APIFY_DEFAULT_ALIEXPRESS_IMAGE_ACTOR);
}

// ── عميل run-based ──────────────────────────────────────────────────────────

interface JsonCall {
  status: number;
  body: unknown;
}

async function requestJson(url: string, init: RequestInit, signal: AbortSignal): Promise<JsonCall> {
  const response = await fetch(url, { ...init, signal });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new SbaseError('APIFY_MALFORMED', `رد غير مقروء من Apify (HTTP ${response.status}).`, 502);
  }
  return { status: response.status, body };
}

/** حالة HTTP من Apify ⇒ خطأ S Base **بمعناه الحقيقي** (الكود يحمل كل شيء). */
function apifyHttpError(status: number, detail: string): SbaseError {
  if (status === 401 || status === 403) {
    return new SbaseError('APIFY_UNAUTHORIZED', `Apify رفض مفتاح الخادم (${status}).`, 502);
  }
  if (status === 402) {
    return new SbaseError('APIFY_BALANCE', `رصيد Apify غير كافٍ لهذا النداء${detail ? `: ${detail}` : '.'}`, 402);
  }
  if (status === 429) {
    return new SbaseError('APIFY_RATE_LIMIT', 'Apify طلبت تخفيف النداءات (429).', 429);
  }
  return new SbaseError('APIFY_HTTP', detail ? `${detail} (HTTP ${status})` : `Apify رجّعت HTTP ${status}.`, 502);
}

/** غلاف Apify القياسي `{ data: {...} }` ⇒ الكائن الداخلي، أو null. */
function runDataOf(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  return isRecord(body.data) ? body.data : null;
}

function detailFrom(body: unknown): string {
  if (!isRecord(body)) return '';
  const error = body.error;
  const message = isRecord(error) ? (error.message ?? error.type) : (body.message ?? body.error);
  if (typeof message === 'string') return message.trim().slice(0, 300);
  if (typeof error === 'string') return error.trim().slice(0, 300);
  return '';
}

const RUN_TERMINAL_FAILURES = new Set(['FAILED', 'ABORTED', 'ABORTING', 'TIMED-OUT']);

export interface ApifyRunResult {
  /** عناصر الـdataset كما رجّعتها Apify (مصفوفة). */
  data: unknown[];
  durationMs: number;
  polls: number;
  runId: string | null;
  datasetId: string | null;
  async: true;
}

export interface ApifyActorCallOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
}

/**
 * تنفيذ run واحد على actor: POST runs → poll actor-runs حتى SUCCEEDED →
 * dataset items. ما يعاودش المحاولة: كل نداء يتخلّص بصدق.
 */
export async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  options: ApifyActorCallOptions = {},
): Promise<ApifyRunResult> {
  if (!apifyConfigured()) {
    throw new SbaseError('APIFY_NOT_CONFIGURED', 'مفتاح Apify غير مضبوط على الخادم.', 503);
  }
  const headers = {
    Authorization: `Bearer ${apifyToken()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const timeoutMs = options.timeoutMs ?? APIFY_TOTAL_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? APIFY_POLL_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const controller = new AbortController();
  const started = now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let polls = 0;

  try {
    const first = await requestJson(
      `${APIFY_API_BASE}/v2/acts/${encodeURIComponent(actorId)}/runs`,
      { method: 'POST', headers, body: JSON.stringify(input) },
      controller.signal,
    );
    if (first.status >= 400) throw apifyHttpError(first.status, detailFrom(first.body));

    const firstData = runDataOf(first.body);
    const runId = asText(firstData?.id);
    if (!runId) throw new SbaseError('APIFY_MALFORMED', 'رد Apify بلا معرّف تشغيل.', 502);
    let datasetId = asText(firstData?.defaultDatasetId);

    // الحالة الأولى: إن كانت نهائية نتصرف، وإلا نبدأ الـpolling.
    let status = asText(firstData?.status) ?? '';
    for (;;) {
      if (status === 'SUCCEEDED') break;
      if (RUN_TERMINAL_FAILURES.has(status)) {
        throw new SbaseError('APIFY_FAILED', `تشغيل Apify ${runId} ما كمّلش (${status || 'FAILED'}).`, 502);
      }
      if (now() - started > timeoutMs) {
        throw new SbaseError('APIFY_TIMEOUT', `Apify ما كمّلتش في ${Math.round(timeoutMs / 1000)} ثانية.`, 504);
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      polls += 1;
      const poll = await requestJson(
        `${APIFY_API_BASE}/v2/actor-runs/${encodeURIComponent(runId)}`,
        { method: 'GET', headers },
        controller.signal,
      );
      if (poll.status >= 400) throw apifyHttpError(poll.status, detailFrom(poll.body));
      const pollData = runDataOf(poll.body);
      datasetId = asText(pollData?.defaultDatasetId) ?? datasetId;
      status = asText(pollData?.status) ?? '';
    }

    if (!datasetId) throw new SbaseError('APIFY_MALFORMED', 'تشغيل Apify بلا dataset.', 502);
    const items = await requestJson(
      `${APIFY_API_BASE}/v2/datasets/${encodeURIComponent(datasetId)}/items`,
      { method: 'GET', headers },
      controller.signal,
    );
    if (items.status >= 400) throw apifyHttpError(items.status, detailFrom(items.body));
    if (!Array.isArray(items.body)) {
      throw new SbaseError('APIFY_MALFORMED', 'dataset Apify ما رجّعتش مصفوفة.', 502);
    }

    return {
      data: items.body,
      durationMs: Math.max(0, now() - started),
      polls,
      runId,
      datasetId,
      async: true,
    };
  } catch (error) {
    if (error instanceof SbaseError) throw error;
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new SbaseError('APIFY_TIMEOUT', `تجاوزنا ${Math.round(timeoutMs / 1000)} ثانية بلا اكتمال.`, 504);
    }
    throw new SbaseError('APIFY_NETWORK', 'تعذّر الوصول إلى Apify.', 502);
  } finally {
    clearTimeout(timer);
  }
}

// ── الترجمة: صفوف Apify ⇒ الشكل الداخلي المعروف ─────────────────────────────

/**
 * أول صورة من صفّ البحث. الـREADME يعلن صوراً في صفّ البحث بلا تسمية موثّقة
 * في المثال — نقرأ المرشّحات الشائعة، وغيابها يبقى غياباً (`missing: ['image']`)
 * وما نخترعش رابطاً.
 */
function firstImage(record: Record<string, unknown>): string | null {
  const candidates = [record.images, record.image, record.imageUrl, record.imgUrl, record.picUrl, record.img];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (Array.isArray(candidate)) {
      const first = candidate.map((entry) => asText(entry) ?? (isRecord(entry) ? asText(entry.imageUrl) ?? asText(entry.fullPathImageURI) : null)).find(Boolean);
      if (first) return first;
    }
  }
  return null;
}

export interface InternalRecordFields {
  offerId: string;
  title: string;
  priceCny: number | null;
  moq: number | null;
  supplier: string | null;
  url: string | null;
  image: string | null;
}

/**
 * الشكل الداخلي المعروف (شكل 1688 الموحّد): `item_id`, `title`,
 * `price` (نصّ CNY), `currency`, `img`, `product_url`, `moq`, `shop_info.company_name`.
 * طبقة الاستخراج تُكمل الباقي (`missing`) بلا تغيير.
 */
function toInternalRecord(fields: InternalRecordFields): Record<string, unknown> {
  const record: Record<string, unknown> = {
    item_id: fields.offerId,
    title: fields.title,
    currency: 'CNY',
  };
  if (fields.priceCny !== null) record.price = String(fields.priceCny);
  if (fields.moq !== null) record.moq = String(fields.moq);
  if (fields.supplier) record.shop_info = { company_name: fields.supplier };
  if (fields.url) record.product_url = fields.url;
  if (fields.image) record.img = fields.image;
  return record;
}

/** صفّ بحث من `sourabhbgp/1688-scraper` — الحقول الموثّقة فقط. */
export function mapApifySearchRecord(record: unknown): Record<string, unknown> | null {
  if (!isRecord(record)) return null;
  const offerId = asText(record.offerId) ?? asText(record.offer_id);
  const title = asText(record.title);
  if (!offerId || !title) return null;
  return toInternalRecord({
    offerId,
    title,
    priceCny: asPositiveNumber(record.priceCny) ?? asPositiveNumber(record.price),
    moq: typeof record.minOrderQuantity === 'number' && Number.isFinite(record.minOrderQuantity) ? record.minOrderQuantity : null,
    supplier: asText(record.supplierName),
    url: asText(record.url) ?? asText(record.detailUrl),
    image: firstImage(record),
  });
}

/** مطابقة من actor الصورة — `titleEn` يتقدّم (قاعدة: العنوان المترجّم أولاً). */
export function mapApifyImageMatchRecord(record: unknown): Record<string, unknown> | null {
  if (!isRecord(record)) return null;
  const offerId = asText(record.offerId) ?? asText(record.offer_id);
  if (!offerId) return null;
  const title = asText(record.titleEn) ?? asText(record.title);
  if (!title) return null;
  const supplier = isRecord(record.supplier) ? asText(record.supplier.companyName) : null;
  return toInternalRecord({
    offerId,
    title,
    priceCny: asPositiveNumber(record.price),
    moq: typeof record.minOrderQuantity === 'number' && Number.isFinite(record.minOrderQuantity) ? record.minOrderQuantity : null,
    supplier,
    url: asText(record.detailUrl) ?? asText(record.url),
    image: firstImage(record),
  });
}

/** الوزن بالجرام: `variants[].weightGrams` موثّق، وأسماء الحزم علوية مرشّحة. */
function packageWeightGrams(row: Record<string, unknown>): number | null {
  const top = asPositiveNumber(row.packageWeightGrams) ?? asPositiveNumber(row.packageWeightG) ?? asPositiveNumber(row.weightGrams);
  if (top !== null) return top;
  const fromPackageDimensions = isRecord(row.packageDimensions) ? asPositiveNumber(row.packageDimensions.weightG) : null;
  if (fromPackageDimensions !== null) return fromPackageDimensions;
  const variants = Array.isArray(row.variants) ? row.variants : Array.isArray(row.skuDetails) ? row.skuDetails : [];
  for (const variant of variants) {
    if (!isRecord(variant)) continue;
    const weight = asPositiveNumber(variant.weightGrams) ?? asPositiveNumber(variant.weightG);
    if (weight !== null) return weight;
  }
  return null;
}

/** صفّ `product_detail` ⇒ جذر 1688 المعروف الذي يفهمه `extractDetail`. */
export function mapApifyDetailRow(row: unknown): Record<string, unknown> | null {
  if (!isRecord(row)) return null;
  const offerId = asText(row.offerId) ?? asText(row.offer_id);
  const title = asText(row.title);
  if (!offerId && !title) return null;

  // specs عند Apify كائن {Name: value} — يتحوّل إلى propsList المعروف.
  const specs: Array<Record<string, unknown>> = [];
  if (isRecord(row.specs)) {
    for (const [name, value] of Object.entries(row.specs)) {
      const text = asText(value);
      if (!name.trim() || !text) continue;
      specs.push({ name: name.slice(0, 60), value: text.slice(0, 160) });
      if (specs.length >= 24) break;
    }
  }

  // variants[] (موثّقة) أو skuDetails (تسمية قديمة) ⇒ `variations` المعروفة:
  // genericVariants تُخرجها مجموعة «options» — الأسماء الأبعاد غير منشورة عند
  // المصدر، فما نخترعوش «لون/مقاس» من عندنا.
  const variants = Array.isArray(row.variants) ? row.variants : Array.isArray(row.skuDetails) ? row.skuDetails : [];
  const variations = variants
    .filter(isRecord)
    .map((variant) => {
      const label = asText(variant.specAttributes) ?? asText(variant.props_names) ?? asText(variant.skuId);
      if (!label) return null;
      const stock = typeof variant.stock === 'number' && Number.isFinite(variant.stock) ? variant.stock > 0 : undefined;
      const entry: Record<string, unknown> = { name: label.slice(0, 60) };
      if (stock !== undefined) entry.in_stock = stock;
      const image = asText(variant.imageUrl);
      if (image) entry.image = image;
      return entry;
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .slice(0, 30);

  const root: Record<string, unknown> = {
    item_id: offerId,
    currency: asText(row.currency)?.toUpperCase() ?? 'CNY',
    attribute: { propsList: specs },
    variations,
    item: { title, companyName: asText(row.supplierName) },
  };
  const description = descriptionText(row);
  if (description) root.description = description;
  const priceCny = asPositiveNumber(row.priceCny) ?? asPositiveNumber(row.price);
  if (priceCny !== null) root.price_info = { price: String(priceCny) };
  // stock رقمي موثّق ⇒ توفّر صادق (0 = نافد، >0 = متوفّر، غايب = غير معروف).
  if (typeof row.stock === 'number' && Number.isFinite(row.stock)) root.is_sold_out = row.stock === 0;
  const images = firstImage(row);
  const variantImages = variations.map((entry) => asText(entry.image)).filter((value): value is string => Boolean(value));
  const gallery = [...new Set([...(images ? [images] : []), ...variantImages])].slice(0, 10);
  if (gallery.length > 0) root.images = gallery;
  const weightGrams = packageWeightGrams(row);
  if (weightGrams !== null) root.weightGrams = weightGrams;
  return root;
}

/**
 * وصف المورّد (`includeDescriptionHtml: true`) يصل HTML خاماً — اسم حقل المخرجات
 * غير منشور على صفحة الـactor، فنقرأ المرشّحات المعروفة ونستعمل ما وصل فعلاً:
 * إزالة الوسوم + فكّ الكيانات الشائعة + دمج الفراغات. ما قلّ عن نصّ مقروء
 * يبقى null — القسم لا يظهر، ولا نعرض وسوماً خاماً ولا نصّاً مخترعاً.
 */
function descriptionText(row: Record<string, unknown>): string | null {
  const raw = asText(row.descriptionHtml)
    ?? asText(row.description)
    ?? asText(row.detailDescription)
    ?? asText(row.descHtml);
  if (!raw) return null;
  const collapsed = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return collapsed.length >= 10 ? collapsed : null;
}

// ── النداءات الجاهزة ────────────────────────────────────────────────────────

export interface ApifySearchResult {
  /** `{ items: [...] }` بالشكل الداخلي — نفس مسار الاستخراج الموحّد. */
  data: { items: Record<string, unknown>[] };
  durationMs: number;
  polls: number;
  runId: string | null;
  /** الـscraper run-based دائماً — الشاشة تعرض «async» كما هي. */
  async: true;
  costUsd: number;
}

/** بحث بكلمة عبر `sourabhbgp/1688-scraper` (mode=search، بلا proxy). */
export async function runApifySearch(
  query: string,
  options: ApifyActorCallOptions = {},
): Promise<ApifySearchResult> {
  const run = await runApifyActor(
    apify1688Actor(),
    {
      mode: 'search',
      keywords: [query],
      // القيمة الموصى بها في صفحة الـactor — ما ناخترعش ترتيباً من عندنا.
      sortType: 'normal',
      maxItems: APIFY_SEARCH_MAX_ITEMS,
    },
    { timeoutMs: options.timeoutMs ?? APIFY_TOTAL_TIMEOUT_MS, pollIntervalMs: options.pollIntervalMs, now: options.now },
  );
  const items = run.data
    .map((record) => mapApifySearchRecord(record))
    .filter((record): record is Record<string, unknown> => record !== null);
  return { data: { items }, durationMs: run.durationMs, polls: run.polls, runId: run.runId, async: true, costUsd: APIFY_SEARCH_COST_USD };
}

export interface ApifyDetailResult {
  /** جذر 1688 بالشكل اللي يفهمه `extractDetail`. */
  data: Record<string, unknown>;
  durationMs: number;
  polls: number;
  runId: string | null;
  costUsd: number;
}

/** تفاصيل منتج عبر `product_detail` — المعرّف **ولا** الرابط يكفي (`offerIds`). */
export async function runApifyDetail(
  input: { id: string | null; url: string | null },
  options: ApifyActorCallOptions = {},
): Promise<ApifyDetailResult> {
  const offer = input.id ?? input.url;
  if (!offer) {
    throw new SbaseError('APIFY_EMPTY', 'معرّف المنتج ولا رابطو مطلوب للتفاصيل.', 400);
  }
  const run = await runApifyActor(
    apify1688Actor(),
    {
      mode: 'product_detail',
      offerIds: [offer],
      includeSkuDetails: true,
      // وصف المورّد الكامل (خيار موثّق، افتراضه false — «large»): الشاشة عندها
      // قسم الوصف جاهزاً، وما وصلش شيء يبقى غايباً بصدق. لا يغيّر الثمن.
      includeDescriptionHtml: true,
      // صفحة المنتج ما تتقراش بلا proxy — حدّ موثّق من الـactor نفسه.
      proxyConfiguration: { useApifyProxy: true },
    },
    { timeoutMs: options.timeoutMs ?? APIFY_DETAIL_TIMEOUT_MS, pollIntervalMs: options.pollIntervalMs, now: options.now },
  );
  const row = run.data.find((entry) => isRecord(entry));
  if (!row) {
    throw new SbaseError('APIFY_EMPTY', 'المصدر ما رجّعش صفّ تفاصيل لهذا المنتج — ما تفوتر ما نفع.', 404);
  }
  const data = mapApifyDetailRow(row) ?? {};
  return { data, durationMs: run.durationMs, polls: run.polls, runId: run.runId, costUsd: APIFY_DETAIL_COST_USD };
}

export interface ApifyImageResult {
  data: { items: Record<string, unknown>[] };
  durationMs: number;
  count: number;
  costUsd: number;
}

/**
 * بحث بصورة عبر Server actor: POST واحد بـbase64 خام. 0 نتيجة = حالة عادية
 * (ومجّانية عند المصدر)، موش خطأ.
 */
export async function searchApifyByImage(
  imageBase64: string,
  options: { timeoutMs?: number; now?: () => number } = {},
): Promise<ApifyImageResult> {
  if (!apifyConfigured()) {
    throw new SbaseError('APIFY_NOT_CONFIGURED', 'مفتاح Apify غير مضبوط على الخادم.', 503);
  }
  const payload = String(imageBase64 ?? '').trim();
  if (!payload) {
    throw new SbaseError('SBASE_IMAGE_TOO_LARGE', 'بيانات الصورة فارغة.', 400);
  }
  const body = JSON.stringify({ imageBase64: payload, maxResults: APIFY_IMAGE_MAX_RESULTS, excludeAds: true });
  // حدّ موثّق: جسم الطلب ≤ 1,000,000 بايت. الرفض هنا **مجّاني** — قبل أي نداء.
  if (body.length > APIFY_IMAGE_BODY_LIMIT_BYTES) {
    throw new SbaseError('SBASE_IMAGE_TOO_LARGE', 'الصورة أكبر من حدّ 1688 الموثّق (نحو 700KB). اختر صورة أصغر.', 413);
  }
  const headers = {
    Authorization: `Bearer ${apifyToken()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const timeoutMs = options.timeoutMs ?? APIFY_IMAGE_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const controller = new AbortController();
  const started = now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const call = await requestJson(apifyImageEndpoint(), { method: 'POST', headers, body }, controller.signal);
    if (call.status >= 400) throw apifyHttpError(call.status, detailFrom(call.body));
    if (!isRecord(call.body)) throw new SbaseError('APIFY_MALFORMED', 'ردّ بحث الصورة موش JSON صالح.', 502);
    // ok:false مع 200 = المزوّد رفض البحث — فشل معلن، ما يتفوترش كنتائج فارغة.
    if (call.body.ok !== true) {
      const reason = detailFrom(call.body) || 'ok=false من actor الصورة.';
      throw new SbaseError('APIFY_FAILED', reason, 502);
    }
    const matches = Array.isArray(call.body.items) ? call.body.items : [];
    const items = matches
      .map((record) => mapApifyImageMatchRecord(record))
      .filter((record): record is Record<string, unknown> => record !== null);
    return {
      data: { items },
      durationMs: Math.max(0, now() - started),
      count: items.length,
      costUsd: APIFY_IMAGE_COST_USD,
    };
  } catch (error) {
    if (error instanceof SbaseError) throw error;
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new SbaseError('APIFY_TIMEOUT', `بحث الصورة ما كمّلش في ${Math.round(timeoutMs / 1000)} ثانية.`, 504);
    }
    throw new SbaseError('APIFY_NETWORK', 'تعذّر الوصول إلى actor الصورة.', 502);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * صفّ بحث صورة AliExpress الموثّق (مثال حقيقي من صفحة الـactor، قُريء 26/11/2026):
 * `productId, title, url, image, price, currency, rating, sold, isBestMatch…`
 * ⇒ الشكل الداخلي الموحّد. العملة تأتي من الردّ كما هي (USD…) — ما نخمّنوش CNY؛
 * MOQ/البائع غير منشورين في هذا الـactor ⇒ يبقيان غايبين (`missing`)، بلا اختراع.
 */
export function mapApifyAliexpressImageRecord(record: unknown): Record<string, unknown> | null {
  if (!isRecord(record)) return null;
  const productId = asText(record.productId);
  const title = asText(record.title);
  if (!productId || !title) return null;
  const mapped: Record<string, unknown> = { item_id: productId, title };
  const price = asPositiveNumber(record.price);
  if (price !== null) mapped.price = String(price);
  const currency = asText(record.currency)?.toUpperCase();
  if (currency) mapped.currency = currency;
  const url = asText(record.url);
  if (url) mapped.product_url = url;
  const image = firstImage(record);
  if (image) mapped.img = image;
  return mapped;
}

export interface ApifyAliexpressImageResult {
  data: { items: Record<string, unknown>[] };
  durationMs: number;
  polls: number;
  runId: string | null;
  async: true;
}

/**
 * بحث بالصورة على AliExpress عبر `piotrv1001/aliexpress-image-search-scraper`
 * (run-based: POST runs ثم poll ثم dataset).
 *
 * الموثّق على صفحة الـactor:
 *   • `imageUrls` يقبل **base64** مباشرة (والاختصار `imagesBase64`) — بلا رابط عمومي.
 *   • 0.02$/صورة (حتى 60 نتيجة)؛ **الصور الفاشلة أو بلا نتائج مجانية**.
 *   • صفوف الفشل: `{status: 'image_error' | 'no_matches' | 'failed', error}` —
 *     والـrun ينجح حتى معها؛ كل واحدة بكودها الحقيقي هنا، ولا واحدة تتفورت
 *     «لا نتائج».
 */
export async function searchApifyAliexpressByImage(
  imageBase64: string,
  options: ApifyActorCallOptions = {},
): Promise<ApifyAliexpressImageResult> {
  const payload = String(imageBase64 ?? '').trim();
  if (!payload) {
    throw new SbaseError('SBASE_IMAGE_TOO_LARGE', 'بيانات الصورة فارغة.', 400);
  }
  const run = await runApifyActor(
    apifyAliexpressImageActor(),
    {
      imagesBase64: [payload],
      // نفس حدّ نتائج الصورة (افتراضي 10) داخل الصفّ الأول الموثّق — ثمن واحد 0.02$ بلا صفحات إضافية.
      maxResultsPerImage: APIFY_IMAGE_MAX_RESULTS,
      shipTo: APIFY_ALIEXPRESS_SHIP_TO,
      currency: APIFY_ALIEXPRESS_CURRENCY,
    },
    { timeoutMs: options.timeoutMs ?? APIFY_IMAGE_TIMEOUT_MS, pollIntervalMs: options.pollIntervalMs, now: options.now },
  );

  const rows = run.data.filter(isRecord);
  const items = rows
    .map((record) => mapApifyAliexpressImageRecord(record))
    .filter((record): record is Record<string, unknown> => record !== null);
  if (items.length === 0 && rows.length > 0) {
    // لا صفّ منتج ⇒ صفوف الفشل الموثّقة فقط: كل واحد بمعناه الحقيقي.
    const failure = rows.find((row) => typeof row.status === 'string');
    const reason = asText(failure?.error) ?? 'المتجر ما رجّعش منتجات.';
    const status = String(failure?.status ?? 'failed');
    if (status === 'no_matches') {
      // حالة عادية **مجانية** — تردّ فارغة، ما تمسّش كخطأ.
      return { data: { items: [] }, durationMs: run.durationMs, polls: run.polls, runId: run.runId, async: true };
    }
    if (status === 'image_error') {
      throw new SbaseError('SBASE_IMAGE_STORE_REFUSED', `AliExpress ما قبلش الصورة (${reason}) — ما تخلّصش والو.`, 502);
    }
    throw new SbaseError('APIFY_FAILED', reason, 502);
  }
  return { data: { items }, durationMs: run.durationMs, polls: run.polls, runId: run.runId, async: true };
}

/**
 * صورة الهاتف ⇒ base64 جاهز لactor الصورة.
 *
 * هذا هو **السَبر المجّاني**: فكّ الشفرة والتحقق يجري محلياً (`sharp`) قبل أي
 * نداء مدفوع. وحدّ الجسم الموثّق (1MB) يتحقق بضغط تدرّجي — الصورة تُصغّر حتى
 * تدخل الميزانية، وإذا ما دخلش حتى بعد التصغير ⇒ خطأ محلي مجّاني (413)،
 * ما يوصلش للشبكة إطلاقاً.
 */
export async function apifyImageBase64(input: Buffer, mimeType?: string): Promise<string> {
  const normalized = await normalizeUploadedImage(input, mimeType);
  let buffer = normalized.buffer;
  const base64Length = (value: Buffer) => Math.ceil(value.length / 3) * 4;
  const edges = [896, 640, 448];
  for (let attempt = 0; base64Length(buffer) > APIFY_IMAGE_BASE64_BUDGET && attempt < edges.length; attempt++) {
    buffer = await sharp(buffer)
      .resize({ width: edges[attempt], height: edges[attempt], fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  }
  if (base64Length(buffer) > APIFY_IMAGE_BODY_LIMIT_BYTES) {
    throw new SbaseError('SBASE_IMAGE_TOO_LARGE', 'الصورة أكبر من حدّ 1688 الموثّق حتى بعد الضغط. اختر صورة أصغر.', 413);
  }
  return buffer.toString('base64');
}
