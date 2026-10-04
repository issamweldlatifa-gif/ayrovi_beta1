# AyWebs — علة « Add to Cart » في تطبيق أندرويد: التشخيص والإصلاح

> التاريخ: 2026-10-04 · الفرع الأساس: `main` @ `350daf5` · الجهاز: Honeywell (أندرويد)
> الشكوى: لقطة شاشة تُظهر الورقة « Select your desired item » مع
> **« Le devis AYROVI est indisponible pour cet article. L'ajout reste bloqué
> jusqu'au rétablissement du prix. »** وزرّ ADD TO CART معطَّل.

---

## 1) ما هي AyWebs (فهم المنظومة قبل الإصلاح)

AyWebs هي **وسيط شراء** (proxy-shopping / shopping agent)، أي نفس فكرة **Buyee**:

```
متجر أجنبي → صفحة المنتج في متصفح داخلي → «Add to Cart» → ورقة اختيار
→ سطر في سلة AYROVI بثمن محسوب على الخادم → طلب → شراء بالنيابة + شحن
```

- الشراء لا يقع في متجر التاجر، بل في **سلة AYROVI** التي تحسب: سعر المنتج +
  الشحن + الديوان + أتعاب الخدمة، بالدينار التونسي.
- الملف الملزم للفريق: `docs/AYWEBS_ADD_TO_CART_ORDER.md` — يمنع أي تحويل
  المستخدم إلى صفحة أخرى، ويمنع عرض سعر غير محسوب على الخادم، ويفرض زرًا
  واحدًا باسم « Add to Cart ».
- القاعدة المقدّسة في المشروع: **السعر النهائي يُحسب في الخادم فقط** (§45)،
  والواجهة لا تحسب شيئًا.

المسار التقني: `AyWebsBrowseActivity.java` (متصفح أندرويد أصلي) →
`POST /api/v1/aywebs/product/resolve` → `AyWebsProductResolver` → كاشط
(`SmartLinkScraper`) → محوّل المتجر (`AmazonAdapter`) → محرّك التسعير.

---

## 2) السبب الجذري — مُثبَت بالقياس لا بالتخمين

### أ) ما قاله الخادم الحيّ

```
POST https://ayrovi-beta1.onrender.com/api/v1/aywebs/product/resolve
     { "url": "https://www.amazon.com/dp/B0GYM3V9H5" }

HTTP 201 في 21.7 ثانية
  title      : "Produit Amazon"        ← لقب احتياطي، لا شيء قُرئ
  images     : []                       ← لا صورة (الرمز الرمادي في اللقطة)
  price      : 0                        ← العلّة
  missing    : ["price","verified_price","image"]
  verificationFailureCode : "RENDER_PROVIDER_NOT_CONFIGURED"
```

في الواجهة: `quoteReady = price > 0 && estimateTnd > 0` → **false** → الرسالة
« devis indisponible » وزر الإضافة معطَّل. إذن اللقطة صحيحة: الخادم لم يقرأ
السعر، وليس العطل في الشبكة ولا في الحساب.

### ب) لماذا لم يُقرأ السعر؟ سببان مستقلّان

**1. صفحة أمازون لا تنشر سعرًا في الأماكن المتوقّعة.**
قياس على الصفحة الحقيقية (سطح المكتب 844 ك.ب · الجوال 568 ك.ب):
- لا يوجد **JSON-LD** ولا `<meta property="product:price:amount">` إطلاقًا.
- السعر مُفتَّت في ثلاث spans:

```html
<span class="a-price ... priceToPay apex-pricetopay-value">
  <span class="a-offscreen"> </span>                    <!-- فارغ! -->
  <span aria-hidden="true">
    <span class="a-price-symbol">$</span>
    <span class="a-price-whole">109<span class="a-price-decimal">.</span></span>
    <span class="a-price-fraction">00</span>
  </span>
</span>
```

