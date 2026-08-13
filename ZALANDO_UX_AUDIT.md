# ZALANDO UX/UI AUDIT → AYROVI Experience Layer

**التاريخ:** 2026-08-13 · **الحالة:** V1 — بانتظار المراجعة (V1 → Review → V2 → Approval)
**الغاية:** Zalando-level UX quality + هوية AYROVI. **لا نسخ** — استخراج مبادئ فقط.

---

## 0. المنهجية (كيف دُرِس Zalando)

| المصدر | النوع | ماذا استخرجنا منه |
|---|---|---|
| zalando.fr — الصفحة الرئيسية | **تجربة حية (13/08/2026)** | شريط الثقة، دخول بالشريحة (Femme/Homme/Enfant)، دليل الماركات، النشرة البريدية، مساعد AI |
| zalando.fr/baskets — صفحة كتالوج | **تجربة حية** | Breadcrumb، فلاتر شائعة أفقيًا + «Tous les filtres»، عدّاد النتائج (22 068 articles)، بطاقات المنتج، دمج محتوى (Outfits) داخل الشبكة |
| zalando.fr — صفحة منتج (Nike Air Force 1) | **تجربة حية** | ترتيب: صور → علامات → ماركة/اسم → سعر مرجعي −25% → مقاس → CTA واحد → وعد توصيل بتاريخ → أكورديون تفاصيل → توصيات |
| Zalando Engineering Blog — *Design System / Theming* (engineering.zalando.com) | **رسمي** | Tokens مركزية (Style Dictionary)، استعارة «Extended Atomic»: Tokens → Electrons → Molecules → Organisms (مملوكة لفرق المنتج)، Semantic tokens (Background/Text/Border) بدل الألوان الخام |
| Zalando — Product Design & UX Careers + Medium zalando-design | **رسمي** | منهج 4Ds: **Discover → Define → Design → Deliver**، قرارات مدفوعة بـ data + UX research، ZDS يخدم 50+ فريقًا / 200+ مكوّن |

> **ملاحظة:** الشاشات الرئيسية فُحصت بمنطق Mobile (360–430px) وDesktop. الأرقام والنصوص المقتبسة من الصفحات الحية بتاريخ اليوم.

---

## 1. Navigation — التنقل

### ما لاحظناه حيًا عند Zalando
- **ثلاث نقاط وصول دائمة أعلى كل صفحة:** محتوى رئيسي / بحث / مساعد — حتى الـskip-links تعامل البحث والمساعد كوجهات من الدرجة الأولى.
- المساعد الذكي (Assistant Zalando) حاضر في كل شاشة كمدخل مستقل، وليس مخفيًا داخل قائمة.
- أسفل التطبيق: الوجهات الجوهرية فقط (Accueil, Catalogue, Wishlist, Panier, Compte) — **لا شيء ثانوي في الـchrome الدائم**.
- التنقل العميق (فئات فرعية) لا يعيش في شريط دائم؛ يُفتح حسب السياق.

### المبدأ المستخرج
> التنقل الدائم = 5 وجهات قصوى. كل ما تبقى contextual. البحث بوابة أولى وليس أيقونة ثانوية.

### التطبيق في AYROVI
- نعتمد شريطًا سفليًا للموبايل: **Accueil | Recherche | AI | Panier | Compte** — والـAI (المساعد/تحليل الصور) وجهة مستقلة لأنه **ميزة AYROVI التفاضلية** (تحليل رابط / سكرينشوت).
- في Desktop: نفس الوجهات أفقيًا أعلى الصفحة مع شريط بحث موسّع.
- ممنوع وضع «Arrivage / Stories / Paramètres» في الـchrome الدائم — تُفتح من Accueil.

---

## 2. Information Architecture — هندسة المعلومات

