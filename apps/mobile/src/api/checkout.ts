/**
 * الشراء — العميل (مرحلة P5، الشريحة 2).
 *
 * هذي هي **قاعدة البيع**، والمنطق هنا مأخوذ من الويب حرفياً
 * (`client/src/shop/checkoutOrder.ts` + `commerce/policy.ts`) باش التطبيق
 * والموقع ما يقولوش كلاماً مختلفاً على نفس الخادم.
 *
 * المبادئ:
 *  • **الطلب يتخلق قبل الخلاص**: أمر الشراء هو المرجع، والدفع يتعلّق بيه
 *    بمعرّفه. لهذا `paymentMethod` في جسم الطلب = `PENDING_SELECTION` دائماً.
 *  • **ما نقترحوش وسيلة ما تتعمّرش**: القائمة = المعلنة من الخادم
 *    (`paymentMethods`) ∩ المتوفّرة تقنياً (بوابة الكارطة، RIB، الحساب البريدي).
 *  • **الرفض يتقال بكوده**: `PRICE_VERIFICATION_REQUIRED` موش «خطأ»، هي «عاود
 *    تحقّق من السعر»؛ وكود ما نعرفوهش يتعرض كما هو باش الدعم يقراه.
 *  • **بلا خلاص مصنوع**: `payUrl` ناقص = عقد مكسور، موش نجاح.
 */
import { ApiError } from './errors';
import { apiGetData, apiSendData, apiSendEnvelope, type RequestOptions } from './client';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/* ── سياسة التجارة: ما يقبله الخادم توّا، بلا تخمين ─────────────────────── */

export interface CommercePolicy {
  governorates: string[];
  /** الوسائل المقبولة في الخادم (قائمة مغلقة). */
  paymentMethods: string[];
  deliveryDelay: string;
  cardGateway: boolean;
  localDeliveryTND: number | null;
  expressFeeTND: number | null;
  deposit: {
    percent: number;
    cardDiscountPercent: number;
    companyName: string;
    bankRib: string;
    posteAccount: string;
    flouciNumber: string;
    reviewDelay: string;
    unavailableRefundPolicy: string;
  };
}

export function parseCommercePolicy(payload: unknown): CommercePolicy {
  if (!isRecord(payload)) throw new ApiError('malformed', 'Politique commerciale illisible.');
  const deposit = isRecord(payload.deposit) ? payload.deposit : {};
  const percent = num(deposit.percent);
  const cardDiscountPercent = num(deposit.cardDiscountPercent);
  // نفس شرط الويب: شروط بيع ناقصة = ما نعرضوش مبالغ عربون مخترعة.
  if (percent === null || percent <= 0 || percent > 100
    || cardDiscountPercent === null || cardDiscountPercent < 0 || cardDiscountPercent > 100) {
    throw new ApiError('malformed', 'COMMERCE_TERMS_INVALID');
  }
  const pricing = isRecord(payload.pricing) ? payload.pricing : {};
  const capabilities = isRecord(payload.capabilities) ? payload.capabilities : {};
  return {
    governorates: strList(payload.governorates).filter((value) => value.trim().length > 0),
    paymentMethods: strList(payload.paymentMethods).map((value) => value.toUpperCase()),
    deliveryDelay: str(payload.deliveryDelay),
    cardGateway: capabilities.cardGateway === true,
    localDeliveryTND: num(pricing.localDeliveryTND),
    expressFeeTND: num(pricing.expressFeeTND),
    deposit: {
      percent,
      cardDiscountPercent,
      companyName: str(deposit.companyName) || 'AYROVI',
      bankRib: str(deposit.bankRib),
      posteAccount: str(deposit.posteAccount),
      flouciNumber: str(deposit.flouciNumber),
      reviewDelay: str(deposit.reviewDelay),
      unavailableRefundPolicy: str(deposit.unavailableRefundPolicy),
    },
  };
}

export async function fetchCommercePolicy(options: RequestOptions = {}): Promise<CommercePolicy> {
  return parseCommercePolicy(await apiGetData<unknown>('/api/public/commerce-config', options));
}

/* ── وسائل الخلاص: القائمة والتوفّر ────────────────────────────────────── */

