# تقرير فهمي لموكاب «البطاقة الكبيرة» — بعد قراءة الصور
**التاريخ:** 17 أكتوبر 2026 (جلسة 16/10) · **الفرع:** `arena/1b1c70c4-zayrovi-beta1`
**الحالة:** تقرير فهم — لم يُغيَّر أي كود بعد (باستثناء أداة القراءة)

---

## 0) كيف «شفت» الصور (حسب طلبك)

لا أستقبل الصور كصورة في هذه الجلسة، فبنیت أداة تحوّلها إلى نص: **`scripts/see-screenshot.py`**

```
pip3 install --break-system-packages rapidocr-onnxruntime opencv-python-headless pillow
python3 scripts/see-screenshot.py capture.png --cols 110 --color
python3 scripts/see-screenshot.py capture.png --no-map        # النص فقط مع مواضعه
python3 scripts/see-screenshot.py capture.png --crop 0,12     # bande علوية فقط
```

تُخرج الأداة شيئين يكملان بعضهما:
1. **النص + موضعه** (`y%` من الأعلى، `x%` من اليسار) عبر OCR محلي (RapidOCR/PP-OCR — موديلاته داخل حزمة pip، بلا إنترنت)؛
2. **خريطة شكل** بالأحرف (الوضوح/السواد) و**خريطة ألوان** (`W` أبيض، `g/G` رمادي، `B` أسود، `V` بنفسجي، `R` أحمر، `E` أخضر، `L` أزرق) → تكشف التخطيط والبطاقات والخلفيات الرمادية.

**النتيجة:** قرأت الـ18 لقطة كلها. وهي صفحات منتجات **Zalando** (تطبيق/ويب جوّال) لأنواع مختلفة: **حذاء** (Jordan Air Jordan 1 Low SE Craft)، **ملابس** (Marks & Spencer Pullover)، **إكسسوارات** (حزام Calvin Klein، كؤوس Villeroy & Boch)، و**منتج مشابه غير ملابس** (مجفّف شعر ومُرغي حليب Severin) + لقطة **العارض ملء الشاشة**.

---

## 1) الهيكل كما يظهر فعلاً في الصور

### الحالة A — أول ما تفتح البطاقة (لقطة 183752 / 184620)
| النسبة من الشاشة | المحتوى |
|---|---|
| 0 → ~52 % | **صورة المنتج** (تأخذ العرض كاملاً)، شارات فوقها: `Dernières pièces` (يسار، y≈48 %) و `L Y / L Y` (يمين) |
| y≈52 % | سطر فوق الصورة/تحتها: **«Notre mannequin (190 cm) porte une taille XL»** |
| ~54 % | **الماركة** يسار + **السعر** يمين على نفس السطر (`Jordan` · `65,90 €`) |
| ~57 % | **السعر المشطوب**: `Prix conseillé 139,99` |
| 58 → 65 % | **العنوان** على سطور: `AIR JORDAN 1` / `LOW SE CRAFT` / `Baskets basses - kaki` + شارة `P Points` يمين |
| 71 → 80 % | **صندوق مساعدة المقاس**: «Nous vous recommandons de choisir une taille au-dessus de celle habituelle.» + رابط **«Guide des tailles»** |
| ~85 % | سطر **«Taille …»** (مُنتقي المقاس) |
| 93 → 95 % | **الشريط الثابت**: يسار `Se termine dans 1j4h22m` + يمين زر **«Ajouter au panier»** |

### الحالة B — بعد التمرير (لقطة 183822 / 184658)
- **هيدر صلب في الأعلى** (y≈4 %: شارة السلة `8` يمين)، والصورة لم يبقَ منها إلا شريط رقيق (y 0 → 13 %).
- المحتوى يبدأ من y≈13 % بنفس ترتيب الحالة A، ثم يكمل: **Couleur**، **Caractéristiques** (شبكة عمودين)، **«Voir les informations sur la fabrication»**، ثم أقسام **Matière / Taille & coupe / Entretien / Dimensions**.
- الشريط السفلي (العدّاد + الزر) **يبقى ثابتاً** في الحالتين.

### العارض ملء الشاشة (لقطة 183815)
شاشة سوداء، الصورة تملؤها، وزر **«×» أعلى اليسار** (y≈5 %، x≈5 %) — لا نص ولا عناصر أخرى.

---

## 2) محتوى البطاقة حسب نوع المنتج (من الصور حرفياً)

