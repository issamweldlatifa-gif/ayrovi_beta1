# إصدار AYROVI على Google Play — دليل عملي (07/10/2026)

هذا الدليل يخصّ **المرحلة P6** في `apps/mobile/PLAN.md`. مكتوب باش يتنفّذ من
غير مطوّر: كل خطوة فيها الأمر/الضغطة بالضبط، وبعد كل خطوة «كيفاش تعرف أنها
نجحت».

> **مبدأ ثابت**: لا كلمة سر، لا ملف توقيع، لا مفتاح في المحادثة ولا في Git.
> كل شي حساس يمرّ من **GitHub Secrets** وحدها.

---

## 0) وين وصلنا توّا (صدق الحالة)

| القطعة | الحالة |
|---|---|
| تطبيق React Native (`apps/mobile`) | ✅ 24 شاشة اصلية، يعمل على الخادم |
| APK تجريبي (`app.ayrovi.mobile.demo` / «AYROVI Démo») | ✅ يتبنى في GitHub Actions — **موش** نسخة النشر |
| AAB موقّع للنشر | ⏳ الملف موجود (`.github/workflows/mobile-release-aab.yml`) — **ناقص غير المفاتيح** |
| روابط عميقة `https://ayrovi.tn` | ⏳ المضبوطات موجودة في `app.json` — **ناقص** `assetlinks.json` على الخادم |
| إشعارات FCM | ❌ ما بدتش: تستلزم مشروع Firebase متاعك + مفاتيح (تحت) |
| بوابة الدفع بالكارطة | ❌ موش مركّبة على الخادم — الكود في التطبيق جاهز ويستنّاها |
| متجر Play | ❌ ما فماش تطبيق مسجّل بعد (خطوة 5) |

---

## 1) إنشاء مفتاح التوقيع (على حاسوبك، مرّة واحدة في العمر)

> ⚠️ **هذا الملف هو هوية التطبيق**. كان ضاع، ما تعاودش تنجّم تحدّث التطبيق
> المنشور حتى بنسخة جديدة. احفظو في مكان آمن + نسخة احتياطية (فلاش/سحابة
> خاصّة). ما تحطّوش في Git أبداً.

```bash
keytool -genkeypair -v \
  -keystore ayrovi-release.jks \
  -alias ayrovi \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storetype JKS
```

- يعيّطلك على **كلمة سر المخزن** (احفظها) و**كلمة سر المفتاح** (تنجّم تكون
  نفسها، وبذلك تسهّل) والاسم/البلد (`TN`).
- `-validity 10000` ≈ 27 سنة: Google يطلب مفتاحاً يعيش أكثر من التطبيق.

تحقّق:

```bash
keytool -list -keystore ayrovi-release.jks
```

(تكتب كلمة السر ⇒ يظهرلك سطر فيه `ayrovi`، نوع المفتاح `PrivateKeyEntry`.)

### تحويل الملف لصيغة يقبلها GitHub

```bash
# Linux / macOS
base64 -w0 ayrovi-release.jks > ayrovi-release.jks.base64
# macOS (بلا -w0)
base64 -i ayrovi-release.jks -o ayrovi-release.jks.base64

# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("ayrovi-release.jks")) | Set-Content ayrovi-release.jks.base64
```

افتح الملف الناتج وانسخ **كل** المحتوى (سطر واحد طويل).

---

## 2) الأسرار الأربعة في GitHub

المستودع → **Settings → Secrets and variables → Actions → New repository secret**:

| الاسم | القيمة |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | محتوى `ayrovi-release.jks.base64` |
| `ANDROID_KEYSTORE_PASSWORD` | كلمة سر المخزن |
| `ANDROID_KEY_ALIAS` | `ayrovi` |
| `ANDROID_KEY_PASSWORD` | كلمة سر المفتاح |

**كيفاش تعرف أنها نجحت**: الملف `.github/workflows/mobile-release-aab.yml`
يفشل **قبل** أي بناء بجملة `Secrets de signature manquants : …` كان واحد
ناقص — ما ثمّاش نسخة غير موقّعة تبدو صالحة.

---

## 3) بناء النسخة (AAB)

من صفحة **Actions** → «Mobile — AAB signé (Play Store)» → **Run workflow**:

| الحقل | القيمة |
|---|---|
| `api_base_url` | عنوان الخادم اللي باش يحكي معاه التطبيق (خطوة 6) |
| `version_name` | مثال `2.0.0` (اللي يظهر للناس) |
| `version_code` | **عدد صحيح يزيد دائماً**: 8، 9، 10… (Play يرفض رقم رجع ولا تعاود) |

> زرّ التشغيل اليدوي يبان بعد ما يتدمج هذا الملف في فرع `main` (شرط GitHub
> على كل workflow). قبل ذلك، البناء يمشي بـtag: `git tag v2.0.0 && git push origin v2.0.0`.

**كيفاش تعرف أنها نجحت**: خطوة «Vérifier la signature (et refuser la clé debug)»
ما تفشلش، وتلقى `AYROVI-release-aab` في أسفل صفحة التشغيل (artifact، محفوظ 30
يوم).

> ملاحظة صدق: كان الملف توقّع بالمفتاح التجريبي متاع القالب، الـworkflow يرفض
> الناتج **بنفسو** (`grep "Android Debug"`) — ما نسلّموش نسخة تبان منشورة وهي
> موش هي.

