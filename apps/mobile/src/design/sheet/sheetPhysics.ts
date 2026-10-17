/**
 * فيزياء الدرج السفلي — دوال نقيّة بلا واجهة، فتُختبر بدون جهاز.
 *
 * كل قرار (هل يُغلق؟ أين يقف الظل؟) يُحسب هنا، والمكوّن `AppSheet` ينفّذه
 * على خيط الواجهة (UI thread) عبر Reanimated. لا حساب في خيط JavaScript أثناء السحب.
 */

/** نابض الفتح والإغلاق: سريع، بلا ارتداد زائد، فيبدو ثابتاً. */
export const SHEET_SPRING = {
  damping: 30,
  stiffness: 340,
  mass: 0.9,
  overshootClamping: true,
} as const;

/** نسبة الارتفاع التي يجب تجاوزها بالسحب لإغلاق الدرج. */
export const DISMISS_RATIO = 0.28;

/** سرعة نزول (px/s) تكفي للإغلاق مهما كان الموضع. */
export const DISMISS_VELOCITY = 900;

/**
 * المسافة المقطوعة للأسفل (translateY) وسرعة الإفلات → هل يُغلق الدرج؟
 * الموضع 0 = مفتوح بالكامل، الموضع `height` = مغلق.
 */
export function shouldDismiss(translateY: number, velocityY: number, height: number): boolean {
  if (height <= 0) return false;
  return translateY > height * DISMISS_RATIO || velocityY > DISMISS_VELOCITY;
}

/**
 * موضع الدرج بعد حركة إصبع بمقدار `changeY`.
 *  • لا يتجاوز الفتح الكامل للأعلى (0)؛
 *  • لا يتجاوز الإغلاق (`height`).
 */
export function nextTranslate(current: number, changeY: number, height: number): number {
  const next = current + changeY;
  if (next < 0) return 0;
  if (next > height) return height;
  return next;
}

/**
 * هل يحقّ للسحب أن يحرّك الدرج؟ إذا كان المحتوى ممرّراً للأسفل (scrollY > 0) والدرج
 * مفتوح بالكامل، فالتمرير هو الذي يملك الحركة. الدرج لا يتحرك إلا عند أعلى المحتوى.
 */
export function panMovesSheet(translateY: number, scrollY: number): boolean {
  return translateY > 0 || scrollY <= 0;
}

/** شفافية الظل الخلفي: 1 حين يكون الدرج مفتوحاً، 0 حين يغلق. */
export function backdropOpacity(translateY: number, height: number): number {
  if (height <= 0) return 0;
  const ratio = 1 - translateY / height;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}
