/**
 * App Links — العقد الوحيد بين التطبيق (أندرويد) والموقع.
 *
 * علاش موجود: `android.intentFilters` في `apps/mobile/app.json` يخلّي
 * `https://ayrovi.tn/...` تفتح التطبيق مباشرة — **بشرط** أن أندرويد يتحقّق من
 * ملكية النطاق، وبذلك يقرأ `https://ayrovi.tn/.well-known/assetlinks.json`.
 * الملف هذا خاصو:
 *  • اسم الحزمة بالضبط كما في `app.json` (`app.ayrovi.mobile`)؛
 *  • بصمة SHA-256 للشهادة اللي توقّع الحزمة — **وشهادة Play مختلفة**:
 *    مفتاح التوقيع المحلي يُرفع مرّة أولى، وعندها Google Play تعيد توقيع الحزمة
 *    بمفتاحها. المعنى: لازم زوز بصمات على الأقل (مفتاح الإصدار + مفتاح Play)
 *    وإلاّ التطبيق المثبّت من Play ما يفتحش الروابط.
 *
 * البصمات ما تتكتبش في الكود: تتقرا من متغيّر بيئة (`ANDROID_APP_LINK_SHA256`)
 * لأنّها تتولّد عند صاحب المشروع، و`npm ci` ما عندوش سرّ. متغيّر فارغ = بلا
 * ملف = الموقع يبقى كما هو، والروابط تفتح في المتصفّح (سلوك أندرويد الافتراضي).
 *
 * خطأ بصمة (باي واحد ناقص) = ملف ما يتحقّقش أبداً بلا حتى إشارة. علاش هالقد
 * نرفضوا الخطأ بالقوة: نكتبوا هنا نفس ما تعمل أندرويد بالضبط — 32 بايت،
 * `AA:BB:...` — ونرفضوا أي شيء آخر بـ`null`.
 */

/** اسم حزمة الإصدار — نفس القيمة في `apps/mobile/app.json`. */
export const ANDROID_APP_LINK_PACKAGE = 'app.ayrovi.mobile';

/** حزمة العرض التجريبي (`AYROVI Démo`) — بصمة الـdebug key مختلفة. */
export const ANDROID_APP_LINK_DEMO_PACKAGE = 'app.ayrovi.mobile.demo';

/** متغيّر البيئة اللي يقرا منه الخادم البصمات (مفصولة بفاصلة). */
export const ANDROID_APP_LINK_ENV = 'ANDROID_APP_LINK_SHA256';

/** متغيّر البيئة اللي يقرا منه الخادم أسماء الحزم (مفصولة بفاصلة، اختياري). */
export const ANDROID_APP_LINK_PACKAGES_ENV = 'ANDROID_APP_LINK_PACKAGES';

/** بصمة شهادة SHA-256: 32 بايت بصيغة سداسية عشرية `AA:BB:...`. */
const FINGERPRINT_PATTERN = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/** بديل شائع: 64 حرف سداسي عشر بلا فواصل — نفس 32 بايت. */
const FINGERPRINT_COMPACT_PATTERN = /^[0-9A-F]{64}$/;

/**
 * ينظّف بصمة واحدة:
 *  • `SHA256: AA:BB…` (كما يطبع `keytool`) ⇒ `AA:BB…`؛
 *  • 64 حرف بلا فواصل ⇒ تدخل الفواصل.
 * في الحالتين نفس البايتات — ما نبدّلوش معنى، نبدّلوا الكتابة فقط.
 */
function normalizeFingerprint(value: string): string {
  const withoutLabel = value.trim().toUpperCase().replace(/^SHA-?256:/, '').trim();
  if (FINGERPRINT_PATTERN.test(withoutLabel)) return withoutLabel;
  if (FINGERPRINT_COMPACT_PATTERN.test(withoutLabel)) {
    return (withoutLabel.match(/.{2}/g) || []).join(':');
  }
  return withoutLabel;
}

/** أسماء حزم أندرويد الصالحة (مسطرة النقطة، حروف صغيرة وأرقام). */
const PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/** العلاقة اللي يطلبها أندرويد لفتح كل المسارات — موش مسار بعينه. */
export const ANDROID_APP_LINK_RELATION = 'delegate_permission/common.handle_all_urls';

