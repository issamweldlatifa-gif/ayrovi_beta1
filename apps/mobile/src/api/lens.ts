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
  /** Prix ZAYROVI avant remise, calculé par le serveur — jamais reconstruit sur le téléphone. */
  originalPriceTnd: number | null;
}

export interface LensSourceRead {
  at: string;
  variantsAvailable: number;
  variantsAvailableWithColor: number | null;
  variantsUnavailable: number;
  variantsUnknown: number;
}

export interface LensOffer {
  source: string;
  sourceUrl: string;
  price: number | null;
  currency: string | null;
  priceTnd: number | null;
  promo: LensPromo | null;
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

export type LensProductFactSection = 'details' | 'material' | 'fit' | 'dimensions';

export interface LensProductFact {
  key: string | null;
  label: string;
  value: string;
  section: LensProductFactSection;
}

export interface LensCandidate {
  id: string;
  kind: 'catalog' | 'external';
  title: string;
  promo: LensPromo | null;
  description: string | null;
  /** Détails marchands arrivant progressivement à l'ouverture de la fiche. */
  details?: LensProductFact[];
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
  /** Prix barré publié par le marchand, puis son équivalent ZAYROVI. */
  originalPrice: number | null;
  originalPriceTnd: number | null;
  priceOrigin: 'merchant' | 'search' | null;
  availability: LensAvailability;
  availabilityCheckedAt: string | null;
  availabilityExpiresAt: string | null;
  sourceRead: LensSourceRead | null;
  sourceCondition: string | null;
  optionLabel: string | null;
  rating: number | null;
  ratingCount: number | null;
  ratingKind: 'merchant' | 'match' | 'listing-quality' | null;
  /** Score de rapprochement renvoyé par Lens, entre 0 et 100. */
  match: number | null;
  offerCount: number;
  offers: LensOffer[];
  /** رمز سعر موقّع من الخادم. التطبيق لا يصنعه أبداً. */
  priceToken: string | null;
  /** VERIFIED فقط مع رمز موقّع؛ غير ذلك PENDING_MANUAL. */
  priceVerificationStatus: 'VERIFIED' | 'PENDING_MANUAL';
  variantOptions: LensVariantOption[];
  /** مرجع التاجر كما نشره (sku/mpn) — غائب إن لم تكشطه المصدر. */
  sku?: string | null;
  /** الباركود كما نشرته المصدر (gtin/ean) — غائب إن لم يُنشر. */
  gtin?: string | null;
  /** بائع العرض كما نشرته المصدر — غائب إن لم يُنشر. */
  seller?: string | null;
  /** نصيحة المقاس كما نشرها المتجر — غائبة إن لم ينشرها. */
  sizeAdvice?: string | null;
  /** «العارض (190 سم) يلبس مقاس XL» — كما نشرها المتجر. */
  modelInfo?: string | null;
  /** معلومات التصنيع كما نشرها المتجر. */
  manufacturingInfo?: string | null;
  /** تقدير التسليم عند المتجر كما نشره. */
  deliveryEstimate?: string | null;
  /** عدّاد تخفيض المتجر كما نشره (مثال 1j4h22m). */
  promoCountdown?: string | null;
  /** أبعاد منشورة في الفيشة (تحتوي قيساً حقيقياً). */
  dimensionsInfo?: string | null;
  /** سياسة الإرجاع كما نشرها المتجر (مثال: Retours gratuits). */
  returnsPolicy?: string | null;
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

/** Boîte normalisée 0..1 : (x, y) = coin haut-gauche, w/h = largeur/hauteur. */
export interface LensBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Produit repéré par `/detect` (cadre de sélection + Live). Aucun prix. */
export interface LensDetectedProduct {
  name: string;
  category: string;
  box: LensBox;
}

export interface LensDetection {
  products: LensDetectedProduct[];
  /** Taille de l'image analysée (après redressement EXIF côté serveur). */
  width: number | null;
  height: number | null;
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
  return {
    percent: num(value.percent) ?? 0,
    label: str(value.label),
    priceTnd: num(value.priceTnd),
    originalPriceTnd: num(value.originalPriceTnd),
  };
};

function parseSourceRead(value: unknown): LensSourceRead | null {
  if (!isRecord(value) || !str(value.at)) return null;
  return {
    at: str(value.at),
    variantsAvailable: num(value.variantsAvailable) ?? 0,
    variantsAvailableWithColor: num(value.variantsAvailableWithColor),
    variantsUnavailable: num(value.variantsUnavailable) ?? 0,
    variantsUnknown: num(value.variantsUnknown) ?? 0,
  };
}

function parseOffers(value: unknown): LensOffer[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((offer) => {
    const sourceUrl = str(offer.sourceUrl);
    if (!sourceUrl) return [];
    return [{
      source: str(offer.source),
      sourceUrl,
      price: num(offer.price),
      currency: strOrNull(offer.currency),
      priceTnd: num(offer.priceTnd),
      promo: parsePromo(offer.promo),
    }];
  });
}

function parseProductFacts(value: unknown): LensProductFact[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((fact) => {
    const label = str(fact.label).trim();
    const factValue = str(fact.value).trim();
    if (!label || !factValue) return [];
    const section: LensProductFactSection = fact.section === 'material' || fact.section === 'fit' || fact.section === 'dimensions'
      ? fact.section : 'details';
    return [{
      key: strOrNull(fact.key),
      label: label.slice(0, 80),
      value: factValue.slice(0, 240),
      section,
    }];
  }).slice(0, 18);
}

function parseCandidateRecord(value: unknown, allowProductShape: boolean): LensCandidate {
  if (!isRecord(value)) throw malformed('fiche produit');
  const sourceUrl = str(value.sourceUrl);
  const id = str(value.id) || (allowProductShape && sourceUrl ? `url:${sourceUrl}` : '');
  if (!id || !sourceUrl) throw malformed('identifiant ou lien manquant');
  const colorImagesRaw = isRecord(value.colorImages) ? value.colorImages : null;
  const colorImages = colorImagesRaw
    ? Object.fromEntries(Object.entries(colorImagesRaw).map(([color, list]) => [color, strList(list)]))
    : null;
  const sourceRead = parseSourceRead(value.sourceRead);
  const offers = parseOffers(value.offers);
  const ratingKind = value.ratingKind === 'merchant' || value.ratingKind === 'match' || value.ratingKind === 'listing-quality'
    ? value.ratingKind
    : null;
  return {
    id,
    kind: value.kind === 'catalog' ? 'catalog' : 'external',
    title: str(value.title),
    promo: parsePromo(value.promo),
    description: strOrNull(value.description),
    details: parseProductFacts(value.details),
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
    originalPrice: num(value.originalPrice),
    originalPriceTnd: num(value.originalPriceTnd),
    priceOrigin: value.priceOrigin === 'merchant' || value.priceOrigin === 'search' ? value.priceOrigin : null,
    availability: availability(value.availability),
    availabilityCheckedAt: strOrNull(value.availabilityCheckedAt) ?? sourceRead?.at ?? null,
    availabilityExpiresAt: strOrNull(value.availabilityExpiresAt),
    sourceRead,
    sourceCondition: strOrNull(value.sourceCondition),
    optionLabel: strOrNull(value.optionLabel),
    rating: num(value.rating),
    ratingCount: num(value.ratingCount),
    ratingKind,
    match: num(value.match),
    offerCount: Math.max(offers.length, Math.trunc(num(value.offerCount) ?? 0)),
    offers,
    priceToken: strOrNull(value.priceToken),
    priceVerificationStatus: value.priceVerificationStatus === 'VERIFIED' && strOrNull(value.priceToken)
      ? 'VERIFIED'
      : 'PENDING_MANUAL',
    variantOptions: parseVariantOptions(value.variantOptions),
    // Identités marchandes (16/10/2026) : telles que publiées par la source.
    sku: strOrNull(value.sku),
    gtin: strOrNull(value.gtin),
    seller: strOrNull(value.seller),
    // Signaux de fiche (17/10/2026) : textes du marchand, mot pour mot.
    sizeAdvice: strOrNull(value.sizeAdvice),
    modelInfo: strOrNull(value.modelInfo),
    manufacturingInfo: strOrNull(value.manufacturingInfo),
    deliveryEstimate: strOrNull(value.deliveryEstimate),
    promoCountdown: strOrNull(value.promoCountdown),
    dimensionsInfo: strOrNull(value.dimensionsInfo),
    returnsPolicy: strOrNull(value.returnsPolicy),
  };
}

/** Candidat d'une grille Lens : l'identifiant fourni par le serveur est obligatoire. */
export function parseCandidate(value: unknown): LensCandidate {
  return parseCandidateRecord(value, false);
}

/** `/analyze-url` renvoie un produit sans `id`; son lien fournit un identifiant stable. */
export function parseUrlProduct(value: unknown): LensCandidate {
  return parseCandidateRecord(value, true);
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

export function parseIdentification(value: unknown): LensIdentification {
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

export function parseExcluded(value: unknown): LensImageResult['excluded'] {
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

/**
 * Réponse de `/detect`. Une boîte hors de 0..1 ou trop petite est écartée
 * (jamais « corrigée » au hasard) : mieux vaut un cadre manuel qu'un cadre faux.
 */
export function parseDetection(value: unknown): LensDetection {
  if (!isRecord(value)) throw malformed('détection');
  const products: LensDetectedProduct[] = [];
  for (const item of Array.isArray(value.products) ? value.products : []) {
    if (!isRecord(item) || !Array.isArray(item.box) || item.box.length !== 4) continue;
    const name = str(item.name).trim();
    const [x, y, w, h] = item.box.map((part) => num(part));
    if (!name || x === null || y === null || w === null || h === null) continue;
    if (x < 0 || y < 0 || w < 0.01 || h < 0.01 || x + w > 1.001 || y + h > 1.001) continue;
    products.push({ name: name.slice(0, 80), category: str(item.category) || 'other', box: { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) } });
    if (products.length >= 8) break;
  }
  const width = num(value.width);
  const height = num(value.height);
  return { products, width: width && width > 0 ? width : null, height: height && height > 0 ? height : null };
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
    product: parseUrlProduct(value.product),
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

/**
 * Produits visibles + boîtes (Z Lens : cadre de sélection et Live). Délai court :
 * une détection en retard ne doit jamais bloquer la recherche — l'écran retombe
 * alors sur un cadre manuel couvrant toute la photo.
 */
export const LENS_DETECT_TIMEOUT_MS = 15_000;

export async function detectProducts(
  file: { uri: string; name: string; type: string },
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<LensDetection> {
  const data = await apiUploadFileData<unknown>(`${LENS_BASE}/detect`, 'image', file, {
    timeoutMs: options.timeoutMs ?? LENS_DETECT_TIMEOUT_MS,
    signal: options.signal,
  });
  return parseDetection(data);
}

export async function analyzeUrl(
  url: string,
  channel: 'url' | 'qr' = 'url',
  recordHistory = true,
  signal?: AbortSignal,
): Promise<LensUrlResult> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/analyze-url`, {
    body: { url, channel, recordHistory },
    timeoutMs: LENS_TIMEOUT_MS,
    signal,
  });
  return parseUrlResult(data);
}

export async function analyzeCode(value: string, signal?: AbortSignal): Promise<LensSearchResult> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/analyze-code`, {
    body: { value }, timeoutMs: LENS_TIMEOUT_MS, signal,
  });
  return parseSearchResult(data);
}

export async function analyzeBarcode(code: string, signal?: AbortSignal): Promise<LensSearchResult> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/analyze-barcode`, {
    body: { code }, timeoutMs: LENS_TIMEOUT_MS, signal,
  });
  return parseSearchResult(data);
}

export async function analyzeText(query: string, signal?: AbortSignal): Promise<LensSearchResult> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/analyze-text`, {
    body: { query }, timeoutMs: LENS_TIMEOUT_MS, signal,
  });
  return parseSearchResult(data);
}

/** Stock frais: la page marchande est relue. Une page illisible rend `unknown`. */
export async function refreshLiveStock(urls: string[], title?: string, signal?: AbortSignal): Promise<LensLiveStock[]> {
  const data = await apiSendData<unknown>('POST', `${LENS_BASE}/live-stock`, {
    body: { urls: urls.slice(0, 8), title: title || undefined },
    timeoutMs: LENS_TIMEOUT_MS,
    signal,
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
