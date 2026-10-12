/**
 * منطق ثبات الجهاز، بلا أي وحدة أصلية: يُغذّى بعيّنات مقياس التسارع ويقرّر متى
 * يبقى الهاتف ساكناً مدة كافية لالتقاط المنتج.
 *
 * القاعدة:
 *  • حركة فوق `MOVE_G` تُعيد العدّ من الصفر وتُعيد تسليح الالتقاط.
 *  • سكون متواصل مدة `STILL_MS` يُطلق الالتقاط مرة واحدة فقط، حتى تحدث حركة جديدة.
 *
 * هذا قياس لثبات الكاميرا (وبالتالي ثبات المنتج في الإطار)، وليس تعرّفاً بصرياً على
 * المنتج. التعرّف يتم على الخادم بعد الالتقاط.
 */

/** فرق التسارع بين عينتين متتاليتين (بوحدة g) الذي يُعدّ حركة. */
export const MOVE_G = 0.04;
/** المدة المطلوبة من السكون قبل الالتقاط (ملّي ثانية). قصيرة عمداً. */
export const STILL_MS = 900;

export type StillnessState = {
  /** آخر عينة (x, y, z) أو null قبل أول قراءة. */
  last: { x: number; y: number; z: number } | null;
  /** بداية السكون الحالي (ملّي ثانية)، أو null إذا كان الجهاز يتحرك. */
  stillSince: number | null;
  /** تم الالتقاط في هذا السكون: لا يُطلق مرة أخرى قبل حركة جديدة. */
  fired: boolean;
};

export const INITIAL_STILLNESS: StillnessState = { last: null, stillSince: null, fired: false };

export type Sample = { x: number; y: number; z: number };

/** الانتقال من عيّنة إلى التي تليها. `fire` = يجب الالتقاط الآن. */
export function nextStillness(state: StillnessState, sample: Sample, now: number): { state: StillnessState; fire: boolean } {
  if (!state.last) {
    return { state: { ...state, last: sample, stillSince: now }, fire: false };
  }
  const delta = Math.abs(sample.x - state.last.x) + Math.abs(sample.y - state.last.y) + Math.abs(sample.z - state.last.z);
  if (delta > MOVE_G) {
    // حركة: يبدأ العدّ من جديد، ويُعاد التسليح للالتقاط القادم.
    return { state: { last: sample, stillSince: null, fired: false }, fire: false };
  }
  const stillSince = state.stillSince ?? now;
  const held = now - stillSince >= STILL_MS;
  const fire = held && !state.fired;
  return {
    state: { last: sample, stillSince, fired: state.fired || fire },
    fire,
  };
}
