# فحص كامل لسيستام تسجيل الدخول — 11/11/2026

**النطاق:** كل طرق الدخول متاع الحريف (إيمايل + كلمة سر، كود بالإيمايل، كود SMS، Google، Facebook، Apple، الدخول من التطبيق)، الجلسات و CSRF، استرجاع كلمة السر، دمج الحسابات، الحسابات المحظورة، دخول الإدارة (back-office)، والكود متاع التطبيق (Expo).

**الطريقة:** قريت الكود سطر بسطر (`src/customer/*`, `src/admin/auth.ts`, `src/admin/routes.ts`, `src/server.ts`, `apps/mobile/src/api/*`, `apps/mobile/src/state/*`). كل ثغرة لقيتها وصلّحتها عندها test يطيح على الكود القديم وينجح على الجديد: `tests/customer-auth-audit-2026-11-11.test.ts`، فيه 16 test. جرّبت الـ16 على الكود القديم: 12 منهم طاحوا، والـ4 اللي نجحوا عادي، لأنهم يثبتو سلوك صحيح كان موجود من قبل ولازم يبقى.

---

## الخلاصة

| الدرجة | العدد | تصلّح في هالفرع |
|---|---|---|
| 🔴 حرجة | 2 | ✅ الزوز |
| 🟠 عالية | 2 | ✅ الزوز |
| 🟡 متوسطة | 5 | ✅ 3 ، ⏳ 2 توصيات |
| 🔵 ضعيفة / تحسين | 7 | ⏳ توصيات |

الأساس متين: الجلسات مخزّنة كـ hash، فما ثمّاش session fixation، و CSRF مفروض على كل كتابة. كلمات السر بـ scrypt ومقارنة في وقت ثابت. استرجاع كلمة السر مبني بشكل ممتاز، و Google و Facebook محميين بـ state مربوط بالمتصفح. المشاكل الكبار كانت في **التقاطعات**: الحظر مع SMS، الإيمايل غير المؤكَّد مع الكود، و Apple.

---

## 🔴 C1 — الحساب المحظور يتفكّ وحدو بكود SMS

**الملف:** `src/customer/routes.ts` → `completePhoneVerification`

**المشكل:** كي الحريف يأكّد رقمو بكود SMS، الكود كان يعمل `UPDATE … SET status='ACTIVE'` بلا أي شرط. يعني الحريف اللي حظرتو الإدارة (`PUT /admin/customer-accounts/:id/status` → `BLOCKED`) يطلب كود SMS لرقمو، يدخل، والحظر يتنحّى وحدو.

وفمّا طريق ثانية: يحل حساب جديد بالإيمايل، يتصل بيه، ومبعد يأكّد رقم الحساب المحظور. ساعتها `mergeAccounts` يدمج الحساب المحظور (بكوموندياتو وعناوينو) في الحساب الجديد.

**التصليح:**
- `completePhoneVerification` يرفض بـ `ACCOUNT_BLOCKED` (403) إذا كان الحساب متاع الرقم محظور، وما عادش يمسّ `status`.
- `mergeAccounts` يرفض الدمج إذا واحد من الزوز حسابات موش `ACTIVE`. هذا يحمي زادة الدمج عن طريق Google و Facebook.
- Google و Facebook و Apple و Google natif: يرفضو بصراحة قبل ما يحلّو جلسة. قبل كانو يقولو «تم الدخول» والجلسة تموت من أول طلب.

**Tests:** `C1 — un compte bloqué reste bloqué` (2) + `identité Google rattachée à un compte bloqué`.

---

## 🔴 C2 — سرقة الحساب مسبقاً عن طريق إيمايل موش مؤكَّد (pre-account takeover)

**الملف:** `src/customer/routes.ts` → `/auth/email-code/verify`

**المشكل:** التسجيل بالإيمايل وكلمة السر (`/auth/email/register`) ما يأكّدش الإيمايل، وتعديل البروفيل (`PUT /account/profile`) يقبل زادة أي إيمايل. السيناريو:
1. المهاجم يحل حساب بإيمايل الضحية وبكلمة سر يعرفها هو، أو يحط إيمايل الضحية في بروفيل حسابو اللي فيه رقمو.
2. الضحية تدخل بعد بـ«كود الإيمايل». الكود يثبت إنها مولات الإيمايل، والسيستام **يأكّد نفس الحساب كيما هو**: كلمة سر المهاجم ورقمو وجلساتو كلهم يبقاو خدامين.
3. الزوز يتقاسمو نفس الحساب. المهاجم يشوف العناوين والكوموندات، وينجم يكوموندي.

