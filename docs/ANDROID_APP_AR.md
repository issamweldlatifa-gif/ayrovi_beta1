# تطبيق أندرويد AYROVI — دليل العمل داخل هذه البيئة

> تحديث: 2026-10-04 — بُني الـ APK فعليًا داخل بيئة العمل من المصدر على فرع `main`
> (آخر commit: `350daf5`).

---

## 1) أين يوجد التطبيق؟

التطبيق الأصلي موجود **داخل نفس المستودع** في مجلد `android/` (Capacitor 7).
لا يوجد مستودع منفصل للتطبيق: الموقع والتطبيق ملف واحد ومصدر واحد.

```
/home/user/ayrovi_beta1/
├── android/                      ← مشروع أندرويد الأصلي (Gradle)
│   ├── app/src/main/AndroidManifest.xml
│   ├── app/src/main/java/app/ayrovi/mobile/
│   │   ├── MainActivity.java             (126 سطر)  القشرة + زر الرجوع + المشاركة + الروابط العميقة
│   │   ├── AyWebsBrowseActivity.java     (680 سطر)  متصفح المتاجر + شريط Add to Cart
│   │   └── AyWebsBrowsePlugin.java       (67 سطر)   الجسر بين الويب والجافا
│   ├── app/src/main/res/
│   │   ├── layout/         4 واجهات XML (متصفح، شريط، ورقتا حوار)
│   │   ├── values/         نصوص فرنسية + ألوان + ستايلات + أيقونات
│   │   └── values-ar/      نفس النصوص بالعربية (RTL مفعّل: supportsRtl=true)
│   ├── app/build.gradle    التوقيع + versionCode/versionName
│   └── variables.gradle    minSdk 23 · compileSdk 35 · targetSdk 35
├── capacitor.config.ts           إعداد Capacitor (appId: app.ayrovi.mobile)
├── client/                       واجهة React/Vite التي تُجمَّع داخل التطبيق
└── .github/workflows/android-apk.yml   بناء APK/AAB عبر GitHub Actions (يدوي)
```

**الـ APK المبني:** `/home/user/apk/AYROVI-debug.apk` (7.1 ميغابايت، موقّع بتوقيع debug).

| البند | القيمة |
|---|---|
| الحزمة | `app.ayrovi.mobile` |
| النسخة | versionName `1.0` · versionCode `1` |
| أقل إصدار أندرويد | 23 (أندرويد 6) |
| الإصدار المستهدف | 35 (أندرويد 15) |
| الأذونات | INTERNET · CAMERA · RECORD_AUDIO |
| SHA-256 | `b8dc861f6c7e6e9613e7181e14b08bed9567facd8ea4ff0eb52e112459cab148` |

---

## 2) تركيب الـ APK على الهاتف

1. نزّل الملف `AYROVI-debug.apk` من مساحة العمل إلى الهاتف.
2. من الإعدادات فعّل **«تثبيت من مصادر غير معروفة»** للتطبيق الذي تفتح منه الملف
   (المتصفح أو مدير الملفات) — أندرويد يطلبها تلقائيًا.
3. افتح الملف واضغط «تثبيت».
4. إن ظهر تحذير Play Protect: «تثبيت على أي حال» (السبب أن التوقيع توقيع تجريبي، لا مشكلة أمنية).

> ملاحظة: هذا بناء **debug** للاختبار المباشر. نسخة Google Play تحتاج AAB موقّعًا
> بمفتاح إصدار (keystore) يُضاف في أسرار GitHub — الطريقة موجودة في `ANDROID_APP.md`.

---

## 3) كيف يعمل التطبيق (باختصار)

- **الحزمة مضمّنة**: واجهة الموقع كاملة (HTML/JS/CSS) داخل الـ APK — يفتح فورًا وبدون شبكة.
- **الاتصال بالـ API**: مسار واحد — `client/src/services/nativeApiOrigin.ts` يعيد توجيه
  `/api/…` و`/uploads/…` إلى خادم الـ API الحقيقي.
- **الجلسة**: داخل التطبيق تُستخدم هوية Bearer (`x-ayrovi-native`) بدل الكوكيز.
- **متصفح المتاجر (AyWebs)**: نشاط أصلي فيه شريط «Add to Cart» يضيف مباشرة إلى سلة AYROVI.
- **المشاركة**: مشاركة نص/رابط من أي تطبيق آخر تفتح AYROVI على AyWebs.
- **روابط عميقة**: `ayrovi://aywebs` و `ayrovi://aywebs/cart` و `ayrovi://aywebs/product?url=…`.
- **زر الرجوع**: يعود داخل الواجهة قبل إغلاق التطبيق.

---

## 4) أوامر البناء (داخل هذه البيئة)

بيئة العمل مجهّزة بـ JDK 21 و Android SDK 35 في `/opt/android-sdk`، و Gradle cache في
`/opt/gradle` (خارج مجلد المشروع كي لا تثقل اللقطة). لإعادة البناء من الصفر:

```bash
cd /home/user/ayrovi_beta1

# 1. الواجهة → مجلد public/
npx vite build

# 2. نسخ الواجهة إلى مشروع أندرويد
npx cap sync android

# 3. بناء APK
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk
export GRADLE_USER_HOME=/opt/gradle
export AYROVI_VERSION_CODE=1 AYROVI_VERSION_NAME=1.0
cd android && sh ./gradlew assembleDebug --no-daemon

# الناتج: android/app/build/outputs/apk/debug/app-debug.apk
```

> إن أُعيد ضبط البيئة (JDK/SDK غير محفوظين في اللقطة): شغّل
> `bash /home/user/android-build/setup-sdk.sh` ثم أعد الخطوات.

---

## 5) خطة العمل المقترحة

| المرحلة | المهمة |
|---|---|
| 1 | تشخيص: أي شاشة/وظيفة ناقصة أو معطوبة في التطبيق الحالي |
| 2 | تعديل واجهة React (`client/`) — تنعكس تلقائيًا على التطبيق بعد `cap sync` |
| 3 | تعديلات أصلية (Java/XML) — متصفح المتاجر، الإشعارات، الكاميرا |
| 4 | إعادة بناء APK للاختبار على الهاتف |
| 5 | عند الجاهزية: AAB موقّع + رفع على Google Play |

---

## تحديث 05/10/2026 — دخول Google داخل التطبيق

- نسخة التطبيق التالية: `versionName 1.0.7` و`versionCode 7`.
- شاشة الدخول في Android أصبحت أقرب للنموذج الموافق عليه: شعار وعنوان ومسافات أصغر، مع بقاء البريد ووسائل الدخول.
- Google يستخدم نافذة Android Credential Manager الأصلية. عند الإلغاء يرجع العميل إلى AYROVI؛ وعند النجاح تُحدّث الجلسة ويظهر حسابه داخل التطبيق مباشرة، بلا صفحة `Connexion terminée` أو سهم يدوي.
- إذا فشل الاختيار الأصلي، يبقى العميل داخل التطبيق وتظهر رسالة؛ لا يفتح Custom Tab تلقائيًا. يلزم تطابق عميل OAuth Android مع بصمة شهادة توقيع APK.
- سير عمل GitHub Actions ينتج APK تجريبيًا بتوقيع debug دائمًا؛ وإذا كانت أسرار التوقيع الأربعة مضبوطة، ينتج أيضًا `AYROVI-release.apk` وAAB بتوقيع keystore الرسمي. ثبّت **release APK** لتطابق SHA-1 المسجّلة لدى Google. لا تُرسل ملف المفتاح أو كلمات مروره في المحادثة.