### Zalando حيًا
- الصفحة الرئيسية = **موزّع انتباه** وليست كتالوجًا: اختيار الشريحة أولًا، ثم ماركات، ثم إلهام.
- الكتالوج يعلن حجمه فورًا («22 068 articles») → المستخدم يعرف أن الفلترة ضرورية ومتاحة.
- المحتوى التحريري (Outfits/Creators) **مدمج داخل شبكة المنتجات** كل ~5 بطاقات — الاكتشاف لا ينقطع.
- صفحة المنتج مرتّبة بترتيب قرار الشراء: صورة → ثقة (badges) → سعر → اختيار (مقاس) → **CTA** → وعد (توصيل/إرجاع) → تفاصيل ثانوية مطوية.

### المبدأ
> كل صفحة تجيب على سؤال واحد أولًا: الصفحة الرئيسية «من أين أبدأ؟»، الكتالوج «كيف أضيّق؟»، المنتج «هل أشتري؟».

### التطبيق في AYROVI
- AYROVI ليست كتالوجًا تقليديًا — هي **وسيط شراء**. الصفحة الرئيسية تجيب: «كيف أطلب أي منتج من الخارج؟» بثلاث بوابات واضحة: **رابط | صورة | AI**.
- الـArrivage (منتجات جاهزة بتونس) = استثناء واضح: قسم مستقل بتصميم مميز، لأنه يتخطى مرحلة الانتظار.
- صفحة المنتج في AYROVI ترتّب: صورة → مصدر (badge متجر) → سعر TND شامل (الرسوم محسوبة) → CTA «Calculer le prix» أو «Commander» → وعد (مدة، عربون 20%، تتبع) → تفاصيل.

---

## 3. Visual Hierarchy — التسلسل البصري

### Zalando حيًا
- عنوان واحد سمين في الشاشة، وكل شيء آخر أخف بوزن متدرّج.
- السعر أكبر نص رقمي في صفحة المنتج، والسعر المرجعي مشطوب + نسبة الخصم.
- CTA واحد primary في كل شاشة (Ajouter au panier) — بقية الأفعال ghost/secondary.
- المساحات البيضاء حول السعر والـCTA أوسع من أي مكان آخر (الفراغ نفسه عنصر hierarchy).

### المبدأ
> شاشة = CTA واحد رئيسي + عنوان واحد. الباقي أوزان بصرية متدرّجة.

### التطبيق في AYROVI
- في الـHero: جملة واحدة + CTA واحد «Commencer» (مع بديلين ثانويين صغيرين: رابط/صورة).
- في بطاقة المنتج: **سعر TND هو النجم** (لأن القيمة الحقيقية = السعر النهائي الشامل)، وسعر المتجر الأصلي ثانوي muted.
- في الـCheckout: CTA «Confirmer la commande» وحده primary؛ تعديل العنوان ghost.

---

## 4. Search — البحث

### Zalando حيًا
- شريط البحث **دائم الظهور** في الأعلى (desktop + mobile)، وليس خلف أيقونة.
- skip-link مخصّص للبحث → اعتراف رسمي بأنه المسار الأسرع للوصول.
- الكتالوج نفسه يتصرف كنتيجة بحث قابلة للفلترة فورًا.

### المبدأ
> البحث سطح دائم وليس حوارًا مخفيًا. تقليل friction حتى أول نتيجة.

### التطبيق في AYROVI
- البحث في AYROVI مختلف: input واحد ذكي يقبل **رابط منتج أو كلمة بحث** — نفس الحقل يكشف الرابط ويحوّله لتحليل مباشر (هذا تفوّق على Zalando، لأن نموذجنا وسيط).
- الرابط → شاشة تحليل فورية (skeleton → نتيجة). الكلمة → نتائج Arrivage + اقتراح «Collez un lien pour commander depuis l'étranger».

---

## 5. Product Discovery — اكتشاف المنتجات

### Zalando حيًا
- مسارات اكتشاف متوازية: فئات، ماركات (دليل أبجدي)، محتوى ملهم (Stories/Outfits)، توصيات.
- الفلاتر الشائعة تظهر **كرقائق أفقية قبل الشبكة** (Marque, Taille, Couleur, Prix…) + زر «Tous les filtres» للعمق.
- Badges على البطاقات تخلق استعجالًا صحيًا: «Meilleure vente», «Hot Drops», «Promo».

