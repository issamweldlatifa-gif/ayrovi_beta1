/**
 * سلّة AYROVI — العميل (مرحلة P5، الشريحة 1).
 *
 * هذي **سلّة الشراء الحقيقية**: السطور اللّي تدخلها AYWEBs (بالجسر) وOCEREX
 * (بـ`commit`) تجي هنا، منها يتكوّن الطلب. سلّة AYWEBs تبقى منفصلة — هي
 * «منبع» فيه أسعار المتاجر وتحقّقها، وهذي هي سلّة الفلوس.
 *
 * ملاحظات عقد صريحة (مقروءة من الخادم، موش مُفترضة):
 *  • ردود `/api/cart/items` **موش** مغلّفة بـ`data`: الحقول في الجذر مع `success`
 *    ⇒ `apiGetEnvelope` / `apiSendEnvelope`.
 *  • `x-session-id` إلزامي على القراءة والكتابة، ونفس معرّف الجهاز متاع AYWEBs:
 *    الخادم يربط السلّتين بنفس الجلسة، و`checkout` يجمّع الزوز.
 *  • المجموع في الخادم = **المنتوجات + التوصيل**: `totalTND = goods + deliveryTND`.
 *    لهذا نكتبو «مجموع المنتوجات» = `totalTND - deliveryTND` (طرح أرقام الخادم،
 *    موش حساب جديد في الجهاز).
 *  • `priceTrust` يحكم: `STALE` يعني التسعير فات وقتو والخادم يرفض الطلب
 *    (`PRICE_VERIFICATION_REQUIRED`) — نقولوها قبل الضغطة، موش بعدها.
 */
import { ApiError } from './errors';
import { apiGetEnvelope, apiSendEnvelope, type RequestOptions } from './client';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const round = (value: number): number => Math.round(value * 1000) / 1000;
const malformed = (what: string): ApiError => new ApiError('malformed', `Réponse panier illisible : ${what}`);

/** حالة الثقة في سعر السطر — قرار الخادم، موش تقدير الجهاز. */
export type AyroviPriceTrust = 'FRESH' | 'MANUAL' | 'STALE';

export interface AyroviCartLine {
  id: string;
  store: string;
  title: string;
  imageUrl: string;
  sourceUrl: string;
  sourcePrice: number;
  sourceCurrency: string;
  quantity: number;
  /** الاختيار المعروض (مقاس/لون) — كما بعثناه، بلا إعادة صياغة. */
  variant: string;
  customerNote: string;
  priceVerificationStatus: 'VERIFIED' | 'PENDING_MANUAL';
  /** `''` = الخادم ما قالش (نسخة قديمة من السطر) — ما نخمّنوش. */
  priceTrust: AyroviPriceTrust | '';
  priceTrustReason: string;
  priceTrustExpiresAt: string;
  availability: string;
  availabilityReason: string;
  lineTotalTND: number | null;
  originalLineTotalTND: number | null;
  promoLabel: string;
  discountTND: number | null;
  updatedAt: string;
}

export interface AyroviCart {
  sessionId: string;
  items: AyroviCartLine[];
  /** مجموع القطع (موش عدد السطور). */
  units: number;
  productSubtotalTND: number;
  deliveryTND: number;
  totalTND: number;
  /** السطور اللّي توقف الطلب — بمعرّفها، والسبب يتقرا من السطر. */
  blockedIds: string[];
}