### أ) حذاء — Jordan
```
Dernières pièces · P Points
Jordan                     65,90 €
Prix conseillé 139,99
AIR JORDAN 1 LOW SE CRAFT — Baskets basses - kaki
[ Nous vous recommandons de choisir une taille au-dessus de celle habituelle. ]  Guide des tailles
Taille …
Couleur Kaki
Caractéristiques (عمودين: عنوان فوق + قيمة تحت)
  Occasion: loisirs        | Motif: uni
  Sport: fitness …         | Fermeture: laçage
  Forme du talon: plat     | Référence du modèle: FQ3055-300
  Bout de la chaussure: rond | Référence: JOC12P01F-N11
  Largeur de chaussure: classique
Voir les informations sur la fabrication
Matière · Taille & coupe · Entretien
```
ورقة المقاس (183826): `Sélectionnez votre taille`، عمودان `FR` و`SUR L'ÉTIQUETTE (US)`، و**«Plus que 3 disponibles»** بالأحمر عند كل مقاس.

### ب) ملابس — Marks & Spencer
```
Dernières pièces
Notre mannequin (190 cm) porte une taille XL
Marks & Spencer           18,50 €
Prix conseillé 39,00
CREWNECK - Pullover - gris                P Points
[ Vous n'êtes pas sûr·e de votre taille ? → Obtenir une recommandation ]
Taille XXL   · Disponible en taille unique
Couleur Gris  →  صف ألوان: blanc | bordeaux | gris | vert chiné
Caractéristiques: Longueur: longueur standard | Coupe: regular | Silhouette: droite |
                  Forme du col: col rond | Longueur des manches: manches longues |
                  Motif: chiné | Référence: QM422Q023-C11
Voir les informations sur la fabrication · Matière · Taille & coupe · Entretien
```

### ج) إكسسوارات — حزام Calvin Klein
```
Calvin Klein              26,90 €     Prix conseillé 59,90
BUCKLE FIXED - Ceinture - marron       P Points
Taille … (85 / 95 / 100 / 105 / 115 / 125)
Épuisé  (عند نفاد المقاس) + ألوان: marron foncé | noir
Caractéristiques: Motif: imprimé animal | Référence du modèle: LV04D7085G-YG1 |
                  Fermeture: boucle à plaque | Référence: 6CA52D0EU-O11
Voir les informations sur la fabrication · Matière · Dimensions
```
كؤوس Villeroy & Boch: نفس البنية + `Taille 200 ml` و`Disponible en taille unique`، وأقسام **Matière/Dimensions** بدل «Taille & coupe».

### د) منتج مشابه (غير ملابس) — Severin
نفس البنية + قسم **«Livraison rapide — 23 octobre-29 octobre»** و**«Retours gratuits»**، وخصائص بقيم طويلة متعددة الأسطر (`Caractéristiques: moteur BLDC, câble rotatif 360°…`، `Fonctions: …`، `Également inclus: …`).

---

## 3) خريطة الحقول: شنو عندنا مقابل شنو في الموكاب

| الحقل في موكاب Zalando | عندنا اليوم | الحكم |
|---|---|---|
| صورة + معرض + عدّاد | ✅ `images[]` | جاهز |
| شارة `Dernières pièces` | ✅ `availability:'limited'` | جاهز |
| الماركة / العنوان / اللون | ✅ | جاهز |
| السعر + السعر المشطوب (`Prix conseillé`) | ✅ `originalPrice` | جاهز |
| `P Points` | ❌ | **برنامج ولاء Zalando — لا يُكشط (لازم يتحذف من الموكاب)** |
| المقاس + حالة كل مقاس (`Plus que 3 disponibles` / `Épuisé`) | ✅ `variantOptions[].availability` | جاهز |
| عمودان FR / US في ورقة المقاس | ⚠️ | مقياس مزدوج — **غير مكشوط** (نعرض المتاح فقط) |
| **«Nous vous recommandons de choisir une taille au-dessus…»** | ❌ | **جديد — نص منشور في الصفحة، قابل للكشط** |
| **«Guide des tailles» / «Obtenir une recommandation»** | ❌ | دليل مقاسات **محلي** (أداة Zalando التفاعلية لا تُكشط) |
| **«Notre mannequin (190 cm)porte une taille XL»** | ❌ | **جديد — قابل للكشط** |
| صف الألوان بالمصغّرات (`blanc · bordeaux · gris · vert chiné`) | ✅ `colorImages` | جاهز |
| Caractéristiques (عنوان فوق + قيمة تحت، عمودين) | ⚠️ شبكة عمودين | **تعديل عرض**: صف مكدّس (العنوان فوق القيمة) |
| `Référence du modèle` / `Référence` | ✅ (تحديث 1/4 مدفوع) | جاهز |
| **«Voir les informations sur la fabrication»** | ❌ | **جديد — قابل للكشط** |
| `Matière` / `Taille & coupe` / `Entretien` / `Dimensions` | ✅ (material/fit/care) + `Dimensions` جديد | قسم Dimensions يضاف |
| **عدّاد تخفيض التاجر** `Se termine dans 1j4h22m` | ⚠️ عدّادنا = صلاحية الاقتباس | **جديد**: عدّاد العرض عند المصدر |
| `Livraison rapide — 23 oct-29 oct` | ❌ | تقدير التاجر — **قابل للكشط** (نبقيه منسوباً للمصدر) |
| `Retours gratuits` | ❌ | سياسة التاجر — قابل للكشط (اختياري) |
| زر «Ajouter au panier» ثابت | ✅ `stickyAction` | جاهز |

