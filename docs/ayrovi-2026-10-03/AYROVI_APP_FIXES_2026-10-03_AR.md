# AYROVI — إصلاحات تطبيق الأندرويد + تصحيحات جوهرية

**التاريخ:** 3 أكتوبر 2026 · **الإصدار:** `3.10.4`
**الرقعة:** `AYROVI_إصلاحات_التطبيق_2026-10-03.patch` (353 سطراً، 7 ملفات + ملف جديد) — مُتحقَّق أنها تُطبَّق وتُنتج ملفات **مطابقة بايت-بايت**
**يعقب:** `AYROVI_تقرير_تطبيق_الأندرويد.md` (Q2) · `AYROVI_تشخيص_أخطاء_التطبيق.md` (Q3) · `AYROVI_تشخيص_الأخطاء_الخمسة.md` (Q4) · `AYROVI_سجل_الإصلاحات_2026-10-03.md` (الويب)

---

## 0. الجواب المباشر

**لا — أخطاء التطبيق لم تكن مُصلَحة.** خدمة المراجعة السابقة كلها كانت **ويب/سيرفر** (CSS، مدقّقات، CI، سكرابر). التطبيق لم يُلمَس، وهذا ما أثبته فحص الملفات: لا إذن ميكروفون، لا `allowBackup=false`، الخطأ القاتل في الجافا كما هو.

**الآن: أُصلحت 6 أخطاء تطبيق بأدلّة، واتّضح أن 3 من ادّعاءاتي السابقة خاطئة.**

| # | الخطأ | المصدر | الحالة |
|---|---|---|---|
| 1 | **«أضف للسلة»/السلة/المفضّلة لا تفعل شيئاً** | Q2 | ✅ **مُصلَح** — Intent بلا action + مخطط خاطئ |
| 2 | زر الرجوع يُغلق التطبيق فوراً | Q3 | ✅ **مُصلَح** — `onBackPressed` مفقود من Capacitor 7 |
| 3 | المحتوى يمرّ تحت شريط الحالة | Q3/A | ✅ **مُصلَح** — `overlaysWebView` كان `true` |
| 4 | الميكروفون يفشل بصمت | Q4 | ✅ **مُصلَح** — `RECORD_AUDIO` غير مُعلَن |
| 5 | `adb backup` يستخرج الجلسات | Q2 | ✅ **مُصلَح** — `allowBackup="false"` |
| 6 | مفتاح `handleBackButton` وهمي | Q2/Q3 | ✅ **مُصلَح** — محذوف |
| — | ❌ **«معرض الصور محجوب»** | Q4 | ⛔ **ادّعاء خاطئ** — أثبتنا أنّه يعمل |
| — | ❌ **«قوائم `accept` تنقص `image/*`»** | Q4 | ⛔ **ادّعاء خاطئ** — موجودة في الخمسة كلها |
| — | ❌ **«الكاميرا تبقى شغّالة وراء السلة»** | Q4 | ⛔ **ادّعاء خاطئ** — الإغلاق يوقفها تماماً |
| — | الإشعارات (دفع) غير ممكنة | Q4 | ✅ مؤكَّد — و**لم نُعلن إذنها** عن قصد |
| — | OAuth يفتح المتصفّح · الدفع يخرج من التطبيق · لا تحديث حيّ | Q3 | ⏳ بنيوي — يحتاج قرار + جهاز |

---

## 1. الخطأ القاتل — «أضف للسلة» لا يفعل شيئاً (كان P0)

### 🔍 الدليل: سلسلة «فشل صامت» مزدوجة

`AyWebsBrowseActivity.openWebRoute()` كانت:
```java
Intent intent = new Intent(this, MainActivity.class);   // ← بلا action على الإطلاق
intent.setData(Uri.parse(webBase + route));             // ← https://localhost/aywebs/cart
intent.setFlags(FLAG_ACTIVITY_CLEAR_TOP | FLAG_ACTIVITY_SINGLE_TOP);
startActivity(intent);
finish();                                               // ← يُغلق الشاشة الحالية
```
و`MainActivity.ayWebsTarget()` تبدأ بـ:
```java
String action = intent.getAction();
if (action == null) { return null; }        // ← هنا تنتهي القصة: لا تنقّل
...
if (Intent.ACTION_VIEW.equals(action)) {
    if (!"ayrovi".equalsIgnoreCase(data.getScheme())) return null;   // ← والحاجز الثاني
}
```
**فشلان مستقلّان:** (1) بلا `action` ⇒ خروج فوري؛ (2) وحتى مع `ACTION_VIEW`، الـ URL من نوع `https` يرفضه الفحص الذي يطلب `ayrovi://aywebs`. والنتيجة العملية: الزبون يضغط «أضف للسلة» أو السلة أو المفضّلة ⇒ **الشاشة تُغلق ولا يحدث أي تنقّل**، والزبون يعود للصفحة القديمة بلا رسالة.

### ✅ الإصلاح
```java
private static final String AYWEBS_DEEP_LINK = "ayrovi://aywebs";   // ثابت جديد

Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(AYWEBS_DEEP_LINK + route));
intent.setClass(this, MainActivity.class);
intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
startActivity(intent);
finish();
```
الآن الـ Intent هو **رابط عميق AYWEBs حقيقي** بنفس الصيغة المُعلَنة في المانيفست (§25) — و`MainActivity` تترجمه إلى `https://localhost/aywebs/cart` وتُحمّله في الـ WebView.

