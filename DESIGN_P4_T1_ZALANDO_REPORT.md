# P4 / T1 — إستراتيجية Zalando: واجهة أحادية اللون، والبرتقالي مُحفّزُ تنفيذ لا لونُ جدران

**التاريخ:** 2026-09-14 · **النطاق:** الواجهة العامة (storefront) + واجهة AYROVIX LENS + القيم الافتراضية المُدارة من لوحة التحكم.
**القاعدة الحاكمة:** المنصة محايدة بالأبيض والأسود؛ البرتقالي `#FF6900` ممنوع كخلفية أو تدرّج أو بطاقة ممتلئة، ومسموح كـ CTA رئيسي وحيد + خطوة نشطة + خط رفيع 3px. الميزانية: **≤ 3%** من مساحة أي شاشة.

---

## 1. القياس قبل التنفيذ (الرقم هو الحجة، لا الانطباع)

قِيست التغطية البرتقالية **بعدّ البكسلات** على لقطات حقيقية (لا بتقدير): `node verify/zalando-audit.mjs`.

| الشاشة | قبل | بعد | الميزانية |
|---|---:|---:|---:|
| الصفحة الرئيسية (جوال — كامل الصفحة) | **9.201 %** | **1.122 %** | 3 % |
| الصفحة الرئيسية (سطح المكتب — كامل الصفحة) | **9.278 %** | **1.131 %** | 3 % |
| قسم LENS v2 (جوال) | **13.294 %** | **1.184 %** | 3 % |
| قسم LENS v2 (سطح المكتب) | **14.197 %** | **1.112 %** | 3 % |
| بطاقة «Découvrez AYROVI» (جوال) | **91.936 %** | **0.823 %** | 3 % |
| بطاقة «Découvrez AYROVI» (سطح المكتب) | **95.893 %** | **0.212 %** | 3 % |
| شاشة LENS المفتوحة (`.lens-home` + `.lens-drop`) — جوال | — | **0.618 %** | 3 % |
| شاشة LENS المفتوحة — سطح المكتب | — | **0.959 %** | 3 % |

البطاقة التعريفية كانت **برتقالية بالكامل حرفياً** (≈ 92–96 %)، وقسم LENS كان يحمل لافِه خوخي + قطعة قطرية برتقالية (≈ 13–14 %).

---

## 2. متغيرات نظام التصميم (Global Design Tokens)

ملف واحد يحمل القيم: `client/src/design/tokens.css`.

```css
:root {
  --ayrovi-bg-main: #ffffff;              /* Canvas 95 % */
  --ayrovi-bg-surface: #f8f9fa;           /* بطاقات وقوائم ومقارنات */
  --ayrovi-border-soft: #eaeaea;          /* filets 1px */
  --ayrovi-text-primary: #111111;         /* الأسود الفاخر */
  --ayrovi-text-secondary: #666666;       /* الرمادي الموزون */
  --ayrovi-color-brand-orange: #ff6900;   /* البرتقالي الصافي — CTA فقط */
}
```

وتم إخضاع كل الأسماء القديمة له كـ **alias** (لا قيمة ثانية في أي مكان):
`--ayrovi-cta` · `--ayrovi-orange` · `--ayrovi-accent` → `var(--ayrovi-color-brand-orange)`،
و`--ayrovi-accent-soft` (كان `#ffb070` خوخي) → `var(--ayrovi-bg-surface)`.

البرتقالي القديم `#fe7003` / `#ff7a00` **لم يبقَ له أي أثر** في `client/src` ولا في `src/`.

---

## 3. التطبيق مكوّناً بمكوّن (Component-Driven)

### 🛑 محددات الحظر والتطهير — `client/src/styles/zalando-ui.css` (جديد)
ورقة أنماط واحدة تضم عناصر النظام القابلة لإعادة الاستخدام، **بلا أي قيمة لونية حرفية**:

| العنصر | الوظيفة |
|---|---|
| `.ay-surface-card` | بطاقة رمادية فاتحة + `border-inline-start: 3px solid` برتقالي (بديل البطاقات البرتقالية الممتلئة) |
| `.ay-surface-plain` | سطح رمادي بسيط بحدّ نحيف |
| `.ay-badge` / `.ay-badge--muted` | شارة: أبيض/رمادي فاتح + نص أسود (بديل الشارات البرتقالية) |
| `.ay-icon-action` | دائرة شفافة + حدّ 1px + أيقونة سوداء (قاعدة «أسعار المتاجر») |
| `.ay-cta-primary` / `.ay-btn-cta` | الزر البرتقالي الممتلئ الوحيد في الشاشة |
| `.ay-accent-rule` | الخط العمودي/الأفقي النحيف (3px) |
| `.ay-step` (+ `.is-active/.is-done`) | معيار مؤشّر الخطوات: النشط برتقالي، القادم رمادي |

