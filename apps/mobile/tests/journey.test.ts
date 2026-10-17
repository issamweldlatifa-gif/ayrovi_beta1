/**
 * مسلك الطلب — مؤشّر **يقول الحقيقة** وإلا ما يبانش (Q5، 08/10/2026).
 *
 * الفكرة المختبرة: المرحلة **تُستنتج من التمرير**، موش من عدّاد يتقدّم لوحدو.
 * مؤشّر يتقدّم بلا سبب هو زينة تكذب — وهذا الفرق بين «مسلك» و«شريط تجميل».
 */
import { describe, expect, it } from 'vitest';
import {
  JOURNEY_HEAD_MARGIN, isPaymentReady, journeyCompletion, resolveJourneyStep,
} from '../src/features/checkout/journey';

const OFFSETS = { address: 300, payment: 900, confirm: 1500 };

describe('أيّ مرحلة هي الحالية؟', () => {
  it('فوق كلشي ⇒ «العنوان» (ما فمّاش مرحلة سالبة)', () => {
    expect(resolveJourneyStep(0, OFFSETS)).toBe(0);
  });

  it('التمرير يتقدّم ⇒ المرحلة تتقدّم **معاه**، موش لوحدها', () => {
    expect(resolveJourneyStep(320, OFFSETS)).toBe(0);
    expect(resolveJourneyStep(880, OFFSETS)).toBe(1);
    expect(resolveJourneyStep(1480, OFFSETS)).toBe(2);
  });

  it('هامش الرأس: المرحلة تولّي حالية **قبل** حافتها (العنوان يبان فوق)', () => {
    // 900 - 48 = 852 ⇒ «الدفع» يبدأ يبان من 852، موش من 900.
    expect(resolveJourneyStep(852, OFFSETS)).toBe(1);
    expect(resolveJourneyStep(851, OFFSETS, 48)).toBe(0);
    expect(JOURNEY_HEAD_MARGIN).toBe(48);
  });

  it('التمرير للّوط ⇒ آخر مرحلة تبقى الحالية', () => {
    expect(resolveJourneyStep(99_999, OFFSETS)).toBe(2);
  });

  it('مواضع ما تحسبتش بعد (0) ⇒ «العنوان»، موش فهرس غالط', () => {
    expect(resolveJourneyStep(500, {})).toBe(0);
    expect(resolveJourneyStep(500, { address: 0, payment: 0, confirm: 0 })).toBe(0);
  });

  it('قيمة تالفة ⇒ «العنوان» (ما نرجّعوش فهرس من `NaN`)', () => {
    expect(resolveJourneyStep(Number.NaN, OFFSETS)).toBe(0);
    expect(resolveJourneyStep(-10, OFFSETS)).toBe(0);
    // العنوان ما تحسبش ⇒ ما يتقدّمش بيه؛ والعميل واقف قبل الدفع ⇒ «العنوان».
    expect(resolveJourneyStep(500, { address: Number.NaN, payment: 900, confirm: 1500 })).toBe(0);
  });
});

describe('المراحل المكتملة — من نفس شروط الزرّ', () => {
  it('والو صالح ⇒ والو مكتمل (حتى «التأكيد»)', () => {
    expect(journeyCompletion({ addressValid: false, paymentValid: false })).toEqual([false, false, false]);
  });

  it('العنوان صالح بس ⇒ «العنوان» وحدو', () => {
    expect(journeyCompletion({ addressValid: true, paymentValid: false })).toEqual([true, false, false]);
  });

  it('الدفع ما يكملش والعنوان ناقص: الترتيب حقيقي موش خانات مستقلّة', () => {
    expect(journeyCompletion({ addressValid: false, paymentValid: true })).toEqual([false, false, false]);
  });

  it('الزوز صالحين ⇒ مرحلتان، و«التأكيد» يبقى ناقصاً (يتمّ بعد الإرسال)', () => {
    expect(journeyCompletion({ addressValid: true, paymentValid: true })).toEqual([true, true, false]);
  });
});

/* ── جهوزية الدفع: بوّابة ⇒ شرط، بلا بوّابة ⇒ مؤجّل موش مرفوض ───────────── */

describe('isPaymentReady', () => {
  it('بوّابة متاحة + اختيار صحيح ⇒ جاهز', () => {
    expect(isPaymentReady(3, true)).toBe(true);
  });

  it('بوّابة متاحة بلا اختيار ⇒ موش جاهز (وإلا خطأ PAYMENT_UNAVAILABLE بعد الضغطة)', () => {
    expect(isPaymentReady(3, false)).toBe(false);
  });

  it('ما فمّاش بوّابة ⇒ جاهز (الخادم يأجّل الدفع، موش يرفضو)', () => {
    expect(isPaymentReady(0, false)).toBe(true);
  });

  it('عدد تالف ⇒ نأجّل وما نحجبش الزرّ', () => {
    expect(isPaymentReady(Number.NaN, false)).toBe(true);
    expect(isPaymentReady(-1, false)).toBe(true);
  });
});