/**
 * يقرا البصمات من نص: يفصل على الفاصلة/السطر الجديد، يرفع الحروف، يشيل
 * التكرار، **ويعطي `null` أوّل ما يلقى قيمة غير صالحة** (موش يتجاهلها).
 *
 * الشدة مقصودة: `ANDROID_APP_LINK_SHA256` مكتوب باليد، وبصمة ناقصة حرف واحد
 * تعطي ملف يتقرا بنجاح من المتصفّح ويُرفض بصمت من أندرويد. الاستثناء الوحيد
 * هو الفراغ: سلسلة فارغة/`undefined` = «ما فماش بصمات» ⇒ `null` بلا خطأ.
 */
export function parseCertificateFingerprints(raw: string | undefined | null): string[] | null {
  const cleaned = (raw || '')
    .split(/[\n\r,]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map(normalizeFingerprint);
  if (cleaned.length === 0) return null;
  for (const fingerprint of cleaned) {
    if (!FINGERPRINT_PATTERN.test(fingerprint)) return null;
  }
  return [...new Set(cleaned)];
}

/**
 * أسماء الحزم: الافتراضي حزمة الإصدار وحدها. تقبل تعدّد (الإصدار + العرض
 * التجريبي) لأنّ الاتنين يفتحوا `ayrovi.tn` في نفس التلفون.
 */
export function parseAppLinkPackages(raw: string | undefined | null): string[] | null {
  const cleaned = (raw || '')
    .split(/[\n\r,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  if (cleaned.length === 0) return [ANDROID_APP_LINK_PACKAGE];
  for (const name of cleaned) {
    if (!PACKAGE_PATTERN.test(name)) return null;
  }
  return [...new Set(cleaned)];
}

/**
 * البيان اللي يتكتب في `/.well-known/assetlinks.json`.
 * `null` = ما نكتبوش ملف غالط: البصمات ناقصة ولا مغلوطة.
 */
export function assetLinksStatement(
  packages: string[],
  fingerprints: string[],
): Array<Record<string, unknown>> | null {
  if (packages.length === 0 || fingerprints.length === 0) return null;
  return packages.map((packageName) => ({
    relation: [ANDROID_APP_LINK_RELATION],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints,
    },
  }));
}

/** نفس الحساب من متغيّرات البيئة — نقطة واحدة يستعملها الخادم. */
/**
 * تشخيص: شنوّة اللي ناقص بالضبط (08/10/2026).
 *
 * المشكلة اللي صلّحناها: إعلان البصمات (`ANDROID_APP_LINK_SHA256`) وحدو **ما
 * يكفّيش** — أسماء الحزم تجي من متغيّر ثاني (`ANDROID_APP_LINK_PACKAGES`)،
 * وفارغ ⇒ بلا بيان ⇒ 404. والرسالة كانت تقول «زيد البصمات» ⇒ صاحب المشروع
 * يزيدها وتبقى 404 بلا تفسير. تشخيص صريح يوفّر دورات كاملة.
 */
export interface AppLinksDiagnostics {
  packages: string[];
  fingerprints: string[];
  /** أسماء المتغيّرات الناقصة — فارغة ⇒ البيان يخرج. */
  missingEnv: string[];
}

export function appLinksDiagnostics(env: Record<string, string | undefined>): AppLinksDiagnostics {
  const packages = parseAppLinkPackages(env[ANDROID_APP_LINK_PACKAGES_ENV]) || [];
  const fingerprints = parseCertificateFingerprints(env[ANDROID_APP_LINK_ENV]) || [];
  const missingEnv: string[] = [];
  if (fingerprints.length === 0) missingEnv.push(ANDROID_APP_LINK_ENV);
  if (packages.length === 0) missingEnv.push(ANDROID_APP_LINK_PACKAGES_ENV);
  return { packages, fingerprints, missingEnv };
}

export function appLinksFromEnv(env: Record<string, string | undefined>): Array<Record<string, unknown>> | null {
  return assetLinksStatement(
    parseAppLinkPackages(env[ANDROID_APP_LINK_PACKAGES_ENV]) || [],
    parseCertificateFingerprints(env[ANDROID_APP_LINK_ENV]) || [],
  );
}
