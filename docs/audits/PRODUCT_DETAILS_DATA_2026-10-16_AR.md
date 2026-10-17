# تدقيق بيانات تفاصيل المنتج — التخزين والتمرير والعرض

| | |
|---|---|
| التاريخ | 2026-10-16 |
| الفرع | `arena/1b1c70c4-zayrovi-beta1` |
| نطاق التدقيق | طريقة تخزين وتمرير بيانات تفاصيل المنتج فقط (كشط → سيرفر → تطبيق) |
| الحالة | **قراءة فقط** — لم يُعدَّل أي كود ولا قاعدة بيانات أثناء هذا التدقيق |
| الأمثلة | حقيقية: مخرجات فعلية لدوال المستودع على captures وfixtures موجودة داخله |

## المنهجية

لم تُصنع أي بيانات افتراضية. شغّلت الدوال الفعلية للمستودع على معطيات حقيقية مخزّنة فيه:

1. `parseProductPageHtml()` (‏`src/scraper/productPageParser.ts:722`) على `tests/fixtures/amazon-product-page.html` — capture حقيقية لصفحة فستان Vince Camuto، مستعملة كـgolden في `tests/aywebs-capture-amazon.test.ts` وموثّقة ببصمة SHA-256 في `tests/fixtures/aywebs/REAL_CAPTURES.md`.
2. `parseSerpApi()` (‏`src/ayrovix/services/productVariants.ts:524`) و`readProductFacts()` (‏`src/ayrovix/services/productEnrichment.ts:257`) على `verify/fixtures/product-variants/01_sneaker.json` — fixture بصيغة SerpApi `google_product` الموجودة في المستودع.

سكريبت التوليد مؤقت وموجود في `.cache/audit-examples.mts` (مجلّد متجاهَل في git). جوهره قابل لإعادة التشغيل:

```ts
import { readFileSync } from 'node:fs';
import { parseProductPageHtml } from '../src/scraper/productPageParser';
import { parseSerpApi } from '../src/ayrovix/services/productVariants';
import { readProductFacts } from '../src/ayrovix/services/productEnrichment';

const dress = parseProductPageHtml(
  readFileSync('tests/fixtures/amazon-product-page.html', 'utf8'),
  'https://www.amazon.com/dp/B0EXAMPLE1', 'amazon');
const sneaker = JSON.parse(readFileSync('verify/fixtures/product-variants/01_sneaker.json', 'utf8'));
const parsed = parseSerpApi(sneaker);
const facts = readProductFacts(sneaker);
```

لا مفاتيح سرية ولا بيانات حساسة في هذا التقرير.

---

## 1) مثال JSON كامل — نتيجة كشط حقيقية لمنتج ملابس

مخرج `parseProductPageHtml` الفعلي (نوعه `ParsedProductPage`) على capture الفستان الحقيقية:

```json
{
 "title": "Vince Camuto Women's Short Sleeve Panneled Shift Mini Dress with Exposed Stitching",
 "description": "Buy Vince Camuto Women's Short Sleeve Panneled Shift Mini Dress with Exposed Stitching: Shop top fashion brands Dresses at Amazon.com ✓ FREE DELIVERY",
 "price": 109,
 "currency": "USD",
 "currencyVerified": true,
 "originalPrice": 149,
 "images": [
  "https://m.media-amazon.com/images/I/71QK1MOCKUP._AC_UL1500_.jpg",
  "https://m.media-amazon.com/images/I/71QK1MOCKUP._AC_UL320_.jpg",
  "https://m.media-amazon.com/images/I/71SECONDVIEW._AC_UL1500_.jpg",
  "https://m.media-amazon.com/images/I/71SECONDVIEW._AC_UL320_.jpg"
 ],
 "colorImages": {},
 "externalId": "",
 "variants": {
  "sizes": ["X-Small", "Small", "Medium", "Large", "X-Large"],
  "colors": ["Camel", "Classic Navy", "Emerald Leaf"],
  "details": [
   { "id": "B0GYMB2V3Q", "label": "X-Small", "size": "X-Small", "color": null, "attributes": null, "available": true,  "stock": true,  "price": null },
   { "id": "B0GYM3V9H5", "label": "Small",   "size": "Small",   "color": null, "attributes": null, "available": true,  "stock": true,  "price": null },
   { "id": "B0GYM7GTF3", "label": "Medium",  "size": "Medium",  "color": null, "attributes": null, "available": true,  "stock": true,  "price": null },
   { "id": "B0GYMKWMFW", "label": "Large",   "size": "Large",   "color": null, "attributes": null, "available": false, "stock": false, "price": null },
   { "id": "B0GYLSS8DT", "label": "X-Large", "size": "X-Large", "color": null, "attributes": null, "available": true,  "stock": true,  "price": null },
   { "id": "B0GKC4CZ4V", "label": "Camel",        "size": null,    "color": "Camel",        "attributes": null, "available": true, "stock": true, "price": null },
   { "id": "B0GKCB8FKF", "label": "Classic Navy", "size": null,    "color": "Classic Navy", "attributes": null, "available": true, "stock": true, "price": null },
   { "id": "B0GYM3V9H5", "label": "Emerald Leaf", "size": null,    "color": "Emerald Leaf", "attributes": null, "available": true, "stock": true, "price": null },
   { "id": "B0GYM3V9H5", "label": "Small · Emerald Leaf",  "size": "Small",  "color": "Emerald Leaf", "attributes": { "size": "Small",  "color": "Emerald Leaf" }, "available": true, "stock": true, "price": null },
   { "id": "B0GYM7GTF3", "label": "Medium · Emerald Leaf", "size": "Medium", "color": "Emerald Leaf", "attributes": { "size": "Medium", "color": "Emerald Leaf" }, "available": true, "stock": true, "price": null },
   { "id": "B0GKCNZ3W5", "label": "X-Small · Camel", "size": "X-Small", "color": "Camel", "attributes": { "size": "X-Small", "color": "Camel" }, "available": true, "stock": true, "price": null },
   { "id": "B0GKBLB2HR", "label": "X-Large · Camel", "size": "X-Large", "color": "Camel", "attributes": { "size": "X-Large", "color": "Camel" }, "available": true, "stock": true, "price": null }
  ]
 },
 "availability": "in_stock",
 "priceSource": "dom",
 "priceRejection": null
}
```

**ملاحظة تدقيقية:** حقول `condition` و`gtin` و`sku` و`seller` و`rating` و`reviewCount` **غائبة كلياً من الـJSON** (وليست فارغة) لأن الصفحة لم تنشرها. هذا تطبيق حرفي لقاعدتي 03/10/2026 (حالة المنتج) و07/10/2026 (الحقول الممتدة) في `productPageParser.ts`: «champ vide est un progrès, champ inventé une régression».

بنية النوع كاملة (‏`src/scraper/productPageParser.ts:7-60`): `title, brand?, description?, price, currency, currencyVerified?, originalPrice?, images[], colorImages{}, externalId, variants, availability, condition?, gtin?, sku?, seller?, rating?, reviewCount?, priceSource, priceRejection?`.

## 2) مثال JSON كامل — نتيجة كشط حقيقية لمنتج أحذية