---

## 4) الأيقونات والرمادي — تأكيد ملاحظتك من الصور

- **فوق الصورة:** أيقونة الرجوع **غامقة مباشرة على الصورة بلا دائرة**، ومربّعان أبيضان صغيران أعلى اليمين (المفضلة/السلة). → ملاحظتك صحيحة: **الأيقونات عارية بلا دوائر ولا خلفيات**. عندنا اليوم دوائر `frost(0.94)` + ظل على زر الرجوع، وكبسولة بيضاء للسلة، ودائرة للمفضلة، وحبّة للعدّاد → **كلها تتحذف**.
- **الرمادي:** الرمادي في الصور هو **خلفية الاستوديو في صورة المنتج** (لا نتحكم فيها) لا واجهة التطبيق؛ واجهة Zalando نفسها **بيضاء بالكامل** بخطوط فاصلة شعرية فقط. → نطبّق نفس القاعدة: خلفيات بيضاء + خطوط شعرية، رمادي ≤ 2 %.

---

## 5) الخطة المحدّثة (تحديث + دفع + رجوع، بدون انتظار البناء)

| # | التحديث | المحتوى |
|---|---------|---------|
| 1 | **الهيكل + الهيدر** | صورة full-bleed (≈52 % أول الشاشة) + هيدر شفاف بأيقونات عارية (رجوع/سلة) + تحوّله إلى هيدر صلب مع **Blur تصاعدي على الصورة** عند صعود البطاقة + شريط «أضف للسلة» ثابت |
| 2 | **الأيقونات + الرمادي** | مسح على التطبيق: حذف كل دائرة/خلفية حول الأيقونات + خلفيات رمادية → بيضاء (رمادي ≤ 2 %) |
| 3 | **الخصائص/الوصف/المقاس** | صفوف مكدّسة (عنوان فوق + قيمة تحت) + صف ألوان بالمصغّرات + منطقة مقاس + **«Guide des tailles»** محلي |
| 4 | **الكشط الجديد** | نصائح المقاس · «Notre mannequin (…) porte une taille …» · معلومات التصنيع · قسم Dimensions · عدّاد تخفيض التاجر · تقدير تسليم التاجر |
| 5 | **التحميل + ملء الشاشة** | شاشة التحميل (الدائرة المتقطّعة) عند فتح البطاقة + عارض صورة ملء الشاشة (zoom، تمرير، إغلاق بـ × أو تمريرة) |

---

## 6) نقاط أحتاج قرارك فيها

1. **العدّاد في الشريط الثابت**: نبدّلو بـ«Se termine dans …» متاع التاجر (جديد في الكشط، تحديث 4) ولا نخليه عدّاد صلاحية الاقتباس متاعنا؟
2. **أقسام Matière / Taille & coupe / Entretien / Dimensions**: نعرضها كلها بنفس ترتيب Zalando (وتختلف حسب نوع المنتج)؟
3. **`Livraison rapide` / `Retours gratuits`**: نعرضها منسوبة للتاجر (لازم كشط جديد) ولا نخلي تقدير التسليم متاعنا برك؟
4. نقعد نحذفو `P Points` و«Obtenir une recommandation» كأدوات Zalando التفاعلية (ما عندهاش معطيات)؟

بعد جوابك (أو قول «وافق، ابدأ») ننفّذ التحديث 1 وندفع.
