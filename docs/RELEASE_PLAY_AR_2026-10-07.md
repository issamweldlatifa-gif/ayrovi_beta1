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
| روابط عميقة `https://ayrovi.tn` | ✅ التطبيق (`app.json`) + الخادم (`/.well-known/assetlinks.json`) جاهزين — **ناقص** غير بصمتك في متغيّر البيئة |
| إشعارات FCM | ❌ ما بدتش: تستلزم مشروع Firebase متاعك + مفاتيح (تحت) |
| بوابة الدفع بالكارطة | ❌ موش مركّبة على الخادم — الكود في التطبيق جاهز ويستنّاها |
| متجر Play | ❌ ما فماش تطبيق مسجّل بعد (خطوة 5) |

---

### 0.1) APK تجريبي (بلا مفاتيح، بلا متجر)

كل ما يتبدّل شي في `apps/mobile/`، GitHub يبني APK تجريبي تلقائياً:

1. افتح **Actions → Mobile — APK Android (démo) → أحدث تشغيل ناجح**.
2. نزّل الـartifact الاسم **`AYROVI-demo-apk`** (يصلح 30 يوماً) — ولا من الطرمينال:

   ```bash
   gh run download -R issamweldlatifa-gif/ayrovi_beta1 -n AYROVI-demo-apk
   ```

3. ثبّتو على التلفون. معرّفو `app.ayrovi.mobile.demo` ⇒ **يتمشّى حَدّ التطبيق
   القديم وما يلمسوش** (الزوز يبقاو مثبّتين).
4. تحقّق من اللي عندك: الرئيسية تعرض «بصمة البناء» = SHA متاع الـcommit اللي
   تبنى منو — ومع شاشة «حول التطبيق» تعرف شنوّة من التطبيق وشنوّة من الخادم.

> الـAPK هذا **موقّع بمفتاح debug** بالعمد (للتجربة فقط). ما ينفعش للنشر — النشر
> يمشي بـAAB موقّع بمفتاحك (§3).

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

> **قبل ما تضغط «Run workflow»**، شغّل جهوزية الإصدار — يشوفلك كل شي مرّة وحدة
> بدل ما تكتشف النقص بعد البناء:
>
> ```bash
> cd apps/mobile
> npm run release:preflight -- --version-code 8 --version-name 2.0.1
> ```
>
> (يزيد `--json` كان تحبّ تقريراً للآلة.) الطبع: `PASS` / `FAIL` / `WARN` /
> `SKIP` على كل بند: الحزمة والإصدار، الخادم حيّ وجاهز وأي كود **منشور فعلاً**،
> إعدادات الشراء، `assetlinks.json` والبصمات، الأسرار الأربعة، ورأس الفرع.
> `FAIL` = ما تبنِش. `WARN` = تقرّر وانت عارف.



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

النصف الأول جاهز في `app.json` (`intentFilters` + `autoVerify: true`).
النصف الثاني **مكتوب وموجود في الخادم** (`src/server.ts` — الطريق
`/.well-known/assetlinks.json`) ولا يستنّى كان **بصمتك**: البصمة ما تتكتبش في
الكود، تتقرا من متغيّرات بيئة، لأنّ صاحب المشروع هو اللي يولّد المفتاح، وكذلك
لأنّ Google Play يعيد التوقيع بمفتاح ثانٍ لازم يتزاد هو أيضاً.

### شنوّة تعمل (مرّة واحدة)

1. خذ **بصمة SHA-256** من مفتاح التوقيع:

```bash
keytool -list -v -keystore ayrovi-release.jks -alias ayrovi | grep SHA256
# ⇒ SHA256:  C0:4A:9F:...   (32 بايت)
```

2. في بيئة الخادم (نفس بلاصة باقي المتغيّرات)، زيد:

| المتغيّر | القيمة | إلزامي؟ |
|---|---|---|
| `ANDROID_APP_LINK_SHA256` | البصمة من الخطوة 1 — وبعدها **زيد بصمة Google Play** مفصولة بفاصلة (Play Console → App integrity → App signing key certificate) | ✅ |
| `ANDROID_APP_LINK_PACKAGES` | `app.ayrovi.mobile` (افتراضي) + `app.ayrovi.mobile.demo` كان تحبّ العرض التجريبي يفتح الروابط هو أيضاً | ❌ (اختياري) |

اللصقة تتقبل كما هي: `SHA256: C0:4A:...`، وكذلك 64 حرف بلا فواصل — الخادم
ينظّم الكتابة (نفس البايتات) ويشيل التكرار.

