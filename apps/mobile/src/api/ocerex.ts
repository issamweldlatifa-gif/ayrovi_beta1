/**
 * OCEREX — «صورة فيها سعر» (لقطة شاشة من تطبيق متجر، بلا رابط).
 *
 * دورة كاملة: **صورة → سعر مرجعي → تسعير AYROVI → رابط المنتوج → سطر في السلّة**.
 *
 * ملاحظات عقد صريحة (من الكود على الخادم، موش مُفترضة):
 *  • ردود OCEREX **موش** مغلّفة بـ`data`: الحقول في الجذر مع `success`. لهذا
 *    نستعمل `apiSendEnvelope` (تتحقّق من `success` وترمي بكود الخادم).
 *  • `x-session-id` إلزامي (نفس نمط AYWEBs: `^[A-Za-z0-9._:-]{8,160}$`).
 *  • `CURRENCY_LOCKED`: كان الخادم قرى عملة، **ما تتّبدّلش**. و`CURRENCY_UNCONFIRMED`:
 *    كان ما قرى شي، العميل يختار من **قائمة مغلقة** يبعثها الخادم.
 *  • الرابط يلزم قبل `commit`، والخطّ يجي من الخادم (`code`، `confidenceLevel`).
 *  • العملة الغايب/المشكوك فيها ما تتخمّنش في الجهاز: تتقال وتُطلب.
 */
import { ApiError } from './errors';
import { apiSendEnvelope, apiSendForm, type RequestOptions } from './client';

export const OCEREX_BASE = '/api/ocerex';

/** تحليل صورة: الخادم يقرا النصّ (OCR) ويبني القرار — ثوانٍ عادة، ودقيقة كسقف. */
export const OCEREX_TIMEOUT_MS = 60_000;

/* ── أدوات ───────────────────────────────────────────────────────────────── */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const malformed = (what: string): ApiError => new ApiError('malformed', `Réponse OCEREX illisible : ${what}`);

/** أنواع الشاشة: منتوج، سلّة، أو «ما عرفناش» — القاموس مغلق. */
export type OcerexScreenType = 'PRODUCT' | 'CART' | 'UNKNOWN';
/** مستوى الثقة: `LOW` توقف كل شي (نفس شرط الخادم). */
export type OcerexConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface OcerexExtraction {
  extractionId: string;
  type: OcerexScreenType;
  /** السعر المرجعي المقروء من الصورة — `null` = ما تقراش. */
  referencePrice: number | null;
  currency: string;
  confidence: number;
  confidenceLevel: OcerexConfidenceLevel;
  /** سياق السعر: سعر منتوج ولا مجموع سلّة (الاثنان يفرقوا في المعنى). */
  priceContext: string;
  productTitle: string;
  platform: string;
  sourceUrl: string;
  /** رمز القرار من الخادم: `OK` ولا سبب واضح. */
  code: string;
  ayroviPrice: number | null;
  pricingVersion: number | null;
  /** العملات المقبولة في التسعير — القائمة الوحيدة اللي نعرضوها للاختيار. */
  supportedCurrencies: string[];
}

export function parseOcerexExtraction(payload: unknown): OcerexExtraction {
  if (!isRecord(payload) || !str(payload.extractionId)) throw malformed('extraction');
  const level = str(payload.confidenceLevel);
  return {
    extractionId: str(payload.extractionId),
    type: payload.type === 'PRODUCT' || payload.type === 'CART' ? payload.type : 'UNKNOWN',
    referencePrice: num(payload.referencePrice),
    currency: str(payload.currency).toUpperCase(),
    confidence: num(payload.confidence) ?? 0,
    confidenceLevel: level === 'HIGH' || level === 'MEDIUM' ? level : 'LOW',
    priceContext: str(payload.priceContext),
    productTitle: str(payload.productTitle),
    platform: str(payload.platform),
    sourceUrl: str(payload.sourceUrl),
    code: str(payload.code),
    ayroviPrice: num(payload.ayroviPrice),
    pricingVersion: num(payload.pricingVersion),
    supportedCurrencies: strList(payload.supportedCurrencies),
  };
}

/* ── الصورة: «حلّل هذه اللقطة» ──────────────────────────────────────────── */

export interface OcerexAnalyzeInput {
  uri: string;
  mimeType: string;
  fileName?: string;
}

