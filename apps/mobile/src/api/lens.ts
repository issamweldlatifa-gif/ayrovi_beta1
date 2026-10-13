/**
 * AYROVIX Lens — عميل البحث، مطابق للموقع (`client/src/ayrovix/services/lensApi.ts`).
 *
 * المبادئ:
 *  • مفتاح الذكاء الاصطناعي يبقى على الخادم؛ التطبيق يرسل المدخل الخام فقط.
 *  • السعر يأتي من صفحة المتجر عبر الخادم. `price = null` يعني «لا سعر منشور»
 *    ولا نخمّن رقماً.
 *  • `availability` من قاموس مغلق: أي قيمة غريبة تصبح `unknown`، لا «متوفّر».
 *  • الرد الناقص أو غير المطابق يرمي `ApiError('malformed')` بدل بيانات مختلقة.
 */
import { ApiError } from './errors';
import { apiGetData, apiSendData } from './client';
import { apiUploadFileData } from './nativeUpload';

export const LENS_BASE = '/api/ayrovix';
/** الخادم يزور صفحات المتاجر لكل نتيجة، فالقراءة الباردة تطول. */
export const LENS_TIMEOUT_MS = 60_000;

export type LensAvailability = 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';

export interface LensPromo {
  percent: number;
  label: string;
  priceTnd: number | null;
}

export interface LensVariantOption {
  id: string | null;
  label: string;
  size: string | null;
  color: string | null;
  /** مؤهّل لاختيار خاص بالمتغيّر (ليس ضماناً للمخزون). */
  available: boolean;
  availability: 'available' | 'unavailable' | 'unknown';
  price: number | null;
  currency: string | null;
  priceTnd: number | null;
  priceToken: string | null;
}

export interface LensCandidate {
  id: string;
  kind: 'catalog' | 'external';
  title: string;
  promo: LensPromo | null;
  description: string | null;
  brand: string | null;
  model: string | null;
  colors: string[];
  sizes: string[];
  source: string;
  sourceUrl: string;
  image: string;
  images: string[];
  colorImages: Record<string, string[]> | null;
  price: number | null;
  currency: string | null;
  priceTnd: number | null;
  availability: LensAvailability;
  /** رمز سعر موقّع من الخادم. التطبيق لا يصنعه أبداً. */
  priceToken: string | null;
  /** VERIFIED فقط مع رمز موقّع؛ غير ذلك PENDING_MANUAL. */
  priceVerificationStatus: 'VERIFIED' | 'PENDING_MANUAL';
  variantOptions: LensVariantOption[];
}

export interface LensIdentification {
  inputKind: string;
  category: string;
  brand: string | null;
  model: string | null;
  color: string[];
  visibleText: string[];
  description: string;
  confidence: number | null;
}

export interface LensImageResult {
  identification: LensIdentification;
  query: string;
  candidates: LensCandidate[];
  eventId: string;
  message: string | null;
  excluded: { count: number; reasons: Record<string, number> } | null;
}

export interface LensUrlResult {
  product: LensCandidate;
  alternates: LensCandidate[];
  eventId: string;
  fallback: boolean;
}

export interface LensSearchResult {
  query: string;
  candidates: LensCandidate[];
  eventId: string;
}

export interface LensLiveStock {
  url: string;
  availability: LensAvailability;
  price: number | null;
  currency: string | null;
  originalPrice: number | null;
  priceTnd: number | null;
  originalPriceTnd: number | null;
  sizes: string[];
  colors: string[];
  images: string[];
  variants: Array<{ value: string; color: string | null; availability: 'available' | 'unavailable' | 'unknown' }>;
  checkedAt: string;
  reason: string;
  priceToken: string | null;
}

export type LensReviewStatus = 'PENDING' | 'IN_REVIEW' | 'QUOTED' | 'REJECTED' | 'CANCELLED';

export interface LensReviewRequest {
  id: string;
  status: LensReviewStatus;
  title: string;
  sourceUrl: string;
  imageUrl: string;
  source: string;
  lensPrice: number | null;
  lensCurrency: string | null;
  desiredSize: string;
  desiredColor: string;
  quotedPrice: number | null;
  quotedCurrency: string | null;
  verifiedVariant: string;
  verifiedUrl: string;
  customerMessage: string;
  createdAt: string;
  updatedAt: string;
  duplicate: boolean;
}