export type PaymentMethodId = 'COD' | 'CARD' | 'FLOUCI' | 'D17' | 'BANK_TRANSFER' | 'POSTE';

interface PaymentDefinition {
  id: PaymentMethodId;
  /** مفاتيح الترجمة: النص ما يتكتبش في منطق. */
  labelKey: string;
  hintKey: string;
  blockedKey: string;
  available: (policy: CommercePolicy) => boolean;
}

/**
 * التعريفات كما في الويب بالحرف:
 *  • `COD` دايماً متاح (ما يستحقّش بوابة).
 *  • `CARD` كان البوابة مركّبة فعلاً في الخادم.
 *  • `BANK_TRANSFER` كان RIB منشور، و`POSTE` كان حساب بريدي منشور.
 *  • `FLOUCI` / `D17` **ما يتاحوش** بلا بوابة: رقم وحدو ما يصنعش خلاصاً.
 */
export const PAYMENT_DEFINITIONS: PaymentDefinition[] = [
  { id: 'COD', labelKey: 'pay.COD', hintKey: 'pay.COD.hint', blockedKey: 'pay.COD.blocked', available: () => true },
  { id: 'CARD', labelKey: 'pay.CARD', hintKey: 'pay.CARD.hint', blockedKey: 'pay.CARD.blocked', available: (policy) => policy.cardGateway },
  { id: 'BANK_TRANSFER', labelKey: 'pay.BANK_TRANSFER', hintKey: 'pay.BANK_TRANSFER.hint', blockedKey: 'pay.BANK_TRANSFER.blocked', available: (policy) => Boolean(policy.deposit.bankRib.trim()) },
  { id: 'POSTE', labelKey: 'pay.POSTE', hintKey: 'pay.POSTE.hint', blockedKey: 'pay.POSTE.blocked', available: (policy) => Boolean(policy.deposit.posteAccount.trim()) },
  { id: 'FLOUCI', labelKey: 'pay.FLOUCI', hintKey: 'pay.FLOUCI.hint', blockedKey: 'pay.FLOUCI.blocked', available: () => false },
  { id: 'D17', labelKey: 'pay.D17', hintKey: 'pay.D17.hint', blockedKey: 'pay.D17.blocked', available: () => false },
];

export interface PaymentChoice {
  id: PaymentMethodId;
  labelKey: string;
  hintKey: string;
  blockedKey: string;
  available: boolean;
}

/**
 * اللي يتعرض في الشاشة: كل وسيلة مع حالتها. واللي **ينجم يتخلّص** فعلاً = متاح
 * تقنياً **و** مقبول في الخادم (قائمة الخادم فارغة = ما نضيّقوش، كيما الويب).
 */
export function paymentChoices(policy: CommercePolicy): PaymentChoice[] {
  const accepted = policy.paymentMethods;
  return PAYMENT_DEFINITIONS.map((definition) => ({
    id: definition.id,
    labelKey: definition.labelKey,
    hintKey: definition.hintKey,
    blockedKey: definition.blockedKey,
    available: definition.available(policy) && (accepted.length === 0 || accepted.includes(definition.id)),
  }));
}

export function availablePaymentChoices(policy: CommercePolicy): PaymentChoice[] {
  return paymentChoices(policy).filter((choice) => choice.available);
}

/** نفس دالة الويب: بلا وسيلة متاحة ⇒ الطلب يتخلق و`PENDING_SELECTION`. */
export function resolvePaymentMethod(
  selected: string,
  availability: { anyAvailable: boolean; isAvailable: (method: string) => boolean },
): { method: string; deferred: boolean } | { refusal: 'PAYMENT_UNAVAILABLE' } {
  if (!availability.anyAvailable) return { method: 'PENDING_SELECTION', deferred: true };
  const method = String(selected || '').toUpperCase();
  if (!method || !availability.isAvailable(method)) return { refusal: 'PAYMENT_UNAVAILABLE' };
  return { method, deferred: false };
}

/* ── شروط الطلب: نفس قواعد الويب، دوال نقية ────────────────────────────── */

export function normalizeTunisianPhone(raw: string): string {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00216')) digits = digits.slice(5);
  else if (digits.startsWith('216') && digits.length === 11) digits = digits.slice(3);
  return digits;
}

