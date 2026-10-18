/**
 * AYWEBs — سياسة ما بعد الدفع (قرارات المالك):
 *
 *  • البطاقة : الشراء فوري. المهلة = لحظة تأكيد الدفع.
 *  • الحوالة / البريد : المهلة يوم واحد من لحظة رفع الوصل.
 *    (مهلة داخلية لنا، ما يحسّش بيها الحريف.)
 *  • تغيّر السعر عند التاجر بعد الدفع : نقبلوه دائماً، مهما كان المبلغ.
 *      - السعر طلع  ⇒ نتحمّلو الفرق (ما نطلبوش من الحريف شي).
 *      - السعر نزل  ⇒ الفرق يبقى عندنا (ما نرجّعوهش للحريف).
 *    لا سقف ولا استرجاع ولا انتظار موافقة.
 *
 * دوال نقية بلا قاعدة بيانات: الدفع والشراء يستعملوها، والاختبارات تغطيها.
 */

export const TRANSFER_PURCHASE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type PaymentMethodCode = 'CARD' | 'BANK_TRANSFER' | 'POSTE' | string;

/** الحوالة والبريد : مهلة الشراء تبدأ من رفع الوصل. البطاقة : فورياً. */
export function purchaseDueAt(input: {
  method: PaymentMethodCode;
  paidAt: string;
  proofSubmittedAt?: string | null;
}): string {
  if (input.method === 'BANK_TRANSFER' || input.method === 'POSTE') {
    const start = input.proofSubmittedAt || input.paidAt;
    const startMs = Date.parse(start);
    if (!Number.isFinite(startMs)) throw new Error('purchaseDueAt: date de départ invalide');
    return new Date(startMs + TRANSFER_PURCHASE_WINDOW_MS).toISOString();
  }
  // بطاقة (أو أي طريقة فورية): الشراء الآن.
  const paidMs = Date.parse(input.paidAt);
  if (!Number.isFinite(paidMs)) throw new Error('purchaseDueAt: date de paiement invalide');
  return new Date(paidMs).toISOString();
}

export interface PostPaymentPriceSettlement {
  action: 'ACCEPT';
  /** الفرق اللي تحمّلناه (السعر طلع). */
  absorbedTnd: number;
  /** الفرق اللي بقى عندنا (السعر نزل). */
  keptTnd: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * تغيّر السعر عند التاجر بعد الدفع: القبول دائماً، والفرق يُسجَّل
 * (تحمّلنا أو احتفظنا) باش يبان في الحسابات.
 */
export function settlePostPaymentPrice(input: { paidTnd: number; currentTnd: number }): PostPaymentPriceSettlement {
  const paid = Number(input.paidTnd);
  const current = Number(input.currentTnd);
  if (!Number.isFinite(paid) || !Number.isFinite(current) || paid < 0 || current < 0) {
    throw new Error('settlePostPaymentPrice: montants invalides');
  }
  const delta = round2(current - paid);
  return {
    action: 'ACCEPT',
    absorbedTnd: delta > 0 ? delta : 0,
    keptTnd: delta < 0 ? round2(-delta) : 0,
  };
}
