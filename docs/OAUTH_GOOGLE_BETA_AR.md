# إنشاء عميل Google OAuth مخصّص لخدمة الـBeta

**التاريخ**: 08/10/2026 · **الفرع**: `arena/c0321e79-ayrovi-beta1`

## لماذا نحتاج عميلاً جديداً (وليس فقط تعديل القديم)

عميل OAuth الحالي **مستعمل من طرف الإنتاج**. تعديل `redirect URI` متاعو باش
يوجّه لخدمة الـBeta = تخريب دخول Google في **الإنتاج**، وهذا بالضبط اللي ما
نحبّوش يصير («ما نحبّش الإنتاج يتبدّل قبل ما تكمل تجربة التطبيق»).

عميل مخصّص = **عميلان، خدمتان، بلا تلاقي**:

| | الإنتاج | الـBeta |
|---|---|---|
| الخدمة | `ayrovi-beta1-1.onrender.com` | `ayrovi-beta1-moo8.onrender.com` |
| عميل OAuth | القديم (ما يتلمسش) | **جديد** |

## القياس اللي خلّانا نعمل هذا

ورشة `Serveur — test de bout en bout (appli)` تقرا التوجيه **الحقيقي** اللي
يخرج من الخادم (موثوق، موش تخمين في الإعدادات):

```
google_callback=autre-serveur:https://ayrovi-beta1-1.onrender.com/api/customer/auth/google/callback
```

يعني: الضغطة على «دخول بـGoogle» تبعث المستعمل لخدمة الإنتاج، والجلسة
تسقط هناك ⇒ الدخول يفشل في تطبيق الـBeta.

---

## الجزء 1 — Google Cloud Console (عميل جديد)

1. افتح <https://console.cloud.google.com/apis/credentials>
2. فوق: تأكّد أنّك في **نفس المشروع** اللي فيه العميل القديم (اسم المشروع يبان
   على يمين «Google Cloud»).
3. **Create Credentials** ← **OAuth client ID**
4. **Application type** ← `Web application` (موش Android ولا iOS: التدفّق
   يمرّ من خادمنا، والخادم هو اللي يعمل التبادل).
5. **Name** ← `AYROVI Beta (Render)`
6. **Authorized JavaScript origins** ← زيد:
   ```
   https://ayrovi-beta1-moo8.onrender.com
   ```
7. **Authorized redirect URIs** ← زيد **بالحرف** (بلا `/` في الآخر، بلا فراغ):
   ```
   https://ayrovi-beta1-moo8.onrender.com/api/customer/auth/google/callback
   ```
8. **Create**
9. النافذة تعطيك **`Client ID`** (ينتهي بـ`.apps.googleusercontent.com`) و
   **`Client secret`** — **انسخهم توّا** (ما يتبانوش ثاني كي تسكّر).

### ⚠️ نقطة تقتل ناس بصمتها: شاشة الموافقة

كي تكون شاشة الموافقة (**OAuth consent screen**) في وضع **Testing**، غير
المستعملين المسجّلين في **Test users** ينجّمو يدخلو — والباقي يلقاو
«Access blocked: … has not completed the Google verification process».

- **OAuth consent screen** ← **Test users** ← **Add users** ← زيد الإيميل
  اللي بش تدخل بيه في التطبيق.

(النشر الكامل `Publish` يطلب مراجعة Google — موش لازم للـBeta.)

**الصلاحيات**: الخادم يطلب `openid email profile` وبرك (الاسم والإيميل). هاذي
صلاحيات أساسية ما تطلبش مراجعة أمنية.

---

## الجزء 2 — Render (خدمة `Ayrovi2`)

**Environment** ← زيد/بدّل الثلاثة (الثلاثة، موش واحد):

| المتغيّر | القيمة |
|---|---|
| `GOOGLE_CLIENT_ID` | الـClient ID الجديد |
| `GOOGLE_CLIENT_SECRET` | الـClient secret الجديد |
| `GOOGLE_CALLBACK_URL` | `https://ayrovi-beta1-moo8.onrender.com/api/customer/auth/google/callback` |

