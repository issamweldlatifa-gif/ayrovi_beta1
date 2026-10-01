# خطة التنفيذ: التوفر والمقاسات الحيّة في نتائج AYROVIX Lens

> **المصدر:** طلب المطور (01/10/2026) — الاستفادة من رابط المنتج الذي يعيده SerpApi
> لاستخراج التوفر والمقاسات والصور عبر كشط صفحة المنتج (PDP) داخل محركنا.
> **الخلاصة:** المحرك موجود بالفعل في المستودع بنسبة ~90%. المطلوب **توصيل** لا **بناء**.

---

## ✅ حالة التنفيذ (محدَّث 01/10/2026)

**المراحل 1 + 2 + 3 + 4 + 5: منفَّذة ومُختبَرة.**

| الملف | التغيير |
|---|---|
| `src/ayrovix/services/lensLiveStock.ts` | 🆕 الإثراء الحيّ + **`refreshLiveStock`** (إعادة قراءة بلا cache + تسجيل عقد الطلب) |
| `tests/lens-live-stock.test.ts` | 🆕 **27 اختباراً** — كلها خضراء |
| `tests/lens-live-stock-card.test.tsx` | 🆕 **9 اختبارات بطاقة** (شارة، رقائق، زر تحقّق، حالات الصمت/الفشل) |
| `src/scraper/scraper.ts` | ✏️ `scrapeParsedPage()` عامة + تصدير `MerchantScrapeResult` (إعادة استخدام، لا نسخ) |
| `src/scraper/productPageParser.ts` | ✏️ كل variant يحمل الآن `stock` (العلم المنشور true/false/null) |
| `src/types/index.ts` | ✏️ `ProductVariantDetail.stock` موثّق |
| `src/ayrovix/routes.ts` | ✏️ التوصيل + تتبّع + **`POST /live-stock`** |
| `src/ayrovix/services/lensPerformanceTrace.ts` | ✏️ 4 حقول تتبّع جديدة |
| `client/.../LensProductCard.tsx` | ✏️ شارة توفر + رقائق مقاسات + زر «تحقّق من التوفر» + طابع زمني |
| `client/.../lensApi.ts` | ✏️ `refreshLiveStock()` + نوع `LiveStockResult` |
| `client/.../lens-product-card.css` | ✏️ أنماط الشارة/الرقائق/الزر |
| `src/scraper/merchantDomains.ts` | ✏️ `AYROVI_TRUSTED_RENDER_HOSTS` (يعالج قيد sportsdirect.fr) |
| `src/scraper/hostCircuit.ts` | 🆕 قاطع دائرة لكل مضيف (3 إخفاقات → 10 دقائق راحة) |
| `.env.example` | ✏️ 7 مفاتيح بيئة موثّقة |
| `tests/ayrovix.test.ts` | ✏️ 7 تأكيدات على allowlist الرندر |

**نتائج التحقق:** `tsc --noEmit` (خادم + عميل) ✅ · **2043 اختباراً ناجحاً** ✅ ·
الاختبارات الـ 8 الفاشلة في `back-office/crm/erp-core/public-seo/public-upload-policy`
**سابقة لعملي** (مؤكَّد بإعادة تشغيلها على الكود الأصلي بعد `git stash`).

### سلسلة الطلب المكتملة (المرحلة 3)

```
بطاقة Lens → [تحقّق من التوفر] → POST /api/ayrovix/live-stock
   → قراءة صفحة المنتج بلا cache (preuve fraîche)
   → recordVariantContract(url, {variants: [{value, availability}]})
   → inspectVariantOrder(url, taille)  ← gardien existant
   → allowed ? Ajouter au panier : 409 + raison lisible
```

بدون هذا العقد، كان `inspectVariantOrder` يرفض أي طلب بمقاس (`NO_CONTRACT`).
والآن: مقاس معلّق `unavailable` → `VARIANT_UNAVAILABLE` · مقاس بلا علم →
`VARIANT_AVAILABILITY_UNKNOWN` (لا يُخمَّن أبداً).

### خطأ حقيقي كشفه اختبار موجود

