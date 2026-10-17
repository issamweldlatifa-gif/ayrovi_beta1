/**
 * منطق مسلك الطلب — الجزء النقي، قابل للاختبار (Q5، 08/10/2026).
 *
 * لماذا مفصول عن المكوّن: «وين العميل داخل الاستمارة؟» قرار فيه حساب مواضع
 * وحدود، والقرارات اللي فيها حساب تتختبر — أو تتكسّر مع أول تغيير تخطيط.
 *
 * القاعدة: **المرحلة تُستنتج من التمرير**، موش من عدّاد يتقدّم لوحدو. وأول
 * مرحلة هي الافتراض دائماً: موضع التمرير فوق الكل ⇒ «العنوان».
 */
export interface JourneyOffsets {
  address: number;
  payment: number;
  confirm: number;
}

export type JourneyStepId = keyof JourneyOffsets;

export const JOURNEY_ORDER: JourneyStepId[] = ['address', 'payment', 'confirm'];

/**
 * هامش الرأس: المرحلة تولّي «الحالية» قبل ما يوصل التمرير لحافتها بالضبط.
 *
 * السبب عملي: عنوان القسم يبان فوق المحتوى، فانتظار الوصول للحافة يخلّي
 * المؤشّر يتأخّر خطوة عمّا يشوفو العميل فعلاً.
 */
export const JOURNEY_HEAD_MARGIN = 48;

/**
 * يرجّع فهرس المرحلة الظاهرة.
 *
 * `offsets` ناقصة أو سالبة ⇒ تُعتبر 0 (ما نقارنوش بـ`NaN`، وما نرجّعوش
 * فهرس غالط على تخطيط ما تحسبش بعد).
 */
export function resolveJourneyStep(
  scrollY: number,
  offsets: Partial<JourneyOffsets>,
  margin: number = JOURNEY_HEAD_MARGIN,
): number {
  if (!Number.isFinite(scrollY) || scrollY < 0) return 0;

  let index = 0;
  for (let position = 0; position < JOURNEY_ORDER.length; position += 1) {
    const key = JOURNEY_ORDER[position]!;
    const offset = offsets[key];
    // موضع ما تحسبش بعد (0 / غائب / تالف) ⇒ **ما يتقدّمش بيه**.
    //
    // العيب اللي كان: إعطاؤه 0 يخلي الشرط `y >= 0 - 48` يصحّ على الكل ⇒
    // المؤشّر ينيّط على **آخر** مرحلة قبل ما يتحسب التخطيط أصلاً.
    if (typeof offset !== 'number' || !Number.isFinite(offset) || offset <= 0) continue;
    if (scrollY >= offset - margin) index = position;
  }
  return index;
}

/**
 * المراحل المكتملة — **من نفس شروط الزرّ**.
 *
 * مؤشّر يقول «الدفع تمّ» والزرّ معطّل هو كذبة بصريّة. شرط واحد يستعمل مرّتين،
 * فما يتباعدوش مع الوقت.
 */
/**
 * هل الدفع **جاهز**؟ موش «مكتمل» — والفارق هو جوهر المسألة.
 *
 * ما فمّاش بوّابة خلاص متاحة ⇒ الخادم **يأجّل** الدفع (`PENDING_SELECTION`)
 * وموش يرفض الطلب. فحسابها «ناقص» يخلّي الزرّ معطّل على طول بلا سبب، والعميل
 * يحسب التطبيق خاسر. أمّا كيف ثمّة بوّابة ⇒ الاختيار صحيح شرط، لأنّ
 * `resolvePaymentMethod('')` يرجّع `PAYMENT_UNAVAILABLE` — يعني زرّ مفعّل
 * يولّي لخطأ محقّق بعد الضغطة.
 */
export function isPaymentReady(availableCount: number, chosen: boolean): boolean {
  if (typeof availableCount !== 'number' || !Number.isFinite(availableCount) || availableCount <= 0) return true;
  return chosen;
}

export function journeyCompletion(input: {
  addressValid: boolean;
  paymentValid: boolean;
}): [boolean, boolean, boolean] {
  // «الدفع» ما يكملش والعنوان ناقص: الترتيب حقيقي، موش ثلاث خانات مستقلّة.
  return [input.addressValid, input.addressValid && input.paymentValid, false];
}