export function isTunisianPhone(raw: string): boolean {
  return /^[24579]\d{7}$/.test(normalizeTunisianPhone(raw));
}

export function isEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw || ''));
}

export interface CheckoutIdentity {
  authenticated: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface CheckoutForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  termsAccepted: boolean;
}

export type CheckoutRefusal =
  | 'AUTH_REQUIRED'
  | 'CONTACT_NOT_VERIFIED'
  | 'FIELDS_MISSING'
  | 'EMAIL_INVALID'
  | 'PHONE_INVALID'
  | 'TERMS_REQUIRED';

/** أول رفض، بالترتيب اللي يهمّ — والسبب يتقال، موش «false». */
export function refuseCheckout(identity: CheckoutIdentity, form: CheckoutForm): CheckoutRefusal | null {
  if (!identity.authenticated) return 'AUTH_REQUIRED';
  if (!identity.emailVerified && !identity.phoneVerified) return 'CONTACT_NOT_VERIFIED';
  if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.address.trim()) return 'FIELDS_MISSING';
  if (!isEmail(form.email)) return 'EMAIL_INVALID';
  if (!isTunisianPhone(form.phone)) return 'PHONE_INVALID';
  if (!form.termsAccepted) return 'TERMS_REQUIRED';
  return null;
}

/* ── الطلب نفسه ────────────────────────────────────────────────────────── */

export interface CheckoutInput {
  name: string;
  email: string;
  phone: string;
  /** الولاية — من قائمة الخادم. */
  city: string;
  address: string;
  /** `home` فقط في التطبيق: المكتب/نقطة الاستلام يستلزمون كتالوج نقاط (ما فمّاش). */
  deliveryMode: 'home';
  latitude: number | null;
  longitude: number | null;
  locale: 'fr' | 'ar';
  termsAccepted: true;
}

export interface CheckoutResult {
  orderId: string;
  orderNumber: string;
  totalTND: number;
  itemCount: number;
  message: string;
  breakdownTotalTND: number | null;
  deposit: {
    percent: number | null;
    amountTND: number | null;
    balanceTND: number | null;
    cardDiscountPercent: number | null;
    status: string;
  };
}

export function parseCheckoutResult(payload: unknown): CheckoutResult {
  if (!isRecord(payload) || !str(payload.orderId) || !str(payload.orderNumber)) {
    throw new ApiError('malformed', 'Confirmation de commande illisible.');
  }
  const breakdown = isRecord(payload.breakdown) ? payload.breakdown : {};
  const deposit = isRecord(payload.deposit) ? payload.deposit : {};
  return {
    orderId: str(payload.orderId),
    orderNumber: str(payload.orderNumber),
    totalTND: num(payload.totalTND) ?? 0,
    itemCount: num(payload.itemCount) ?? 0,
    message: str(payload.message),
    breakdownTotalTND: num(breakdown.totalTnd),
    deposit: {
      percent: num(deposit.percent),
      amountTND: num(deposit.amountTnd),
      balanceTND: num(deposit.balanceTnd),
      cardDiscountPercent: num(deposit.cardDiscountPercent),
      status: str(deposit.status),
    },
  };
}

/**
 * `POST /api/checkout` — الطلب يتخلق هنا، وبعدها يتعلّق الخلاص بيه.
 * الردّ جذري (`success` + الحقول)، بلا غلاف `data`.
 */
export async function submitCheckout(
  input: CheckoutInput,
  options: RequestOptions & { sessionId: string },
): Promise<CheckoutResult> {
  const envelope = await apiSendEnvelope<Record<string, unknown>>('POST', '/api/checkout', {
    body: {
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      city: input.city.trim(),
      address: input.address.trim(),
      deliveryMode: input.deliveryMode,
      // الطلب هو المرجع: الوسيلة تختار بعد، من صفحة الطلب.
      paymentMethod: 'PENDING_SELECTION',
      latitude: input.latitude,
      longitude: input.longitude,
      locale: input.locale === 'ar' ? 'ar-TN' : 'fr-TN',
      termsAccepted: true,
    },
    headers: { 'x-session-id': options.sessionId, ...(options.headers ?? {}) },
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? 30_000,
  });
  return parseCheckoutResult(envelope);
}

