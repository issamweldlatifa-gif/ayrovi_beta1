/**
 * معرّف جلسة AYWEBs — الجزء النقي (بلا React Native، قابل للاختبار).
 *
 * الخادم يفرض `^[A-Za-z0-9._:-]{8,160}$` على `x-session-id`. المعرّف هِنا
 * «علامة تركيب» (installation) موش هوية: ما فيهش حتى معلومة شخصية، وهو نفسو
 * اللّي يخلي السلّة تبدا قبل الدخول وتبقى بعدو (§26 في عقد الخادم).
 */

export const AYWEBS_SESSION_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;

export function isValidAyWebsSessionId(value: unknown): value is string {
  return typeof value === 'string' && AYWEBS_SESSION_PATTERN.test(value.trim());
}

/**
 * يبني المعرّف من UUID v4: `ayw-<uuid>`. النتيجة تتحقّق من النمط قبل ما ترجع،
 * وكان UUID ما جاش صالح (سيبة كذّابة في مكتبة) نفشلو بصوت عالي — موش نولّدو
 * معرّفاً ضعيفاً في الصمت.
 */
export function formatAyWebsSessionId(uuid: string): string {
  const value = `ayw-${String(uuid).trim().toLowerCase()}`;
  if (!isValidAyWebsSessionId(value)) {
    throw new Error(`UUID invalide pour une session AYWEBs : « ${uuid} »`);
  }
  return value;
}