### 🔘 الأزرار والتفاعل
* **الزر الرئيسي الفريد** (`Ouvrir LENS`، `Choisir cette offre`، `Envoyer`، `Appliquer`، CTA الشرائح، زر الخروج الصوتي): برتقالي ممتلئ `#FF6900` بنص أبيض `font-weight: 700`.
* **قاعدة «زرّان = يُخفَّض الثاني»:** كل زر ثانٍ على الشاشة نفسها تحوّل تلقائياً إلى ثانوي — طُبّقت حرفياً على `lens2__banner-cta` (أصبح أبيض بحدّ نحيف) وعلى زر «Mode vocal» في المُركِّب.
* **أسهم أسعار المتاجر:** `.lens2__merchant-go` وكل نظيراتها → خلفية شفافة، حدّ `--ayrovi-border-soft`، سهم أسود. لا بقع برتقالية في قائمة المقارنة.

### 🗂️ الحاويات والبطاقات
* `TransitionCard` («Découvrez AYROVI»): **أُلغي الأورانج الممتلئ بالكامل** → `ay-surface-card` (رمادي `#F8F9FA`، عنوان `#111111`، خطّ رأسي 3px برتقالي على الحافة الابتدائية).
* `lens2__banner`: كان تدرّجاً برتقالياً → أصبح بطاقة سطح + `border-inline-start: 3px solid #FF6900`.
* قسم LENS v2: الخلفية الخوخية `linear-gradient(160deg,#fdf6f0,#fbeadd,#fbe3d2)` → أبيض صافٍ، والقطعة القطرية البرتقالية `.lens2__diagonal` → `display:none`.

### 🏷️ الشارات ومؤشرات التتبع
* شارات «Prix repéré» و«OFFRE DU MOMENT» و«Meilleure correspondance» وشارات الحالة/المخزون/العملة → أبيض أو رمادي فاتح بحدّ نحيف ونص أسود.
* **مؤشّر الخطوات (Step Tracker) ثُبَّت كمعيار:** الدائرة والخط للخطوة النشطة برتقاليان، والقادمة رمادية باهتة (`--ayrovi-border-soft`). طُبّق على `.lens-step*`، `.ay-journey-progress`، و`.lens2__step` (الخطوة 1 نشطة).

### شاشة تفاصيل المنتج ومقارنة الأسعار (`LensResults`)
* كتلة «Prix final estimé»: من `bg-accent/10` + حدّ برتقالي → `bg-surface` + `border-line`.
* نجوم التقييم: من `text-accent-deep` → `text-ink`.
* أزرار «Choisir» الثانوية بجانب كل سعر: ثانوية محايدة.
* الزر البرتقالي الوحيد في الشاشة: **«Choisir cette offre»**.

### واجهة LENS (`LiveCamera`, `LensNavigation`, `.lens-*`, `.lens2__phone*`)
* إطارات الكشف عن المنتجات، الشعاع، النقاط، زوايا الرؤية، والعجلة الدوّارة: من البرتقالي إلى الأبيض/الأسود — **مظهر Google Lens / Apple** لا لوحة إعلانية.
* `lens2__phone` (الموكاب): شاشة بيضاء، رقائق مختارة بحبر أسود، وأسهم المتاجر دوائر شفافة.

### مناطق إضافية طُهِّرت
`DiscoveryHub` (تبويبات + شارات + خطوط جانبية)، `CustomerAccountPage`، `CheckoutModal`، `CartDrawer`، `OrderSuccessModal`، `ProductResult`، `ProductCandidates`، `AboutSection`، `PartnerBrandsSlider`، `MenuDrawer`، `Footer`، `HeroSlider`، `ContentCard`، `AssistantMessages`، `AssistantVoiceOrb`، `AssistantVoiceModeScreen`، `AssistantComposer`، `social/*`، `EvergreenHero`، `TrustBar`، `BottomNavBar`، `App.tsx`.

---

## 4. جانب الخادم وقاعدة البيانات

* `src/db/database.ts`: القيم الافتراضية المزروعة (`accent`, `icons.activeColor`, `lens_hero_settings.accent_color`, `trust_bar_settings.accent_color`, `hero_content_settings.accent_color`, `site_theme`) → `#FF6900`.
* **ترحيل بيانات لمرة واحدة** `rebrand_zalando_orange_v1`: يعيد طلاء القيم المخزّنة سلفاً (`#fe7003`, `#ff7a00`) في `interface_config`, `site_theme`, `lens_hero_settings`, `trust_bar_settings` — دون لمس أي تعديل يدوي بلون مختلف.
* `src/admin/routes.ts` و`src/public/routes.ts`: القيم الافتراضية المُعادة → `#FF6900`.
* `src/services/invoice.ts`: حدّ الفاتورة السفلي → `#FF6900`.
* لوحة التحكم (`InterfaceStudio`, `AdminApp`, `HeroVisualsPage`, `LensSectionPage`, `TrustBarPage`): القيم الافتراضية للمعرّض → `#FF6900`.