عند إعادة كتابة `LensProductCard.tsx` أسقطت سهواً الشرط `saved ?` من اسم زر
المفضّلة accessibility — فصار زر غير محفوظ يقول «إزالة من المفضلة». اختبار
`lens-product-cards.test.tsx` كشفه فوراً وأُصلح. **درس: الاختبارات المرجعية
تحمي أكثر من الكود الجديد.**

---

## 1. الخلاصة التنفيذية

| السؤال | الجواب |
|---|---|
| هل الفكرة صحيحة؟ | ✅ نعم — وهذا هو النمط القياسي: Discovery عبر SerpApi + Enrichment عبر PDP scraping |
| هل نبنيه من الصفر؟ | ❌ لا — `src/scraper/` يحتوي بالفعل على PDP parser كامل (JSON-LD + embedded JSON + DOM) |
| ما الفجوة الحقيقية؟ | الـ Scraper موصول بمسار **"لصق رابط"** فقط، وليس بمسار **شبكة نتائج Lens** |
| حجم العمل الحقيقي | ~6–10 ساعات موزعة على 5 مراحل (التفصيل في §4) |
| أكبر خطر | تأخير الرد > 7 ثوانٍ، وتعلّق مخزون منتج بمنتج آخر (دليل غير مطابق) |

---

## 2. تحليل الوضع الحالي (بأدلة من الكود)

### 2.1 ما هو منفّذ فعلاً — جرد الوحدات

| الوحدة | الملف | ما تفعله الآن |
|---|---|---|
| محرّك Lens الموحّد | `src/ayrovix/services/lensEngine.ts` | `recognizeImage()`: vision + `serpApiVisualSearch` + signals، مع échéance لكل محرّك وذاكرة تخزين |
| مسار Lens العام | `src/ayrovix/routes.ts:439` | `enrichCandidateDescriptions(deduped)` — **يثرِي الوصف فقط** |
| البحث البصري | `src/ayrovix/services/visualSearch.ts:156` | `availability` تُضبط `in_stock` **فقط** إذا `row.in_stock === true` — وإلا `unknown` |
| كشط PDP | `src/scraper/scraper.ts` | `SmartLinkScraper.scrapeProduct()`: direct fetch (7s) → parse → fallback rendered provider |
| محلّل PDP | `src/scraper/productPageParser.ts` (623 سطر) | **JSON-LD + JSON مدمّج (`__NEXT_DATA__`) + DOM عبر jsdom** → price / images / colorImages / **variants (sizes, colors, details)** / **availability** / externalId |
| الجلب المصدَّر | `src/scraper/renderedPageFetcher.ts` | ScraperAPI / ScrapingBee / BrightData |
| سياسة المتغيّرات | `shared/variantPolicy.ts` | `reportedVariantStock` / `allowsMerchantVariantChoice` — **العلم المنطقي (boolean) وحده هو دليل** |
| إثراء SerpApi للتفاصيل | `src/ayrovix/services/productEnrichment.ts` | `google_shopping` + `google_product` → gallery + sizes + availability لكل مقاس — موصول بـ `product.ts` فقط |
| عقد الطلب | `src/ayrovix/services/variantAvailability.ts` | `resolveVariants` + `inspectVariantOrder` (يُستعمل في `src/api/routes.ts:11`) |
| حماية SSRF | `src/services/safeUrl.ts` | `resolveSafeHttpUrl` / `fetchSafeRemote` / `readLimitedText` |
| كشف المتجر | `src/scraper/merchantDomains.ts` | `detectMerchantStore` + `isTrustedRenderTarget` |

### 2.2 الفجوة بالضبط

1. **Lens لا يملأ التوفر/المقاسات من مصدر حقيقي.** نوع `AyrovixCandidate`
   (`src/ayrovix/types.ts:54`) يحتوي **أصلاً** على `availability`, `sizes`, `images`,
   `priceVerificationStatus` — أي أن **عقد الـ API جاهز ولا يحتاج تغييراً** — لكن مسار
   Lens لا يملأ هذه الحقول من صفحة المنتج.
