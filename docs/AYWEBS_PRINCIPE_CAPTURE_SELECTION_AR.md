# AYWEBs — مبدأ الالتقاط: «الحريف يختار ← AYWEBs يلتقط ← ZAYROVI تسعّر ← الحريف يؤكد»

_19/11/2026 — قرار معتمد («موافق علي دفعات الكل نفذهم كل دون توقف»)._

## 1. المبدأ

1. **الحريف يختار** في صفحة التاجر: المقاس، اللون، النسخة، الكمية — وبعد ينزل على AYWEBs.
2. **AYWEBs يلتقط** اللي اختارو برك: الاسم، التصويرة، السوم الأصلي، العملة، المقاس واللون المختارين، والكمية كي تبان.
3. **ZAYROVI تسعّر**: السوم النهائي يتحسب في السرفر (`calculatePrice`) — عمرو ما يتحسب في التليفون.
4. **الحريف يؤكد**: الورقة تولّي ورقة تأكيد. التبديل يصير في صفحة التاجر، موش في ZAYROVI.

## 2. شنوّة ما عادش نعملوه

- ما عادش نستخرجو **كل** المقاسات و**كل** الألوان.
- ما عادش نبنيو مصفوفة التركيبات (`variantMatrix`، SKUs متاع AliExpress) ولا ستوك التاجر لكل تركيبة.
- ما عادش نقراو سوم/ستوك الاختيارات اللي الحريف ما اختارهاش (الغلاف يمسحهم من المخرج).

## 3. قواعد مغلقة (السرفر يحكم، موش التليفون)

| القاعدة | التفصيل | الرفض |
|---|---|---|
| **القيمة المختارة الحقيقية** | نقراو حالة الكنترول (ASIN، `sku_id`، `goods_id`، المقاس المختار) موش النص الظاهر برك | — |
| **قراءتين متطابقتين** | الغلاف يحفظ توقيع القراءة (سوم + اختيار + معرّف) 8 ثواني؛ التطبيق يعاود يقرا بعد ~400ms | `SELECTION_NOT_PROVEN` |
| **السوم مربوط بالاختيار** | معرّف الاختيار يدخل في بصمة الالتقاط وفي بصمة الدليل (توكن الديفي) | — |
| **اختيار ناقص** | مجموعة فيها ≥2 قيم وما فيها حتى قيمة مختارة ⇒ «اختار المقاس في الصفحة». **عمرنا ما نختارو قيمة افتراضية** | `SELECTION_INCOMPLETE` → `VARIANT_REQUIRED` (422) |
| **التوفّر بثلاث حالات** | نفاد صريح ولا زرّ شراء معطّل ولا قيمة معلّمة غير متوفّرة ⇒ رفض؛ «En stock» صريح ⇒ `AVAILABLE`؛ غير هكا ⇒ `UNKNOWN` = **«غير مؤكّد»**، عمرو ما يتقال «متوفّر» | `SELECTION_UNAVAILABLE` → `VARIANT_UNAVAILABLE` (409) |
| **Amazon** | الـASIN المختار لازم يكون ASIN الصفحة المفتوحة | `SELECTION_NOT_PROVEN` |
| **اختيار من التطبيق يعاكس الصفحة** | الصفحة هي المرجع: «بدّل الاختيار في صفحة التاجر» | `VARIANT_UNKNOWN` (409) |

## 4. كيفاش يتشعل (بلا نشر جديد)

- **افتراضياً**: `AYWEBS_SELECTION_CAPTURE=shein,temu,aliexpress`. أما Amazon وZalando يرجعوا افتراضياً لمسار المتغيرات (`matrix`) والتسعير والتحقق لكل مقاس. `all` أو `off` أو قائمة متاجر تبقى خيارات صريحة، و`core` يستعمل `matrix` في القارئ والخادم معاً.
- **من الـCRM** (لوحة «Capture des boutiques» ← «Principe de capture»): `selection` ولا `matrix` لكل متجر. سطر الـCRM ديما يغلب.
- **الطريق القديم (`matrix`) يبقى رجوع للخلف**. القياس منفصل: `selection:<متجر>` مقابل `registre:<متجر>` في لوحة الصحّة؛ ما نفسخو القديم كان بعد ما نقارنو نسب القبول.

## 5. التدفّق التقني

```
التطبيق ── GET /capture/script.js?store_id=X ──► السرفر يختار الغلاف حسب المبدأ (X-AyWebs-Capture-Principle)
   │                                                      └─ profil.mode = 'selection' ⇒ القارئ يتخطّى المصفوفة
   ├─ قراءة 1  (signature محفوظة في الصفحة)
   ├─ ~400ms
   ├─ قراءة 2  ⇒ capture.selection = {reads: 2, stable: true|false}, pageQuantity, captureMode
   └─ POST /product/resolve {capture, quantity}
          validateAyWebsCapturedPage(…, {selectionMode}) ─► evaluateAyWebsSelection (selectionCapture.ts)
          ⇒ تركيبة وحدة (اللي اختارها الحريف) + السوم متاع الصفحة + توفّر بثلاث حالات
          ⇒ captured_selection {attributes, variant_id, availability, page_quantity, image}
          ⇒ calculatePrice + توكن ديفي مربوط بالاختيار
```

## 6. إصلاحات التدقيق المرتبطة (نفس الدفعات)

- **P1-1**: `$` مسبوق (`C$`، `AU $`، `MX$`…) وأسواق TEMU (`/au`، `/ca`، `/mx`…) ما عادش يتحسبو USD؛ Zalando `€` مثبت.
- **P1-2**: SHEIN/TEMU — معرّف الصفحة ≠ الرابط ⇒ `PRODUCT_IDENTITY_MISMATCH`؛ تبديل اللون في SHEIN مقبول كان المعرّفين زوز من نفس حبّات الألوان.
- **P1-3**: القراءة من السرفر بالرابط الأصلي (السوق)، والكانوني للكاش برك؛ السوق يدخل في مفتاح الكاش.
- **P2-5**: عملات Amazon: pl (zł→PLN)، se (kr→SEK)، ca ($→CAD)، com.tr (TL/₺→TRY)، in (₹→INR)، eg (EGP)، sa (ريال→SAR)؛ وأسعار الصرف الثانوية تجي **live** من نفس مصدر السوق (ما فماش أرقام مكتوبة باليد).
- **P2-6**: في وضع `selection` فحص الـASIN ديما شغّال؛ `AYWEBS_AMAZON_VARIANT_CONTRACT` يبقى للطريق القديم برك (موثّق في `.env.example`).

## 7. الملفات

- `src/aywebs/selectionCapture.ts` — الحكم على الاختيار.
- `src/aywebs/captureEnvelope.ts` — وضع `selection` في الغلاف (قراءتين، الكمية، تنقيص المخرج).
- `src/aywebs/captureControl.ts` — المبدأ لكل متجر (`ayweb_capture_principles`).
- `src/aywebs/webviewCapture.ts`، `src/aywebs/productResolver.ts`، `src/aywebs/routes.ts`.
- `tests/aywebs-selection-capture-2026-11-19.test.ts`.