3. **بلا بصمة: الملف يرجع 404** مع `APP_LINK_FINGERPRINT_NOT_CONFIGURED` —
بالعمد. ملف غالط أسوأ من ملف غايب: أندرويد يقعد يعاود بلا إشارة، والمستعمل
يحسب «الروابط مكسورة». بصمة مغلوطة (حرف ناقص) ما تتنشرش أصلاً: الخادم يرفضها
كلّها (`shared/appLinks.ts`).

### كيفاش تتأكّد أنها نجحت

> ⚠️ `ayrovi.tn` ما فيهش خادم توّا (شوف §6)، يعني بصمة أندرويد ما تتقراش منو.
> لهذا `app.json` يعلن كذلك **`ayrovi-beta1-1.onrender.com`** — وخدمة الخادم
> (الفرع) تنشر `assetlinks.json` على نفس النطاق. كي يولّي `ayrovi.tn` حيّ،
> النطاقان يخدمو بلا بناء جديد.

```bash
curl -s https://ayrovi-beta1-1.onrender.com/.well-known/assetlinks.json | python3 -m json.tool
# لازم تشوف package_name = app.ayrovi.mobile والبصمة صحيحة في القائمة
```

ومن التلفون: اكتب في Chrome رابط `https://ayrovi.tn/...` ⇒ يفتح التطبيق
مباشرة بلا ما يسألك. المسارات اللي مازال ما عندهاش شاشة في التطبيق ما تعطيش
صفحة بيضاء: `app/+not-found.tsx` تعرض المسار وتفتحو في المتصفّح.

> ملاحظة: الطريق هذا **ما يبدّل شي** في الموقع كان المتغيّر فارغ (سلوك اليوم).
> الاختبارات: `npx vitest run tests/android-app-links.test.ts` (14 اختبار).

---

## 6) أي خادم يحكي مع التطبيق (الحقيقة، وتصحيح غلطة)

**`ayrovi.tn` ما فيهش خادم** (07/10/2026) — على العنوان هذا التطبيق يلقى
«ما فماش شبكة» في كل شاشة. الخادم الحقيقي هو خدمة Render،
والاسم اللي يعلن عليه الخادم نفسه:

```
https://ayrovi-beta1-1.onrender.com
```

(مرجعان في الريبو: `client/src/services/apiOrigin.ts` — «الخادم المنشور يعلن
على `-1`» — و`android/app/build.gradle` القديم.)

**الغلطة اللي كانت**: حزمة التطبيق كانت تتبنى بـ`EXPO_PUBLIC_API_BASE_URL`
افتراضي `https://ayrovi.tn` ⇒ كل شاشة تلقى «ما فماش شبكة» ⇒ «التطبيق ما يخدمش».
تصحّحت في: `apps/mobile/src/api/config.ts` (الأصل الافتراضي)، وورشتَي APK/AAB،
وسكريبت الجهوزية — واختبار (`tests/origin.test.ts`) يمنع رجوع التشتّت.

| الحالة | أي خادم | شنوّة يخدم |
|---|---|---|
| **توّا (خادم `main` الحيّ)** | `ayrovi-beta1-1.onrender.com` | الرئيسية، Lens، OCEREX، متاجر AYWEBs، المساعد… **والدخول يفشل** |
| **بعد نشر الفرع** | نفس الخدمة على فرع جديد ولا خدمة ثانية | كل شي: الدخول، السلّة، الشراء، وإصلاحات التقاط أمازون |

**علاش الدخول يفشل على الخادم الحيّ**: إعطاء الجلسة للتطبيق
(`src/customer/sessionExchange.ts` — `x-ayrovi-client: mobile/x.y.z`) موجود في
**الفرع** وحدو؛ الخادم الحيّ `main` يعطي كوكي للمتصفّح. التطبيق يقولها بصراحة:
«الخادم ما فتحش جلسة للتطبيق: النسخة اللي عندو ما تعرفش التطبيق».

### كيفاش تعرف «الخادم على أي فرع؟» — بجواب واحد

```bash
curl -s https://<عنوان-الخدمة>/api/ready
```

| الجواب | المعنى |
|---|---|
| `"branch":"arena/c0321e79-ayrovi-beta1"` + `"commit":"xxxxx"` | الخادم منشور من الفرع، وهذا بالضبط الكود |
| `"commit":"local"` (وبلا `branch`) | **قديم/منشور بلا Git** ⇒ ما نعرفوش أي كود، يعني عملياً: موش الفرع |