2. **الكشط معزول عن Lens.** `SmartLinkScraper` مُستدعى من: `api/routes.ts` (لصق رابط)،
   `product.ts` (extractProductFromUrl)، `priceWatch.ts` — **وليس** من `lensEngine` أو
   `routes.ts` (ayrovix).
3. **البطاقة لا تعرض المقاسات/التوفر.** `client/src/ayrovix/components/LensProductCard.tsx`
   يعرض عنوانًا ووصفًا وصورة وسعرًا فقط — لا شارة توفر ولا رقائق مقاسات.
4. **قيد مخفي مهم:** `isTrustedRenderTarget()` يسمح بالجلب المصدَّر (الRenderer المدفوع)
   لـ amazon/shein/temu/aliexpress فقط. أي نطاق آخر — ومنه `sportsdirect.fr`
   و`zalando` — يُكسح بالـ direct fetch وحده، وسيفشل غالباً أمام anti-bot.

---

## 3. تقييم الملخص التقني المقدَّم

**نعم، الملخص مفيد ودقيق في جوهره** — وهو يصوّب مشكلة حقيقية (SerpApi لا يعطي مخزوناً
حيّاً) ويقترح الحل الصحيح (reverse-engineering لصفحة المنتج). فيما يلي ما أؤكّده وما أصحّحه:

### ✅ ما هو صحيح ويوافق بنية المستودع

| نقطة الملخص | الحالة في المستودع |
|---|---|
| `Promise.all()` للمعالجة المتوازية | ✅ نفس نمط `lensEnrichment.ts` (worker pool + concurrence) |
| `timeout: 2500` لإسقاط المواقع البطيئة | ✅ نفس مبدأ `AYROVI_LENS_ENRICH_DEADLINE_MS` |
| قراءة JSON المخفي (`runParameters` / `INITIAL_STATE`) | ✅ `productPageParser.ts` يفعل هذا فعلاً (+ JSON-LD + `__NEXT_DATA__`) |
| استهداف أزرار المقاسات (`disabled` / `oos`) | ✅ `productPageParser.ts` يقرأ `variants` + `reportedVariantStock` |
| فلترة النتائج النافدة قبل محرك الحساب | ✅ صحيحة لمسار الطلب (انظر التصحيح 4) |

### ⚠️ ما يحتاج تصحيحاً قبل التنفيذ

1. **"ضمن حاجز الـ 7 ثوانٍ قبل العرض" — أخطر بند في الملخص.**
   8 صفحات منتج × (fetch + parse + render fallback) لا يكمل ضمن 7 ثوانٍ بشكل موثوق،
   والمواقع الكبرى تحجب direct fetch. **القاعدة المطبَّقة في هذا المستودع**
   (`lensEnrichment.ts`, streaming D2-7): **الإثراء لا يؤخر الرد أبداً**. البديل:
   échéance صارمة (2.5s) + budget (أول 4–6 نتائج فقط) + **تمرينة ثانية تدريجية**
   (progressive) عند فتح المنتج أو الضغط على "أضف للسلة".
2. **لا يوجد Cache في الملخص — إلزامي.** المستودع يستخدم: `data/lens-descriptions`
   (TTL 7 أيام)، `data/variant-availability` (TTL 6 ساعات)، جدول `product_profiles`
   (TTL 6 ساعات). بدون cache: كل تصفح = 8 طلبات مدفوعة (render providers).
3. **لا يوجد "دليل المطابقة" — خطر تعلّق مخزون منتج بآخر.** لازم
   `titleOverlap(candidate.title, parsed.title) ≥ 0.6` (نفس `MATCH_THRESHOLD` في
   `lensEnrichment.ts`) قبل قبول أي بيانات من الصفحة.
4. **"حذف النتائج النافدة فوراً" — لا تحذفها من العرض.** اعرضها بشارة
   `out_of_stock` (الشفافية تمنع فقدان الثقة)، واستبعدها فقط من مسار إتمام الطلب.
