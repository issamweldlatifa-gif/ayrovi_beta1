/**
 * سياسة ما بعد الدفع — قرارات المالك (2026-10-18):
 * مهلة فورية للبطاقة، يوم واحد بعد رفع الوصل للحوالة/البريد،
 * وقبول تغيّر السعر دائماً (نتحمّلو الزيادة، ونحتفظو بالنقص).
 */
import { describe, expect, it } from 'vitest';

import {
  TRANSFER_PURCHASE_WINDOW_MS,
  purchaseDueAt,
  settlePostPaymentPrice,
} from '../src/aywebs/postPaymentPolicy';

const PAID = '2026-10-18T10:00:00.000Z';
const PROOF = '2026-10-18T12:30:00.000Z';

describe('purchaseDueAt', () => {
  it('البطاقة : الشراء فوري، المهلة = لحظة الدفع', () => {
    expect(purchaseDueAt({ method: 'CARD', paidAt: PAID })).toBe(PAID);
  });

  it('الحوالة : مهلة يوم واحد من رفع الوصل، موش من لحظة الموافقة', () => {
    const due = purchaseDueAt({ method: 'BANK_TRANSFER', paidAt: PAID, proofSubmittedAt: PROOF });
    expect(Date.parse(due) - Date.parse(PROOF)).toBe(TRANSFER_PURCHASE_WINDOW_MS);
    expect(TRANSFER_PURCHASE_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('البريد (POSTE) نفس قاعدة الحوالة', () => {
    const due = purchaseDueAt({ method: 'POSTE', paidAt: PAID, proofSubmittedAt: PROOF });
    expect(due).toBe('2026-10-19T12:30:00.000Z');
  });

  it('حوالة بلا تاريخ وصل : نرجعو لتاريخ الدفع', () => {
    expect(purchaseDueAt({ method: 'BANK_TRANSFER', paidAt: PAID, proofSubmittedAt: null }))
      .toBe('2026-10-19T10:00:00.000Z');
  });

  it('تاريخ غالط يرمي خطأ بدل ما يعطي مهلة مزوّرة', () => {
    expect(() => purchaseDueAt({ method: 'CARD', paidAt: 'not-a-date' })).toThrow();
  });
});

describe('settlePostPaymentPrice', () => {
  it('السعر طلع : نقبلو ونتحمّلو الفرق، مهما كان المبلغ', () => {
    expect(settlePostPaymentPrice({ paidTnd: 220, currentTnd: 245.5 }))
      .toEqual({ action: 'ACCEPT', absorbedTnd: 25.5, keptTnd: 0 });
  });

  it('السعر نزل : نقبلو ونحتفظو بالفرق، ما نرجّعوهش للحريف', () => {
    expect(settlePostPaymentPrice({ paidTnd: 220, currentTnd: 190 }))
      .toEqual({ action: 'ACCEPT', absorbedTnd: 0, keptTnd: 30 });
  });

  it('ما تغيّرش شي : صفر في الاتجاهين', () => {
    expect(settlePostPaymentPrice({ paidTnd: 220, currentTnd: 220 }))
      .toEqual({ action: 'ACCEPT', absorbedTnd: 0, keptTnd: 0 });
  });

  it('لا سقف : زيادة كبيرة جداً تبقى مقبولة', () => {
    expect(settlePostPaymentPrice({ paidTnd: 10, currentTnd: 5000 }).absorbedTnd).toBe(4990);
  });

  it('الكسور تتحسب بدقة المليم (بلا 0.1+0.2)', () => {
    expect(settlePostPaymentPrice({ paidTnd: 0.1, currentTnd: 0.3 }).absorbedTnd).toBe(0.2);
  });

  it('مبلغ سالب أو غير رقمي يُرفض', () => {
    expect(() => settlePostPaymentPrice({ paidTnd: -1, currentTnd: 10 })).toThrow();
    expect(() => settlePostPaymentPrice({ paidTnd: Number.NaN, currentTnd: 10 })).toThrow();
  });
});
