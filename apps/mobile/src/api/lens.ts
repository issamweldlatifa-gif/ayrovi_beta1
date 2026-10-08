/**
 * Lens (AYROVIX) — عميل البحث: صورة، نص، QR/باركود، رابط، ومراقبة السعر.
 *
 * ثوابت هذي الطبقة — نفس مبادئ باقي العملاء:
 *  • **السعر يجي من صفحات المتاجر، موش من الصورة**: الخادم هو اللي يقرا الفيشة
 *    ويحوّل للدينار؛ هنا نعرضو كما هو. لو كان الخادم رجّع `price = null`
 *    (ما لقاش سعر منشور)، نعرضو `null` — ما نخمّنوش رقماً.
 *  • `priceToken` موقّع من الخادم: نمرّروه كما هو، وما نصنعوش واحداً في الجهاز.
 *  • `availability` من قاموس مغلق؛ أي قيمة غريبة تولّي `unknown` — موش «متوفّر».
 *  • ما فماش HTML في هذي القناة: نبعثو ملف صورة ولا نصّ، والخادم يقرا هو.
 */
import { ApiError } from './errors';
import {
  apiGetData, apiSendData, apiSendForm, type RequestOptions, type SendOptions,
} from './client';

export const LENS_BASE = '/api/ayrovix';

/** مهلة قراءة Lens: الخادم يزور صفحات المتاجر لكل نتيجة — القراءة الباردة تطول. */
export const LENS_ANALYZE_TIMEOUT_MS = 60_000;

/* ── أدوات قراءة (نفس قواعد عملاء آخرين: شكل غلط = خطأ بصوت عالي) ─────────── */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const bool = (value: unknown): boolean => value === true;
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const malformed = (what: string): ApiError => new ApiError('malformed', `Réponse Lens illisible : ${what}`);

/* ── التوفّر (قاموس مغلق، بأربع قيم) ──────────────────────────────────────── */

export type LensAvailability = 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';

const availability = (value: unknown): LensAvailability => {
  const text = str(value);
  return text === 'in_stock' || text === 'limited' || text === 'out_of_stock' ? text : 'unknown';
};

/* ── الترويج (promo) ─────────────────────────────────────────────────────── */

export interface LensPromo {
  percent: number;
  label: string;
  priceTnd: number | null;
}

const parsePromo = (value: unknown): LensPromo | null => {
  if (!isRecord(value)) return null;
  return {
    percent: num(value.percent) ?? 0,
    label: str(value.label),
    priceTnd: num(value.priceTnd),
  };
};

/* ── نتيجة واحدة (بطاقة منتوج) ───────────────────────────────────────────── */

export interface LensOffer {
  source: string;
  sourceUrl: string;
  price: number | null;
  currency: string;
  priceTnd: number | null;
  promo: LensPromo | null;
}

export interface LensCandidate {
  id: string;
  kind: 'catalog' | 'external';
  title: string;
  brand: string;
  source: string;
  sourceUrl: string;
  image: string;
  images: string[];
  /** سعر المتجر كما نشرو هو — `null` = ما نشروش سعراً (ما نخمّنوش). */
  price: number | null;
  currency: string;
  /** الحسبة التونسية «الكل داخل» — من الخادم. */
  priceTnd: number | null;
  /** من وين جاء السعر: `merchant` = فيشة مقروءة، `search` = مقتطف بحث. */
  priceOrigin: string;
  originalPrice: number | null;
  originalPriceTnd: number | null;
  availability: LensAvailability;
  /** `VERIFIED` = الخادم مسؤول على الرقم؛ `PENDING_MANUAL` = مازال ما تأكّدش. */
  verification: string;
  priceToken: string;
  match: number;
  rating: number | null;
  ratingCount: number | null;
  /** `merchant` = تقييم التاجر، `match` = جودة المطابقة (موش تقييم منتوج). */
  ratingKind: string;
  colors: string[];
  sizes: string[];
  description: string;
  offerCount: number;
  offers: LensOffer[];
}