مسار Google كان محمي من هالشي (ينحّي الإيمايل غير المؤكَّد)، أما مسار الكود لا.

**التصليح** (نفس منطق Google):
- **إذا الحساب فيه وسيلة دخول أخرى** (رقم مؤكَّد، Google، Facebook، Apple): ما نعرفوش مولاه شكون. نحّيو منو الإيمايل ونبعثولو notification، ومولى الإيمايل الحقيقي ياخو حساب جديد.
- **إذا الحساب فيه كلمة سر برك:** الحساب يبقى لمولى الإيمايل، أما كلمة السر تتلغى، كل الجلسات القديمة تتسكّر، و liens الاسترجاع المفتوحين يتلغاو. ويوصلو notification يفسّرلو كيفاش يحط كلمة سر جديدة.
- إذا الإيمايل كان مؤكَّد من قبل، السلوك ما تبدّل في شي (فما test يثبت هذا).

**Tests:** `C2 — pré-appropriation…` (3).

---

## 🟠 H1 — ما فماش حد للمحاولات على كل إيمايل (credential stuffing)

**الملف:** `emailLoginHandler`

**المشكل:** الحد الوحيد كان 5 أخطاء لكل IP في Map في الذاكرة. يعني:
- مهاجم عندو برشا IP (botnet أو proxies) يجرّب كلمات سر بلا حد على نفس الإيمايل؛
- الحد يتمسح مع كل redémarrage؛
- و `/auth/login` ما عندوش حتى `rateLimit` في `server.ts`، عكس الإدارة و OTP.

وزيد: كي الإيمايل موش موجود ما كانش يصير حتى حساب scrypt، فالجواب يرجع في 1ms عوض 50ms تقريباً. بالتوقيت برك تنجم تعرف شكون عندو حساب.

**التصليح:**
- حد جديد **على كل إيمايل** و**مخزّن في قاعدة البيانات**: 10 أخطاء في 15 دقيقة مهما كانت الـ IP (`customer_auth_rate_limits`، والإيمايل مخزّن كـ HMAC موش نص واضح). الدخول الناجح يرجّع العدّاد لصفر.
- الإيمايل اللي موش موجود يتحسب بنفس الطريقة، باش ما يولّيش وسيلة تعرف بيها شكون مسجّل.
- `burnPasswordCheck`: حساب scrypt وهمي كي الحساب موش موجود، باش يولّي التوقيت كيف كيف.
- الحد القديم بالـ IP بقى كيما هو.

**ملاحظة:** مهاجم ينجم يقفل الدخول بكلمة السر على حساب معيّن 15 دقيقة. هذا مقبول، خاطر الحريف ينجم يدخل بالكود، بـ SMS ولا بـ Google.

**Tests:** `H1 — plafond de connexion PAR ADRESSE` (3).

---

## 🟠 H2 — Apple Sign-In: ما يخدمش، وفيه ثغرة CSRF

**الملف:** `/auth/apple/start` و `/auth/apple/callback`

**المشاكل:**
1. `response_mode: 'query'` مع `scope: 'name email'`: Apple **ترفض** هذا وتفرض `form_post` كي تطلب scopes. يعني بوطونة Apple، كي تتفعّل بالمفاتيح، ترجع صفحة غلطة عند Apple.
2. ما فماش cookie يربط الـ `state` بالمتصفح (Google و Facebook عندهم). مهاجم ينجم يبعث للضحية lien callback فيه حسابو هو، والضحية تلقى روحها داخلة لحساب المهاجم (login CSRF)، وكل ما تعمل (عنوان، كارطة…) يمشي ليه.
3. الـ `id_token` ما كانش يتراقب فيه `aud` ولا `iss` ولا `exp`.
4. الإيمايل متاع Apple كان يتستعمل للدمج حتى من غير `email_verified`.