/* ── أدوات قراءة صارمة ─────────────────────────────────────────────────── */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const malformed = (what: string): ApiError => new ApiError('malformed', `Réponse Lens illisible : ${what}`);

const availability = (value: unknown): LensAvailability => {
  const text = str(value);
  return text === 'in_stock' || text === 'limited' || text === 'out_of_stock' ? text : 'unknown';
};

const parsePromo = (value: unknown): LensPromo | null => {
  if (!isRecord(value)) return null;
  return { percent: num(value.percent) ?? 0, label: str(value.label), priceTnd: num(value.priceTnd) };
};

export function parseCandidate(value: unknown): LensCandidate {
  if (!isRecord(value)) throw malformed('fiche produit');
  const id = str(value.id);
  const sourceUrl = str(value.sourceUrl);
  if (!id || !sourceUrl) throw malformed('identifiant ou lien manquant');
  const colorImagesRaw = isRecord(value.colorImages) ? value.colorImages : null;
  const colorImages = colorImagesRaw
    ? Object.fromEntries(Object.entries(colorImagesRaw).map(([color, list]) => [color, strList(list)]))
    : null;
  return {
    id,
    kind: value.kind === 'catalog' ? 'catalog' : 'external',
    title: str(value.title),
    promo: parsePromo(value.promo),
    description: strOrNull(value.description),
    brand: strOrNull(value.brand),
    model: strOrNull(value.model),
    colors: strList(value.colors),
    sizes: strList(value.sizes),
    source: str(value.source),
    sourceUrl,
    image: str(value.image),
    images: strList(value.images),
    colorImages,
    price: num(value.price),
    currency: strOrNull(value.currency),
    priceTnd: num(value.priceTnd),
    availability: availability(value.availability),
    priceToken: strOrNull(value.priceToken),
    priceVerificationStatus: value.priceVerificationStatus === 'VERIFIED' && strOrNull(value.priceToken)
      ? 'VERIFIED'
      : 'PENDING_MANUAL',
    variantOptions: parseVariantOptions(value.variantOptions),
  };
}

function parseVariantOptions(value: unknown): LensVariantOption[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((option) => ({
    id: strOrNull(option.id),
    label: str(option.label),
    size: strOrNull(option.size),
    color: strOrNull(option.color),
    available: option.available === true,
    availability: option.availability === 'available' || option.availability === 'unavailable'
      ? option.availability
      : 'unknown',
    price: num(option.price),
    currency: strOrNull(option.currency),
    priceTnd: num(option.priceTnd),
    priceToken: strOrNull(option.priceToken),
  }));
}

const parseCandidates = (value: unknown): LensCandidate[] =>
  Array.isArray(value) ? value.map(parseCandidate) : [];

function parseIdentification(value: unknown): LensIdentification {
  const raw = isRecord(value) ? value : {};
  return {
    inputKind: str(raw.input_kind) || 'product_photo',
    category: str(raw.category),
    brand: strOrNull(raw.brand),
    model: strOrNull(raw.model),
    color: strList(raw.color),
    visibleText: strList(raw.visible_text),
    description: str(raw.description),
    confidence: num(raw.confidence),
  };
}

function parseExcluded(value: unknown): LensImageResult['excluded'] {
  if (!isRecord(value)) return null;
  const reasons: Record<string, number> = {};
  if (isRecord(value.reasons)) {
    for (const [key, count] of Object.entries(value.reasons)) {
      const n = num(count);
      if (n !== null) reasons[key] = n;
    }
  }
  return { count: num(value.count) ?? 0, reasons };
}

export function parseImageResult(value: unknown): LensImageResult {
  if (!isRecord(value)) throw malformed('résultat image');
  const eventId = str(value.eventId);
  return {
    identification: parseIdentification(value.identification),
    query: str(value.query),
    candidates: parseCandidates(value.candidates),
    eventId,
    message: strOrNull(value.message),
    excluded: parseExcluded(value.excluded),
  };
}

export function parseSearchResult(value: unknown): LensSearchResult {
  if (!isRecord(value)) throw malformed('résultat recherche');
  return {
    query: str(value.query) || str(value.code),
    candidates: parseCandidates(value.candidates),
    eventId: str(value.eventId),
  };
}