export function parseLensCandidate(entry: unknown): LensCandidate {
  if (!isRecord(entry) || !str(entry.sourceUrl) || !str(entry.title)) {
    throw malformed('résultat sans titre ou sans lien');
  }
  const offers: LensOffer[] = Array.isArray(entry.offers)
    ? entry.offers.filter(isRecord).map((offer) => ({
      source: str(offer.source),
      sourceUrl: str(offer.sourceUrl),
      price: num(offer.price),
      currency: str(offer.currency),
      priceTnd: num(offer.priceTnd),
      promo: parsePromo(offer.promo),
    }))
    : [];
  return {
    id: str(entry.id),
    kind: entry.kind === 'catalog' ? 'catalog' : 'external',
    title: str(entry.title),
    brand: str(entry.brand),
    source: str(entry.source),
    sourceUrl: str(entry.sourceUrl),
    image: str(entry.image),
    images: strList(entry.images),
    price: num(entry.price),
    currency: str(entry.currency),
    priceTnd: num(entry.priceTnd),
    priceOrigin: str(entry.priceOrigin),
    originalPrice: num(entry.originalPrice),
    originalPriceTnd: num(entry.originalPriceTnd),
    availability: availability(entry.availability),
    verification: str(entry.priceVerificationStatus),
    priceToken: str(entry.priceToken),
    match: num(entry.match) ?? 0,
    rating: num(entry.rating),
    ratingCount: num(entry.ratingCount),
    ratingKind: str(entry.ratingKind),
    colors: strList(entry.colors),
    sizes: strList(entry.sizes),
    description: str(entry.description),
    offerCount: num(entry.offerCount) ?? 0,
    offers,
  };
}

/* ── التعرّف (identification) ────────────────────────────────────────────── */

export interface LensIdentification {
  brand: string;
  model: string;
  description: string;
  confidence: number;
}

const parseIdentification = (value: unknown): LensIdentification => {
  if (!isRecord(value)) return { brand: '', model: '', description: '', confidence: 0 };
  const confidence = num(value.confidence);
  return {
    brand: str(value.brand),
    model: str(value.model),
    description: str(value.description),
    // ثقة غايبة تبقى 0 — ما نلوّحوش بثقة ما قالهاش الخادم.
    confidence: confidence == null ? 0 : confidence,
  };
};

export interface LensAnalysis {
  identification: LensIdentification;
  query: string;
  candidates: LensCandidate[];
  eventId: string;
  /** كم فيشة زارها الخادم فعلاً وكام من الذاكرة، وكم معلومة تدخّلت. */
  liveStock: { fetched: number; cacheHits: number; applied: number; budget: number };
  /** فيشات تخبّت لأنها موقوفة — نقولوها بصراحة بدل «ما لقيناش». */
  excluded: { count: number; reasons: Record<string, number> };
}

export function parseLensAnalysis(payload: unknown): LensAnalysis {
  if (!isRecord(payload)) throw malformed('analyse');
  const candidates = payload.candidates;
  if (!Array.isArray(candidates)) throw malformed('liste de résultats');
  const liveStock = isRecord(payload.liveStock) ? payload.liveStock : {};
  const excluded = isRecord(payload.excluded) ? payload.excluded : null;
  const reasons: Record<string, number> = {};
  if (excluded && isRecord(excluded.reasons)) {
    for (const [key, value] of Object.entries(excluded.reasons)) {
      const count = num(value);
      if (count != null) reasons[key] = count;
    }
  }
  return {
    identification: parseIdentification(payload.identification),
    query: str(payload.query),
    candidates: candidates.map(parseLensCandidate),
    eventId: str(payload.eventId),
    liveStock: {
      fetched: num(liveStock.fetched) ?? 0,
      cacheHits: num(liveStock.cacheHits) ?? 0,
      applied: num(liveStock.applied) ?? 0,
      budget: num(liveStock.budget) ?? 0,
    },
    excluded: { count: excluded ? num(excluded.count) ?? 0 : 0, reasons },
  };
}

/* ── الرفع: الصورة ───────────────────────────────────────────────────────── */