### 📊 التحقّق
```
  ✓ AyWebsBrowseActivity : openWebRoute envoie une action
  ✓ AyWebsBrowseActivity : openWebRoute utilise le schéma ayrovi://
  ✓ MainActivity : ayWebsTarget rejette les intents sans action
```
✅ **لا أخطاء صياغة** (`javac -encoding UTF-8` → 0 خطأ حقيقي بعد استثناء الحزم الغائبة).
⚠️ **لم تُتحقَّق بالتصريف الكامل**: لا يوجد Android SDK ولا JDK 21 في هذه البيئة. أضفنا **مهمّة compile في CI** لهذا الغرض بالضبط (القسم 7).

---

## 2. زر الرجوع كان يُغلق التطبيق فوراً (Q3)

### 🔍 الدليل — ونتيجة قاطعة كانت لصالحنا
```
$ grep -rn "onBackPressed" node_modules/@capacitor/android/       →  0 نتيجة
$ grep -n "enableOnBackInvokedCallback" AndroidManifest.xml       →  غير مضبوط
```
**Capacitor 7.6.9 لا يعرّف زر الرجوع إطلاقاً** (المفتاح `handleBackButton` مات). فالنقر على الرجوع كان يذهب للسلوك الافتراضي لأندرويد: `finish()` ⇒ **إغلاق التطبيق حتى لو كانت شاشة AYROVI مفتوحة فوق**.

قبل الإصلاح، اختبرنا الفرضية التي يقوم عليها الحل — هل طبقات التطبيق مبنية على `history`؟
```
  الصفحة الرئيسية    : history.length = 2  · dialog = 0
  بعد فتح Lens       : history.length = 3  · dialog = 1
  بعد history.back() : dialog = 0   ←  ✅ الطبقة أُغلقت فعلاً
```

### ✅ الإصلاح
```java
@Override
public void onBackPressed() {
    if (getBridge() != null && getBridge().getWebView() != null
        && getBridge().getWebView().canGoBack()) {
        getBridge().getWebView().goBack();   // شاشة AYROVI مفتوحة ⇒ تُغلق
        return;
    }
    super.onBackPressed();                   // الجذر ⇒ يخرج من التطبيق (سلوك صحيح)
}
```

---

## 3. المحتوى يمرّ تحت شريط الحالة (Q3/A)

### 🔍 الدليل
`StatusBarConfig.java:7` → `private boolean overlaysWebView = true;` (الافتراضي) و`StatusBarPlugin.java:35` يقرأ الإعداد من `plugins.StatusBar.overlaysWebView`. وبما أن `targetSdk 35` يفرض edge-to-edge، فالمحتوى كان يُرسم تحت الشريط.

### ✅ الإصلاح — في `capacitor.config.ts`
```ts
plugins: {
  StatusBar: { overlaysWebView: false, style: 'DARK', backgroundColor: '#FAFAFA' },
},
```
**ليست تغييراً تجميلياً**: تحقّقنا أن الإضافة تقرأ هذا المفتاح فعلاً (`StatusBarPlugin.java:35`) — أي أن القيمة الافتراضية `true` هي أصل المشكلة، وإعدادنا يُبطلها.

---

## 4. الميكروفون كان يفشل بلا رسالة (Q4)

### 🔍 الدليل — إثبات مزدوج
```
node_modules/@capacitor/android/.../BridgeWebChromeClient.java:102  → onPermissionRequest(...)
                                                             :109  → permissionList.add(Manifest.permission.RECORD_AUDIO)
AndroidManifest.xml                                          →  لا وجود لـ RECORD_AUDIO
```
Capacitor **يطلب الإذن وقت التشغيل**، لكن أندرويد **يرفض بصمت** كل إذن غير مُعلَن في المانيفست: لا صندوق حوار، لا رسالة، والميكروفون يفشل فقط.

### ✅ الإصلاح
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```
ومعه قرار صريح موثَّق: **لم نُعلن `POST_NOTIFICATIONS`** — لأن الإشعارات الفورية تحتاج بنية كاملة غير موجودة (لا إضافة دفع، لا جدول رموز أجهزة، لا FCM: تحقّقنا — `0` ملف، `0` جدول). إعلان الإذن وحده كان سيجعل الميزة **تبدو** موجودة وهي غير موجودة. الاختبار يقفل هذا القرار صراحةً.

---

## 5. أمان: `adb backup` كان يستخرج الجلسات (Q2)

`allowBackup="true"` يسمح لأي شخص يصل إلى الجهاز (أو نسخ ADB) باستخراج ملفّات التطبيق — بما فيها **ملف تعريف الـ WebView وملفات الجلسة**. صار `allowBackup="false"`.

وإلى جانبه حذف **المفتاح الوهمي** `android.handleBackButton: true` من الإعداد: مفتاح لا تقرأه Capacitor 7، فوجوده يوهم بأن زر الرجوع مُوصَّل — وقد كان العكس تماماً.

---

## 6. ⛔ تصحيحات: ثلاثة ادّعاءات لي كانت **خاطئة** (Q4)

هذا القسم مهم بقدر ما فوقه. كلٌّ منها فُحص باختبار حقيقي يرفض أو يثبت:

### 6.1 «`className="hidden"` يحجب منتقي الصور» — **خاطئ**
```
  3 مدخلات ملفات: class="hidden" display=none accept="image/*"
  🎯 منتقي الملفات انفتح: نعم ✅