المُحلِّل القديم كان يقرأ:
`.apexPriceToPay .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price ... .a-offscreen, #priceblock_dealprice`
→ فئة `.apexPriceToPay` غير موجودة في الصفحة الحالية (الصحيح `priceToPay`)،
و`.a-offscreen` **داخل** كتلة السعر فارغ، وفي واجهة الجوال لا وجود لـ
`#corePriceDisplay_desktop_feature_div` أصلاً. النتيجة: `priceSource = "none"`
و`price = 0`. (القياس: قبل الإصلاح 0 على سطح المكتب والجوال معًا.)

**2. الخادم لا يستطيع جلب الصفحة أصلاً من IP مركز بيانات.**
أمازون تُرجع لـ Render صفحة قشرة بحجم **3,781 بايت** (بعنوان `Amazon.com`) بلا
سعر ولا صور ولا متغيّرات — نفس الطلب من IP آخر يُرجع الصفحة الكاملة 1,29 م.ب.
وهذا يفسّر أيضًا زمن الانتظار 21,7 ثانية (محاولات فاشلة متتالية)، وغياب
العنوان والصور إلى جانب السعر.

---

## 3) الإصلاح المنفَّذ

### أ) قارئ أمازون مخصّص — `src/scraper/amazonPage.ts` (جديد)

يقرأ — وبهذا الترتيب — من الصفحة نفسها، دون أي تخمين:

| المصدر | ما يُقرأ |
|---|---|
| `#apex-pricetopay-accessibility-label` | « $109.00 » (سلسلة كاملة) |
| `#corePriceDisplay_desktop_feature_div .a-price` | إعادة بناء من `a-price-symbol` + `a-price-whole` + `a-price-fraction` |
| `.priceToPay` · `#apex_desktop .a-price[data-a-color=base]` · `#buybox` | منطقة الشراء |
| `#priceblock_ourprice` · `#priceblock_dealprice` · `#tp_price_block_total_price_ww` | تخطيطات قديمة/جوال |
| `"displayPrice":"$109.00"` · `"priceAmount":109.00` · `"currencyCode":"USD"` | JSON مدمج في الصفحة |
| `.a-text-price .a-offscreen` | السعر المشطوب (سعر القائمة) |

بالإضافة إلى:
- **رفض قوالب النصوص** `{priceToPay}` وأسعار التقسيط (« /month »)؛
- **العملة** من الحقل المخفي `[customerVisiblePrice][currencyCode]` أو من الرمز؛
- **التوفّر** من `#availability` (« In Stock » / « Only 3 left » / « Currently
  unavailable ») — ولا شيء غير ذلك يُخمَّن؛
- **المتغيّرات** من بيانات `twister`: `sortedDimValuesForAllDims`
  و`dimensionValuesDisplayData` و`variationDisplayLabels`، مع **حالة كل قيمة**
  (`dimensionValueState`: `AVAILABLE` / `SELECTED` / `UNAVAILABLE`) — فالقيمة
  غير المتوفرة تُعطَّل بدليل منشور، كما يفرضه عقد المشروع.

### ب) إصلاحان مرافقان
- `looksLikeSize()` في `productPageParser.ts` كان يرفض المقاسات النصّية
  (« Small », « Medium », « X-Large ») لأن قائمته تقبل الاختصارات فقط — وكانت
  تعابيره النمطية تحتوي `\\s` (شرطة مائلة مزدوجة) فلا تُطابق أبدًا. صُحّح الاثنان.
- **محاولة جلب ثانية بحزمة « متصفح سطح مكتب »** في `scraper.ts`: على نفس
  الرابط، IP قد يُمنح الصفحة الكاملة للمتصفح الجوّال ويُمنع من سطح المكتب —
  والعكس. محاولة ثانية محدودة (6 ثوانٍ) ترفع نسبة النجاح دون تغيير أي مسار.

### ج) الجسر الحاسم: الصفحة التي يراها المستخدم — لا صفحة الخادم

حتى مع الإصلاح أعلاه، يبقى الخادم ممنوعًا من جلب صفحات كثيرة. لكن **التطبيق
يملك أصلاً الصفحة الصحيحة**: المستخدم يراها في المتصفح الداخلي، ممتلئة بالسعر
والمقاسات. فصار:

```
WebView → JS يقرأ HTML الصفحة المعروضة (يُنزع منه ما لا لزوم له من <script>)
        → POST /product/resolve  { url, page: { url, html } }
        → الخادم يُعيد قراءة الصفحة بمنطقه هو (نفس المُحلِّل) → يحسب السعر
        → provenance: provider = "webview"
```

ثلاثة ضوابط تمنع أن يكون هذا ثغرة:
1. **نفس المُضيف إلزاميًا**: إن اختلف مضيف `page.url` عن مضيف المنتج المطلوب
   تُرفض الصفحة كليًا (مُختبر: صُحيفة من `evil.example.com` → تم تجاهلها
   والرجوع إلى سلسلة الخادم).
2. **حدّ حجم** 4 م.ب + وجوب أن يبدو المحتوى HTML.
3. **الخادم لا يثق بالعميل في السعر**: الواجهة ترسل *صفحة*، والخادم يستخرج
   منها بنفسه ويحسب السعر (§45 لم يُخترق)، ويُسجَّل مصدر القراءة في الدليل.

---

## 4) التحقق (مُشغَّل فعليًا في هذه البيئة)

| الاختبار | قبل | بعد |
|---|---|---|
| مُحلِّل على صفحة أمازون سطح المكتب (844 ك.ب) | price 0 · sizes 0 | **109 USD · in_stock · 5 مقاسات · 3 ألوان · 23 متغيّرًا** |
| مُحلِّل على صفحة أمازون جوال (568 ك.ب) | price 0 | **109 USD · in_stock** |
| `/product/resolve` مع صفحة العميل | — | **HTTP 201 · 0.9 ثانية · provider `webview` · READY · 580.783 TND** |
| `/product/resolve` بدون صفحة عميل (جلب خادمي) | price 0 · 21.7 ث | **READY · 109 USD · 5.3 ثانية (عبر Jina)** |
| صفحة عميل بمضيف مختلف | — | **مُتجاهلة كما يجب** |
| مجموعة اختبارات المشروع | — | **2152 اختبارًا: كلها ناجحة** (بعد تحديث اختبار عقد واحد) |
| اختبار انحدار جديد | — | `tests/amazon-product-extraction.test.ts` (6 اختبارات) + ملف محاكاة للبنية الحقيقية |

مثال الاستجابة الكاملة مع صفحة العميل:

```json
{ "status": "READY", "missing": [],
  "data": { "price": 109, "currency": "USD", "title": "Vince Camuto …",
            "variant_groups": [ {"attribute":"size","values":["X-Small","Small","Medium","Large","X-Large"]},
                                {"attribute":"color","values":["Emerald Leaf","Camel","Classic Navy"]} ],
            "ayrovi_pricing": { "total_tnd": 580.783,
              "breakdown": { "converted_source_price": 336.0, "shipping": 14.5,
                             "customs": 197.4, "service_fee": 33.6, "other": 6.5 } } } }
```

---

## 5) ما يبقى على عاتق المستخدم (خطوة واحدة)

الكود مصلَح ومختبر، لكن **التطبيق يتصل بالخادم المنشور** على
`https://ayrovi-beta1.onrender.com` — وهو ما زال يشغّل النسخة القديمة. لذلك
حتى يُثبَّت الـ APK الجديد، يجب نشر هذا الإصلاح على الخادم:

```bash
# من جهازك، بعد سحب المستودع
git checkout main && git pull
git am aywebs-amazon-price-fix.patch     # أو انسخ الملفات يدويًا (مجلد files/)
npm ci && npm run build && npm test
git push origin main                     # Render يعيد النشر تلقائيًا
```

الملفات جاهزة في `deliver/`: `aywebs-amazon-price-fix.patch` (تصحيح git كامل مع
رسالة الالتزام) و`aywebs-amazon-price-fix-files.zip` (نفس الملفات للنسخ اليدوي
عبر واجهة GitHub).

> إن ظلّ الخادم على النسخة القديمة، يظل التطبيق يرسل `page` ويهملها الخادم
> القديم بصمت — أي نفس السلوك السابق، دون أي تراجع إضافي.