### المبدأ
> الفلترة السريعة أفقيًا قبل العمق، والمحتوى التحريري وقود الاكتشاف وليس حاجزًا.

### التطبيق في AYROVI
- الاكتشاف لدينا ثنائي: **Arrivage** (جاهز الآن) + **Commande sur demande** (رابط/صورة). واجهة الاكتشاف تعرض الاثنين بوضوح ولا تخلطهما.
- رقائق فلاتر Arrivage أفقية (Catégorie, Prix, Taille، Disponible).
- Badges خاصة بنا، لا نسخ: `EN STOCK TUNIS`، `NOUVEL ARRIVAGE`، `SUR COMMANDE` (للمنتجات قابلة الطلب).

---

## 6. Cards — البطاقات

### Zalando حيًا
- صورة Packshot موحّدة الخلفية (نسبة ~3:4)، قلب wishlist أعلى اليمين، badges صغيرة أسفل الصورة/فوقها.
- تحت الصورة: ماركة → اسم → سعر (−نسبة إن وُجد). **لا أزرار داخل البطاقة** — البطاقة كلها رابط.
- بطاقات المحتوى (Outfit) تختلف شكليًا عن بطاقات المنتج حتى لا تُلبِس.

### المبدأ
> البطاقة = صورة + 3 أسطر كحد أقصى. الفعل داخل البطاقة = النقر عليها، لا زر داخلي إلا لاستثناء مبرَّر.

### التطبيق في AYROVI (استثناء مبرَّر)
- نموذجنا يحتاج فعلًا سريعًا: بطاقة Arrivage تحمل CTA صغير (أيقونة سلة/حاسبة) **بالإضافة** للنقر على البطاقة — لأن شراءنا أسرع (لا مقاسات معقّدة).
- ترتيب البطاقة: صورة (نسبة 4:5) → badge مصدر/حالة → اسم → **سعر TND شامل** → «PRIX FINAL · tout inclus» سطر ثقة واحد.

---

## 7. CTA — الإجراء الرئيسي

### Zalando حيًا
- CTA primary أسود ممتلئ، ارتفاع ~48px، نص فعلي صريح («Ajouter au panier»).
- أسفله مباشرة وعد التوصيل بتاريخ محدد — الـCTA والوعد جاران دائمًا.
- الأفعال الثانوية (wishlist، مشاركة، متابعة ماركة) أيقونات/ghost.

### المبدأ
> الـCTA لا يسافر وحده: بجانبه دائمًا سبب للثقة (تاريخ توصيل، إرجاع، دفع).

### التطبيق في AYROVI
- CTA دائمًا برفقة وعد: بجانب «Commander» نلصق `Acompte 20% · Suivi en temps réel` وبجانب «Payer l'acompte» نلصق مدة الوصول التقديرية.
- في الموبايل: CTA رئيسي **sticky أسفل الشاشة** عند صفحات القرار (منتج، سلة).

---

## 8. Mobile UX

### Zalando حيًا
- نفس المحتوى، ترتيب مختلف: navigation العلوية تنكمش إلى [logo + أيقونات]، البحث يبقى بارزًا بعرض كامل، البطاقات عمودان، الفلاتر تتحول لـbottom sheet.
- اللمس: أهداف ≥44px، السحب الأفقي للأشرطة (sizes, filters) بدل القوائم.

### المبدأ
> Mobile-first ليس تصغيرًا: هو **إعادة ترتيب أولويات** (بحث بارز، chrome سفلي، sheets بدل sidebars).

### التطبيق في AYROVI
- المرجع: 360–430px أولًا. كل prototype يُبنى mobile ثم يُوسّع (768px → 1024px).
- الفلاتر والقائمة والسلة في الموبايل = **Bottom Sheet** بمقبض سحب، وليست صفحات جديدة.

---

## 9. Spacing — المساحات