مسار الأحذية يمر عادةً عبر SerpApi `google_product`. الخام في المستودع: `verify/fixtures/product-variants/01_sneaker.json` (‏title: *Nike Air Max Torch 4 Men's Running Shoes - White/Silver*، `prices: ["$109.99"]`، `typical_prices`، `rating: 4.6`، `reviews: 1284`، `sizes` من 39 إلى 42 لكل منها `product_id` و`serpapi_link`، `variations.Color` بـ`thumbnail` و`available`، `features`: Upper material / Closure، `sellers_results.online_sellers`).

ومخرج `parseSerpApi()` الفعلي عليه (نوعه `ParsedProduct` = `{ signals, groups, readPaths }`):

```json
{
 "signals": {
  "title": "Nike Air Max Torch 4 Men's Running Shoes - White/Silver",
  "description": "Lightweight running shoe with Max Air heel unit and breathable mesh upper.",
  "extensions": ["Running shoes", "Men's", "Mesh upper"],
  "specs": [
   { "name": "Upper material", "value": "Mesh",    "path": "product_results.features[0]" },
   { "name": "Closure",        "value": "Lace-up", "path": "product_results.features[1]" }
  ],
  "breadcrumbs": [],
  "sellerStockTexts": ["In stock"],
  "price": { "amount": 109.99, "currency": "USD", "path": "product_results.prices[0]" }
 },
 "groups": [
  {
   "sourceLabel": "Color",
   "path": "product_results.variations[\"Color\"]",
   "values": [
    { "label": "White", "selected": true,  "availableFlag": true,  "stockTexts": [], "thumbnail": "https://example.com/w.jpg", "productId": "112" },
    { "label": "Black", "selected": false, "availableFlag": false, "stockTexts": [], "thumbnail": "https://example.com/b.jpg", "productId": "115" }
   ]
  },
  {
   "sourceLabel": "Size",
   "path": "product_results.sizes",
   "values": [
    { "label": "39", "selected": false, "stockTexts": [], "productId": "111", "serpapiLink": "https://serpapi.com/search?product_id=111" },
    { "label": "40", "selected": true,  "stockTexts": [], "productId": "112", "serpapiLink": "https://serpapi.com/search?product_id=112" },
    { "label": "41", "selected": false, "stockTexts": [], "productId": "113", "serpapiLink": "https://serpapi.com/search?product_id=113" },
    { "label": "42", "selected": false, "stockTexts": [], "productId": "114", "serpapiLink": "https://serpapi.com/search?product_id=114" }
   ]
  }
 ]
}
```

**الفرق البنيوي بين المسارين:** الكشط المباشر للصفحة يعطي `ParsedProductPage` (القسم 1)؛ SerpApi يعطي `ParsedProduct` (‏signals + groups) حيث كل variant يحمل `productId` و`serpapiLink` — وهما مفتاح حلّ التوفر الحيّ لكل مقاس لاحقاً (`variantAvailability.ts`).

## 3) بنية mergeFacts الدقيقة

**Array وليس Object.** عنصرها `LensProductFact` معرّف في `apps/mobile/src/api/lens.ts:62-68`:

```ts
export type LensProductFactSection = 'details' | 'material' | 'fit';

export interface LensProductFact {
  key: string | null;   // مفتاح مطبّع (ex. 'material') أو null إن لم تعرفه القواعد
  label: string;        // اسم الخاصية كما نشره المصدر
  value: string;        // قيمتها كما نشرها المصدر
  section: LensProductFactSection;
}
```

سلوك `mergeFacts` (‏`apps/mobile/src/features/lens/productEnrichment.ts:20-33`):

- الترتيب: حقائق البطاقة الحالية أولاً ثم القادمة (progressive enrichment)؛
- إسقاط كل حقيقة بلا label أو بلا value؛
- دبلجة بالمفتاح `label|value`_lowercase؛
- سقف **18 حقيقة**.

مثال حقيقي من تشغيل `readProductFacts` أعلاه (جهة السيرفر نفس البنية باسم `ZayrovixProductFact`):

```json
[
 { "key": "material", "label": "Upper material", "value": "Mesh",    "section": "material" },
 { "key": null,       "label": "Closure",        "value": "Lace-up", "section": "details" }
]
```

ومثال ثانٍ مثبت باختبار `src/ayrovix/services/productEnrichment.test.ts:15-17`:

```json
[
 { "key": "material", "label": "Material", "value": "100% cotton", "section": "material" },
 { "key": "fit",      "label": "Fit",      "value": "Regular fit", "section": "fit" },
 { "key": "pattern",  "label": "Pattern",  "value": "Striped",     "section": "details" }
]
```

## 4) الخامة والقصّة والعناية والمقاسات واللون: حقول مستقلة أم قائمة عامة؟

| المعلومة | طريقة التخزين | المرجع في الكود |
|---|---|---|
| المقاسات | **حقل مستقل** `sizes: string[]` | `LensCandidate.sizes` |
| الألوان | **حقل مستقل** `colors: string[]` + `optionLabel` | `LensCandidate.colors` |
| الخامة | داخل **قائمة الخصائص العامة** بوسم `section: 'material'` | `FACT_KEYS` + `MATERIAL_FACT`، `productEnrichment.ts:236` |
| القصّة/المقاسية | داخل القائمة العامة بوسم `section: 'fit'` (fit/length/neckline/sleeve/shape) | `FACT_KEYS`، `productEnrichment.ts:237-241` |
| العناية | **لا قسم لها جهة السيرفر**؛ الواجهة تستخرجها client-side من حقائق `details` عبر regex ‏`CARE_FACT` والباقي يصبح «خصائص» | `LensProductView.tsx:606-607` |
| الوصف | حقل مستقل `description` مع تنظيف ضوضاء DOM | `productPageParser.ts` (‏NOISE_LINES) |

الخلاصة: بنية هجينة مقصودة — ما له معنى اختيارٍ (مقاس/لون) حقول مستقلة قابلة للانتقاء، وما له معنى معرفةٍ (خامة/قصّة/عناية) حقائق موسومة تُصفّى عند العرض.

## 5) صور الألوان: أين هي وكيف ترتبط بالـVariant

- **المخزن:** `colorImages: Record<string, string[]>` — المفتاح اسم اللون lowercase والقيمة مصفوفة روابط الصور (مرجع Zalando، 24/09/2026، `productPageParser.ts:23-25`؛ ونفسه في `ScrapedProduct.colorImages`، `src/types/index.ts:53`).
- **التمرير:** `toZayrovixProduct` (‏`src/ayrovix/services/product.ts:63`) يحوله كما هو إلى `LensCandidate.colorImages`، و`mergeLensProduct` يوحّد المجموعات بدون دبلجة روابط.
- **العرض:** منتقي الألوان في `LensProductView.tsx:180-224` يعرض thumbnail لكل لون من `colorImages[color]`.
- **الربط بالـVariant:** تطابق اسم اللون نصاً — `variants.details[].color` و`variantOptions[].color` يحملان نفس اسم مفتاح `colorImages`. في capture الفستان الحقيقية `colorImages = {}` لأن أمازون لا ينشر galerie لكل لون، بينما `details[].color` موجود: الربط يعمل متى نشرت المصدر الصور، وغيباؤها لا يُختلق.

## 6) المقاسات ↔ Variants ↔ الأسعار ↔ التوفّر

- **البنية المصدر:** `ProductVariantDetail` في `src/types/index.ts:14-31`: `{ id, label, size, color, attributes?, available, stock?, price? }` — مع فصل مقصود بين `available` (أهلية الانتقاء) و`stock` (المخزون كما ينشره التاجر: true/false/null حين يصمت).
- **التحويل:** `toZayrovixProduct` (‏`product.ts:38-56`) يمرّر التفاصيل عبر `isSelectableVariant` (‏`shared/variantPolicy`) وينتج `LensVariantOption`: `{ id, label, size, color, available, availability, price, currency, priceTnd, … }`.
- **سعر كل Variant على حدة: نعم** — `detail.price` → `price` + `priceTnd` عبر محرك الأسعار `estimateWithDb`؛ وفي capture الفستان قيمته `null` لأن الصفحة لا تنشر سعراً لكل مقاس (لا يُختلق سعر).
- **مخزون كل Variant على حدة: نعم، كما ينشره التاجر** — `detail.stock` → `reportedVariantStock` → `availability: 'available' | 'unavailable' | 'unknown'`؛ الصمت يبقى `unknown` ولا يصبح «متاحاً افتراضياً» أبداً (انظر في المثال 1: مقاس Large ‏`stock: false` بينما بقية المقاسات `true`).
- **طبقة تحقق حيّة فوق ذلك:** عقد توفّر لكل variant عند الشراء (`recordVariantContract` في `variantAvailability.ts`)، وخطأ `VARIANT_AVAILABILITY_UNKNOWN` معالج في `LensProductView.tsx:754` — أي أن «المخزون المكشوط» لا يُصدَّق أعمى بل يُعاد التحقق منه لحظة الالتزام.

## 7) الدالة/الملف الذي يحوّل بيانات الكشط إلى ما تستقبله صفحة React Native

السلسلة الكاملة، بترتيب المرور:

1. `parseProductPageHtml` — `src/scraper/productPageParser.ts:722` (HTML → `ParsedProductPage`)؛
2. `SmartLinkScraper.scrapeParsedPage` — `src/scraper/scraper.ts` (‏`ParsedProductPage` → `ScrapedProduct`)؛
3. **`toZayrovixProduct` — `src/ayrovix/services/product.ts:33`** ← نقطة التحويل المركزية (‏`ScrapedProduct` → `ZayrovixProduct`: سعر TND عبر `estimateWithDb`، variantOptions، galerie، تحقق السعر)؛
4. routes — `src/ayrovix/routes.ts` (‏`/detect:505`، `/analyze-url:554`) تُخرج JSON عبر HTTP؛
5. `apps/mobile/src/api/lens.ts` — أنواع العقد (`LensCandidate`…) واستدعاءات الهاتف؛
6. `mergeLensProduct` — `apps/mobile/src/features/lens/productEnrichment.ts` (دمج progressive بنفس الضمانات: لا سعر بلا `priceToken` موقّع، لا تقييم إلا `merchant`)؛
7. `LensProductView.tsx` — العرض النهائي.

فرع SerpApi الموازي: `parseSerpApi` (‏`productVariants.ts:524`) + `readProductFacts` (‏`productEnrichment.ts:257`) + `enrichProduct`.

## 8) الملفات المتحكمة في كل طبقة

| الدور | المسارات |
|---|---|
| استخراج البيانات | `src/scraper/productPageParser.ts` · `src/scraper/scraper.ts` · `src/scraper/amazonPage.ts` · `src/scraper/priceIntegrity.ts` · `src/ayrovix/services/productVariants.ts` (SerpApi) · `src/ayrovix/services/search.ts` (SerpApi shopping) |
| تنظيم الخصائص | `src/ayrovix/services/productEnrichment.ts` (‏FACT_KEYS / readProductFacts / merge) · `apps/mobile/src/features/lens/productEnrichment.ts` (‏mergeFacts / mergeLensProduct) |
| جلب التفاصيل والتوفّر | `src/ayrovix/routes.ts` · `src/ayrovix/services/product.ts` · `src/ayrovix/services/lensLiveStock.ts` · `src/ayrovix/services/variantAvailability.ts` · `shared/variantPolicy.ts` |
| العرض في React Native | `apps/mobile/src/features/lens/LensProductView.tsx` · `apps/mobile/src/api/lens.ts` |
| العرض في الويب (للمقارنة) | `client/src/shop/ProductPage.tsx` |

## 9) هل تستطيع الواجهة الحالية عرض كل هذه البيانات دون تعديل Backend؟

### متاح ومعروض اليوم (بلا أي تعديل)
العنوان، Marke، الوصف، Galerie + صور الألوان، الألوان، المقاسات/‏optionLabel، **سعر ومخزون كل variant على حدة**، أقسام الخصائص/الخامة/القصّة/العناية، التقييم التجاري (`ratingKind === 'merchant'`)، promo والسعر المرجعي، التوفر مع `availabilityCheckedAt`.

### يصل إلى الهاتف ولا يعرضه (قرار واجهة فقط — البيانات موجودة في الـpayload)
`offers[]` (قائمة العروض البديلة بمصادرها وأسعارها)، `offerCount`، `match` (نسبة تطابق Lens)، `sourceCondition` (جديد/مستعمل/مجدَّد كما نشره التاجر).

### مكشوط لكن لا يصل إلى الهاتف (يلزمه تعديل backend صغير لإضافته للـpayload)
`gtin`، `sku`، `seller` — تُقرأ في الـparser لكنها تبقى في خط aywebs/ingestion (‏`src/aywebs/productNormalizer.ts:210`، `src/aywebs/productResolver.ts:773`)؛ وكذلك `priceSource` و`priceRejection` (تيليمetrie ودعم) و`exchangeRate`.

### غير موجود أصلاً في أي طبقة (لا كشطاً ولا تخزيناً)
تاريخ السعر عبر الزمن، زمن توصيل تقديرى لتونس، مخزون محلي تونسي، مراجعات مستخدمين موثّقة داخل المنصة، القياسات الفعلية إلا إذا نشرها التاجر ضمن specs.

---

## الخلاصة التنفيذية

1. التخزين متماسك ومبدؤه واضح: **الصمت ليس بياناتٍ** — الحقول غير المنشورة تغيب (undefined) ولا تُملأ بفراغ ولا تُخمَّن؛ والأمثلة الحقيقية أعلاه تثبت ذلك (‏`colorImages: {}` و`price: null` لكل variant وغياب gtin/sku/seller في capture أمازون).
2. البنية هجينة مقصودة: اختيارات (مقاسات/ألوان/variants) كحقول مستقلة قابلة للانتقاء، ومعرفة (خامة/قصّة/عناية) كحقائق موسومة `section` تُصفّى عند العرض، مع سقف 18 حقيقة ودبلجة `label|value`.
3. سعر ومخزون كل variant مدعومان بنيوياً من المصدر إلى الواجهة، مع طبقتي حماية: `priceToken` موقّع (لا سعر بلا إثبات) وعقد تحقق توفّر حيّ عند الشراء.
4. أكبر فرصة فورية **بدون backend**: إظهار `offers[]` و`sourceCondition` و`match` الموجودة سلفاً في payload الهاتف.
5. أكبر فجوة بنيوية: `gtin/sku/seller` تُكشط ثم تُحبس في خط ingestion دون أن تراها بطاقة المنتج — قرار منتج مطلوب لإمرارها أو الإبقاء على حجبها.

*أُنتج هذا التقرير آلياً من تشغيل الكود الفعلي على بيانات المستودع الحقيقية؛ لم يُعدَّل أي كود ولا قاعدة بيانات.*