export interface LensImageInput {
  uri: string;
  /** نوع MIME المعلن من المصوّر (`image/jpeg` مثلاً). */
  mimeType: string;
  fileName?: string;
  /** قصّ في الخادم اختياري: `{x,y,w,h}` بالنسب المائوية (0..100). */
  roi?: { x: number; y: number; w: number; h: number };
}

/**
 * `POST /analyze-image` — يبعث الصورة كملف، والخادم يقرا.
 *
 * ملاحظات صريحة:
 *  • الحدّ الأقصى 6 ميغا على الخادم (`LIMIT_FILE_SIZE` → 400)؛ نبعثو الملف كما هو.
 *  • `roi` يخلي القصّ في الخادم (واحد يقرا حقيقة)، بدل ما نبعث صورة مقصوصة
 *    تاها ثانية — نفس اللي تعملو الواجهة في الموقع.
 *  • الردّ غلاف `{success, data}`: نستعملو `unwrap` متاع العميل (`apiSendForm`).
 */
export async function analyzeLensImage(
  input: LensImageInput,
  options: RequestOptions = {},
): Promise<LensAnalysis> {
  if (!input.uri) throw new ApiError('malformed', 'Aucune image à analyser');
  const form = new FormData();
  const name = input.fileName || `lens.${input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : 'jpg'}`;
  form.append('image', { uri: input.uri, name, type: input.mimeType } as unknown as Blob);
  if (input.roi) form.append('roi', JSON.stringify(input.roi));
  const { data } = await apiSendForm<unknown>(`${LENS_BASE}/analyze-image`, form, {
    ...options,
    timeoutMs: options.timeoutMs ?? LENS_ANALYZE_TIMEOUT_MS,
  });
  return parseLensAnalysis(data);
}

/* ── النصّ، QR، الباركود ─────────────────────────────────────────────────── */

interface LensCandidatesPayload {
  candidates: LensCandidate[];
  eventId: string;
  query: string;
}

const parseCandidates = (payload: unknown, what: string): LensCandidatesPayload => {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) throw malformed(what);
  return {
    candidates: payload.candidates.map(parseLensCandidate),
    eventId: str(payload.eventId),
    query: str(payload.query ?? payload.code),
  };
};

/** `POST /analyze-text` — بحث بكلمة. الخادم يجيب كتالوج AYROVI + نتائج الويب. */
export async function analyzeLensText(
  query: string,
  options: RequestOptions = {},
): Promise<LensCandidatesPayload> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/analyze-text`, {
    body: { query },
    ...options,
    timeoutMs: options.timeoutMs ?? LENS_ANALYZE_TIMEOUT_MS,
  });
  return parseCandidates(data, 'recherche texte');
}

/** `POST /analyze-code` — محتوى QR (قد يكون رابطاً). */
export async function analyzeLensCode(
  value: string,
  options: RequestOptions = {},
): Promise<LensCandidatesPayload> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/analyze-code`, {
    body: { value },
    ...options,
    timeoutMs: options.timeoutMs ?? LENS_ANALYZE_TIMEOUT_MS,
  });
  return parseCandidates(data, 'recherche QR');
}