> ⚠️ الحقلان هذا **جديدان اليوم**: قبل، الكود كان يقرا `RENDER_GIT_COMMIT_SHA`
> — اسم ما تعطيهش Render (الصحيح `RENDER_GIT_COMMIT`)، وكان يتجاهل
> `RENDER_GIT_BRANCH` تماماً. النتيجة: كل خادم منشور على Render يردّ
> `commit:"local"`، يعني «ما نعرفوش» تلبّست في شكل معلومة. الخدمة الجديدة
> تولّي تجاوب بالحقيقة من أوّل نشر.

**قياس فعلي (07/10/2026، عبر `.github/workflows/server-probe.yml`)**:

| العنوان | `/api/health` | `/api/ready` | `assetlinks.json` | `aywebs/health` |
|---|---|---|---|---|
| `ayrovi-beta1-1.onrender.com` | 200 (3.10.4) | 200 — `commit: local`، بلا فرع | **HTML** (الطريق ما موجودش) | 200 بلا `stats` |
| `ayrovi-beta1.onrender.com` | 200 (3.10.4) | 200 — `commit: local`، بلا فرع | **HTML** | 200 بلا `stats` |

**الاستنتاج**: **حتى واحد منهم ما يشغّل كود الفرع** (طريق `assetlinks` وحقل
`stats` موجودين في الفرع وحدو). يعني حسب القاعدة: **خدمة جديدة من الفرع،
والإنتاج الحالي ما يتلمسش**.

### شنوّة يشغّل الخادم الحيّ بالضبط (قياس، موش تخمين)

فحص آلي (`Serveur — état du déploiement`، سكريبت في
`.github/workflows/server-probe.yml`) على `https://ayrovi-beta1-1.onrender.com`
يوم 07/10/2026:

| القياس | النتيجة | المعنى |
|---|---|---|
| `GET /api/health` | **200** | الخادم حيّ ويجاوب |
| `GET /api/ready` | **200**، `commit: "local"` | **ما هوش منشور من Git** — ما يعلنش أي commit، فما نعرفوش أي كود يشغّل |
| `GET /.well-known/assetlinks.json` | 200 لكن **HTML** | صفحة SPA — يعني **الطريق هذا (متاع الفرع) ما موجودش** |
| `GET /api/v1/aywebs/health` | 200 بلا حقل `stats` | نفس الاستنتاج: الكود طالع من `main`، موش من الفرع |
| `/api/public/commerce-config` · `/api/assistant/status` | 200 · 200 | الخدمات الأساسية موجودة |

### فحص كل نقطة دخول متاع التطبيق (نفس التاريخ، نفس الفحص)

الفحص يجرّب **نفس المسارات ونفس الطرق (GET/POST)** اللي يستعملها التطبيق
(`apps/mobile/src/api/`)، على `https://ayrovi-beta1-1.onrender.com`:

| الطلب | الكود | القراءة |
|---|---|---|
| `GET /api/public/hero-content` | 200 | ✅ |
| `GET /api/public/navigation` | 200 | ✅ |
| `GET /api/public/announcement-messages` | 200 | ✅ |
| `GET /api/public/commerce-config` | 200 | ✅ |
| `GET /api/customer/auth/config` | 200 | ✅ |
| `POST /api/customer/auth/email/login` | 401 | ✅ الطريق موجود (401 = محتاج بيانات حساب صحيحة) |
| `POST /api/customer/auth/otp/request` | **503** | ⛔ `OTP_UNAVAILABLE` — **دخول بالـSMS موش مضبوط في الخادم** |
| `GET /api/customer/auth/me` | 401 | ✅ (محتاج جلسة) |
| `GET /api/customer/account/overview` | 401 | ✅ (محتاج جلسة) |
| `GET /api/customer/account/orders` | 401 | ✅ (محتاج جلسة) |
| `GET /api/cart/items` | 400 | ✅ (محتاج `x-session-id`) |
| `GET /api/v1/aywebs/health` | 200 | ✅ |
| `GET /api/v1/aywebs/stores` | 200 | ✅ |
| `POST /api/v1/aywebs/cart/items` | 400 | ✅ (محتاج جسم الطلب) |
| `GET /api/assistant/status` | 200 | ✅ |
| `POST /api/ocerex/analyze` | 400 | ✅ (محتاج صورة/نص) |
| `POST /api/checkout` | 401 | ✅ (محتاج جلسة) |

**قاعدة القراءة**: `404` = الطريق ماكانش (خدمة ناقصة) · `401/400/403` =
الطريق موجود ويطلب حساب/بيانات · `5xx` = الطريق موجود لكن الخدمة موش جاهزة.