**التصليح:**
- `response_mode: 'form_post'`، و route جديدة `POST /auth/apple/callback` تبعث **303** للـ GET بـ `code` و `state` برك. الـ POST اللي جاي من موقع آخر ما يهزّش cookie، أما الـ GET اللي بعدو (navigation عادية) يهزّو.
- cookie جديد `ayrovi_customer_apple_oauth` (HttpOnly، SameSite=Lax، Path=/api/customer/auth/apple)، ويتراقب في الـ callback.
- مراقبة `aud == APPLE_CLIENT_ID` و `iss == https://appleid.apple.com` و `exp`.
- الدمج بالإيمايل وتبنّي الإيمايل ما يصيروش كان إذا `email_verified`.
- `rateLimit('apple-oauth')` في `server.ts`، كيما Google و Facebook.

> ⚠️ **في Apple Developer:** الـ Return URL لازم تبقى `https://<domaine>/api/customer/auth/apple/callback` (نفس الـ URL، Apple تبعث عليها POST توا).

**Tests:** `H2` (5)، منهم مسار كامل start → form_post → 303 → GET مع cookie → جلسة، ورفض token متاع تطبيق آخر.

---

## 🟡 متوسطة

### M1 — `/auth/google/native` يرجّع الـ token للموقع ✅ تصلّح
كانت ترجّع `native_session_token` في الـ JSON لكل واحد يطلبها، حتى من الموقع. الـ token صالح 30 يوم، وأي script مدسوس (XSS) ينجم يقراه. توا تستعمل `sessionExchangeFields`: التطبيق الجديد ياخو `session_token`، التطبيق القديم (`x-ayrovi-native: 1`) ياخو `native_session_token`، والموقع ياخو cookie HttpOnly برك. `parseSessionIssue` في التطبيق يقرا الزوز أسامي، فما تبدّل شي من جهتو.

### M2 — كي الحريف يتحظر، الجلسات اللي بدات بـ OAuth كانت تطلع «ناجحة» ✅ تصلّح (مع C1)

### M3 — Apple: الـ id_token ما يتراقبش ✅ تصلّح (مع H2)

### M4 — `developmentCode` في بيئات موش production ⏳ توصية
الـ OTP بـ `console` والكود بالإيمايل يرجّعو الكود في الجواب كي `NODE_ENV !== 'production'`. Render يفرض production (`assertProductionConfiguration`)، أما أي preview أو staging عام بلا `NODE_ENV=production` يخلّي أي واحد يدخل لأي إيمايل ولا رقم. **التوصية:** ما تحطش أبداً بيانات حقيقية في staging، ولا زيد متغيّر `ALLOW_DEV_CODES=1` يكون إجباري باش يطلع الكود.

### M5 — ما فماش «أخرج من كل الأجهزة» ولا قائمة جلسات ⏳ توصية
الجلسة تعيش 30 يوم ثابتة، بلا انتهاء كي ما يستعملهاش وبلا تجديد. `logout` يسكّر الجلسة الحالية برك. **التوصية:** `GET /account/sessions` و `POST /auth/logout-all`، و idle timeout (مثلاً 14 يوم بلا استعمال) لأن `last_seen_at` موجود أصلاً.

---

## 🔵 ضعيفة / تحسينات (ما تبدّلتش)

1. **مقارنة CSRF** `hashToken(x) !== csrf_token` موش في وقت ثابت. الخطر شبه معدوم لأن القيم hash، أما `safeEqualHash` موجودة وينجم يتستعمل.
2. **`requireCustomer` يمسح الـ cookie** حتى لعميل Bearer. ما يضرّش، أما ما عندو حتى معنى.
3. **`customer_native_handoffs`** يخزّن الـ token الخام 10 دقايق. الأحسن تشفيرو بـ `CUSTOMER_AUTH_SECRET` (AES-GCM) ولا تخزين hash مع token ثاني يتعمل وقت الـ claim.
4. **`/auth/email/lookup` و `EMAIL_TAKEN`** يكشفو وجود الحساب، وهذا اختيار مقصود (Zalando). الحد 60 في 15 دقيقة لكل IP. يكفي، أما لازم يتعرف.
5. **التسجيل ما يأكّدش الإيمايل.** C2 سكّر الخطر، أما التوصية تبعث lien تأكيد وما تخلّيش كلمة السر تولّي خدامة كان بعد التأكيد.
6. **الحد بالـ IP في الذاكرة** (5 أخطاء) قاسي على CGNAT (Ooredoo، Orange، TT). المشروع كبّرو لـ OTP على هالسبب، وتنجم تكبّرو هنا لـ 20 خاطر توا فما حد على كل إيمايل.
7. **تغيير كلمة السر** (`/account/security/password`) ما يمسحش `customer_native_handoffs` متاع الحساب. نافذة 10 دقايق، ضعيفة.