export function parseUrlResult(value: unknown): LensUrlResult {
  if (!isRecord(value)) throw malformed('résultat lien');
  return {
    product: parseCandidate(value.product),
    alternates: parseCandidates(value.alternates),
    eventId: str(value.eventId),
    fallback: value.fallback === true,
  };
}

export function parseLiveStock(value: unknown): LensLiveStock[] {
  if (!isRecord(value) || !Array.isArray(value.results)) throw malformed('stock');
  return value.results.map((entry) => {
    if (!isRecord(entry)) throw malformed('ligne stock');
    const variants = Array.isArray(entry.variants)
      ? entry.variants.filter(isRecord).map((variant) => ({
        value: str(variant.value),
        color: strOrNull(variant.color),
        availability: (variant.availability === 'available' || variant.availability === 'unavailable'
          ? variant.availability
          : 'unknown') as 'available' | 'unavailable' | 'unknown',
      }))
      : [];
    return {
      url: str(entry.url),
      availability: availability(entry.availability),
      price: num(entry.price),
      currency: strOrNull(entry.currency),
      originalPrice: num(entry.originalPrice),
      priceTnd: num(entry.priceTnd),
      originalPriceTnd: num(entry.originalPriceTnd),
      sizes: strList(entry.sizes),
      colors: strList(entry.colors),
      images: strList(entry.images),
      variants,
      checkedAt: str(entry.checkedAt),
      reason: str(entry.reason),
      priceToken: strOrNull(entry.priceToken),
    };
  });
}

const REVIEW_STATUSES: LensReviewStatus[] = ['PENDING', 'IN_REVIEW', 'QUOTED', 'REJECTED', 'CANCELLED'];

export function parseReview(value: unknown): LensReviewRequest {
  if (!isRecord(value)) throw malformed('demande de révision');
  const id = str(value.id);
  if (!id) throw malformed('identifiant de demande');
  const status = str(value.status) as LensReviewStatus;
  return {
    id,
    status: REVIEW_STATUSES.includes(status) ? status : 'PENDING',
    title: str(value.title),
    sourceUrl: str(value.sourceUrl),
    imageUrl: str(value.imageUrl),
    source: str(value.source),
    lensPrice: num(value.lensPrice),
    lensCurrency: strOrNull(value.lensCurrency),
    desiredSize: str(value.desiredSize),
    desiredColor: str(value.desiredColor),
    quotedPrice: num(value.quotedPrice),
    quotedCurrency: strOrNull(value.quotedCurrency),
    verifiedVariant: str(value.verifiedVariant),
    verifiedUrl: str(value.verifiedUrl),
    customerMessage: str(value.customerMessage),
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
    duplicate: value.duplicate === true,
  };
}

/* ── الاستدعاءات ───────────────────────────────────────────────────────── */

/** صورة (من الكاميرا أو المعرض). الملف يُرسل كـ multipart بلا تحويل في الجهاز. */
export async function analyzeImage(
  file: { uri: string; name: string; type: string },
  options: { customerIntent?: string | null; roi?: { x: number; y: number; w: number; h: number }; signal?: AbortSignal } = {},
): Promise<LensImageResult> {
  const parameters: Record<string, string> = {};
  if (options.customerIntent) parameters.customerIntent = options.customerIntent.slice(0, 200);
  if (options.roi) parameters.roi = JSON.stringify(options.roi);
  // Upload natif du file:// : valide le fichier local avant le réseau et
  // distingue une panne de caméra d'un refus de Render.
  const data = await apiUploadFileData<unknown>(`${LENS_BASE}/analyze-image`, 'image', file, {
    parameters,
    timeoutMs: LENS_TIMEOUT_MS,
    signal: options.signal,
  });
  return parseImageResult(data);
}

export async function analyzeUrl(url: string, channel: 'url' | 'qr' = 'url', recordHistory = true): Promise<LensUrlResult> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/analyze-url`, {
    body: { url, channel, recordHistory },
    timeoutMs: LENS_TIMEOUT_MS,
  });
  return parseUrlResult(data);
}

export async function analyzeCode(value: string): Promise<LensSearchResult> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/analyze-code`, { body: { value }, timeoutMs: LENS_TIMEOUT_MS });
  return parseSearchResult(data);
}