**النتيجة**: **التطبيق في الشكل هذا ما عندو حتى خدمة ناقصة على الخادم الحيّ،
إلاّ الدخول بالـSMS.** الدخول بالإيميل حاضر (401 على طلب فارغ = الطريق يخدم)،
والسلّة، والشراء، والـAYWEBs، والمُساعد، وOCEREX كاملين موجودين.

**علاش الدخول بالـSMS يرجع 503**: الخادم يقبل دخول بالـSMS كان كان مزوّد
مضبوط في البيئة. لازمو واحد من الثنيات هذي:

- Twilio Verify: `CUSTOMER_OTP_PROVIDER=twilio_verify` + `TWILIO_ACCOUNT_SID`
  + `TWILIO_AUTH_TOKEN` + `TWILIO_VERIFY_SERVICE_SID`؛
- ولا ويب-هوك متاعك: `CUSTOMER_OTP_PROVIDER=webhook` +
  `CUSTOMER_OTP_WEBHOOK_URL` (لازم `https://`) + `CUSTOMER_OTP_WEBHOOK_TOKEN`.

**عنوان خدمة الـBeta الحالية**: `https://ayrovi-beta1-moo8.onrender.com`
(خدمة `Ayrovi2` في Render، من الفرع `arena/c0321e79-ayrovi-beta1`). العنوان
مسجّل في المواضع الكل بأمر `release:set-api-base` — الرمز، الورشتين، الجهوزية،
فحص الـBeta، والروابط العميقة.

### أداة قياس: «Serveur — test de bout en bout (appli)»

في `.github/workflows/beta-smoke.yml`: تشغيل واحد يجيب جواب قاطع — يخلق حساب
تجريبي بعنوان `smoke.<وقت>@ayrovi.test` بنفس `en-tête` متاع التطبيق، ويتحقّق
واحد واحد: `/api/ready` (فرع؟) · `session_token` في الجسم · `Bearer` يفتح
الحساب · السلّة · `POST /api/checkout` (يطلب `x-session-id`، ويبعث نفس جسم
التطبيق) · قائمة الطلبات · `assetlinks.json`. ويقرا زادة
`/api/customer/auth/config` ويقول **شنوّة يعرض الخادم**: إيميل، Google،
Facebook، Apple، SMS، استرجاع كلمة السرّ. النتيجة تظهر في **ملخّص + تعليق**
التشغيل، بلا ما تحتاج تلفون.

**شرط تأكيد الطلب — لازم تعرفو قبل التجربة**: الخادم ما يقبلش تأكيد الطلب كان
كان الحساب **متوثّق**: إيميل موثّق (دخول Google/Apple/Facebook) ولا تلفون موثّق
(دخول بالـSMS). حساب إيميل عادي جديد **ما يكمّلش الطلب** — والرفض صريح ومترجم في
التطبيق: `CONTACT_VERIFICATION_REQUIRED` («وثّق إيميلك ولا رقمك قبل التأكيد»).
يعني باش تجرّب **طلب حقيقي** على خدمة الـBeta، لازم واحد من الثنيات:

- مفاتيح Google/Facebook (كانت موجودة في بيئة الإنتاج، النسخ يجيبها) ⇒ دخول
  Google = إيميل موثّق؛ ولا
- مزوّد SMS (`CUSTOMER_OTP_PROVIDER=webhook` + `CUSTOMER_OTP_WEBHOOK_URL`
  و`CUSTOMER_OTP_WEBHOOK_TOKEN`، ولا Twilio Verify) ⇒ توثيق/دخول بالتلفون.

وكان ما فماش حتى واحد منهم، التطبيق **يقولها بصراحة** ولا يخترع نجاحاً كاذباً.

**تبديل العنوان بأمر واحد**: كي تولّي عندك خدمة Beta، بدّل العنوان في كل
المواضع (الرمز، الورشتين، الجهوزية، فحص الـBeta، الروابط العميقة) بأمر:

```bash
cd apps/mobile && npm run release:set-api-base -- https://العنوان-الجديد.onrender.com
npm test            # اختبار الأصل يتأكّد أنّ المواضع الكل متّفقين
```

**وقتاش يتشغّل وحدو**: كي نكتبو عنوان خدمة الـBeta في الحقل الافتراضي في
`beta-smoke.yml` (نفس الـcommit اللي يبدّل عنوان التطبيق) ⇒ كل push يشغّلو
ويعطي الحكم. قائمة متغيّرات البيئة اللازمة للخدمة الجديدة (باش الدخول يخدم
من أول ضغطة) موجودة في `docs/RENDER_DEPLOY.md` § «Service Beta».