/** `POST /analyze-barcode` — باركود رقمي (6..14 خانة). */
export async function analyzeLensBarcode(
  code: string,
  options: RequestOptions = {},
): Promise<LensCandidatesPayload> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/analyze-barcode`, {
    body: { code },
    ...options,
    timeoutMs: options.timeoutMs ?? LENS_ANALYZE_TIMEOUT_MS,
  });
  return parseCandidates(data, 'recherche code-barres');
}

/** أقصر طول مقبول من الخادم: 2 خانات في النصّ/الرمز، و6 أرقام في الباركود. */
export const LENS_MIN_TEXT = 2;
export const LENS_BARCODE_PATTERN = /^\d{6,14}$/;

/* ── الرابط المشترك ──────────────────────────────────────────────────────── */

export interface LensProduct {
  title: string;
  brand: string;
  description: string;
  image: string;
  images: string[];
  source: string;
  sourceUrl: string;
  price: number | null;
  currency: string;
  priceTnd: number | null;
  originalPrice: number | null;
  originalPriceTnd: number | null;
  availability: LensAvailability;
  verification: string;
  priceToken: string;
  colors: string[];
  sizes: string[];
  optionLabel: string;
}

export interface LensUrlResult {
  product: LensProduct;
  alternates: LensCandidate[];
  eventId: string;
  /** `true` = فيشة المتجر ما تنجّمتش تتقرا، والنتائج من البحث (يتقال، ما يتخبّاش). */
  fallback: boolean;
}

/** `POST /analyze-url` — نفس الرابط اللي في AYWEBs، أمّا هنا مع بدائل. */
export async function analyzeLensUrl(
  url: string,
  options: RequestOptions & { channel?: 'url' | 'qr' } = {},
): Promise<LensUrlResult> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/analyze-url`, {
    body: { url, channel: options.channel ?? 'url' },
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? LENS_ANALYZE_TIMEOUT_MS,
  });
  if (!isRecord(data) || !isRecord(data.product)) throw malformed('fiche produit');
  const product = data.product;
  return {
    product: {
      title: str(product.title),
      brand: str(product.brand),
      description: str(product.description),
      image: str(product.image),
      images: strList(product.images),
      source: str(product.source),
      sourceUrl: str(product.sourceUrl),
      price: num(product.price),
      currency: str(product.currency),
      priceTnd: num(product.priceTnd),
      originalPrice: num(product.originalPrice),
      originalPriceTnd: num(product.originalPriceTnd),
      availability: availability(product.availability),
      verification: str(product.priceVerificationStatus),
      priceToken: str(product.priceToken),
      colors: strList(product.colors),
      sizes: strList(product.sizes),
      optionLabel: str(product.optionLabel),
    },
    alternates: Array.isArray(data.alternates) ? data.alternates.map(parseLensCandidate) : [],
    eventId: str(data.eventId),
    fallback: bool(data.fallback),
  };
}

/* ── السعر والتوفّر الطازج («تحقّق من المخزون») ──────────────────────────── */

export interface LensLiveStockVariant {
  value: string;
  color: string;
  availability: 'available' | 'unavailable' | 'unknown';
}

export interface LensLiveStockResult {
  url: string;
  availability: LensAvailability;
  price: number | null;
  currency: string;
  priceTnd: number | null;
  originalPriceTnd: number | null;
  sizes: string[];
  colors: string[];
  images: string[];
  variants: LensLiveStockVariant[];
  /** وقت القراءة الذي يثبت هذا النتيجة (قراءة بلا تاريخ موش دليل). */
  checkedAt: string;
  reason: string;
  priceToken: string;
}

const variantAvailability = (value: unknown): LensLiveStockVariant['availability'] =>
  value === 'available' || value === 'unavailable' ? value : 'unknown';

/**
 * `POST /live-stock` — قراءة **طازجة** لصفحات المتاجر (بلا ذاكرة).
 *
 * الحدود من الخادم: 8 روابط في الطلب الواحد. أكثر من هذا، يتقال — ما نصغّروش
 * الطلب في الصمت.
 */