/**
 * `POST /analyze` — يرفع اللقطة ويرجّع القرار.
 *
 * ملاحظة صدق: الخادم يرجّع `success: false` مع `code` كي الرمز موش `OK` (مثلاً
 * `LOW_CONFIDENCE`) — وفي نفس الوقت يوصل الاستخراج كامل. لهذا نقراو الغلاف
 * يدوياً هنا بدل ما نرميو: **الرحلة ما تتوقّفش**، والقرار يتقال للمستعمل.
 */
export async function analyzeOcerexImage(
  input: OcerexAnalyzeInput,
  sessionId: string,
  options: RequestOptions = {},
): Promise<{ extraction: OcerexExtraction; ok: boolean; message: string }> {
  if (!input.uri) throw new ApiError('malformed', 'Aucune image à analyser');
  const form = new FormData();
  const extension = input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : 'jpg';
  form.append('image', {
    uri: input.uri,
    name: input.fileName || `ocerex.${extension}`,
    type: input.mimeType,
  } as unknown as Blob);
  const payload = await apiSendForm<unknown>(`${OCEREX_BASE}/analyze`, form, {
    ...options,
    /* الغلاف كامل: `success:false` (مثلاً `LOW_CONFIDENCE`) يجي مع الاستخراج
       في نفس الردّ 200 — فكّ `data` كان باش يرمي ويضيّع السبب. */
    envelope: true,
    headers: { 'x-session-id': sessionId, ...(options.headers ?? {}) },
    timeoutMs: options.timeoutMs ?? OCEREX_TIMEOUT_MS,
  });
  const body = payload.data;
  if (!isRecord(body) || !str(body.extractionId)) throw malformed('analyse');
  return {
    extraction: parseOcerexExtraction(body),
    ok: body.success === true,
    message: str(body.error),
  };
}

/**
 * `POST /calculate` — التسعير بالدينار.
 *
 * `currency` تُبعث **فقط** كي الخادم ما قراش عملة (`CURRENCY_UNCONFIRMED`).
 * الخادم يرفض أي تبديل لعملة مقروءة (`CURRENCY_LOCKED`) — وهذا هو الصواب:
 * العملة جزء من الدليل، موش اختيار.
 */
export async function calculateOcerexPrice(
  input: { extractionId: string; currency?: string },
  sessionId: string,
  options: RequestOptions = {},
): Promise<OcerexExtraction> {
  const envelope = await apiSendEnvelope<Record<string, unknown>>('POST', `${OCEREX_BASE}/calculate`, {
    body: { extractionId: input.extractionId, ...(input.currency ? { currency: input.currency } : {}) },
    headers: { 'x-session-id': sessionId, ...(options.headers ?? {}) },
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? OCEREX_TIMEOUT_MS,
  });
  return parseOcerexExtraction(envelope);
}

/* ── الرابط: «وين هذا المنتوج؟» ────────────────────────────────────────── */

export interface OcerexResolution {
  title: string;
  platform: string;
  url: string;
  imageUrl: string;
}

export async function resolveOcerexUrl(
  input: { extractionId: string; url: string },
  sessionId: string,
  options: RequestOptions = {},
): Promise<{ extraction: OcerexExtraction; resolution: OcerexResolution }> {
  const envelope = await apiSendEnvelope<Record<string, unknown>>('POST', `${OCEREX_BASE}/resolve`, {
    body: { extractionId: input.extractionId, url: input.url },
    headers: { 'x-session-id': sessionId, ...(options.headers ?? {}) },
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? OCEREX_TIMEOUT_MS,
  });
  const resolution = isRecord(envelope.resolved) ? envelope.resolved : {};
  return {
    extraction: parseOcerexExtraction(envelope),
    resolution: {
      title: str(resolution.title),
      platform: str(resolution.platform),
      url: str(resolution.url),
      imageUrl: str(resolution.imageUrl),
    },
  };
}

/* ── الشراء: «زيدها لسلّة AYROVI» ─────────────────────────────────────── */

export async function commitOcerexToCart(
  extractionId: string,
  sessionId: string,
  options: RequestOptions = {},
): Promise<{ cartItemId: string; extraction: OcerexExtraction }> {
  const envelope = await apiSendEnvelope<Record<string, unknown>>('POST', `${OCEREX_BASE}/commit`, {
    body: { extractionId },
    headers: { 'x-session-id': sessionId, ...(options.headers ?? {}) },
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? OCEREX_TIMEOUT_MS,
  });
  const cartItemId = str(envelope.cartItemId);
  if (!cartItemId) throw malformed('ligne de panier créée');
  return { cartItemId, extraction: parseOcerexExtraction(envelope) };
}

