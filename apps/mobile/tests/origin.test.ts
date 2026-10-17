/**
 * «أي خادم يشير ليه البناء» — حقيقة واحدة، موش أربعة.
 *
 * علاش هذا الاختبار: الحزمة تاخذ عنوان الخادم من `EXPO_PUBLIC_API_BASE_URL`،
 * والورشات (APK و AAB) عندها قيمة افتراضية خاصة بها. كانوا يتباعدوا، تلقى
 * حزمة تشير لنطاق ما فيهش خادم — وهذا بالضبط اللي صار: `ayrovi.tn` ما فيهش
 * خادم يجاوب، والحزمة كانت تبنى عليه ⇒ «التطبيق ما يخدمش» في كل شاشة.
 *
 * لهذا القاعدة هنا: **الأصل الافتراضي في `src/api/config.ts` هو المرجع**،
 * والورشات ونسخة المعاينة في `app.json` لازم يتبعوه — بلا استثناء.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_API_BASE_URL } from '../src/api/config';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const ANDROID_APK = read('../../../.github/workflows/mobile-android.yml');
const RELEASE_AAB = read('../../../.github/workflows/mobile-release-aab.yml');
const PREFLIGHT = read('../scripts/release-preflight.mjs');
const MANIFEST = JSON.parse(read('../app.json')) as {
  expo: { android: { intentFilters: Array<{ autoVerify?: boolean; data?: Array<{ host?: string }> }> } };
};

describe('عنوان الخادم في البناء', () => {
  it('الأصل الافتراضي عنوان HTTPS صالح بلا مسار', () => {
    const parsed = new URL(DEFAULT_API_BASE_URL);
    expect(parsed.protocol).toBe('https:');
    expect(parsed.pathname).toBe('/');
    expect(parsed.search).toBe('');
  });

  it('ورشة الـAPK تبنى على نفس الأصل (الافتراضي + الرجوع)', () => {
    const occurrences = ANDROID_APK.match(new RegExp(DEFAULT_API_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || [];
    // واحدة في مدخل `workflow_dispatch`، وواحدة في سطر البناء.
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('ورشة AAB الموقّع تبنى على نفس الأصل (المدخل + الرجوع)', () => {
    const occurrences = RELEASE_AAB.match(new RegExp(DEFAULT_API_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('سكريبت جهوزية الإصدار يستعمل نفس الأصل افتراضاً', () => {
    expect(PREFLIGHT).toContain(`apiBase: '${DEFAULT_API_BASE_URL}'`);
    expect(PREFLIGHT).toContain(`origin: '${DEFAULT_API_BASE_URL}'`);
  });

  it('نطاق الخادم معلن كرابط عميق (وكذلك النطاق المستقبلي) — التحقّق موش الصمت', () => {
    const hosts = (MANIFEST.expo.android.intentFilters[0].data || []).map((entry) => entry.host);
    expect(MANIFEST.expo.android.intentFilters[0].autoVerify).toBe(true);
    expect(hosts).toContain(new URL(DEFAULT_API_BASE_URL).host);
    // النطاق المستقبلي يبقى معلناً: لمّا يولّي حيّ، الروابط تخدم بلا بناء جديد.
    expect(hosts).toContain('ayrovi.tn');
  });
});