export async function lensLiveStock(
  input: { urls: string[]; title?: string },
  options: RequestOptions = {},
): Promise<LensLiveStockResult[]> {
  if (!input.urls.length) throw new ApiError('malformed', 'Aucun lien à vérifier');
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/live-stock`, {
    body: { urls: input.urls.slice(0, 8), title: input.title ?? '' },
    ...options,
    timeoutMs: options.timeoutMs ?? LENS_ANALYZE_TIMEOUT_MS,
  });
  if (!isRecord(data) || !Array.isArray(data.results)) throw malformed('vérification du stock');
  return data.results.filter(isRecord).map((row) => ({
    url: str(row.url),
    availability: availability(row.availability),
    price: num(row.price),
    currency: str(row.currency),
    priceTnd: num(row.priceTnd),
    originalPriceTnd: num(row.originalPriceTnd),
    sizes: strList(row.sizes),
    colors: strList(row.colors),
    images: strList(row.images),
    variants: Array.isArray(row.variants)
      ? row.variants.filter(isRecord).map((variant) => ({
        value: str(variant.value),
        color: str(variant.color),
        availability: variantAvailability(variant.availability),
      }))
      : [],
    checkedAt: str(row.checkedAt),
    reason: str(row.reason),
    priceToken: str(row.priceToken),
  }));
}

/* ── القرار والمراقبة (يستلزمون حساب عميل) ─────────────────────────────── */

/** `POST /choose` — نعلّم الخادم أن العميل اختار نتيجة (تحليلات، بلا بيانات شخصية). */
export async function chooseLensEvent(eventId: string, options: RequestOptions = {}): Promise<void> {
  if (!eventId) return;
  await apiSendData<unknown>('POST', `${LENS_BASE}/choose`, { body: { eventId }, ...options });
}

export interface LensWatch {
  id: string;
  url: string;
  title: string;
  imageUrl: string;
  source: string;
  targetPriceTnd: number | null;
  lastPriceTnd: number | null;
  lastCurrency: string;
  lastPrice: number | null;
  status: string;
  lastCheckedAt: string;
  createdAt: string;
}

/** المراقبة تحتاج تسجيل دخول — الخادم يردّ 401 وهذا يتقال بصراحة في الواجهة. */
export async function fetchLensWatches(options: RequestOptions = {}): Promise<LensWatch[]> {
  const data = await apiGetData<unknown>(`${LENS_BASE}/watch`, options);
  if (!Array.isArray(data)) throw malformed('veilles de prix');
  return data.filter(isRecord).map((row) => ({
    id: str(row.id),
    url: str(row.url),
    title: str(row.title),
    imageUrl: str(row.imageUrl),
    source: str(row.source),
    targetPriceTnd: num(row.targetPriceTnd),
    lastPriceTnd: num(row.lastPriceTnd),
    lastCurrency: str(row.lastCurrency),
    lastPrice: num(row.lastPrice),
    status: str(row.status),
    lastCheckedAt: str(row.lastCheckedAt),
    createdAt: str(row.createdAt),
  }));
}

export async function createLensWatch(
  input: { url: string; title: string; imageUrl?: string; source?: string; targetPriceTnd?: number | null },
  options: RequestOptions = {},
): Promise<{ id: string }> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/watch`, {
    body: {
      url: input.url,
      title: input.title,
      imageUrl: input.imageUrl ?? '',
      source: input.source ?? '',
      targetPriceTnd: input.targetPriceTnd ?? null,
    },
    ...options,
  });
  if (!isRecord(data) || !str(data.id)) throw malformed('veille créée');
  return { id: str(data.id) };
}

export async function removeLensWatch(id: string, options: RequestOptions = {}): Promise<void> {
  await apiSendData<unknown>('DELETE', `${LENS_BASE}/watch/${encodeURIComponent(id)}`, { ...options });
}

export interface LensHistoryEntry {
  id: string;
  kind: string;
  queryLabel: string;
  title: string;
  imageUrl: string;
  sourceUrl: string;
  source: string;
  price: number | null;
  currency: string;
  verification: string;
  resultsCount: number;
  createdAt: string;
}

/** `GET /history` — كي ما كانش حساب، الخادم يرجّع قائمة فارغة (بلا خطأ). */
export async function fetchLensHistory(options: RequestOptions = {}): Promise<LensHistoryEntry[]> {
  const data = await apiGetData<unknown>(`${LENS_BASE}/history`, options);
  if (!Array.isArray(data)) throw malformed('historique');
  return data.filter(isRecord).map((row) => ({
    id: str(row.id),
    kind: str(row.kind),
    queryLabel: str(row.queryLabel),
    title: str(row.title),
    imageUrl: str(row.imageUrl),
    sourceUrl: str(row.sourceUrl),
    source: str(row.source),
    price: num(row.price),
    currency: str(row.currency),
    verification: str(row.verificationStatus),
    resultsCount: num(row.resultsCount) ?? 0,
    createdAt: str(row.createdAt),
  }));
}