export function parseAyroviCartLine(payload: unknown): AyroviCartLine {
  if (!isRecord(payload) || !str(payload.id)) throw malformed('ligne');
  const trust = str(payload.priceTrust);
  const promo = isRecord(payload.promo) ? payload.promo : null;
  const availability = str(payload.availability);
  return {
    id: str(payload.id),
    store: str(payload.store),
    title: str(payload.title),
    imageUrl: str(payload.imageUrl),
    sourceUrl: str(payload.sourceUrl),
    sourcePrice: num(payload.sourcePrice) ?? 0,
    sourceCurrency: str(payload.sourceCurrency).toUpperCase(),
    quantity: num(payload.quantity) ?? 1,
    variant: str(payload.requestedSize) || str(payload.requestedColor) || str(payload.variant),
    customerNote: str(payload.customerNote),
    priceVerificationStatus: payload.priceVerificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING_MANUAL',
    priceTrust: trust === 'FRESH' || trust === 'MANUAL' || trust === 'STALE' ? trust : '',
    priceTrustReason: str(payload.priceTrustReason),
    priceTrustExpiresAt: str(payload.priceTrustExpiresAt),
    availability,
    availabilityReason: str(payload.availabilityReason),
    lineTotalTND: num(payload.lineTotalTND),
    originalLineTotalTND: num(payload.originalLineTotalTND),
    promoLabel: promo ? str(promo.label) : '',
    discountTND: promo ? num(promo.discountTND) : null,
    updatedAt: str(payload.updatedAt),
  };
}

export function parseAyroviCart(payload: unknown): AyroviCart {
  if (!isRecord(payload) || !Array.isArray(payload.items)) throw malformed('panier');
  const items = payload.items.map(parseAyroviCartLine);
  const deliveryTND = num(payload.deliveryTND) ?? 0;
  const totalTND = num(payload.totalTND) ?? 0;
  return {
    sessionId: str(payload.sessionId),
    items,
    units: num(payload.totalItemsCount) ?? items.reduce((sum, line) => sum + line.quantity, 0),
    // المجموع متاع الخادم يشمل التوصيل: نرجّعو المنتوجات كيما هو معروف في الخادم.
    productSubtotalTND: round(Math.max(0, totalTND - deliveryTND)),
    deliveryTND,
    totalTND,
    blockedIds: items.filter((line) => line.priceTrust === 'STALE').map((line) => line.id),
  };
}

/** `GET /api/cart/items` — السلّة كاملة بلا أي حساب في الجهاز. */
export async function fetchAyroviCart(
  options: RequestOptions & { sessionId: string },
): Promise<AyroviCart> {
  const payload = await apiGetEnvelope<unknown>('/api/cart/items', {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    headers: { 'x-session-id': options.sessionId, ...(options.headers ?? {}) },
  });
  return parseAyroviCart(payload);
}

/**
 * `PATCH /api/cart/items/:id` — الكمية **مطلقة** (0 = حذف في نفس المسار).
 * ما نبعثوش كمية نسبية: الجهاز ما يعرفش الحالة الحقيقية في الخادم.
 */