من بعد: **Manual Deploy → Deploy latest commit**.

### لماذا `GOOGLE_CALLBACK_URL` إلزامي حتى مع عميل جديد

الخادم يبني عنوان الرجوع هكذا:

```
GOOGLE_CALLBACK_URL  وإلا  PUBLIC_BASE_URL  وإلا  RENDER_EXTERNAL_URL
```

القياس أثبت أنّ `GOOGLE_CALLBACK_URL` **موروثة من الإنتاج** ومسجّلة صريحة في
الخدمة ⇒ ما تفوتش على `PUBLIC_BASE_URL`. يعني **لازم** تبدّلها بيدك، وإلاّ
العميل الجديد يستقبل طلباً بعنوان رجوع قديم ويرفضو فوراً (`redirect_uri_mismatch`).

---

## الجزء 3 — التحقّق (أمر واحد، جواب قاطع)

خمّنش. شغّل الفحص:

```
GitHub → Actions → Serveur — test de bout en bout (appli) → Run workflow
```

اقرا السطر في **ملخّص التشغيل** (والتعليق في الأعلى):

| اللي تشوفو | المعنى |
|---|---|
| `google_callback=ok` | ✅ Google يرجّع على نفس الخدمة — جرّب الدخول |
| `google_callback=autre-serveur:…` | ⛔ باقي مربوط بالقديم — راجع `GOOGLE_CALLBACK_URL` |
| `google_callback=absente` | ⛔ `GOOGLE_CLIENT_ID`/`SECRET` فارغين ولا غالطين |

الفحص يتشغّل **وحدو كل يوم** (5 صباحاً) ومع كل تعديل في الورشة ⇒ أي تبديل في
Render يبان وحدو بلا ما نطلبو.

---

## ملاحظة على القياس الآلي

الفحص (`Serveur — test de bout en bout (appli)`) يسأل **Google روحو** واش يقبل
عنوان الرجوع، ويقول:

| الحالة | المعنى |
|---|---|
| `google_callback=accepte-par-google` | ✅ العنوان مسجّل وGoogle يعرض شاشة الدخول |
| `google_callback=refus-google:<خطأ>` | ⛔ Google يرفض العنوان/العميل قبل الدخول |
| `google_callback=autre-serveur:…` | ⛔ الخادم لازمو يبعث عنوان الخدمة القديمة |

**حدود هذا القياس**: يوقف عند **شاشة اختيار الحساب**. أخطاء «Access blocked»
(وضع Testing) تبان **بعد** اختيار الحساب ⇒ الفحص ما ينجّمش يشوفها. لهذا
التطبيق يعرض التلميح `auth.providers.incompleteHint` كي الدخول ما يكمّلش.

## تشخيص سريع لأخطاء Google المعروفة

| الرسالة في المتصفّح | السبب | الإصلاح |
|---|---|---|
| `Error 400: redirect_uri_mismatch` | العنوان المعلن في Console موش هو المبعوث | طابق العنوان حرفياً (بلا `/` زايد) |
| `Access blocked: … not completed verification` | وضع Testing | زيد الإيميل في **Test users** |
| `Error 401: invalid_client` | الـClient ID/Secret مقلوبين ولا من مشروع آخر | انسخهم من جديد |
| الدخول ينجح في المتصفّح والتطبيق يبقى «غير مسجّل» | الجلسة ما توصلش للتطبيق | الفحص يقول `claim=…`؛ لازم يكون `400/HANDOFF_INVALID` ولا `404` |

## قاعدة الأمان المتبّعة هنا

- **لا تكتب** الـClient ID ولا الـsecret في المحادثة ولا في الريبو — Render
  Environment وبرك.
- **عميلان منفصلان** = تبديل في الـBeta ما يأثّرش على الإنتاج، والعكس بالعكس.
