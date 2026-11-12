# AYWEBs — سكريبت كابتشر خاصّ بكلّ متجر (12/11/2026)

## المشكل

سكريبت واحد مشترك لأكثر من 300 متجر: تصليح يخدم على Amazon يكسّر Zalando والعكس، وما فماش طريقة نعرفو بيها شكون تأثّر قبل النشر.

## الحلّ: طبقات + حماية

| الطبقة | شكون | السكريبت اللي يوصل للتطبيق |
|---|---|---|
| **أ — متجر مخصّص** | Amazon, Zalando | سكريبت مكتوب باليد (`src/aywebs/storeScripts/`) |
| **أ — lot مولَّد** | SHEIN, TEMU, AliExpress | القلب المشترك **منقّص آلياً**: كود المتاجر الأخرى ينحّى (`shein` 158 Ko · `temu` 112 · `aliexpress` 137) |
| **ب — منصّة** | أي متجر Shopify أو WooCommerce | lot `kernel` (89 Ko) فيه قرّاء المنصّات، يتعرّفو على المنصّة وقت التشغيل |
| **ج — عام** | باقي متاجر السجلّ (walmart, sephora, primark…) | lot `kernel`: JSON-LD / meta / microdata، **ويتجنّب** عوض ما يعطي سعر غالط |
| متجر مجهول / من غير `store_id` | التطبيقات القديمة | القلب الكامل كما هو (ما تبدّل شي) |

الـlots **ما يتكتبوش باليد أبداً**: يتولّدو من القلب (`scripts/build-aywebs-capture-bundles.mjs`) بتثبيت أعلام المتاجر الأخرى على `false` وحذف الكود الميّت.

### كيفاش نتأكّدو اللي الـlot = القلب؟

- `npm run aywebs:bundles:check`: يفشل إذا الملف المولَّد قديم (CI).
- `npm run aywebs:bundles:diff`: يعاود **كل** صفحة في اختبارات AYWEBs بالقلب وبالـlot اللي يوصل للمتجر هذاكا، ويقارن النتيجة حرف بحرف (CI). آخر تشغيل: 60 ملف، 686 اختبار، 0 فرق.
- اختبار «نصف قطر الأثر»: تبديل في كود SHEIN يبدّل lot SHEIN برك.

## صفحات مرجعية لكل متجر (بوّابة CI)

`tests/fixtures/aywebs/stores/<متجر>/<حالة>.html`: صفحة منتج مجمّدة. السطر الأوّل فيه:

```html
<!-- aywebs-fixture {"url":"https://…","expect":{"price":21.4,"currency":"EUR"},"note":"…"} -->
```

- `expect` يكتبو **إنسان** (السعر والعملة، ولا سبب الرفض) وما يتولّدش من جديد أبداً.
- `<حالة>.expected.json`: صورة كاملة (مصدر السعر، التأكيد، التوفّر، المتغيّرات، الصور، والـlot اللي تخدم بيه الصفحة).
- أيّ تبديل في القلب يبدّل قراءة متجر واحد → تفشل صفحتو هو → نشوفو شكون تأثّر **قبل** النشر.
- بعد ما تراجع الفرق: `npm run aywebs:fixtures:update`.

حالياً: 25 صفحة على 16 متجر + مواقع من برّا السجلّ (Shopify, WooCommerce).

## التحكّم من الـCRM (من غير redeploy)

صفحة **Achats AYWEBs ← Capture des boutiques**:

- نسبة الكابتشرات المقبولة لكل متجر على 24 ساعة، وسبب الرفض الأكثر، والسكريبت اللي يوصل فعلاً (lot + بصمة).
- **إنذار** كي تنزل النسبة تحت 80% (بداية من 20 كابتشر).
- لكل متجر 3 أوضاع (السبب إجباري، ويتسجّل في الـaudit):
  - `auto`: عادي.
  - `core`: **رجوع للسكريبت الكامل** القديم، يوصل للتطبيق في أقلّ من 5 دقايق.
  - `paused`: **قاطع**: الكابتشر يوقف للمتجر هذا برك، التصفّح يقعد، والحريف يشوف «الكابتشر موقوف» ويقدر يبعث طلب شراء. نفس أثر `AYWEBS_<STORE>_CAPTURE_ENABLED=false`.
- الـAPI: `GET /api/admin/aywebs/capture/health` و `PUT /api/admin/aywebs/capture/controls/:storeId` (`{mode, note}`).

العدّادات تتحفظ في `ayweb_capture_hourly` (30 يوم) وما تضيعش كي يعاود السرفر يقلع. الأوضاع في `ayweb_capture_controls`.

## قرّاء المنصّات

### Shopify
- يتعرّف على `window.Shopify` ولا موارد `cdn.shopify.com`، وأبداً على marketplace.
- سعر **الـvariant المختار** (`?variant=` ← فورم السلّة ← `ShopifyAnalytics`)، بالسنتيمات، بعملة العرض.
- عرض الـJSON-LD متاع **نفس** الـvariant عوض «أوّل مقاس».
- مجموعات المتغيّرات (`options` + `option1..3`): الحالة والسعر لكل قيمة، مع الحفاظ على المحاور الأخرى كيف ما هي معروضة.
- variant مش معروف ← ما يعطي حتى سعر.

### WooCommerce
- منتج variable: `data-product_variations` + القيم المختارة (القوائم ولا `?attribute_pa_…`).
- مصدرين مستقلّين للتأكيد: JSON متاع الـvariation + السعر اللي يعرضو WooCommerce ليها.
- الحالة والصورة ومجموعات المتغيّرات.

### قاعدة عامّة جديدة (كل المتاجر)
JSON-LD فيه **فورشات** (`AggregateOffer` بـ`lowPrice` ≠ `highPrice`) ما عادش يتحسب كسعر. قبل كان «39 €» يتقبل لمنتج تختار منو 59 €.

## باش تزيد متجر

1. زيد صفحة مرجعية (أو أكثر) في `tests/fixtures/aywebs/stores/<id>/` فيها `expect` مكتوب باليد.
2. إذا القراءة العامّة تكفي ← خلاص (الـkernel).
3. إذا لا: قارئ في `src/aywebs/captureReaders/<id>.ts`، و`bundle` إذا لازمو lot، ولا علم `IS_<STORE>` في القلب + سطر في `AYWEBS_CAPTURE_BUNDLE_FLAGS`.
4. `npm run aywebs:bundles` ثمّ `npm run aywebs:bundles:diff` ثمّ `npm run aywebs:fixtures:update` (بعد المراجعة).
5. بعد النشر: راقب النسبة في الـCRM؛ وإذا صار مشكل ← `core` ولا `paused`.

## الحدود المعروفة (الخطوات الجاية)

- متاجر `structured_only` (primark, cdiscount…) من غير JSON-LD: meta وحدها مصدر واحد ← رفض. الحلّ: selectors DOM متحقّق منها لكل متجر.
- Magento / SFCC / VTEX / BigCommerce: يمرّو حالياً بالـJSON-LD العام. قارئ منصّة لكل وحدة كيف Shopify وWooCommerce.
- `offers` فيها برشا عروض بأسعار مختلفة (موش Shopify): القاعدة «أوّل عرض» مازالت قائمة (بائعين في marketplace).