/* ── ما يخرج من الجهاز؟ لا شي شخصي ─────────────────────────────────────── */

/** أنواع ما يُقبل رفعها (نفس قائمة الخادم: JPEG/PNG/WebP). */
export const LENS_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const isLensAllowedMime = (mime: string): boolean =>
  (LENS_ALLOWED_MIME as readonly string[]).includes(mime.toLowerCase());

/**
 * الصيغة اللّي يستحقّها الشاشة من مصوّر الجهاز: `mimeType` الغايب يتقرا من
 * الامتداد، والصيغة غير المقبولة تتقال هنا قبل ما تتبعث 6 ميغا بلا فايدة.
 */
export function lensUploadInputFrom(asset: {
  uri?: string; mimeType?: string; fileName?: string | null;
}): LensImageInput {
  const uri = String(asset.uri ?? '');
  if (!uri) throw new ApiError('malformed', 'Aucune image à analyser');
  const declared = String(asset.mimeType ?? '').toLowerCase();
  const inferred = /\.png$/i.test(uri) ? 'image/png' : /\.webp$/i.test(uri) ? 'image/webp' : 'image/jpeg';
  return {
    uri,
    mimeType: declared || inferred,
    fileName: asset.fileName ?? undefined,
  };
}

/** خيارات النداء الموحّدة لقناة Lens (مهلة طويلة + تحمّل القراءة الباردة). */
export const lensSendOptions = (options: SendOptions = {}): SendOptions => ({
  ...options,
  timeoutMs: options.timeoutMs ?? LENS_ANALYZE_TIMEOUT_MS,
});

/* ── تصنيف قيمة المسح (QR / باركود) ─────────────────────────────────────── */

export type LensScanKind = 'barcode' | 'url' | 'code';

export interface LensScanTarget {
  kind: LensScanKind;
  value: string;
}

/**
 * شنوّة عملنا بالقيمة اللّي قراها المصوّر؟
 *
 *  • **6..14 رقم** ⇒ باركود (`/analyze-barcode`).
 *  • **http/https** ⇒ رابط منتوج (`/analyze-url` بقناة `qr`) — فيه بلاصة،
 *    ومحاذاة `https` تتصلّح هنا لأن الكاميرا ما ترجّعش بروتوكول موحّد.
 *  • **الباقي** ⇒ رمز (`/analyze-code`): نصّ داخل QR.
 *
 * التصنيف هنا (في طبقة الـ API) موش في الشاشة: قاعدة واحدة، مختبَرة، وكل شاشة
 * تستعملها — بلا نسختين تفترقا مع الوقت.
 */