---

## دخول الإدارة (back-office)

| العنصر | الحالة |
|---|---|
| Cookie `HttpOnly; SameSite=Strict; Path=/api/admin; Secure` في prod | ✅ |
| جلسة 8 سوايع، token مخزّن كـ hash، CSRF يتبدّل مع `/auth/me` | ✅ |
| scrypt، 12 حرف على الأقل، المقارنة في وقت ثابت | ✅ |
| حد للمحاولات: 8 لكل IP (ذاكرة) + 10 في 5 دقايق لكل IP + 120 عام | ✅ |
| تغيير كلمة السر يطلب القديمة ويسكّر كل الجلسات | ✅ |
| `active=0` يسكّر الدخول فوراً | ✅ |
| كلمة السر الافتراضية `AyroviBeta2026!` ممنوعة في prod | ✅ |
| `ADMIN_BOOTSTRAP_RESET` يتستعمل مرة وحدة، 32 حرف على الأقل | ✅ |
| `X-Frame-Options: DENY` على `/admin` | ✅ |
| **2FA (TOTP)** | ❌ ما فماش. **أهم توصية للإدارة**، خاطر هي اللي تقرر الأسوام وترجيع الفلوس. |
| حد على كل إيمايل admin + تسجيل المحاولات الفاشلة في audit | ⏳ توصية |
| توقيت مختلف كي الإيمايل موش موجود | 🔵 ضعيف (نفس تصليح `burnPasswordCheck` ينجم يتطبق) |

---

## التطبيق (apps/mobile)

| العنصر | الحالة |
|---|---|
| الـ token في SecureStore (Keychain/Keystore)، عمرو ما يتحط في AsyncStorage على الجهاز | ✅ |
| `x-ayrovi-client: mobile/x` → token في الـ body؛ Bearer + `x-csrf-token` على كل كتابة | ✅ |
| كي يطيح CSRF يتجدّد مرة وحدة (`csrfRefresher`) بلا ما يطلع للحريف | ✅ |
| OAuth بالـ handoff: code عشوائي 32 byte، الخادم يخزّن hash برك، يتستعمل مرة وحدة، 10 دقايق | ✅ |
| `parseSessionIssue` يقرا `session_token` و `native_session_token` | ✅، يعني تصليح M1 ما يكسّر شي |
| Logout: يمسح الـ trousseau حتى كي الشبكة طايحة | ✅ |

---

## الملفات اللي تبدّلت

- `src/customer/routes.ts`:
  - `assertActiveAccount`
  - `mergeAccounts` يرفض الحسابات المحظورة
  - `completePhoneVerification`
  - `email-code/verify` (C2)
  - حد المحاولات على كل إيمايل و `burnPasswordCheck`
  - Apple (form_post، POST callback، cookie، claims)
  - Google natif (`sessionExchangeFields`، 403 blocked)
- `src/customer/passwords.ts` → `burnPasswordCheck`
- `src/customer/passwordRecovery.ts` → `customerAuthRateCount` و `customerAuthRateReset`
- `src/server.ts` → `rateLimit('apple-oauth')`
- `tests/customer-auth-audit-2026-11-11.test.ts` → 16 test جديد

## النتائج

- `tsc --noEmit`: نظيف.
- Tests الدخول (`customer-*`، `otp`، `authenticated-rate-key`، `adversarial-customer-isolation`) + الجديد: الكل ناجح.
- Vitest الكامل: 3516 ناجح. فما 16 فاشلين **كانو فاشلين قبل التصليح زادة** (جرّبتهم على الكود القديم: نفس الـ16). سببهم البيئة: ما فماش `dist` (build متاع SPA)، و guards متاع icônes/editorial. ما عندهم حتى علاقة بالدخول.
