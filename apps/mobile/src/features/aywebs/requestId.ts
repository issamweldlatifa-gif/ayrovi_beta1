/**
 * معرّف عملية إضافة إلى السلّة.
 *
 * عقد الخادم: المفتاح (`request_id`) **ثابت لعملية واحدة** — إعادة إرسال نفس
 * الضغطة (شبكة تقطعت، المستعمل عاود) تُعامَل كإعادة تشغيل ما تولّدش سطراً
 * ثاني (`idempotent_replay`). وأي عملية جديدة (ضغطة جديدة، اختيار جديد) تاخذ
 * مفتاحاً جديداً.
 *
 * لهذا المعرّف هنا موش في `src/api`: هذي واجهة الجهاز (expo-crypto)، و`src/api`
 * يبقى نقي وقابل للاختبار في Node — نفس القاعدة متاع `features/aywebs/session`.
 */
import * as Crypto from 'expo-crypto';

export function newAyWebsRequestId(): string {
  return `aywadd-${Crypto.randomUUID()}`;
}
