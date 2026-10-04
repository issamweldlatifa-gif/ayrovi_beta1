/**
 * ختم البناء المرئي (04/10-2026).
 *
 * لماذا : بعد تسليم دفعات إصلاح، بقي المستخدم يرى واجهات قديمة لأن الخادم
 * المنشور (وأحيانًا الـ APK المثبّت) لم يُحدَّث — ولم يكن هناك ما يميّز
 * النسخة الجديدة بصريًا. الختم يُظهر للعين المجردة أي بناء يعمل الآن، في
 * الموقع وفي التطبيق : في CI يحمل اختصار كوميت GitHub (GITHUB_SHA)، ومحليًا
 * تاريخ البناء. يُحقن عبر `define` في vite.config.mts.
 */
declare const __AYROVI_BUILD_STAMP__: string;

export const APP_BUILD_STAMP: string =
  typeof __AYROVI_BUILD_STAMP__ === 'string' && __AYROVI_BUILD_STAMP__ ? __AYROVI_BUILD_STAMP__ : 'dev';