### Zalando (رسمي + مرصود)
- النظام مبني على tokens مسافات موحّدة عبر المنصات (Style Dictionary يولّد نفس القيم للويب/iOS/Android).
- المرصود حيًا: إيقاع 8px واضح؛ حواف الشاشة ~16px موبايل، الفواصل بين الأقسام أسخى (48px+).

### المبدأ
> سلّم واحد قائم على 4، لا قيم عشوائية. الفراغ هو ما يصنع «الفخامة» وليس الزخارف.

### التطبيق في AYROVI
- Scale: **4 · 8 · 12 · 16 · 24 · 32 · 48 · 64** فقط.
- حواف الشاشة: 16px موبايل / 24px تابلت / 32px desktop (max-width 1200px).
- فواصل الأقسام: 48px موبايل / 72px desktop.

---

## 10. Typography — الخطوط

### Zalando (رسمي + مرصود)
- Token-based type scale؛ عناوين sans سمينة قصيرة، نصوص منتجات بأحجام صغيرة مضبوطة الإيقاع.
- Hierarchy بالوزن أكثر من الحجم: Marca (bold) → product name (regular) → price (bold).

### المبدأ
> عائلتان كحد أقصى؛ التدرّج بالوزن واللون قبل الحجم.

### التطبيق في AYROVI
- **Plus Jakarta Sans** (المعتمدة حاليًا في AYROVI) — Display/H1-H3 بأوزان 800/700، Body بأحجام 15–16px، Caption 12px للـbadges.
- Scale ثابت في Tokens (موثّق في ملف الـDesign System، قسم Typography).

---

## 11. States — الحالات

### Zalando حيًا
- **Loading:** شبكات skeleton على شكل البطاقات الحقيقية (لا spinners للصفحات).
- **Empty:** wishlist الفارغة تحوّل لفرصة اكتشاف (CTA + اقتراحات)، لا رسالة نهاية.
- **Error:** رسائل حقلية بجانب السبب + حفظ المدخلات.
- **Success/Disabled:** تأكيدات على مستوى الزر نفسه (تغيير حالة «Ajouté ✓»)؛ الأزرار المعطّلة رمادية مع سبب واضح.

### المبدأ
> كل حالة تُبقِي المستخدم في المسار وتقترح الخطوة التالية. الـskeleton يحاكي الشكل النهائي.

### التطبيق في AYROVI
- تحليل الرابط/الصورة = **skeleton بطاقة المنتج** (الصورة، السطر، السعر) وليس دائرة انتظار — مع شريط مسح lens خاص بنا.
- سلة فارغة → اقتراحات: «Collez un lien» + آخر Arrivage.
- فشل تحليل رابط → error بجانب الحقل + بديل (جرّب صورة / AI).

---

## 12. Interaction — التفاعلات

### Zalando (مرصود + رسمي)
- **Buttons:** primary ممتلئ / secondary مفرّغ / tertiary نصي؛ حالات واضحة hover/pressed/focus-visible.
- **Cards:** hover خفيف (ظل/تكبير صورة 2–3%)، دون حركة مبالغة.
- **Filters:** رقائق toggle + sheet كامل؛ «nombre de résultats» يتحدّث فورًا مع كل فلتر.
- **Sheets/Modals:** bottom-sheet في الموبايل بمقبض، modal صغير مركّز في desktop، إغلاق بالخارج/Escape.

### المبدأ
> ردود فعل فورية (<150ms للّمس)، حركة واحدة في كل شاشة، وكل sheet قابل للإغلاق بثلاث طرق (زر، خارج، سحب).

### التطبيق في AYROVI
- نظام Motion موحّد: 150ms micro / 250ms UI / 400ms sheets — منحنى واحد `cubic-bezier(.22,.61,.36,1)` + احترام `prefers-reduced-motion`.
- عدّاد نتائج Arrivage يتحدث فوريًا مع الفلاتر (قاعدة نأخذها للنسخة React لاحقًا).

---

## 13. مبادئ Zalando الرسمية → قرارات AYROVI البنيوية

