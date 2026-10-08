/**
 * تسميات الحالات — «الكود الخام ما يوصلش للمستعمل».
 *
 * المشكلة اللي تحلّها: الشاشات كانت تعرض `order.status` كما هو (`AWAITING_DEPOSIT`,
 * `PAID`…) وهو كود داخلي بالفرنسية/الإنجليزية. المستعمل التونسي يستحقّ «في انتظار
 * التسبقة»، لا `AWAITING_DEPOSIT`.
 *
 * القاعدة:
 *  • **المفردات مغلقة ومنشورة في مخطط قاعدة البيانات** (`src/db/database.ts`،
 *    `CHECK(status IN (…))`) — نفس اللي ينجّم الخادم يبعثو، لا أكثر. مكتوبة هنا
 *    مرآةً، ومُختبرة عند الجذر (`tests/mobile-status-vocabulary.test.ts`) باش ما
 *    تتباعدش على خفاء.
 *  • كود **مجهول** (الخادم زاد قيمة جديدة قبل التطبيق) ⇒ `null` ⇒ الواجهة تعرض
 *    الكود الخام. هذا ترصّد، موش زينة: نكتبو الحقيقة، ما نخترعوش تسمية.
 */
import type { TranslationKey } from '@/i18n/keys';

/** `orders.status` — من `CHECK(status IN (…))` في مخطط الطلبات. */
export const ORDER_STATUS_CODES = [
  'CREATED',
  'AWAITING_DEPOSIT',
  'AWAITING_PAYMENT_VERIFICATION',
  'CONFIRMED',
  'PREPARING',
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

/** `orders.payment_status` — من نفس المخطط. */
export const PAYMENT_STATUS_CODES = [
  'PENDING',
  'PENDING_VERIFICATION',
  'PAID',
  'PARTIALLY_PAID',
  'FAILED',
  'REJECTED',
  'REFUNDED',
] as const;

/** `orders.payment_method` — من نفس المخطط (يشمل `PENDING_SELECTION`). */
export const PAYMENT_METHOD_CODES = [
  'PENDING_SELECTION',
  'COD',
  'D17',
  'FLOUCI',
  'CARD',
  'BANK_TRANSFER',
  'POSTE',
] as const;

/** فئات الأخبار المسموح بها في `src/magazine/service.ts`. */
export const NEWS_CATEGORY_CODES = [
  'NEW_ARRIVAL',
  'NEW_BRAND',
  'PROMOTION',
  'DELIVERY',
  'AYROVI',
  'INFORMATION',
  'OTHER',
] as const;
export type NewsCategoryCode = (typeof NEWS_CATEGORY_CODES)[number];

/** `orders.deposit_status` — من نفس المخطط. */
export const DEPOSIT_STATUS_CODES = [
  'NONE',
  'PENDING',
  'SUBMITTED',
  'PAID',
  'REJECTED',
] as const;

/** أربع عائلات، كل واحدة مفرداتها ولها فضاء مفاتيح خاص بها. */
export type StatusFamily = 'order' | 'payment' | 'method' | 'deposit';

const ORDER_STATUS_KEYS: Record<string, TranslationKey> = {
  CREATED: 'status.order.CREATED',
  AWAITING_DEPOSIT: 'status.order.AWAITING_DEPOSIT',
  AWAITING_PAYMENT_VERIFICATION: 'status.order.AWAITING_PAYMENT_VERIFICATION',
  CONFIRMED: 'status.order.CONFIRMED',
  PREPARING: 'status.order.PREPARING',
  SHIPPED: 'status.order.SHIPPED',
  IN_TRANSIT: 'status.order.IN_TRANSIT',
  OUT_FOR_DELIVERY: 'status.order.OUT_FOR_DELIVERY',
  DELIVERED: 'status.order.DELIVERED',
  CANCELLED: 'status.order.CANCELLED',
};

const PAYMENT_STATUS_KEYS: Record<string, TranslationKey> = {
  PENDING: 'status.payment.PENDING',
  PENDING_VERIFICATION: 'status.payment.PENDING_VERIFICATION',
  PAID: 'status.payment.PAID',
  PARTIALLY_PAID: 'status.payment.PARTIALLY_PAID',
  FAILED: 'status.payment.FAILED',
  REJECTED: 'status.payment.REJECTED',
  REFUNDED: 'status.payment.REFUNDED',
};

const PAYMENT_METHOD_KEYS: Record<string, TranslationKey> = {
  PENDING_SELECTION: 'status.method.PENDING_SELECTION',
  COD: 'status.method.COD',
  D17: 'status.method.D17',
  FLOUCI: 'status.method.FLOUCI',
  CARD: 'status.method.CARD',
  BANK_TRANSFER: 'status.method.BANK_TRANSFER',
  POSTE: 'status.method.POSTE',
};

const DEPOSIT_STATUS_KEYS: Record<string, TranslationKey> = {
  NONE: 'status.deposit.NONE',
  PENDING: 'status.deposit.PENDING',
  SUBMITTED: 'status.deposit.SUBMITTED',
  PAID: 'status.deposit.PAID',
  REJECTED: 'status.deposit.REJECTED',
};

const NEWS_CATEGORY_KEYS: Record<NewsCategoryCode, TranslationKey> = {
  NEW_ARRIVAL: 'news.category.NEW_ARRIVAL',
  NEW_BRAND: 'news.category.NEW_BRAND',
  PROMOTION: 'news.category.PROMOTION',
  DELIVERY: 'news.category.DELIVERY',
  AYROVI: 'news.category.AYROVI',
  INFORMATION: 'news.category.INFORMATION',
  OTHER: 'news.category.OTHER',
};

/** Clé locale d'une catégorie connue ; `null` laisse les codes futurs visibles. */
export function newsCategoryKey(category: string): TranslationKey | null {
  const code = String(category || '').trim().toUpperCase();
  return NEWS_CATEGORY_KEYS[code as NewsCategoryCode] ?? null;
}

/** Libellé humain d'une catégorie, sans masquer les valeurs futures du serveur. */
export function newsCategoryText(
  category: string,
  translate: (key: TranslationKey) => string,
): string {
  const key = newsCategoryKey(category);
  return key ? translate(key) : category;
}

const KEYS: Record<StatusFamily, Record<string, TranslationKey>> = {
  order: ORDER_STATUS_KEYS,
  payment: PAYMENT_STATUS_KEYS,
  method: PAYMENT_METHOD_KEYS,
  deposit: DEPOSIT_STATUS_KEYS,
};

/** كل أكواد عائلة — للمرور عليها في الاختبارات وفي الواجهة كان لزم. */
export function statusCodes(family: StatusFamily): readonly string[] {
  switch (family) {
    case 'order': return ORDER_STATUS_CODES;
    case 'payment': return PAYMENT_STATUS_CODES;
    case 'method': return PAYMENT_METHOD_CODES;
    case 'deposit': return DEPOSIT_STATUS_CODES;
  }
}

/** مفتاح الترجمة لحالة معروفة، و`null` لحالة مجهولة (الواجهة تعرض الكود). */
export function statusKey(family: StatusFamily, code: string): TranslationKey | null {
  const value = String(code || '').trim().toUpperCase();
  if (!value) return null;
  return KEYS[family][value] ?? null;
}

/**
 * نص جاهز للعرض: التسمية المترجمة إذا كانت الحالة معروفة، وإلاّ الكود كما هو.
 * `translate` تُمرّر (موش تُستورد) باش هذا الملف يبقى بلا React وبلا سياق.
 */
export function statusText(
  family: StatusFamily,
  code: string,
  translate: (key: TranslationKey) => string,
): string {
  const key = statusKey(family, code);
  return key ? translate(key) : String(code || '');
}