/**
 * `POST /api/customer/account/orders/:id/payments/card/initiate` — يرجّع صفحة
 * الخلاص. هذي الوحيدة **مغلّفة بـ`data`** (كيما الموقع بالضبط).
 */
export async function initiateCardPayment(
  orderId: string,
  options: RequestOptions = {},
): Promise<{ payUrl: string; transactionNumber: string; amountTND: number | null }> {
  const data = await apiSendData<unknown>('POST', `/api/customer/account/orders/${encodeURIComponent(orderId)}/payments/card/initiate`, {
    body: {},
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? 30_000,
  });
  if (!isRecord(data) || !str(data.payUrl)) {
    throw new ApiError('malformed', 'La passerelle n’a pas renvoyé d’adresse de paiement.');
  }
  return {
    payUrl: str(data.payUrl),
    transactionNumber: str(data.transactionNumber),
    amountTND: num(data.amountTnd),
  };
}

/** الرفض المحلي (نفس الشروط، قبل الشبكة) — يتقال بنفس طريقة رفض الخادم. */
export const CHECKOUT_LOCAL_REFUSALS: Record<string, string> = {
  AUTH_REQUIRED: 'checkout.refusal.AUTH_REQUIRED',
  CONTACT_NOT_VERIFIED: 'checkout.refusal.CONTACT_NOT_VERIFIED',
  FIELDS_MISSING: 'checkout.refusal.FIELDS_MISSING',
  EMAIL_INVALID: 'checkout.refusal.EMAIL_INVALID',
  PHONE_INVALID: 'checkout.refusal.PHONE_INVALID',
  PAYMENT_UNAVAILABLE: 'checkout.refusal.PAYMENT_UNAVAILABLE',
};

/** أكواد رفض الخادم اللي نعرفوهم — والكود المجهول يبقى يبان. */
export const CHECKOUT_SERVER_REFUSALS: Record<string, string> = {
  PRICE_VERIFICATION_REQUIRED: 'checkout.refusal.PRICE_VERIFICATION_REQUIRED',
  AYWEBS_SOURCE_VERIFICATION_REQUIRED: 'checkout.refusal.AYWEBS_SOURCE_VERIFICATION_REQUIRED',
  CONTACT_VERIFICATION_REQUIRED: 'checkout.refusal.CONTACT_VERIFICATION_REQUIRED',
  VERIFIED_EMAIL_REQUIRED: 'checkout.refusal.VERIFIED_EMAIL_REQUIRED',
  CHECKOUT_EMAIL_INVALID: 'checkout.refusal.CHECKOUT_EMAIL_INVALID',
  TERMS_REQUIRED: 'checkout.refusal.TERMS_REQUIRED',
  DELIVERY_MODE_INVALID: 'checkout.refusal.DELIVERY_MODE_INVALID',
  DELIVERY_POINT_REQUIRED: 'checkout.refusal.DELIVERY_POINT_REQUIRED',
  DELIVERY_LOCATION_INVALID: 'checkout.refusal.DELIVERY_LOCATION_INVALID',
  ORDER_TOTAL_CAP: 'checkout.refusal.ORDER_TOTAL_CAP',
  ACCOUNT_UNAVAILABLE: 'checkout.refusal.ACCOUNT_UNAVAILABLE',
  CARD_GATEWAY_UNAVAILABLE: 'checkout.refusal.CARD_GATEWAY_UNAVAILABLE',
};

/**
 * كود الرفض من أي خطأ: رفض محلي (`code` على كائن عادي) ولا رفض خادم
 * (`ApiError`). الكود المجهول يبقى يبان بنصّه — بلا تغطية بمفتاح عام.
 */
export function checkoutRefusalText(error: unknown): { key: string; code: string; message: string } {
  if (error instanceof ApiError) {
    const key = CHECKOUT_SERVER_REFUSALS[error.code] ?? CHECKOUT_LOCAL_REFUSALS[error.code] ?? '';
    return { key, code: error.code, message: error.message };
  }
  if (isRecord(error) && typeof error.code === 'string' && error.code) {
    const key = CHECKOUT_LOCAL_REFUSALS[error.code] ?? CHECKOUT_SERVER_REFUSALS[error.code] ?? '';
    return { key, code: error.code, message: str(error.message) };
  }
  return { key: '', code: '', message: '' };
}