export async function updateAyroviCartQuantity(
  input: { itemId: string; quantity: number; sessionId: string },
  options: RequestOptions = {},
): Promise<{ itemId: string; quantity: number }> {
  // ما نقصّوش الكسر بصمت: 2.5 موش «2»، هي طلب غالط يتقال قبل الشبكة.
  const quantity = input.quantity;
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
    throw new ApiError('malformed', 'Quantité invalide (entier 0..99).');
  }
  const payload = await apiSendEnvelope<Record<string, unknown>>('PATCH', `/api/cart/items/${encodeURIComponent(input.itemId)}`, {
    body: { quantity },
    headers: { 'x-session-id': input.sessionId, ...(options.headers ?? {}) },
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  const line = isRecord(payload.cartItem) ? payload.cartItem : null;
  if (!line || !str(line.id)) throw malformed('ligne mise à jour');
  return { itemId: str(line.id), quantity: num(line.quantity) ?? quantity };
}

/** `DELETE /api/cart/items/:id` — `removed:true` وإلا عقد مكسور. */
/**
 * إضافة منتوج **كتالوج** للسلّة — بـ`productId` فقط.
 *
 * لماذا مسار مخصّص (`/api/cart/catalog`): المسار العام يعيد حساب السعر من
 * `sourcePrice`، بينما منتوج الكتالوج عندو `final_price` منشور من المتجر.
 * إعادة الحساب تنتج **سعراً ثانياً** لنفس المنتوج — وهذا بالضبط اللي منعنا
 * «زيد للسلّة» في Q1. هنا: سعر واحد، هو سعر المتجر، `VERIFIED`.
 *
 * والرفض يُقرأ من الخادم (بلا سعر · نافد · منتوج موش موجود) ⇒ الشاشة تقول
 * السبب الحقيقي، موش «وقع خطأ».
 */
export interface CatalogCartResult {
  cartItemId: string;
  totalItemsCount: number;
  totalTND: number;
  deliveryTND: number;
}

export async function addCatalogToCart(input: {
  productId: string;
  quantity?: number;
  requestedSize?: string;
  requestedColor?: string;
  customerNote?: string;
}, options: RequestOptions = {}): Promise<CatalogCartResult> {
  const payload = await apiSendEnvelope<Record<string, unknown>>('POST', '/api/cart/catalog', {
    ...options,
    body: {
      productId: input.productId,
      ...(input.quantity ? { quantity: input.quantity } : {}),
      ...(input.requestedSize ? { requestedSize: input.requestedSize } : {}),
      ...(input.requestedColor ? { requestedColor: input.requestedColor } : {}),
      ...(input.customerNote ? { customerNote: input.customerNote } : {}),
    },
  });
  const cartItem = isRecord(payload.cartItem) ? payload.cartItem : {};
  return {
    cartItemId: str(cartItem.id),
    totalItemsCount: num(payload.totalItemsCount) ?? 0,
    totalTND: num(payload.totalTND) ?? 0,
    deliveryTND: num(payload.deliveryTND) ?? 0,
  };
}

export async function removeAyroviCartItem(
  input: { itemId: string; sessionId: string },
  options: RequestOptions = {},
): Promise<void> {
  const payload = await apiSendEnvelope<Record<string, unknown>>('DELETE', `/api/cart/items/${encodeURIComponent(input.itemId)}`, {
    headers: { 'x-session-id': input.sessionId, ...(options.headers ?? {}) },
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  if (payload.removed !== true) throw malformed('suppression');
}

/* ── البوابة: واش يوقف الطلب قبل ما نبداو ──────────────────────────────── */

export interface AyroviCartReadiness {
  canCheckout: boolean;
  /** سطور يلزمها إعادة تحقّق من السعر (Lens) قبل الطلب. */
  staleLines: AyroviCartLine[];
  /** سبب واحد للعرض: التوصيل/الدفع يزيدو يتحقّقوا في شاشة الشراء. */
  blockReason: '' | 'EMPTY' | 'PRICE_VERIFICATION_REQUIRED';
}

/**
 * نفس قرار الخادم في `/api/checkout` (`verifyCartPriceTrust`) وأول شرط منّو:
 * **سلّة فارغة ما تولّدش طلباً**، وسطر `STALE` يوقف الطلب كامل بسببه.
 * هذي بوابة عرض فقط — الخادم يبقى هو الحاكم.
 */
export function ayroviCartReadiness(cart: AyroviCart | null): AyroviCartReadiness {
  if (!cart || cart.items.length === 0) return { canCheckout: false, staleLines: [], blockReason: 'EMPTY' };
  const staleLines = cart.items.filter((line) => line.priceTrust === 'STALE');
  if (staleLines.length) {
    return { canCheckout: false, staleLines, blockReason: 'PRICE_VERIFICATION_REQUIRED' };
  }
  return { canCheckout: true, staleLines: [], blockReason: '' };
}

/** رسالة السطر الموقوف — من كود الخادم، بلا تفسير مخترع. */
export const AYROVI_PRICE_TRUST_REASONS: Record<string, string> = {
  TOKEN_EXPIRED_OR_ALTERED: 'QUOTE_EXPIRED',
  TOKEN_MISSING: 'QUOTE_MISSING',
  MANUAL_REVIEW_PATH: 'MANUAL_REVIEW',
  TOKEN_VALID: 'FRESH',
  LEGACY_RECENT: 'FRESH',
};
