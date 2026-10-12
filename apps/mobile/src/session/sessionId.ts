/**
 * معرّف الجلسة — الجزء النقي (بلا React Native، قابل للاختبار).
 *
 * الخادم يفرض `^[A-Za-z0-9._:-]{8,160}$` على `x-session-id`. المعرّف هِنا
 * «علامة تركيب» (installation) موش هوية: ما فيهش حتى معلومة شخصية، وهو نفسو
 * اللّي يخلي السلّة تبدا قبل الدخول وتبقى بعدو (§26 في عقد الخادم).
 */

export const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;

export function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value.trim());
}

/**
 * يبني المعرّف من UUID v4: `ayw-<uuid>`. النتيجة تتحقّق من النمط قبل ما ترجع،
 * وكان UUID ما جاش صالح (سيبة كذّابة في مكتبة) نفشلو بصوت عالي — موش نولّدو
 * معرّفاً ضعيفاً في الصمت.
 */
export function formatSessionId(uuid: string): string {
  const value = `ayw-${String(uuid).trim().toLowerCase()}`;
  if (!isValidSessionId(value)) {
    throw new Error(`UUID invalide pour une session : « ${uuid} »`);
  }
  return value;
}