5. **تدوير User-Agent لا يكفي** لـ Sports Direct/Zalando — المستودع يملك الحل
   (`renderedPageFetcher`) لكن محصوراً في 4 نطاقات؛ يجب توسيع القائمة أو adapter خاص.
6. **"تفعيل Ajouter au panier تلقائياً" — يحتاج قيداً:** مخزون وقت العرض ≠ مخزون وقت
   الطلب. المستودع يحل هذا بـ `inspectVariantOrder` (إعادة تحقّق وقت الإضافة). دون ذلك
   سنعيد إنتاج المشكلة الأصلية (طلب قطع نافدة).
7. **حدود التكلفة والحماية:** budget + concurrence + circuit breaker لكل نطاق +
   احترام `robots.txt`/شروط المتجر (المستودع يستخدم `fetchSafeRemote` أصلاً).

---

## 4. خطة التنفيذ

### المرحلة 0 — قرارات معمارية (قبل كتابة كود)

- **ملف جديد:** `src/ayrovix/services/lensLiveStock.ts` — على نفس نمط
  `lensEnrichment.ts` (بنفس الحرّاس: budget / cache / deadline / preuve).
- **إعادة استخدام — لا نسخ:** نفتح واجهة عامة صغيرة في `SmartLinkScraper`
  (`scrapeParsedPage(url): Promise<MerchantScrapeResult>`) بدل إعادة كتابة منطق
  direct-then-render الموجود في `scrapeWithHttp`.
- **مفاتيح البيئة** (بنفس اصطلاح المستودع):

```bash
AYROVI_LENS_LIVE_STOCK=true          # on/off دون إعادة نشر
AYROVI_LENS_LIVE_BUDGET=4            # عدد الصفحات المكسوحة لكل بحث
AYROVI_LENS_LIVE_CONCURRENCY=2
AYROVI_LENS_LIVE_DEADLINE_MS=2500    # لا يتجاوز أبداً
AYROVI_LENS_LIVE_TTL_MS=21600000     # 6 ساعات
AYROVI_LENS_LIVE_CACHE_DIR=data/lens-live-stock
AYROVI_LENS_LIVE_MATCH_THRESHOLD=0.6
```

### المرحلة 1 — خدمة الإثراء الحيّة (القلب)

`enrichCandidatesLiveStock(candidates, options)` في `lensLiveStock.ts`:

```
لكل مرشح خارجي (kind='external') يملك sourceUrl، ضمن الـ budget:
  1. cache lookup بـ sha256(url) — TTL 6h → hit: تطبيق فوري (0 ms، 0 تكلفة)
  2. miss → scrapeParsedPage(url)      [direct 7s → rendered fallback]
  3. parse → ParsedProductPage         [price, images, colorImages, variants, availability]
  4. PREUVE: titleOverlap ≥ 0.6 ؟ وإلا تجاهل كامل (لا نُلصق مخزون منتج آخر)
  5. map → AyrovixCandidate:
       availability   ← parsed.availability           (in_stock | limited | out_of_stock | unknown)
       sizes[]        ← variants.details[].size        (+ per-variant stock من reportedVariantStock)
       colors[]       ← parsed.variants.colors
       images[]       ← دمج parsed.images دون فقدان الموجود
       price          ← يُستخدم فقط إذا كان candidate.price === null
       availabilityCheckedAt / availabilityExpiresAt ← now / now + TTL
  6. out_of_stock → يبقى في القائمة بشارة (يُستبعد لاحقاً من الطلب فقط)
  7. أي فشل → لا يُخزَّن (المحاولة التالية تعيد الكشط) — نفس قاعدة lensEnrichment
تشغيل: worker pool (concurrence 2) داخل Promise.all + échéance عامة 2.5s
       → عند الانتهاء نرد بما جاهز، والعمل المتأخر يُهمَل (لا يُعرض ولا يُخزَّن)
```

### المرحلة 2 — التوصيل في مسار Lens

- `src/ayrovix/routes.ts` بعد السطر 439:
  `const candidates = await enrichCandidatesLiveStock(await enrichCandidateDescriptions(deduped));`