export async function analyzeBarcode(code: string): Promise<LensSearchResult> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/analyze-barcode`, { body: { code }, timeoutMs: LENS_TIMEOUT_MS });
  return parseSearchResult(data);
}

export async function analyzeText(query: string): Promise<LensSearchResult> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/analyze-text`, { body: { query }, timeoutMs: LENS_TIMEOUT_MS });
  return parseSearchResult(data);
}

/** Stock frais: la page marchande est relue. Une page illisible rend `unknown`. */
export async function refreshLiveStock(urls: string[], title?: string): Promise<LensLiveStock[]> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/live-stock`, {
    body: { urls: urls.slice(0, 8), title: title || undefined },
    timeoutMs: LENS_TIMEOUT_MS,
  });
  return parseLiveStock(data);
}

/** تسجيل الاختيار للتحليلات؛ فشله لا يوقف المستخدم. */
export async function markChosen(eventId: string): Promise<void> {
  if (!eventId) return;
  try {
    await apiSendData<unknown>('POST', `${LENS_BASE}/choose`, { body: { eventId } });
  } catch {
    /* اختياري */
  }
}

export async function requestManualReview(input: {
  eventId?: string;
  sourceUrl: string;
  title: string;
  imageUrl?: string;
  source?: string;
  lensPrice?: number | null;
  lensCurrency?: string | null;
  desiredSize?: string;
  desiredColor?: string;
  contact: string;
}, sessionId: string): Promise<LensReviewRequest> {
  // `x-session-id` إلزامي: الخادم يرد INVALID_SESSION بدونه.
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/review-request`, {
    body: input,
    headers: { 'x-session-id': sessionId },
  });
  return parseReview(data);
}

export async function getManualReview(id: string, sessionId: string): Promise<LensReviewRequest> {
  const data = await apiGetData<unknown>(`${LENS_BASE}/review-request/${encodeURIComponent(id)}`, {
    headers: { 'x-session-id': sessionId },
  });
  return parseReview(data);
}

/* ── السجل (نفس شكل `AyrovixHistoryItem` في الموقع) ───────────────────── */

export type LensHistoryKind = 'image' | 'url' | 'qr' | 'barcode' | 'code' | 'text';

export interface LensHistoryItem {
  id: string;
  kind: LensHistoryKind;
  inputValue: string;
  queryLabel: string;
  title: string;
  imageUrl: string;
  sourceUrl: string;
  source: string;
  price: number | null;
  currency: string | null;
  verificationStatus: 'VERIFIED' | 'PENDING_MANUAL';
  resultsCount: number;
  createdAt: string;
}

const HISTORY_KINDS: LensHistoryKind[] = ['image', 'url', 'qr', 'barcode', 'code', 'text'];

export function parseHistory(value: unknown): LensHistoryItem[] {
  if (!Array.isArray(value)) throw malformed('historique');
  const items: LensHistoryItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) throw malformed('ligne historique');
    const id = str(entry.id);
    if (!id) throw malformed('identifiant historique');
    const kind = str(entry.kind) as LensHistoryKind;
    items.push({
      id,
      kind: HISTORY_KINDS.includes(kind) ? kind : 'text',
      inputValue: str(entry.inputValue),
      queryLabel: str(entry.queryLabel),
      title: str(entry.title),
      imageUrl: str(entry.imageUrl),
      sourceUrl: str(entry.sourceUrl),
      source: str(entry.source),
      price: num(entry.price),
      currency: strOrNull(entry.currency),
      verificationStatus: entry.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING_MANUAL',
      resultsCount: num(entry.resultsCount) ?? 0,
      createdAt: str(entry.createdAt),
    });
  }
  return items;
}

/** سجل Lens لهذا الزائر/الحساب. بلا هوية، الخادم يرجّع قائمة فارغة. */
export async function fetchLensHistory(limit = 30): Promise<LensHistoryItem[]> {
  const data = await apiGetData<unknown>(`${LENS_BASE}/history?limit=${Math.min(Math.max(1, limit), 100)}`);
  return parseHistory(data);
}
