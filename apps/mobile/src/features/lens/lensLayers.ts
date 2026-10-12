/**
 * منطق طبقات Lens — دالّة نقيّة بلا واجهة، فتُختبر بدون جهاز.
 *
 * قاعدتان فقط:
 *  • الأوضاع (صورة / مسح مباشر / رابط ورمز) ليست تاريخاً: تبديلها يغلق الدرج.
 *  • درج واحد كحد أقصى: فتح درج يغلق الذي قبله. لا تداخل نوافذ.
 *
 * الرجوع (زر Android أو السهم) يتبع منطق التطبيقات المعتاد:
 *  1. درج مفتوح ⇒ يُغلق فقط؛
 *  2. بلا درج وفي وضع غير الصورة ⇒ العودة إلى وضع الصورة؛
 *  3. بلا درج وفي وضع الصورة ⇒ تترك الشاشة للتبويبات (الواجهة الرئيسية).
 */

export type LensMode = 'photo' | 'live' | 'code';

/** الدرج المفتوح الآن، أو `null`. */
export type LensLayer = 'results' | 'ocerex' | 'help' | 'history';

export interface LensStack {
  readonly mode: LensMode;
  readonly layer: LensLayer | null;
}

export const LENS_START: LensStack = { mode: 'photo', layer: null };

/** فتح درج: يستبدل الدرج المفتوح (درج واحد في كل مرة). */
export function openLayer(stack: LensStack, layer: LensLayer): LensStack {
  return { ...stack, layer };
}

/** إغلاق الدرج المفتوح، والوضع يبقى كما هو. */
export function closeLayer(stack: LensStack): LensStack {
  return stack.layer === null ? stack : { ...stack, layer: null };
}

/** تغيير الوضع: يغلق أي درج مفتوح. */
export function changeMode(_stack: LensStack, mode: LensMode): LensStack {
  return { mode, layer: null };
}

export type LensBackAction = 'close-layer' | 'photo-mode' | 'leave';

export function backAction(stack: LensStack): LensBackAction {
  if (stack.layer !== null) return 'close-layer';
  if (stack.mode !== 'photo') return 'photo-mode';
  return 'leave';
}

/** تطبيق الرجوع على الحالة. `leave` يُرجع الحالة كما هي (التبويبات تتولّى الباقي). */
export function applyBack(stack: LensStack): LensStack {
  switch (backAction(stack)) {
    case 'close-layer':
      return closeLayer(stack);
    case 'photo-mode':
      return { mode: 'photo', layer: null };
    case 'leave':
      return stack;
  }
}

/** هل يُقرأ الباركود أو الكاميرا تعمل؟ لا قراءة والدرج مفتوح، ولا كاميرا في وضع الرابط. */
export function scanAllowed(stack: LensStack): boolean {
  // القراءة بالكاميرا تأتي من ماسح QR في وضع «Lien / code» فقط (لا يُركَّب إلا وهو مفتوح).
  return stack.mode === 'code' && stack.layer === null;
}