---

## 4) الرفع لمتجر Play

1. **حساب مطوّر**: `play.google.com/console` → $25 مرّة واحدة → تحقّق الهوية
   (ياخذ من 1 لـ3 أيام عادة).
2. **إنشاء تطبيق**: الاسم `AYROVI`، اللغة الافتراضية (العربية/الفرنسية)،
   «Application», «Gratuit».
3. **Play App Signing**: اختار «استعمل مفتاحك» ولا خلي Google يولّي المفتاح
   الأساسي — الـAAB متاعنا موقّع بمفتاحك، فالمسار طبيعي.
4. **Track داخلي** (Internal testing): ارفع الـ`.aab`، زيد 20–100 متجر
   تجريبي، وجرّب قبل الفتح للناس.
5. **الأوراق المطلوبة وقتها** (حضّرها من توّا):
   - سياسة الخصوصية على رابط عمومي (الموقع عندك — `/privacy` ولا صفحة مشابهة)؛
   - Data safety (واش تجمع: الاسم، التلفون، الإيميل، الصور المسكانية — كلها
     للأغراض المعلنة: الطلب والتوصيل)؛
   - تصنيف المحتوى + شاشات (screenshots) + أيقونة 512×512 + صورة غلاف.

---

## 5) الروابط العميقة (`https://ayrovi.tn/...` تفتح التطبيق)

المضبوطات في `app.json` (`intentFilters` مع `autoVerify: true`) — كفاية
للنصف الأول. النصف الثاني على الخادم:

1. من مفتاح التوقيع، خذ **بصمة SHA-256**:

```bash
keytool -list -v -keystore ayrovi-release.jks -alias ayrovi | grep SHA256
```

2. انشر على الموقع الملف `/public/.well-known/assetlinks.json` (المضيف:
   `ayrovi.tn`، و`applicationId`: `app.ayrovi.mobile`):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "app.ayrovi.mobile",
    "sha256_cert_fingerprints": ["<البصمة من الخطوة 1>"]
  }
}]
```

3. **كيفاش تعرف أنها نجحت**: من التلفون، اكتب في Chrome رابط منتوج
   `https://ayrovi.tn/...` — يفتح التطبيق مباشرة بلا ما يسألك. (كان Google
   Play App Signing، زيد بصمة **Google** كذلك اللي تلقاها في Play Console →
   App integrity.)

---

## 6) أي خادم يحكي مع التطبيق (القرار المعلّق)

`EXPO_PUBLIC_API_BASE_URL` يتچرى وقت البناء — يعني العنوان يتثبّت في النسخة.
ثلاثة اختيارات، والقرار متاعك:

| الاختيار | الفايدة | الثمن |
|---|---|---|
| `https://ayrovi.tn` (الموقع الحالي) | بلا خدمات جديدة | خادم الموقع **ما فيهش** تعديلات هذا الفرع (`mobile/` في `x-ayrovi-client`) ⇒ الدخول يفشل |
| نشر هذا الفرع على Render/VPS | دخول كامل + AYWEBs + OCEREX يخدمو من التلفون | وقت نشر + متابعة |
| خادم جلسة المطوّر (عبر النفق) | تجربة سريعة | لازمه حاسوب شاعل دائماً ⇒ موش للإصدار |

**التوصية**: قبل الإصدار، ننشرو هذا الفرع على Render (الخدمة موجودة أصلاً
عندك) ونعاودو نبنيو الـAAB بـ`api_base_url` متاعها. حينها فقط ينجّم الدخول
يكمل من التلفون.

---

## 7) اللي مازال موش جاهز (وعلاش)

| القطعة | السبب | شنوّة يلزم |
|---|---|---|
| إشعارات FCM | ما فماش مشروع Firebase مربوط | مشروع Firebase متاعك + `google-services.json` (ماشي في Git: يُمرّر كـsecret) + جدول أجهزة في الخادم (`POST /api/customer/devices`) |
| خلاص بالكارطة | بوّابة الخادم موش مركّبة | مفاتيح Konnect في بيئة الخادم (`KONNECT_*`) — الكود في التطبيق موجود ويستنّاها |
| Apple App Store | ما فماش حساب Apple Developer | حساب ($99/سنة) + شهادة + ملف AASA |
| تبديل التطبيق القديم على التلفون | توقيع مختلف (ما فماش keystore قديم) | المستعمل يحذف القديم ويركّب الجديد، ولا نختارو معرّفاً جديداً في Play |

---

## 8) قائمة تحقّق سريعة قبل كل إصدار

- [ ] `version_code` زاد عن الإصدار اللي قبلو.
- [ ] `EXPO_PUBLIC_API_BASE_URL` مضبوط على الخادم اللي باش يخدم فعلاً.
- [ ] الـCI أخضر على الفرع (`CI` + `Mobile — AYROVI app`).
- [ ] الأسرار الأربعة موجودة (وما تبدّلتش من غير ما تعرف).
- [ ] الـAAB المرفوع موقّع بالمفتاح متاعك (الـworkflow يقولها).
- [ ] نسخة احتياطية جديدة من `ayrovi-release.jks` + كلمات السر.