```
الـ `display:none` + `input.click()` نمط قياسي ويعمل. **لم أغيّر شيئاً** — لا شيء يحتاج إصلاحاً.

### 6.2 «قوائم `accept` تنقص `image/*`» — **خاطئ**
كل المدخلات الخمسة فيها `accept="image/*"` (بما فيها `LensCamera.tsx:22` الذي اتّهمته سابقاً). **لم أغيّر شيئاً**.

### 6.3 «الكاميرا تبقى شغّالة وراء السلة — خطر سياسة Google Play» — **خاطئ**
بكاميرا وهمية (`--use-fake-device-for-media-stream`) قسنا الحالة الحقيقية:
```
  بعد فتح Lens      : video=true · trackState=live · enabled=true   ← تبدأ تلقائياً (حقيقي)
  نافذة الكاميرا     : class="lens-camera fixed inset-0 z-[76]" role=dialog aria-modal=true
  بعد Escape        : []   ←  العنصر أُزيل والمسار توقّف ✅
```
نافذة الكاميرا **مودالية تغطّي كل شيء** (z-76) وتحجب النقر على شريط التنقّل (z-30) — أي أن الوصول إلى السلة والكاميرا مفتوحة **غير ممكن من الواجهة**؛ وإغلاق الكاميرا يُزيل عنصر الفيديو ويوقف المسار نهائياً. **لم أغيّر شيئاً في دورة حياة الكاميرا.**

> **الدرس المسجَّل:** ثلاثة من خمسة ادّعاءات في Q4 كانت إيجابيات كاذبة. لو «أصلحتها» كما هي لكانت تعديلات بلا سبب — وهو أسوأ من عدم الإصلاح.

---

## 7. الحارس الجديد — كي لا تعود هذه الأخطاء

### المشكلة البنيوية
**لا شيء في أي بوابة آلية كان ينظر إلى التطبيق**: `ci.yml` لا يصرف Java ولا يقرأ المانيفست، و`android-apk.yml` **يدوي فقط** (`workflow_dispatch`). لذلك عاش خطأ Intent بلا action بلا اعتراض.

### الحل — ملف جديد: `scripts/check-android-shell.mjs` (13 ثابتاً)
```
$ npm run android:check
  ✓ manifeste : allowBackup désactivé
  ✓ manifeste : aucune permission déclarée deux fois
  ✓ manifeste : INTERNET + CAMERA déclarées
  ✓ manifeste : RECORD_AUDIO déclarée
  ✓ manifeste : POST_NOTIFICATIONS volontairement absente
  ✓ manifeste : lien profond ayrovi://aywebs déclaré
  ✓ manifeste : partage ACTION_SEND text/plain déclaré
  ✓ AyWebsBrowseActivity : openWebRoute envoie une action
  ✓ AyWebsBrowseActivity : openWebRoute utilise le schéma ayrovi://
  ✓ MainActivity : ayWebsTarget rejette les intents sans action
  ✓ MainActivity : bouton retour matériel câblé
  ✓ capacitor.config.ts : clé fantôme handleBackButton retirée
  ✓ capacitor.config.ts : barre d’état configurée explicitement

Coque Android : 13 invariants vérifiés, 0 rupture.
```
**ومُتحقَّق أن للحارس أنياباً** — اختبار سلبي حقيقي: أرجَعنا `allowBackup="true"` و`overlaysWebView: true` ⇒ `2 invariants rompus` ورمز خروج `1`؛ وبعد الاسترجاع ⇒ `13/13`.

### ومرحلة تصريف حقيقية في CI
أُضيفت مهمّة `android-shell` إلى `ci.yml`: `npm ci` ← `setup-java 21` ← `build:client && cap sync android` ← `./gradlew :app:compileDebugJavaWithJavac`. **هذه هي المرّة الأولى التي يُصرَّف فيها الجافا آلياً في هذا المشروع.** (مضبوطة `continue-on-error: true` مؤقتاً مع تعليق صريح: تُقلَب إلى `false` عند أول تشغيل أخضر — لأنني لا أستطيع تشغيل Gradle هنا، ولا أُسلّم حارساً لم أُشغّله كأنه مُختبَر.)

---

## 8. 🔬 تصحيح إضافي: اختبار كان يمرّ **بلا أن يفحص شيئاً**

`tests/android-shell.test.ts` كان يحتوي:
```ts
expect(cfg).toContain('handleBackButton: true');   // ← يقفل مفتاحاً وهمياً
```
وهو `toContain` أي **يبحث في كل الملف بما فيه التعليقات**. لذلك **ظلّ ناجحاً** حتى بعد حذف المفتاح — لأن تعليق الشرح يذكر الاسم! فحص حقيقي لم يكن يحدث.

**وبالمقابل وقعتُ في المصيدة نفسها معكوسة:** أول نسخة من تأكيداتي الجديدة فشلت لأن **تعليقي أنا** في المانيفست يذكر `POST_NOTIFICATIONS` الذي أمنعه.

**الإصلاح الجذري (طُبِّق في الاختبار والحارس معاً):** تُنزع التعليقات قبل أي تأكيد.
```ts
const stripComments = (source) =>
  source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
```
والنتيجة بعد التصحيح: الاختبار **7/7 ✅**، و**يفشل فعلاً** عند إرجاع `allowBackup="true"`، ويعود للنجاح بعد الاسترجاع. أي صار اختباراً حقيقياً.

---

## 9. حالة التحقّق النهائية

```
✅ npm test                    2130/2130  (154 ملف) — يشمل اختبارات القشرة المشدَّدة
✅ npm run typecheck           نظيف (خادم + عميل + capacitor.config.ts)
✅ npm run android:check       13/13 ثابتاً · 0 rupture
✅ اختبار سلبي للحارس           يمسك الانحدار (خروج 1) ويعود سليماً
✅ اختبار سلبي للاختبار         يمسك الانحدار ويعود سليماً
✅ javac -encoding UTF-8      0 خطأ صياغة حقيقي في ملفات الجافا الثلاثة
✅ AndroidManifest.xml         XML صالح · 3 أذونات بلا تكرار · allowBackup=false
✅ ci.yml                      YAML صالح · وظيفتان · 42 + 6 خطوة
✅ الرقعة                     353 سطراً · تُطبَّق بـ patch -p1 · تُنتج ملفات مطابقة بايت-بايت
```

### الملفات المتغيّرة
| الملف | التغيير |
|---|---|
| `android/.../AyWebsBrowseActivity.java` | ثابت `AYWEBS_DEEP_LINK` + `openWebRoute` بـ `ACTION_VIEW` |
| `android/.../MainActivity.java` | `onBackPressed()` جديد يفوّض لـ `goBack()` |
| `android/app/src/main/AndroidManifest.xml` | `allowBackup="false"` · `+RECORD_AUDIO` · تعليقات تشرح القرارات |
| `capacitor.config.ts` | حذف المفتاح الوهمي · إعداد `plugins.StatusBar` |
| `tests/android-shell.test.ts` | نزع التعليقات · تأكيدات حقيقية للأذونات والنسخ الاحتياطي |
| `package.json` | `android:check` |
| `.github/workflows/ci.yml` | حارس الثوابت + مهمّة `android-shell` (أول تصريف جافا آلي) |
| `scripts/check-android-shell.mjs` | **جديد** — 13 ثابتاً |

---

## 10. ما تبقّى في التطبيق — وفيه قرارك

| # | البند | لماذا لم يُنفَّذ الآن |
|---|---|---|
| 1 | **OAuth يفتح المتصفّح الخارجي بدل التطبيق** (Q3) | الجسر يرقع `fetch`/`XHR` فقط، وأزرار OAuth روابط `<a href>` تُنقل بالـ WebView. الإصلاح يعيد تشكيل مسار المصادقة (اعتراض التنقّل + `allowNavigation` أو مسار أصلي) — تغيير معماري يحتاج جلسة واختبار على جهاز |
| 2 | **الدفع يخرج من التطبيق إلى Chrome** (Q3) | نفس العائلة: `window.location.assign(payUrl)` مع `allowNavigation: []`. يحتاج قراراً: فتح بوابة داخل التطبيق أم عبر Custom Tab |
| 3 | **لا تحديث حيّ للحزمة** (Q3/Q5) | `android-apk.yml` يدوي، ولا يوجد تحديث حيّ — قرار إصدار |
| 4 | **`minifyEnabled false`** (Q2) | مكسب حجم حقيقي، لكن تفعيله قد يكسر Capacitor بلا قواعد ProGuard صحيحة، **ولا أستطيع بناء APK هنا للتحقق** — لا أُغيّر ما لا أستطيع قياسه |
| 5 | **`post()` يرسل `x-session-id` وحده** (Q2) | يحتاج التحقق من عقد الخادم أولاً؛ الخطأ المحتمل صامت (401 بلا سبب ظاهر) |
| 6 | **`AYROVI_API_ORIGIN` مكتوب في الكود** (Q2) | `nativeApiOrigin.ts` يثبّت أصل الـ API — يحتاج بيئة بناء (dev/staging/prod) بدل قيمة واحدة |
| 7 | **610 KB حزمة الأدمين في كل APK** (Q5) | فصل الحزمة في `vite.config.mts` + `android-apk.yml` — يلمس مسار الإصدار |
| 8 | **الإشعارات الفورية** | تحتاج البنية الكاملة (إضافة + جدول رموز + FCM + خدمة خادم) — مشروع قائم بذاته |

**التوصية:** البنود 1 و2 (مسارا المصادقة والدفع) هي الأكثر تأثيراً على الزبون، وهي التي تحتاج جهازاً حقيقياً للتجربة — أي أنها الخطوة التالية الطبيعية بعد هذه الجلسة.

---
*كل إصلاح في هذا السجل مقترن بدليله، وكل ادّعاء سابق مُختبر. ثلاثة من ادّعاءاتي ثبت خطؤها فسُجّلت بنصّها ولم تُصلَّح — لأن إصلاح خطأ غير موجود يضرّ أكثر مما ينفع.*

---

# الجزء الثاني — دفعة لقطاتك السبع (Q8) · 2026-10-03

> **قبل أي شيء، تصحيح جوهري واحد** (تفصيله في §12): اللقطات السبع التي أرسلتها هي **تطبيق Buyee نفسه** (تجربة «Add to Buyee»)، **لا** شاشات تطبيق AYROVI. تحقّقت من ذلك بأربعة أدلة قاطعة. ومع ذلك — وهذا مهم — **الأخطاء التي كشفتها الدفعة الثانية أخطاء حقيقية في شيفرة تطبيقنا**، اكتُشفت بقراءة الكود وفحص الخادم حيّاً، لا بتخمين من اللقطات. الإصلاحات مثبتة أدناه بدليلها.

## 11. الجذر الحقيقي لثلاثة أعراض دفعة واحدة

### 11.1 الزر المتجمّد «Loading…» ← كان يتكلّم مع العَدَم

كل طلبات الشِل الثلاثة (`analyze` / `resolve` / `cart`) كانت تُرسَل إلى `webBase`، وقيمته `https://localhost` — أي أصل الحزمة المضمّنة داخل الـ WebView، **حيث لا يوجد أي خادم يستمع**. النتيجة: الطلب يفشل دائماً، فيبقى الزر على «Loading…» ثم يسقط إلى «Page non éligible».

**الإصلاح (سلسلة كاملة، 4 حلقات):**

| الحلقة | الملف | ما يحدث |
|---|---|---|
| 1 | `client/src/services/apiOrigin.ts` **(جديد)** | مصدر واحد للثابت `AYROVI_API_ORIGIN`، **بلا أي import** — وُجد خصيصاً لمنع الدورة `nativeShell → nativeApiOrigin → nativeShell` |
| 2 | `client/src/services/nativeShell.ts` | يرسل `apiOrigin: AYROVI_API_ORIGIN` مع `{url, sessionId}` |
| 3 | `AyWebsBrowsePlugin.java` | يتحقّق (http/https فقط، حذف `/` الأخيرة) ويمرّره في `EXTRA_API_ORIGIN` |
| 4 | `AyWebsBrowseActivity.java` | حقل `apiOrigin`؛ الثلاثة `POST` على `apiOrigin + …` |

**حارس يمنع الرجوع:** `scripts/check-android-shell.mjs` يفشل إن ظهر `post(webBase` مرة أخرى (اختبار سلبي أُجري: أعدتُ الخلل → الحارس أطلق إنذارين وسقط).

### 11.2 تسجيل الدخول كان **مستحيلاً** — لا نقص واجهة، بل إعدادات WebView غائبة

ثلاثة إعدادات كانت غائبة كلياً: `setSupportMultipleWindows`, `onCreateWindow`, `setAcceptThirdPartyCookies`.
النتيجة على جهازك: أي `window.open()` (نوافذ الدخول الموحّد SSO) يُتجاهل صامتاً، وكوكيز الطرف الثالث مرفوضة، فتتعطّل زرّ الدخول عبر Google/Apple/الخدمة.

**الإصلاح:** الثلاثة مضبوطة الآن، والنوافذ المنبثقة تُفتح في **نفس** الـ WebView (لا مخرج من التطبيق)، ويُقبل كوكي الطرف الثالث. المرجع في Capacitor: `BridgeWebChromeClient.java:102-109`.

### 11.3 الخادم كان يتكلّم بدقّة، والشِل كان لا يسمعه

الخادم يصنّف الصفحة تصنيفاً دقيقاً (`page_type` = PRODUCT / LOGIN / CHECKOUT / SEARCH / CAPTCHA، و`customer_action_required`) **ويملك رسالة عربية/فرنسية جاهزة للزبون** في `error_contract.userMessage`. لكن الشِل كان يقرأ حقلاً واحداً (`is_product_page`) ويرمي الباقي.

**الإصلاح:** `AyWebsApiException` يحمل `error_contract.userMessage`، و`toastMessage`، و`setAddLabel` — فصار الزر يقول الحقيقة: «Connectez-vous sur la boutique» مع شرح «La boutique demande une connexion…»، و»Panier de la boutique» مع «Ceci est le panier de la boutique, pas celui d'AYROVI». و+8 ثم +5 نصوص في `res/values/strings.xml`.

### 📊 التحقّق الحيّ (خادم :3000 — `ayrovi-d1d6344e`, PID 3885)

| الطلب | النتيجة |
|---|---|
| `analyze` بلا جلسة | **400 `SESSION_REQUIRED`** — «x-session-id manquant ou malformé» |
| `analyze` `amazon.co.jp/dp/B0CJ8H4TV7` | `PRODUCT` · `registered=true` · `capture_allowed=true` |
| `analyze` `/ap/signin` | `page_type=LOGIN` · `customer_action_required=LOGIN` |
| `analyze` `/gp/cart/view.html` | `page_type=CHECKOUT` |
| `analyze` `/s?k=test` | `page_type=SEARCH` |
| `analyze` `buyee.jp/item/...` | `registered=false` · `capture_allowed=false` · `UNKNOWN` |

> **تصحيح آخر لملاحظة سابقة:** كنت كتبت أن `analyze`/`resolve` مسارات عامّة. **خطأ** — الفحص الحيّ أثبت أنها تتطلّب ترويسة جلسة (`x-session-id`). الشِل يعمل لأن الجلسة موحّدة: نفس `ayrovi_session_id` من الويب → Intent → ترويسة Java.

## 12. 🔬 تصحيح جوهري: لقطاتك السبع = تطبيق **Buyee**، لا تطبيقنا

فهذا يغيّر معنى سؤالك «زر معطل» و«تسجيل دخول» — لذلك أُثبته بالأدلة:

| الدليل | لقطاتك (3→7) | شِل AYWEBs لدينا (`activity_aywebs_browse.xml`) |
|---|---|---|
| الشريط الأعلى | ✕ + 🔒 + الرابط + **أيقونة الترجمة 文A** + تحديث | ✕ + الرابط + تحديث — **لا قفل ولا ترجمة** (أسطر 20-47) |
| الشريط السفلي | سهمان ‹ › فقط (5/6/7) | رجوع + تقدّم + «Panier» + «Favoris» + **زر برتقالي «Add to Cart»** (أسطر 63-118) |
| النصوص | «Item added to **Buyee** cart» · «Proceed to **order page**» · شعار Buyee في صفحة الدخول | نصوصنا تقول «panier **AYROVI**» ولا تذكر Buyee إطلاقاً |
| الشاشة 1 | تطبيق Buyee: تبويبات Home / Stores / Wish List / Cart / My Page | واجهتنا: OCEREX / Vision / AyWebs / SONIM / Lens |

**السبب في التشابه:** المطوّر الأصلي بنى واجهاتنا على هذه الصور نفسها كـ«مواصفة» — تعليقاته في المستودع تقول حرفياً: `dialog_aywebs_variant_sheet.xml → (capture 3)` و`dialog_aywebs_added.xml → (capture 4)` و`AyWebsStoresScreen.tsx → (référence Add-to-Buyee, capture 2)`. أي أن AYWEBs **صُمِّم ليشبه Buyee**، لكنه كود وتشغيل مختلفان تماماً.

## 13. سؤالك: هل بُحث عن «Add to Buyee»، كيف يعمل، وهل التزمنا؟

**نعم، بُحث — والنتيجة موثّقة:**

1. **الملحق (Extension):** «Add to Buyee» ملحق **للمتصفّح على الحاسوب فقط** (Chrome / Firefox / Safari / 360)، يدعم 150+ متجراً يابانياً (Amazon JP، Mercari، Rakuten…). ليس تطبيق هاتف.
2. **التطبيق (ما في لقطاتك):** يقدّم **نفس الوظيفة داخل الهاتف**: متصفّح داخلي → اختيار النسخة/اللون/المقاس → «Add to Cart» → **سلة Buyee** → «Proceed to order page».
3. **الشرط الحاسم:** «**To place an order, free membership registration and login are required**» — عضوية Buyee وتسجيل دخول **إلزاميان** لإتمام الطلب (لقطة 6 بالنص). أي أن «الزر المعطّل» في تجربتهم ليس عطلاً: إنه شرط عضوية.
4. **البديل الرسمي:** لصق **رابط** المنتج («Simply provide the URL to request your purchase») — وهذا **بالضبط** ما يفعله AYWEBs خادمياً: تصنيف الرابط → حلّ المنتج → ورقة النسخ → سلة AYROVI.

**الامتثال — بنداً بنداً:**

| المعيار | حالتنا | الحكم |
|---|---|---|
| عدم تجاوز تسجيل دخول المتجر | `src/aywebs/browser.ts:165-195` (§27) + `AUTH_REQUIRED` برسالة صادقة | ✅ ملتزم |
| عدم إيهام الزبون بسلة المتجر | وسم «Panier de la boutique» + «…pas celui d'AYROVI» | ✅ ملتزم |
| طريقة الرابط مسموحة رسمياً | هي الطريقة الموصى بها من Buyee للزبون | ✅ ملتزم |
| عدم انتحال ماركة Buyee | نصوصنا لا تذكر Buyee؛ واجهتنا مختلفة (موثّق في §12) | ✅ ملتزم |
| التقاط `buyee.jp` | `registered=false` — نتصفّح ولا نلتقط | ⚪ قرار سياسة تجارة، لا خطأ تقني |

## 14. أيقونة AYWEBs — فحص بصري حقيقي على التطبيق الحيّ

شغّلت متصفّحاً حقيقياً على المخدم الحيّ بعرض هاتف (412×915) وقرأت **DOM الفعلي**:

```
found: true
label: "AyWebs — التسوق من الويب"      (زر موجود، نص مرئي: AyWebs)
الزر: 74×56 px · الشريط: 5 أعمدة
الأيقونة: SVG 30×30 · viewBox 0 0 24 24 · 4 أشكال مرسومة
النقر ⇒ الانتقال إلى /aywebs ✓ مع مربّع بحث فعّال
```

الأيقونة ليست صورة خارجية ولا خطّاً بعيداً: هندستها داخل `client/src/design/editorial/glyphs.json` (رمز `AyWebs`، من أصل 99 رمزاً) — أي أنها تعمل داخل APK بلا شبكة.
**اللقطتان:** `verify_shots/aywebs-tab-zoom.png` (الأيقونة مكبّرة) و`verify_shots/aywebs-screen.png` (الشاشة كاملة: المتاجر + الشريط الخمسي والتبويب AYWEBs مضيء بالبرتقالي).
**وأيقونة التطبيق نفسها** (`mipmap-*/ic_launcher.png`) هي شعار AYROVI «A» بنقطة برتقالية — ليست أيقونة Capacitor الافتراضية.

## 15. حالة التحقّق النهائية بعد الدفعة الثانية

| الفحص | النتيجة |
|---|---|
| `npm run android:check` (22 ثابتاً) | **22/22 ✓** — والاختبار السلبي يُطلق الإنذار |
| `tests/android-shell.test.ts` (13 اختباراً) | **13/13 ✓** |
| `npm test` (الانحدار الكامل) | **2136 ✓** من 2136 |
| `javac -encoding UTF-8` | 0 أخطاء حقيقية |
| `res/values/strings.xml` + `values-ar` | صالح XML |
| `npm run typecheck` · `npm run build` | نظيف ✓ · نجح ✓ |

**الرقعة:** `/home/user/AYROVI_إصلاحات_التطبيق_2026-10-03.patch` — **1048 سطراً · 13 ملفاً** · أُعيد تطبيقها من النسخة الأصلية أعلاه وطابقت الحالي بايت-بايت (0 اختلاف).

| الملف | الأسطر في الرقعة | الحالة |
|---|---|---|
| `scripts/check-android-shell.mjs` | 223 | جديد |
| `AyWebsBrowseActivity.java` | 207 | معدّل |
| `tests/android-shell.test.ts` | 98 | معدّل |
| `.github/workflows/ci.yml` | 83 | معدّل |
| `MainActivity.java` | 31 | معدّل |
| `AndroidManifest.xml` | 24 | معدّل |
| `AyWebsBrowsePlugin.java` | 22 | معدّل |
| `client/src/services/apiOrigin.ts` | 19 | **جديد** |
| `capacitor.config.ts` | 19 | معدّل |
| `res/values/strings.xml` | 11 | معدّل |
| `nativeShell.ts` · `package.json` · `nativeApiOrigin.ts` | 9 · 8 · 6 | معدّل |

## 16. القائمة المفتوحة (محدَّثة)

**سدّ فوري:** لا شيء من هذه الإصلاحات يظهر على هاتفك قبل **إعادة بناء APK** — الملفّات مغيّرة على القرص، والجهاز يشغّل بناءً قديماً.

| # | البند | السبب في بقائه مفتوحاً |
|---|---|---|
| 1 | **إعادة بناء APK** | الشرط الأول لرؤية أي إصلاح على الجهاز |
| 2 | **OAuth/الدفع يخرجان من التطبيق** | `window.location.assign(payUrl)` — يحتاج قراراً: بوابة داخلية أم Custom Tab |
| 3 | **لا تحديث حيّ** | `android-apk.yml` يدوي |
| 4 | **`minifyEnabled false`** | لا أستطيع بناء APK هنا للتحقّق ⇒ لا أغيّر ما لا أقيسه |
| 5 | **`buyee.jp` غير مُفعّل في السجل** | قرار تجارة/سياسة، لا خطأ تقني |
| 6 | **الإشعارات الفورية** | مشروع قائم بذاته (FCM + جدول رموز + خدمة) |

---
*الدفعة الثانية أُضيفت في 2026-10-03. كل بند أعلاه مقترن بدليله على القرص أو بفحص حيّ — وما لم يُتحقّق منه لم يُدّعَ.*

---

# الجزء الثالث — لأول مرة: **APK مبنيّ فعليًا** · 2026-10-03

> كنت كتبت في §10 البند 4: «لا أستطيع بناء APK هنا للتحقّق ⇒ لا أُغيّر ما لا أقيسه». **هذا سقط اليوم.** بنيتُ بيئة أندرويد كاملة داخل الجلسة، والحزمة تُصرَّف وتُوقَّع وتُثبَّت. فيما يلي ما جرى، وما يثبته، وما بقي غير مُتحقَّق منه.

## 17. البناء — من الصفر إلى APK موقّع

| الخطوة | ما فعلته | النتيجة |
|---|---|---|
| JDK | JDK 11 الموجود لا يكفي (AGP 8.7 يحتاج 17+) → نزّلت **Temurin 21** إلى `/opt/jdk` | `openjdk 21.0.12.1 LTS` |
| Android SDK | لا وجود له → نزّلت `commandlinetools` + `platforms;android-35` + `build-tools;35.0.0` + `platform-tools` إلى `/opt/android-sdk` | `android.jar` (27 MB) موجود |
| عقبة 1 | `/opt` مملوك لـ root ⇒ ملفات الترخيص لم تُكتب و`sdkmanager` رفض التثبيت صامتاً | حُلّت بـ `chown` ثم قُبلت الرخص |
| عقبة 2 | `/tmp` قرص 993 MB فقط ⇒ `No space left on device` | نقلت `GRADLE_USER_HOME` إلى `/var/gradle-home` (القرص 25 GB) |
| عقبة 3 | الذاكرة 2 GB ⇒ الـ daemon **قُتل** في المحاولة الأولى (بعد نجاح تصريف Java!) | المحاولة 2 مع `-Xmx1100m` و`workers.max=1` ⇒ **BUILD SUCCESSFUL in 25s** |
| عقبة 4 | `gradlew` بلا صلاحية تنفيذ | `chmod +x` |

**الأمر الواحد الآن:** `npm run android:sync` ثم `npm run android:apk` (أضفتهما إلى `package.json`).

## 18. ما يثبته هذا البناء — لا تخمين

| الفحص على الملف الناتج | النتيجة |
|---|---|
| التصريف | **`compileDebugJavaWithJavac` نجح**: `AyWebsBrowseActivity.java` و`MainActivity.java` و`AyWebsBrowsePlugin.java` صُرِّفت بلا خطأ واحد (تحذيرات `deprecation`/`unchecked` فقط) |
| هوية الحزمة | `app.ayrovi.mobile` · `versionName 1.0` · `targetSdk 35` · التسمية **AYROVI** |
| الأصناف داخل `classes4.dex` | `AyWebsBrowseActivity` · `AyWebsBrowsePlugin` · `MainActivity` ✓ |
| رموز الإصلاح داخل الـ dex | `apiOrigin` · `EXTRA_API_ORIGIN` · `AyWebsApiException` · `toastMessage` · `setAddLabel` · `setSupportMultipleWindows` · `onCreateWindow` · `setAcceptThirdPartyCookies` |
| النصوص الصادقة داخل الموارد | «Connectez-vous sur la boutique» · «La boutique demande une connexion» · «Panier de la boutique» · «Vérification anti-robot» · «Service indisponible» |
| الأذونات | `INTERNET` · `CAMERA` · **`RECORD_AUDIO`** · **لا `POST_NOTIFICATIONS`** (كما يفرضه الحارس) |
| تخطيطات الشِل | `activity_aywebs_browse.xml` · `dialog_aywebs_added.xml` · `dialog_aywebs_variant_sheet.xml` |
| الحزمة الويب المضمّنة | **107 ملفاً** منها `index.html` (26 KB) — الواجهة تعمل **بلا شبكة** |
| جسر الويب→الأصلي داخل الحزمة | `apiOrigin` موجود في `index-BrFEev8f.js` ✓ (أي أن إصلاح الدفعة الثانية سافر إلى الـ APK) |
| التوقيع | موقّع بشهادة **Android Debug** (`SHA-256 d2e8ffa7…6eb1`) ⇒ قابل للتثبيت مباشرة |

**الملف:** `/home/user/artifacts/AYROVI-debug-2026-10-03.apk` — **7.4 MB** · `sha256 e179a3295622d8fc…`

## 19. خادم الإنتاج الذي يخاطبه الـ APK — حيّ ويؤكّد الإصلاح

الثابت `AYROVI_API_ORIGIN = https://ayrovi-beta1.onrender.com`. فحصته حيّاً:

```
GET /                                    → 200
POST /api/v1/aywebs/page/analyze         → 400 SESSION_REQUIRED
  error_contract.userMessage = "Session AYROVI invalide ou absente."
```

أي أن عقد الخطأ الذي بنيت عليه `AyWebsApiException` **حقيقي في الإنتاج**، لا في خادمي المحلّي فقط. (ملاحظة: الاستجابة الأولى استغرقت 52 ثانية — إنها خطة Render المجانية في وضع السبات؛ أول فتح للتطبيق بعد خموله سيكون بطيئًا، وهذا **ليس** عطلاً في التطبيق.)

## 20. ما تغيّر في هذه الجولة

- `package.json`: `+ android:sync` و`+ android:apk`.
- الرقعة أُعيد توليدها: **1058 سطراً · 13 ملفاً** — أُعيد تطبيقها من النسخة الأصلية وطابقت **بايت-بايت** (0 اختلاف من 13).
- الحارس **22/22 ✓** · اختبارات الشِل **13/13 ✓** · `typecheck` نظيف ✓.

## 21. ⚠️ ما لم يُتحقَّق منه (بصراحة تامة)

| # | البند | لماذا |
|---|---|---|
| 1 | **التشغيل الفعلي على جهاز** | لا محاكي هنا (لا KVM، ذاكرة 2 GB). البناء والتصريف **مُتحقَّقان**، أما سلوك اللمس والشبكة على هاتف حقيقي فيحتاج جهازك — وهذا بالضبط ما جعل اللقطات السبع مفيدة |
| 2 | **APK إصدار (release)** | لا يوجد `signingConfig` في المستودع ⇒ سيكون **غير موقّع وغير قابل للتثبيت**. البناء الحالي **debug** ويُثبَّت عادةً بجانب نسخة قديمة **بعد إزالتها** (توقيع مختلف) |
| 3 | **`minifyEnabled`** | بقي `false` كما كان — الآن *يمكن* تجربته فعليًا، لكنه قرار إصدار ويحتاج قواعد ProGuard مجرَّبة على الجهاز |
| 4 | **مسار OAuth/الدفع** | يبقى خارج التطبيق (`allowNavigation: []`) — يحتاج قرارًا منك |