**حماية**: التشغيل الآلي ما يلمسش عناوين الإنتاج (يتوقّف ويقولها بالصريح)؛
العنوان الافتراضي = `https://beta-a-configurer.invalid`. كي تولّي عندك خدمة
Beta تحطّ عنوانها في الحقل `base`.

**التطبيق ما يخبّيش هذا**: شاشة الدخول تقرأ `/api/customer/auth/config`،
كي ترجع `phoneOtp.enabled = false` تظهر كارطة الهاتف **بالتفسير**
(«طريقة الدخول هذي مازالت ما مفعّلةش في الخادم») والزر **مقفول** — ما فماش
زر ميّت ولا رسالة كذب. الدخول بالإيميل يبقى مفتوح ويخدم.

**الخلاصة**: الخادم يخدم بلا مشكلة، لكن يشغّل كود `main` **وينشر يدوياً بلا
Git**. لهذا: الدخول من التطبيق ما يخدمش، وإصلاحات AYWEBs متاع الفرع ما موجودة.

### ثلاثة حلول مرتّبة

| الحل | شنوّة يعطي | الثمن |
|---|---|---|
| **1) خدمة Render ثانية من هذا الفرع** (موصى به) | التطبيق كامل يخدم، والموقع الحيّ ما يتلمسش | 10 دقائق إعداد؛ الديسك جديد ⇒ نرجّعو نسخة قاعدة (Même schéma : الفرع ما بدّلش `src/db/database.ts`) |
| 2) دمج الفرع في `main` | نفس النتيجة على الخدمة الحالية | **الموقع الحيّ يتبدّل** — لا يتوصّى بيه بلا تجربة |
| 3) نبقاو على `main` | تصفّح بلا حساب | الدخول، السلّة، الشراء، المراقبات: **مقفولين** |

**الحلّ 1 بالتفصيل**: Render → New → Web Service → نفس الريبو → Branch
`arena/c0321e79-ayrovi-beta1` → Frankfurt · Starter · Build
`npm ci --include=dev && npm run build` · Start `npm start` · Health
`/api/ready` · Disk جديد `ayrovi-data-beta` في `/opt/render/project/src/data` ·
انسخ متغيّرات البيئة من الخدمة الحالية + `PUBLIC_BASE_URL` = عنوان الخدمة
الجديدة. من بعد: `npm run release:preflight -- --api-base <العنوان الجديد>` ثم
بناء APK/AAB عليه.

## 7) اللي مازال موش جاهز (وعلاش)

| القطعة | السبب | شنوّة يلزم |
|---|---|---|
| إشعارات FCM | ما فماش مشروع Firebase مربوط | مشروع Firebase متاعك + `google-services.json` (ماشي في Git: يُمرّر كـsecret) + جدول أجهزة في الخادم (`POST /api/customer/devices`) |
| خلاص بالكارطة | بوّابة الخادم موش مركّبة | مفاتيح Konnect في بيئة الخادم (`KONNECT_*`) — الكود في التطبيق موجود ويستنّاها |
| Apple App Store | ما فماش حساب Apple Developer | حساب ($99/سنة) + شهادة + ملف AASA |
| تبديل التطبيق القديم على التلفون | توقيع مختلف (ما فماش keystore قديم) | المستعمل يحذف القديم ويركّب الجديد، ولا نختارو معرّفاً جديداً في Play |
| دخول بالـSMS (كود OTP) | الخادم بلا مزوّد SMS مضبوط (قياس: `503 OTP_UNAVAILABLE`) | `CUSTOMER_OTP_PROVIDER` + مفاتيح Twilio Verify، ولا ويب-هوك (شوف §6) — الدخول بالإيميل يخدم بلا هذا |

---

## 8) قائمة تحقّق سريعة قبل كل إصدار

- [ ] `version_code` زاد عن الإصدار اللي قبلو.
- [ ] `EXPO_PUBLIC_API_BASE_URL` مضبوط على الخادم اللي باش يخدم فعلاً.
- [ ] الـCI أخضر على الفرع (`CI` + `Mobile — AYROVI app`).
- [ ] الأسرار الأربعة موجودة (وما تبدّلتش من غير ما تعرف).
- [ ] الـAAB المرفوع موقّع بالمفتاح متاعك (الـworkflow يقولها).
- [ ] نسخة احتياطية جديدة من `ayrovi-release.jks` + كلمات السر.
- [ ] `npm run copy:check` أخضر (تدقيق النصوص: كود بلا نص، نص بلا مستعمل، لغة غالطة).
- [ ] `ANDROID_APP_LINK_SHA256` موجود في بيئة الخادم (وإلاّ الروابط ما تفتحش التطبيق).