export function classifyLensScan(raw: string): LensScanTarget | null {
  const value = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (!value) return null;
  if (LENS_BARCODE_PATTERN.test(value)) return { kind: 'barcode', value };
  if (/^https?:\/\//i.test(value)) {
    return { kind: 'url', value: value.replace(/^http:\/\//i, 'https://') };
  }
  // `www.exemple.tn/produit` بلا بروتوكول: رابط كذلك، والخادم يتحقّق منو.
  if (/^www\.[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(value)) return { kind: 'url', value: `https://${value}` };
  if (value.length < 2) return null;
  return { kind: 'code', value };
}

/** أنواع الباركود اللّي نطلبها من الكاميرا (نفس ما يفهمو الخادم: رقمي). */
export const LENS_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14', 'qr'] as const;

/* ── قسم LENS التعريفي (واجهة المتجر) ────────────────────────────────────── */

/**
 * محتوى قسم LENS على الرئيسية (`GET /api/public/lens-hero`).
 *
 * ملاحظة عقد مقصودة: **الردّ ينجم يكون `null`** (ما فمّاش إعداد). وهادي موش
 * غلطة — القسم عندو الإدارة: `enabled === false` يعني «المدير عطّلو»، و`null`
 * يعني «ما تتضبطش». والحالتين ⇒ **القسم ما يبانش**، بلا رسالة خطأ.
 */
export interface LensHeroContent {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  proofLine: string;
  accentColor: string;
  /** ترتيب العناصر **قرار إداري** (`eyebrow,title,description,cta,proof`). */
  elementOrder: string;
  enabled: boolean;
  sortOrder: number;
  bgType: string;
  bgColor: string;
  bgImage: string;
  overlayStrength: number;
  phoneEnabled: boolean;
  phone: {
    image: string;
    statusLabel: string;
    resultLabel: string;
    productName: string;
    priceChip: string;
    metaChip: string;
    stockChip: string;
    ctaLabel: string;
  };
  media: {
    type: 'IMAGE' | 'VIDEO';
    videoUrl: string;
    videoPath: string;
    poster: string;
    ratio: string;
    autoplay: boolean;
    muted: boolean;
    loop: boolean;
  };
}

const LENS_HERO_ORDER: LensHeroContent['elementOrder'] = 'eyebrow,title,description,cta,proof';

function strOr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * نسبة العرض/الارتفاع من نصّ مثل `16/9`.
 *
 * القيمة الغريبة ⇒ `16/9`: هذا **عرض**، وتوقّف الشاشة على رقم ناقص أسوأ من
 * نسبة افتراضية معروفة.
 */
export function lensHeroRatio(value: unknown): number {
  const [rawWidth, rawHeight] = strOr(value, '16/9').split('/');
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 16 / 9;
  return width / height;
}

export async function fetchLensHero(options: RequestOptions = {}): Promise<LensHeroContent | null> {
  let payload: unknown;
  try {
    payload = await apiGetData<unknown>('/api/public/lens-hero', options);
  } catch (error) {
    // القسم زينة: نقصو ما يمنعش التصفّح (نفس قاعدة الفوتر).
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[lens-hero] inaccessible', error);
    return null;
  }
  if (!isRecord(payload)) return null;

  const phone = isRecord(payload.phone) ? payload.phone : {};
  const media = isRecord(payload.media) ? payload.media : {};

  return {
    eyebrow: strOr(payload.eyebrow),
    title: strOr(payload.title),
    description: strOr(payload.description),
    ctaLabel: strOr(payload.ctaLabel),
    ctaUrl: strOr(payload.ctaUrl),
    proofLine: strOr(payload.proofLine),
    /**
     * Aucune couleur de repli ici, et c'est volontaire : `src/api/**` ne
     * connaît pas la charte (aucun import de `@/design`). Mettre `#FF6900`
     * en défaut introduisait un SECOND orange dans le produit, différent de
     * l'accent `#FF7900` — l'exacte incohérence que §17 interdit.
     *
     * Chaîne vide = « le serveur n'a rien dit » : l'interface décide.
     */
    accentColor: strOr(payload.accentColor),
    elementOrder: strOr(payload.elementOrder, LENS_HERO_ORDER),
    enabled: payload.enabled === true,
    sortOrder: Number(payload.sortOrder) || 40,
    bgType: strOr(payload.bgType),
    bgColor: strOr(payload.bgColor),
    bgImage: strOr(payload.bgImage),
    overlayStrength: Number(payload.overlayStrength) || 0,
    phoneEnabled: payload.phoneEnabled === true,
    phone: {
      image: strOr(phone.image),
      statusLabel: strOr(phone.statusLabel),
      resultLabel: strOr(phone.resultLabel),
      productName: strOr(phone.productName),
      priceChip: strOr(phone.priceChip),
      metaChip: strOr(phone.metaChip),
      stockChip: strOr(phone.stockChip),
      ctaLabel: strOr(phone.ctaLabel),
    },
    media: {
      type: media.type === 'IMAGE' ? 'IMAGE' : 'VIDEO',
      videoUrl: strOr(media.videoUrl),
      videoPath: strOr(media.videoPath),
      poster: strOr(media.poster),
      ratio: strOr(media.ratio, '16/9'),
      autoplay: media.autoplay !== false,
      muted: media.muted !== false,
      loop: media.loop !== false,
    },
  };
}