- تتبّع الأداء في `lensPerformanceTrace.ts`: `liveStockMs`, `liveStockHits`, `liveStockBudget`.
- إضافة `liveStock: { checked, budget, deadlineMs }` لاستجابة الـ API (شفافية للواجهة).

### المرحلة 3 — إعادة التحقّق عند الطلب (عقد الطلب)

- نقطة نهاية جديدة: `POST /api/ayrovix/live-stock` body `{ urls: [] }` — كشط فوري
  بتجاوز الـ cache، يُستدعى عند الضغط على "أضف للسلة".
- عند الإضافة الفعلية: `inspectVariantOrder` + إعادة كشط للتأكيد؛ إن تعذّر إثبات
  التوفر → `PENDING_MANUAL` (لا طلب آلي على دليل قديم).

### المرحلة 4 — الواجهة (`LensProductCard.tsx`)

- شارة توفر: ✅ متوفر / ⚠️ آخر القطع / ❌ نفد (بألوان الهوية الحالية).
- رقائق المقاسات: النافد `disabled` مع `aria-disabled` (وفق `variantPolicy.ts`).
- زر "تحديث التوفر" يستدعي نقطة نهاية المرحلة 3.
- ملاحظة: `AyrovixCandidate` في `client/src/ayrovix/types.ts` يحمل `availability`
  و`sizes` مسبقاً — لا تغيير في العقد.

### المرحلة 5 — المتانة والتوسيع

- توسيع `isTrustedRenderTarget` عبر env allowlist (مثل `sportsdirect.fr`, `zalando`)
  أو إضافة هذه النطاقات إلى `MERCHANT_DOMAINS` كـ `store: 'generic'` موثوق.
- Circuit breaker لكل نطاق (إيقاف مؤقت بعد N فشل متتالٍ) + عدّاد نسبة نجاح كل نطاق.
- (لاحقاً) تدوير proxies للجلب المباشر، وسجل adapter لكل قالب متجر.

---

## 5. الاختبارات المطلوبة

| النوع | الملف المقترح | التغطية |
|---|---|---|
| وحدة | `tests/lens-live-stock.test.ts` | cache hit/miss · رفض دليل غير مطابق (overlap منخفض) · احترام budget · échéance مع fetcher بطيء · تحويل out_of_stock · per-size stock · الفشل لا يُخزَّن |
| تكامل | (نفس الملف، supertest) | `/analyze-image` مع fetcher محقون → candidates تحمل availability/sizes |
| انحدار | موجودة مسبقاً | `lens-enrichment.test.ts` · `lens-engine-unified.test.ts` · `product-variants.test.ts` · `variant-policy.test.ts` تبقى خضراء |

---

## 6. حدّ ثابتة لا تُخترق (مستخرجة من قواعد المستودع)

1. **لا تخمين توفر أبداً** — الصمت = `unknown`، و`unknown` لا يعني `in_stock`.
2. **مخزون العرض ليس إثباتاً للطلب** — إعادة التحقّق وقت الإضافة إلزامية.
3. **الإثراء لا يؤخر الرد أبداً** — échéance صارمة + نرد بما جاهز.
4. **لا يُلصق نص/صور/مخزون منتج بمنتج آخر** — دليل مطابقة قوي أولاً.
5. **`false` في env يقطع الإنفاق دون إعادة نشر.**

---

## 7. تقدير الجهد

| المرحلة | الجهد | ملاحظة |
|---|---|---|
| 0 + 1 (الخدمة + الاختبارات) | 3–4 ساعات | الجزء الأثمن |
| 2 (التوصيل + التتبّع) | 1 ساعة | تعديل موقعين |
| 3 (إعادة التحقّق عند الطلب) | 1–2 ساعة | يعيد استخدام `inspectVariantOrder` |
| 4 (الواجهة) | 2–3 ساعات | شارة + رقائق + زر تحديث |
| 5 (المتانة) | 1 ساعة | allowlist + circuit breaker |

---

*هذه الخطة تُنفَّذ على الفرع `arena/01a0f8b6-ayrovi-beta1`. المرحلة 1 جاهزة للتنفيذ فوراً
بناء على الطلب.*
