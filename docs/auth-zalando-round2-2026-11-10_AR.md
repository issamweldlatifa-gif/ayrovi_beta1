# جولة تسجيل الدخول الثانية — التفرّع والاسترجاع، كلّه أبيض وأسود (10 نوفمبر 2026)

الطلب بالصور السبع الجديدة: مسار يفرّع حسب معرفة البريد، استرجاع كلمة المرور على ثلاث لقطات، كلّ الأزرار والحقول أبيض/أسود بلا أزرق زائد، وحذف الأسطر والأزرار اللي ظهرت في لقطة « حاجات تنحّي »، وإخفاء Plus Light عن الزائر.

---

## 1) التفرّع حسب البريد (المرجعان 122706 و122726)

- **endpoint جديد على الخادم** `POST /api/customer/auth/email/lookup`: يرجع `{ registered }` فقط — لا شيء آخر من الحساب. سقف 60 طلب/15 دقيقة لكل IP، و`EMAIL_INVALID` للعنوان الرديء. (قرار معلن: شاشة الدخول تكشف وجود الحساب كزيندو، أما شاشة الاسترجاع فتبقى غير كاشفة كما كانت).
- **بريد معروف ⇒ كلمة المرور**: العنوان يظهر مقروء-فقط في الصندوق المسنن مع « Modifier » تحت المسطرة (يرجع للتعبير)، حقل « Mot de passe » بتسمية فوق الصندوق و« Révéler/Masquer » داخل الصندوق zone 44، زر **« Se connecter » أسود**، زر outline « Recevoir un code par e-mail »، ورابط « Mot de passe oublié ? » مسطّر يفتح الاسترجاع ومعه البريد.
- **بريد مجهول ⇒ التسجيل**: « S'inscrire » مع كلمة المرور (Révéler + إشارة 8 أحرف) و« Prénom » و« Nom de famille »، فقرة الشروط، وزر أسود. الخادم يستقبل displayName = « Prénom Nom » و`marketingOptIn: false` (الحساب المفوّض بالتسويق يبقى متاحًا من صفحة الحساب كما كان).
- حساب بلا كلمة مرور (مُنشأ بالرمز سابقًا)؟ « Recevoir un code par e-mail » يفتح الطريق فورًا — نفس زرّ المرجع.

## 2) الاسترجاع على نمط Zalando (123050، 123056، 123028)

- **خطوة الطلب** (`/forgot` مُعاد بناؤه): العلامة فوق العنوان « Réinitialiser le mot de passe »، سطر الوعد، الحقل المسنن (معبّأ مسبقًا كي يأتي من Modifier)، زر أسود « Recevoir le lien »، و« Revenir à la connexion » مسطّر.
- **خطوة التأكيد**: إطار رمادي مع علامة ✓ سوداء « Si un compte existe avec cette adresse ({email}), les instructions viennent d'être envoyées » — نصّنا الأمانة القديم (202 ≠ وُصل) داخل شكل المرجع، ثم النصائح المرقّمة 1/2/3 (Spam، العنوان، 15 دقيقة)، إعادة الإرسال بعد العدّاد، والعودة للدخول.

## 3) خطوة الرمز الجديدة (123028)

- **ستّ صناديق** للرمز (`auth-code-box-0..5`): إدخال رقمًا رقمًا، قفز تلقائي للصندوق الموالي، Backspace يرجع للسابق، والترتيب يبقى يسار→يمين حتى بالعربية.
- « Continuer » أسود (مفعّل عند اكتمال 6 أرقام)، سطر « Vous n'avez pas reçu de code ? » مع **« Renvoyer un nouveau code (60) »** بعدّاد نازل، و« Se connecter avec un autre compte » مسطّر يلغي الطلب ويرجع للبداية.
- خطوة الرمز تطغى على أي وضع — الرمز هو الدليل، الطلب يصل من « Recevoir un code » أو من الحساب المذكور.

## 4) أبيض وأسود — الأزرق الزائد انحذف

- **لا violet في شاشات الدخول ولا الاسترجاع**: كل `tone="main"` صار `solid` (بوز هذه `main` صفر في الملفين)، الروابط كلها حبر مسطّر (لا accentText)، الحقول: حدود حبر، تركيز حبر، مؤشّر واختيار حبر (`AuthField` مكوّن جديد بلا أي superposition)، والرمز التطويري بالحبر بدل الأزرق.
- زر « Continuer avec ce compte » (الحساب المذكور) ولّى **حبرًا ممتلئًا** بدل البنفسجي.
- أحمر `danger` باقٍ للأخطاء فقط (دلالة، مش زخرفة) — والاختبار `brand-colors` تُحدّث: sign-in وforgot خرجا من خريطة `tone="main"`.

## 5) المحذوفات (لقطة 122532) — ما تظهرش

من صفحة البداية أُزيلت: « Pas encore activé sur le serveur. »، « Le même compte que sur le site… »، « Continuer avec un numéro de téléphone » (وضع الهاتف كله خرج من الواجهة؛ الخادم يبقى يدعمه لعميلاته الآخرين)، « Continuer avec un mot de passe » (استُبدل بالتفرّع الآلي)، « Session rangée dans le trousseau… »، و« OU » وسطر « Recevoir les offres » (checkbox marketing) وسطر العنوان القديم. صفحة البداية: علامة، عنوان، صندوق البريد، Continuer أسود، فقرة الشروط، ثلاثة مزوّدين. نقية.

## 6) Plus Light للزائر

- في `AppHeader`: **Plus Light يظهر للمسجَّل فقط** — الزائر يرى « Bienvenue, se connecter ? » وحدها (لقطة 122549). المستخدم الموثّق يجدها كما هي (disabled، إطار 1، منطقة 44).

## 7) البوابات

- mobile vitest **121/1196** ✅ · mobile jest **56/352** (زاد اختبارين) ✅ · tsc mobile + جذر + client ✅ · tokens:check ✅
- الخادم: `customer-email-code` 17 (منها 3 جديدة للـ lookup) + `customer-password-recovery` 10 ✅
- الوثيقة: `docs/auth-zalando-round2-2026-11-10_AR.md` · ملفات جديدة: `src/features/auth/AuthField.tsx` (mobile)، lookup في `src/api/account.ts`، endpoint في `src/customer/routes.ts`.