/* ── البوابة: نفس شروط الخادم، مقروءة محلياً قبل أي ضغطة ───────────────── */

/**
 * أكواد المنع — قائمة وقت التنفيذ، والأنواع مشتقّة منها. السبب: `t()` يتكوّن
 * بالكود (`ocerex.block.${code}`)، وبلا قائمة حقيقية ما ينجّم حتى اختبار
 * يتأكّد أن **كل** كود عندو نص — كان يتزاد كود جديد ونصّه ناقص، المستعمل يقرا
 * `ocerex.block.XXX`.
 */
export const OCEREX_BLOCK_CODES = [
  'LOW_CONFIDENCE',
  'NO_REFERENCE_PRICE',
  'NO_PRICE_FOUND',
  'UNSUPPORTED_SCREEN',
  'PRICE_NOT_CALCULATED',
  'EXTRACTION_EXPIRED',
  'CURRENCY_UNCONFIRMED',
  'CURRENCY_LOCKED',
  'INVALID_URL',
  'RESTRICTED',
  /** ما فماش منع. */
  '',
] as const;

export type OcerexBlockCode = (typeof OCEREX_BLOCK_CODES)[number];

export interface OcerexReadiness {
  canCalculate: boolean;
  canResolve: boolean;
  canCommit: boolean;
  calculateBlock: OcerexBlockCode;
  commitBlock: OcerexBlockCode;
}

/**
 * قرار «شنوّة ينجّم يصير توّا» — نفس شروط الخادم بالحرف:
 *  • `calculate`: رمز `OK` + سعر مرجعي + ثقة موش `LOW` + عملة معروفة
 *    (المقروءة ولا وحدة من القائمة المغلقة).
 *  • `commit`: شرط التسعير + عملة + رابط منتوج صالح.
 *
 * البوابة في الجهاز ما تعوّضش الخادم: هي باش ما نبعثوش طلباً محكوم عليه
 * بالرفض، ولنقولوا السبب قبل الضغطة.
 */
export function ocerexReadiness(extraction: OcerexExtraction | null): OcerexReadiness {
  const empty: OcerexReadiness = {
    canCalculate: false, canResolve: false, canCommit: false, calculateBlock: '', commitBlock: '',
  };
  if (!extraction) return empty;

  if (extraction.confidenceLevel === 'LOW') return { ...empty, calculateBlock: 'LOW_CONFIDENCE', commitBlock: 'LOW_CONFIDENCE' };
  if (extraction.code === 'UNSUPPORTED_SCREEN') return { ...empty, calculateBlock: 'UNSUPPORTED_SCREEN', commitBlock: 'UNSUPPORTED_SCREEN' };
  if (extraction.code === 'NO_PRICE_FOUND') return { ...empty, calculateBlock: 'NO_PRICE_FOUND', commitBlock: 'NO_PRICE_FOUND' };
  if (extraction.code === 'NO_REFERENCE_PRICE' || extraction.referencePrice == null) {
    return { ...empty, calculateBlock: 'NO_REFERENCE_PRICE', commitBlock: 'NO_REFERENCE_PRICE' };
  }
  if (extraction.code !== 'OK' && extraction.code !== '') {
    return { ...empty, calculateBlock: 'EXTRACTION_EXPIRED', commitBlock: 'EXTRACTION_EXPIRED' };
  }

  const priced = extraction.ayroviPrice != null && extraction.ayroviPrice > 0;
  const hasUrl = /^https:\/\/[^\s]+$/i.test(extraction.sourceUrl);
  return {
    canCalculate: true,
    canResolve: true,
    // الشراء: تسعير خادمي (زر التسعير مرّ) + عملة + رابط — بلا هذا الخطّ يتوقّف.
    canCommit: priced && Boolean(extraction.currency) && hasUrl,
    calculateBlock: '',
    commitBlock: !priced ? 'PRICE_NOT_CALCULATED' : !extraction.currency ? 'CURRENCY_UNCONFIRMED' : !hasUrl ? 'INVALID_URL' : '',
  };
}

/** مثال الرابط اللي يتعرض في الحقل — HTTPS وحدو مقبول. */
export const OCEREX_INVALID_HINT_PLACEHOLDER = 'https://…/produit';

/** رسالة الخطأ متاع الخادم، وإلا كود صريح — بلا تفسير مخترع. */
export const ocerexErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError && error.message.trim()) return error.message;
  return 'Analyse impossible.';
};