| مبدأ Zalando (رسمي) | قرار AYROVI |
|---|---|
| Tokens مركزية = مصدر حقيقة واحد، تتحوّل لكل منصة | `ayrovi-design-system.html` يعرّف **CSS Custom Properties المرجعية**؛ عند الدمج تُنسخ إلى `index.css` بدون تغيير قيم |
| Extended Atomic: Tokens → عناصر أساسية → مكوّنات → تجارب أعمال (Organisms مملوكة للفرق) | في AYROVI: Tokens → Atoms (زر/حقل/Badge) → Molecules (بطاقة منتج/شريط بحث) → Organisms (Hero، Arrivage rail، Checkout sheet) |
| Semantic tokens (Background/Text/Border) بدل hex منتشر | كل المكوّنات تستهلك `--ay-bg` `--ay-text` `--ay-primary`…؛ لا hex داخل مكوّن |
| Theming عبر دمج base + theme | يتوافق مع محرّك الثيم الحي الحالي في لوحة الإدارة (site_theme JSON) — نفس أسماء المتغيرات |
| 200+ مكوّن / 50+ فريق: الاتساق قبل الكم | نبني فقط ما تحتاجه صفحات Roadmap الـ12 (القسم 16 في المهمة) — لا مكوّنات زائدة |
| 4Ds: Discover → Define → Design → Deliver | نطبّقها هنا حرفيًا: هذا الـAudit=Discover/Define، الـDesign System=Design، الدمج React=Deliver (بعد الاعتماد فقط) |

---

## 14. الخلاصة التنفيذية — 10 مبادئ مُعتمدة لـAYROVI

1. **Chrome دائم بخمس وجهات**: Accueil | Recherche | AI | Panier | Compte.
2. **شاشة = CTA واحد + وعد ملاصق له** (أكومpte 20%، مدة، تتبع).
3. **سعر TND الشامل هو النجم** في كل بطاقة وصفحة.
4. **بحث يقبل الرابط والكلمة** — تفوّق بنيوي على نموذج Zalando، نستثمر فيه.
5. **Arrivage وSUR COMMANDE عالمان منفصلان بصريًا** — لا خلط.
6. **Mobile-first 360→430px**: sheets بدل sidebars، أهداف لمس ≥44px.
7. **لا over-card**: إيقاع بصري بالفراغ، الأقسام full-width، فواصل بدل علب متكدّسة.
8. **Skeleton يحاكي الشكل النهائي** في كل انتظار (تحليل، كتالوج، طلب).
9. **كل حالة تبقيه في المسار** (empty/error → خطوة تالية مقترحة).
10. **Tokens أولًا**: لا لون/مسافة/خط خارج النظام — نقطة الانطلاق لأي صفحة لاحقة.

---

## 15. خارطة الاعتماد (كما طلبت المهمة)

```
ZALANDO_UX_AUDIT.md   ← هذا الملف (Discover/Define)
ayrovi-design-system.html  ← المختبر البصري V1   ⟵ نتوقّف هنا للمراجعة
ayrovi-home-v1.html        ← Prototype الرئيسية V1 ⟵ يراجع معه
        ↓ Review → V2 → Approval
Login → Accueil → Recherche → Arrivage → Stories → Product →
Calculator → Cart → Checkout → Orders → Profile
(كل صفحة: Page → Section → Component → Feature → State → Responsive → Review → Approval)
```

**ما لم يُمَس:** Authentication، Google Login، الأمان، Backend، Database، API، Admin، منطق الأعمال، الصفحات الإنتاجية — صفر تعديل. المخرجات طبقة Experience مستقلة تمامًا.

---

### مراجع الدراسة
- التجربة الحية: zalando.fr (Accueil، /baskets، صفحة منتج Nike AF1) — 13/08/2026.
- Zalando Engineering Blog: «An Introduction to the Zalando Design System» (2022)، «Theming the Zalando Design System» (2024) — https://engineering.zalando.com
- Zalando Design على Medium: «Bringing more character to the ZDS with theming» (2024) — semantic tokens، إطار Background/Text/Border.
- Zalando Jobs — Product Design & UX: منهج 4Ds وdata-driven design.