> ملاحظة: طبقة الـ back-office (`--admin-*`) لها ميثاق لوني خاص بها ولم تُغيَّر قيمها؛ التغيير طال البرتقالي المشترك مع الواجهة فقط.

---

## 5. الأقفال (Tests) — منع الانحدار

**`tests/design-zalando.test.ts` (جديد، 20 اختباراً):**
1. المتغيرات الستة موجودة بقيمها الحرفية المطلوبة.
2. **حامل واحد فقط** للبرتقالي: `--ayrovi-color-brand-orange`؛ والبقية aliases تَحِلّ إليه.
3. صفر لترالي برتقالي قديم في أي `.css` / `.tsx` / `.ts` داخل `client/src`.
4. صفر لترالي قديم في `src/admin/routes.ts`، `src/public/routes.ts`، `src/services/invoice.ts`، و`src/db/database.ts` خارج جسمي الترحيل (لهما الحق في ذكر القيم التي يعيدان طلاءها).
5. قسم LENS: خلفية بيضاء بلا تدرّج، القطرية `display:none`، البانر سطح بحدّ 3px، وأسعار المتاجر شفافة.
6. بطاقة «Découvrez AYROVI» تحمل `ay-surface-card` ولا تحمل `bg-[#FF7A00]`.
7. عناصر `zalando-ui.css` معرَّفة ومستورَدة من `index.css` وخالية من أي لون حرفي.
8. **قائمة سماح مغلقة** لكل `bg-accent`/`bg-cta` المتبقية (كلها حالات نشطة أو CTA رئيسي) + سقف عددي على عدد الاستخدامات.

**اختبارات حُدِّثت لتقفل القيمة الجديدة:** `tests/design-tokens.test.ts` (الآن يتحقق أن `--ayrovi-cta` يحلّ إلى `#ff6900`)، `tests/interface-config.test.ts`، `tests/ayrovi.test.ts`، `tests/home-content-cms.test.ts`، `scripts/design-token-sweep.cjs`.

**الحصيلة:** `npm run typecheck` ✓ · `npx vitest run` → **678/678 ناجح** · `npm run build` ✓.

---

## 6. كيف تتحقق بنفسك

```bash
npm ci
npm run build          # أو npm run dev
npm run dev &          # الخادم على :3000
npm run audit:design   # يعدّ البكسلات البرتقالية ويخرج برمز 1 إن تجاوز 3%
npx vitest run tests/design-zalando.test.ts
```

الأدلة المصوّرة محفوظة في `verify/`:
`zalando-before-*.png` (قبل) مقابل `zalando-*.png` (بعد)، لكلٍّ من الصفحة الرئيسية وقسم LENS وبطاقة «Découvrez AYROVI» وشاشة LENS المفتوحة، بقياسَي الجوال وسطح المكتب.

---

## 7. الملفات

`62 ملفاً` · `+910 / −223`. أبرزها:

| الملف | الأثر |
|---|---|
| `client/src/design/tokens.css` | المتغيرات الستة + توحيد مصدر البرتقالي |
| `client/src/styles/zalando-ui.css` *(جديد)* | عناصر النظام القابلة لإعادة الاستخدام |
| `client/src/index.css` | تطهير LENS (`.lens-scan`, `.lens-phone*`, `.lens2*`, `.lens-home*`, `.lens-frame*`) |
| `client/src/styles/interface-runtime.css` | halo الـhero محايد، `.ay-btn-cta` على الجِذر الرسمي |
| `client/src/components/TransitionCard.tsx` | من بطاقة برتقالية إلى `ay-surface-card` |
| `client/src/components/LensHero.tsx` | خطوة نشطة واحدة + بانر سطحي |
| `client/src/ayrovix/components/LensResults.tsx` | شاشة مقارنة الأسعار: شارات وكتل أسعار محايدة |
| `client/src/ayrovix/components/LiveCamera.tsx` | مِقياس (viewfinder) محايد |
| `client/src/App.tsx` | الحقن البرمجي للبرتقالي أصبح يكتب الجِذر الرسمي |
| `src/db/database.ts` | القيم الافتراضية + ترحيل `rebrand_zalando_orange_v1` |
| `tests/design-zalando.test.ts` *(جديد)* | 20 قفلاً تمنع عودة الماضي |
| `verify/zalando-audit.mjs` *(جديد)* | قياس التغطية البرتقالية بالبكسل |
