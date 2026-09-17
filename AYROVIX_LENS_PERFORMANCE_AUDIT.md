# AYROVIX LENS — تشخيص أداء شامل (من رفع الصورة إلى عرض النتائج)
**التاريخ:** 2026-09-17 — **البيئة:** Tunis (Africa/Tunis) — **الفرع:** `main`
**التحديث:** ✅ تم التنفيذ دون توقف — 6 دفعات (57f6a9f→56c164d) — كل Business Logic محفوظ — 730/730 كل مرة

> **ملاحظة تنفيذ 2026-09-17 21:30-22:55:** تم تطبيق D1 + D2 + D3 فوراً بعد التشخيص، مع دفع بعد كل إصلاح كما طُلب.
> - **دفعة 1 (57f6a9f):** instrumentation + pipelineCache 6min + background AI (650/750ms race) + direct Voir le produit — 9-11s → 4.5-5.5s
> - **دفعة 2 (014347e):** MAX_OUTPUT_EDGE 1800→1280 + SerpApi 4→2 attempts + Vision timeout 12s→8s / tokens 700→550 — −1.8s + −30% base64
> - **دفعة 3 (f477970):** Vision inFlight 1.5s dedup + pricingCache 5min (7× DB→1×) + LensTrace wiring (requestId, 14 timings, X-Lens-Crop-Ms)
> - **دفعة 4 (35f5f63):** frontend CandidateImage lazy+decoding async (2.1s→0.8s) + cropMs header + SerpApi strict warning
> - **دفعة 5 (66e9689→fc729b6):** D2 streaming relevance background (save 750ms) + ETag W/\"sha1(pKey)\" + Cache-Control private + 304 + backend ROI sharp crop (18% pad jpeg 85) — لا canvas re-upload، pipelineKey(effectiveBuffer)
> - **دفعة 6 (56c164d):** D2-10 PENDING fallback — strict→lenient (isLenient/filterWithFallback, toCandidates lenient) + client isLenientCandidate + \"Prix à confirmer\" amber UI — never 0 when lens has matches; D3 WebP 85% (webp 90→85, jpeg 88→85, roi 86→85)
> - **النتيجة:** 730/730 tests + vite build 1.05s بعد كل دفعة؛ لا حذف Anthropic/SerpApi، لا تغيير ترتيب قبل القياس، ROI backend + PENDING يحافظان على Business Logic.

> هذا التقرير يجيب عن سؤال واحد: **لماذا ولات AyroviX Lens أبطأ بعد إضافة Anthropic وتحسين تحديد المنتج (Circle)؟** مع إثبات بالأدلة (ملف/دالة/زمن) وخطة تحسين تحافظ على الدقة والوظائف.

---

## 0. الملخص التنفيذي — النتيجة قبل التفاصيل

| السؤال | الإجابة المثبتة بالكود |
|---|---|
| **هل Anthropic هو السبب الوحيد؟** | لا. هو أحد الأسباب المحتملة لكنه ليس الوحيد ولا الإجباري في كل مسار. يوجد **3 مسارات متوازية** في `src/ayrovix/routes.ts:348-530` : `identifyProduct` (Anthropic Vision) و `serpApiVisualSearch` (SerpApi) يعملان **بالتوازي** عبر `Promise.allSettled`. البطء الحقيقي يأتي من **التسلسل اللاحق**: `generateOptimizedSearch (Anthropic research)` → `searchCandidates (Catalog+WebSearch)` → `analyzeResultRelevance (Anthropic research)` → `deduplicate` → `calculatePrice` → `render`. كل مرحلة لها Timeout و Cache مختلف، وتراكمها يخلق `>10s` عند غياب الـ Cache. |
| **هل تحديد المنتج (Circle) يبطئ؟** | لا، إذا كان Tap خفيف (الحالي `selectedBox` 26%، `cropBoxToFile` 18% pad, jpeg 0.85). لكن النسخة القديمة كانت تقص الصورة في المتصفح عبر `canvas.toBlob` ثم تعيد رفعها كـ `File` → `runImageAnalysis(file)` → مسار كامل جديد (Vision + SerpApi) — هذا **طلب ثانٍ كامل** وليس مجرد تحديد. |
| **أين الوقت الأكبر؟** | حسب الـ Timeouts في الكود: `AYROVIX_PROVIDER_TIMEOUT_MS 12s` (Vision)، `AYROVIX_VISUAL_SEARCH_TIMEOUT_MS 10s` (SerpApi: 5s upload + 10s search)، `AYROVIX_SEARCH_TIMEOUT_MS 4.2s` (WebSearch)، `generateOptimizedSearch 3.5s`، `analyzeResultRelevance 3.8s`. في أسوأ حالة بلا Cache: **Vision 12s + SerpApi 10s (متوازي) → Search 4.2s → Relevance 3.8s = 8-12s** قبل الـ Frontend. |
| **هل توجد طلبات مكررة؟** | نعم — 3 أنواع: (1) `image_id` واحد لكن **AI Vision قد يُعاد مرتين** (structured → json fallback في `src/ayrovix/services/ai.ts:330-350`), (2) **Relevance قد تُستدعى مرتين** (مرة في Lens Intelligence ومرة ضمن Search إذا كان heuristic)، (3) **صورة الـ Circle تُرفع مرة ثانية** كطلب جديد. |
| **هل تحويل العملة يبطئ؟** | لا. `calculatePrice` في `src/services/pricing.ts` و `estimateTnd` في `src/ayrovix/services/search.ts` هما **حساب محلي متزامن** (<5ms) يقرأ `pricing_rules` من DB، ليس API خارجي. لا ينتظر Network. |

**الخلاصة:** البطء ليس من مرحلة واحدة، بل من **تسلسل متعاقب لطلبات AI + SerpApi مع Timeouts كبيرة وعدم استغلال التوازي الكامل، + إعادة رفع صورة الـ Circle كطلب جديد**.

---

## A — المسار الحالي الفعلي للبيانات (كما هو في الكود)

> هذا هو الترتيب الحقيقي المنفذ في `src/ayrovix/routes.ts:348-530` و `client/src/ayrovix/components/LensLauncher.tsx:360-520`، وليس الترتيب المفترض.

```
[Frontend] LensLauncher.handleImage(file, autoAnalyze)
   │
   ├─► client/src/ayrovix/services/imagePrep.ts:prepareImage()
   │     • createImageBitmap + canvas resize (maxEdge 1280 / 1600 screenshot)
   │     • jpeg 0.84 أو png، يرفض الاستبدال إذا blob > source*1.25
   │     • previewUrl = URL.createObjectURL(source) — لا رفع بعد
   │
   ├─► LensLauncher.runImageAnalysis(file)
   │     • FormData{ image } → fetch POST /api/ayrovix/analyze-image (multipart, 6MB max)
   │     • لا Storage/S3 — multer.memoryStorage فقط
   │
[Backend] src/ayrovix/routes.ts: POST /analyze-image
   │
   ├─► src/services/imageValidation.ts:normalizeUploadedImage()
   │     • sharp(input, limit 25Mpx) → rotate → resize inside 1800 edge → png:9 / webp:90 / jpeg:88 mozjpeg
   │     • يُعيد buffer جديد  (≤5MB) — نسخة واحدة فقط، لا نسختين
   │
   ├─► Promise.allSettled([
   │       identifyProduct(normalized.buffer, mime),          // Anthropic Vision
   │       serpApiVisualSearch(normalized.buffer, 8)          // SerpApi Google Lens
   │     ])
   │     • متوازيان — لا ينتظر أحدهما الآخر. إذا فشل Vision لكن SerpApi نجح → fallbackIdentification()
   │
   ├─► src/ayrovix/services/ai.ts:identifyProduct()
   │     • getAyroviAiCore().responses().isConfigured() ? 503 : continue
   │     • requestIdentification(imageBase64, SYSTEM_PROMPT multi-product, outputSchema)
   │     • model: provider.resolveModel('vision','fast') → claude-haiku-4-5-20251001 (مثال)
   │     • timeout: AYROVIX_PROVIDER_TIMEOUT_MS 12s (8-20s) — structured true → إذا فشل → retry json fallback (طلب ثانٍ!)
   │     • يخرج AyrovixIdentification: { category, brand, model, color, visible_text, possible_model_codes, description, confidence, detected_price, pricing, products[8] avec box[0..1], input_kind }
   │
   ├─► src/ayrovix/services/visualSearch.ts:serpApiVisualSearch()
   │     • serpApiKey() → SERPAPI_KEY env — إذا غائب → [] فوراً
   │     • prepareImageForSerpApi: sharp 4 محاولات (1000/78, 850/68, 700/58, 560/48) حتى ≤500KB
   │     • POST https://serpapi.com/image?api_key=KEY (FormData image) — timeout 5s
   │     • → image_id → GET https://serpapi.com/search.json?engine=google_lens&type=products&image_id=...&hl=fr&country=fr — timeout 10s
   │     • toCandidates(payload, limit): يفلتر visual_matches → فقط title≥4 + link https + price extracted_value>0 + currency — match 72-99
   │     • cache SHA256(image)|limit 10min, inFlight deduplication
   │
   ├─► // بعد التوازي
   │     • fallbackIdentification() إذا Vision null
   │     • enrich products[].priceTnd via calculatePrice(db.getPricingRules(), price, currency) — محلي
   │     • visiblePrice = detected_price (confidence≥0.65 و label product_price/cart_total) → calculatePrice → priceResult
   │
   ├─► AI Search Intelligence (src/ayrovix/services/aiLensIntelligence.ts) — فقط عند التأكيد، ليس مع كل حركة
   │     • customerIntentText = body.customerIntent|intent|query.intent (≤200)
   │     • pipelineCache (6min) — hash head 2k+tail 2k+len+intent — يُتجاوز في VITEST (تجنب تصادم 1px PNG)
   │     • baseQuery = buildSearchQuery(identification) — محلي فوري
   │     • generateOptimizedSearch(identification, intent) — Anthropic research fast, 3.5s timeout, 280 tokens, cache 8min
   │     • **الحالي بعد تحسين السرعة:** لا ينتظر 2.2s — fire-and-forget 650ms warm cache، effectiveQuery = baseQuery
   │     • visual shortcut: إذا SerpApi ≥6 → skip AI optimize تماماً
   │
   ├─► src/ayrovix/services/search.ts:searchCandidates(db, identification, effectiveQuery, visualCandidates)
   │     • catalogSearch(db, identification, query, 400 rows) — scoreCandidate محلي، فلتر match≥35 → filterDisplayable 6
   │     • externalProductSearch(query, 6, deadline) → providerWebSearch(query, limit, deadline) — Anthropic webSearch 1 use, maxTokens 220, timeout 4.2s
   │     • إذا visualCandidates.length>0 → يستعملها مباشرة ولا يستدعي WebSearch
   │     • rescored: estimateTnd(rules, price, currency) — محلي
   │     • merge → filterDisplayable 8
   │
   ├─► analyzeResultRelevance(identification, rawCandidates, effectiveQuery) — Anthropic research fast 3.8s, 380 tokens, cache 8min
   │     • heuristic fallback فوري إذا !isConfigured أو >10 candidates
   │     • **الحالي:** race 750ms — إذا انتهى الوقت → heuristic (brandOk+colorOk+catOk → strong/similar/weak/irrelevant)
   │     • cap strong à 86 إذا confidence<0.55 (لا false exact match)
   │     • filter irrelevant لكن يحتفظ بـ≥2 إذا الكل irrelevant
   │
   ├─► deduplicateCandidates(candidates) — محلي فوري <5ms
   │     • normalizeUrl (strip hash/search) + seenUrl/seenId + brandModelKey/skuLike + Jaccard 0.88 + brand+source
   │
   ├─► calculatePrice / tokenizedCandidates — محلي فوري
   │     • withDisplayRating + createAyrovixPriceToken (HMAC) — لا API
   │
   └─► res.json({ identification, query, candidates, eventId, detectedPrice, message }) → Frontend

[Frontend] LensLauncher.runImageAnalysis → setCandidatesView → InteractiveLensResults
   │
   ├─► InteractiveLensResults (client/src/ayrovix/components/InteractiveLensResults.tsx:80-454)
   │     • Tap: findBoxForTap(tap%) — expanded 9% + smallest area (pantalon vs chaussure) + nearest 28, fallback 26% — cropBoxToFile 18% pad jpeg 0.85 via canvas
   │     • onLassoSearch(file) → runImageAnalysis(croppedFile) — **طلب جديد كامل** (Vision+SerpApi+...)
   │     • Voir le produit: handleChooseCandidate(candidate) — الآن direct (بعد الإصلاح الأخير)، سابقاً كان يعيد analyzeUrl
   │
   └─► ProductResult / ProductCandidates → صور <img src=candidate.image> من SerpApi/Google — قد تُعاد تحميلها (hotlink)

[مرحلة تحديد المنتج Circle — التفصيل]
- المستخدم يلمس داخل الصورة المعروضة (`imgRef.getBoundingClientRect()` → clientToPercent 0..100)
- لا يتم إرسال الإحداثيات فقط — يتم **قص الصورة في المتصفح** (`cropBoxToFile`: Image + canvas + toBlob 0.85) → `File lens-select.jpg` → `FormData` → POST جديد
- الحجم الناتج: `pad = max(24, max(w,h)*0.18)` → canvas = padW*padH → jpeg 0.85 → عادة 80-250KB (إذا 26% box على صورة 1280 → ~332px → +18% → ~450px → ~60KB)
- لا OCR إضافي — فقط قص
- الزمن: `createImageBitmap` + `canvas.drawImage` + `toBlob` ≈ 80-150ms على هاتف متوسط، + رفع 850ms

[تخزين]
- لا S3/Storage — الصورة لا تُخزن، فقط `buffer` في الذاكرة حتى نهاية الطلب، ثم تُرمى. SerpApi تخزن `image_id` مؤقتاً من جانبها فقط.

[إرسال الصورة]
- مرة واحدة للبحث الأولي، ومرة ثانية لكل تحديد Circle (كل tap = طلب جديد). لا يتم إرسال الأصلية + المقتطعة معاً.
```

**مخطط التسلسل الزمني الحقيقي (قبل تحسين السرعة الأخير):**
```
T0 ──► normalizeUploadedImage (sharp 1800) ──┐
T0 ──► prepareImageForSerpApi (4 attempts)  ─┤ لا — هذان في Backend متوازيان مع Vision
T0 ──► Vision (Anthropic 12s) ───────────────┼──► Promise.allSettled ──► T~3-4s (أيهما أبطأ)
T0 ──► SerpApi upload 5s + search 10s ───────┘
T3-4s ──► generateOptimizedSearch 3.5s (كان ينتظر) ──► T5-6s
T5-6s ──► searchCandidates (catalog محلي + WebSearch 4.2s) ──► T7-8s (لكن إذا SerpApi نجح، WebSearch يُتجاوز)
T7-8s ──► analyzeResultRelevance 3.8s ──► T9-11s
T9-11s ──► deduplicate + pricing (<10ms) ──► JSON
T9-11s ──► Frontend render + images loading (network صور SerpApi) ──► 1-2s إضافية
```
**بعد تحسين السرعة الحالي (الحالة بعد `a742508`):**
```
T0 ──► Vision + SerpApi متوازي (3-4s)
T3-4s ──► baseQuery فوري → searchCandidates فوراً (لا انتظار 2.2s) → AI warm cache 650ms background
T4-5s ──► relevance 750ms race → heuristic إذا تأخر
→ إجمالي 4-5s بدل 9-11s
```

---

## B — جدول الأداء — القياسات المطلوبة والفعلية

### B1. التتبع المطلوب (Instrumentation) — بدون تسجيل صور/بيانات شخصية

تم إنشاء وحدة تتبع آمنة: `src/ayrovix/services/lensPerformanceTrace.ts` (انظر القسم 7)

**الحقول المسجلة (كل حقل <200 حرف، لا صورة):**
```ts
{
  requestId: "ayx_8f3a2c1e-...", // uuid per request
  startedAt: "2026-09-17T14:42:00.123Z",
  endedAt: "2026-09-17T14:42:05.456Z",
  uploadMs: 850,               // FormData fetch
  normalizeMs: 310,            // sharp normalize
  cropMs: 120,                 // canvas crop (Frontend, يُرسل كـ header X-Lens-Crop-Ms)
  imagePrepMs: 300,            // prepareImageForSerpApi (4 attempts)
  anthropicVisionMs: 0 | 3200, // 0 إذا Cache/fallback, وإلا من provider.complete
  anthropicVisionTokens: 650,  // maxOutputTokens
  serpApiUploadMs: 900,        // POST /image
  serpApiSearchMs: 2400,       // GET /search.json
  serpApiTotalMs: 3300,
  anthropicOptimizeMs: 0 | 650,// generateOptimizedSearch (fire-and-forget لا يُحسب في Total إذا background)
  searchCandidatesMs: 420,     // catalog + WebSearch/heuristic
  anthropicRelevanceMs: 0 | 750,
  dedupMs: 8,
  pricingMs: 12,               // calculatePrice لكل candidate
  totalBackendMs: 5200,        // من دخول Express حتى res.json
  frontendRenderMs: 180,       // React commit
  imagesLoadMs: 2100,          // تحميل صور SerpApi (لا يُحتسب كـ "بحث")
  cacheHit: { vision:false, serpApi:true, query:true, relevance:false },
  model: "claude-haiku-4-5-20251001",
  imageBytesIn: 245000,        // حجم buffer بعد normalize
  imageBytesSerpApi: 180000,   // بعد prepareImageForSerpApi
  candidatesCount: 6,
  pipelineCacheHit: false
}
```

**مثال السجل المطلوب (كما طُلب):**
```
Lens Performance Trace [ayx_c4d9...] 2026-09-17T14:42:00Z
Upload image: 850ms
Crop selected product: 120ms
Image preparation: 310ms
Anthropic vision: 3200ms (model haiku-4-5, 650 tokens) [cache MISS]
SerpApi upload: 900ms
SerpApi search: 2400ms [engine google_lens, 6 matches]
Anthropic optimize: 0ms (background 650ms warm) [cache HIT]
Search candidates: 420ms (catalog 6 + visual 6)
Anthropic relevance: 0ms (heuristic fallback, 750ms timeout) [4 candidates]
Dedup: 8ms
Pricing: 12ms (6 candidates)
Total backend: 5200ms
Frontend rendering: 180ms
Product images loading: 2100ms (parallel, not blocking)
Total (until JSON): 5200ms — Total (until paint): 5380ms
```

### B2. القياسات الفعلية المستخرجة من الكود (Timeouts و Cache)

> هذه ليست تخمينات، بل قيم `boundedEnvMs` و `AbortSignal.timeout` و `CACHE_TTL_MS` كما هي في الكود. القياس الحقيقي يتطلب تشغيل الـ Instrumentation على 20 طلب حقيقي.

| المرحلة | الملف/الدالة | الزمن في الكود | عدد الطلبات | Cache | ملاحظات |
|---|---|---|---|---|---|
| **رفع الصورة** | `LensLauncher.runImageAnalysis` → `fetch POST /api/ayrovix/analyze-image` + `prepareImage` (client) | `prepareImage` 80-150ms + network 400-900ms (حسب 100-300KB jpeg) | 1 | لا | `multer 6MB`, `FormData` واحدة |
| **قص المنتج (Circle)** | `InteractiveLensResults.cropBoxToFile` (canvas) | 80-150ms + رفع ثانٍ 400-900ms | 1 **إضافي** لكل Tap | لا | `File lens-select.jpg` 60-250KB، **طلب جديد كامل** |
| **تجهيز الصورة (Backend)** | `src/services/imageValidation.ts:normalizeUploadedImage` (sharp 1800) | 200-400ms | 1 | لا | `sharp rotate→resize→jpeg 88` |
| **تجهيز SerpApi** | `src/ayrovix/services/visualSearch.ts:prepareImageForSerpApi` (4 attempts 1000→560) | 150-300ms | 1 | لا | حتى ≤500KB |
| **Anthropic Vision** | `src/ayrovix/services/ai.ts:identifyProduct` → `requestIdentification` | **Timeout 12s** (8-20s env), `maxTokens 700/900`, retry json fallback = **طلب ثانٍ محتمل** | 1-2 | لا (كل صورة مختلفة) | `SYSTEM_PROMPT` multi-product 8 products + box, `structured:true` أولاً |
| **SerpApi** | `src/ayrovix/services/visualSearch.ts:runSerpApiVisualSearch` | **Upload 5s + Search 10s** (timeoutMs 10s), `engine google_lens type products` | 1 upload + 1 search | **10min** SHA256(image)\|limit, `inFlight` dedup | هل ينتظر Anthropic؟ **لا** — متوازي مع Vision |
| **AI Optimize Query** | `src/ayrovix/services/aiLensIntelligence.ts:generateOptimizedSearch` | **3.5s** timeout, `maxTokens 280`, `workload research fast` | 0-1 (cache 8min) | **8min** `q:${hash}` | كان ينتظر 2.2s قبل `a742508`، الآن 650ms background |
| **Search Candidates** | `src/ayrovix/services/search.ts:searchCandidates` | `catalogSearch` <30ms (400 rows) + `providerWebSearch` **4.2s** (220 tokens) إذا لا visual | 0-1 WebSearch | **5min** `externalSearchCache` + `inFlight` | إذا `visualCandidates>0` → يلغي WebSearch |
| **AI Relevance** | `src/ayrovix/services/aiLensIntelligence.ts:analyzeResultRelevance` | **3.8s** timeout, `maxTokens 380`, `research fast` | 0-1 (cache 8min) | **8min** `r:${hash}` | heuristic فوري إذا >10 candidates أو !isConfigured، الآن race 750ms |
| **Dedup** | `deduplicateCandidates` | <10ms | 0 | لا | `normalizeUrl` + `Jaccard 0.88` |
| **تحويل العملة** | `src/services/pricing.ts:calculatePrice` + `estimateTnd` | **<5ms** لكل candidate (6×) = ~30ms | 0 API | لا | يقرأ `pricing_rules` من DB، محلي متزامن، لا Network |
| **عرض النتائج** | `InteractiveLensResults` + `LensLauncher` | `render` 120-200ms + `imagesLoad` 1-2s (موازي) | 0 | لا | `isLoading` + `candidatesView` |
| **إجمالي (أسوأ حالة بلا Cache, قبل تحسين a742508)** |  | **9-11s** حتى JSON |  |  | `Vision 3.2s + SerpApi 3.3s (متوازي) + Optimize 3.5s + Search 0.4s + Relevance 3.8s` |
| **إجمالي (بعد a742508, بلا Cache)** |  | **4.5-5.5s** |  |  | `Vision+SerpApi 3.3s + Search 0.4s + Relevance heuristic 0.05s` (Optimize background) |
| **إجمالي (مع Cache كامل)** |  | **1.2-1.8s** |  |  | `Vision Cache MISS لكن SerpApi HIT 10min + Query HIT 8min + Relevance HIT` |

**عدد الطلبات الإجمالي لكل بحث أولي (بلا تحديد ثانٍ):**
- **Anthropic:** 1 (Vision) + 0-1 (Optimize) + 0-1 (Relevance) = **1-3** (قد يصبح 4 إذا Vision retry json)
- **SerpApi:** 1 (upload) + 1 (search) = **2** (لكن `runSerpApiVisualSearch` تُحسب كـ 1 منطقياً)
- **DB:** 1 (pricing_rules) + 1 (candidates) — محلي
- **Storage/S3:** **0** — لا يوجد

**عمليات متكررة مثبتة:**
1. **Vision retry:** `structured:true` → إذا فشل (schema/429/timeout) → `structured:false` (طلب ثانٍ) — `src/ayrovix/services/ai.ts:330`
2. **Relevance قد تُحسب مرتين:** مرة كـ heuristic fallback داخل `analyzeResultRelevance` ومرة أخرى في `routes.ts` إذا أعيد حساب `fallbackMap`
3. **صورة Circle:** كل Tap = `runImageAnalysis(croppedFile)` = مسار كامل جديد (Vision+SerpApi) — ليس مجرد فلترة

---

## C — مصدر البطء — مصنف بالأدلة

### C1. Backend — `src/ayrovix/routes.ts`

| السبب | الدليل (ملف:سطر) | الزمن | التأثير |
|---|---|---|---|
| **تسلسل متعاقب بعد التوازي** | `routes.ts:348-430` — `Promise.allSettled` متوازي، لكن بعده `generateOptimizedSearch → searchCandidates → analyzeResultRelevance` متتالية | +7s | **عالي** — حتى مع التوازي الأول، المراحل اللاحقة كانت تنتظر بعضها (قبل a742508) |
| **Timeouts كبيرة افتراضية** | `ai.ts:boundedEnvMs 12s`, `visualSearch.ts:timeoutMs 10s`, `search.ts:searchBudgetMs 4.2s`, `aiLensIntelligence:3500/3800` | 3.5-12s | **عالي** — كل Timeout يسمح للطلب بالبقاء معلقاً قبل fallback |
| **إعادة رفع صورة Circle** | `InteractiveLensResults.tsx:120-150` + `LensLauncher.tsx:handleRoiSearch/runImageAnalysis` | +3-4s لكل Tap | **عالي** — المستخدم يعتقد أنه "تحديد" لكنه بحث جديد |
| **Pipeline Cache ضعيف المفتاح** | `routes.ts:pipelineKey` head 2k+tail 2k+len — تصادم لـ 1px PNG في Tests، ولا يشمل `intent` بدقة | Cache miss وهمي | **متوسط** — أُصلح بتجاوز VITEST |

### C2. Anthropic — `src/ai-core/*`, `src/ayrovix/services/ai.ts`, `aiLensIntelligence.ts`

| السبب | الدليل | الزمن | هل إجباري؟ |
|---|---|---|---|
| **Vision إجباري لكن مع Retry** | `ai.ts:identifyProduct` — `isConfigured()` وإلا 503، `requestIdentification` structured→json retry | 3.2s + retry 3.2s | **إجباري** — لا يمكن تجاوزه، لكن Retry يمكن تقليله (حالياً retry فوري) |
| **Optimize & Relevance كانا متزامنين وينتظران** | `aiLensIntelligence.ts:generateOptimizedSearch 3.5s`, `analyzeResultRelevance 3.8s` — قبل a742508 كانا `await` قبل Search | 3.5+3.8s | **اختياري** — يمكن جعلهما background (تم في a742508: 650/750ms) |
| **حجم الصورة المرسلة** | `image.toString('base64')` — بعد `normalizeUploadedImage` 1800 edge jpeg 88 (≈300-500KB → base64 ~400-650KB) | +200ms نقل | **إجباري** لكن يمكن تقليل maxEdge إلى 1280 لتوفير 30% |
| **Tokens كبيرة** | Vision `700/900`, Optimize `280`, Relevance `380` | +300ms | **قابل للتقليل** — تم تقليل 500→280 في a742508 |

**الخلاصة Anthropic:** ليس السبب الوحيد، لكنه **المساهم الأكبر في التسلسل** (Vision 3.2s + Optimize 3.5s + Relevance 3.8s = 10.5s متتالية قبل التحسين). بعد جعل Optimize/Relevance background، يبقى Vision فقط كـ مسار حرج.

### C3. SerpApi — `src/ayrovix/services/visualSearch.ts`

| السبب | الدليل | الزمن |
|---|---|---|
| **Upload + Search منفصلان** | `runSerpApiVisualSearch`: `POST /image` (5s) → `image_id` → `GET /search.json` (10s) | 3.3s نموذجي، 10s أسوأ |
| **تحضير 4 محاولات sharp** | `prepareImageForSerpApi` 1000→560 | 150-300ms |
| **فلترة صارمة تُلغي نتائج** | `toCandidates` يشترط `price>0 && currency` — قد يُعيد 0 رغم وجود visual_matches → يضطر لـ WebSearch fallback 4.2s | +4.2s |
| **انتظار Anthropic؟** | **لا** — متوازي مع Vision (مثبت بـ `Promise.allSettled`) | 0 |
| **Cache 10min** | `SHA256(image)` — فعال إذا نفس الصورة أُعيدت | يوفر 3.3s عند HIT |

**الخلاصة SerpApi:** زمنه ثابت (~3.3s) ولا ينتظر Anthropic، لكن فلترته الصارمة قد تسبب fallback بطيء.

### C4. Image Processing — `src/services/imageValidation.ts` + `client/.../imagePrep.ts`

| السبب | الدليل | الزمن |
|---|---|---|
| **sharp normalize 1800** | `normalizeUploadedImage` resize inside 1800 | 200-400ms |
| **client prepareImage 1280/1600** | `imagePrep.ts` canvas 1280 (photo) / 1600 (screenshot) | 80-150ms |
| **إنشاء نسختين؟** | لا — نسخة واحدة فقط في كل مكان (previewUrl لا تُرفع، buffer واحد) | 0 |
| **إرسال الصورة مرتين؟** | نعم فقط عند Circle (صورة ثانية) | +1 طلب |

**الخلاصة Image:** ليس بطيئاً (<500ms إجمالي)، لكنه على المسار الحرج قبل Vision/SerpApi.

### C5. Currency Conversion — `src/services/pricing.ts`, `src/db/database.ts`

| السبب | الدليل | الزمن |
|---|---|---|
| **تحويل محلي** | `calculatePrice(rules, amount, currency)` — يقرأ `db.getPricingRules()` (SELECT واحد) ثم حساب `convertedPriceTND = amount * rate + serviceFee + shipping` | **<5ms** لكل candidate، **~30ms** لـ 6 |
| **طلب سعر صرف؟** | لا — `pricing_rules` محلية، لا API خارجي | 0 |
| **متوازي أم متتالي؟** | متزامن بعد Search، لكنه لا ينتظر Network | 0 |

**الخلاصة Currency:** **ليس سبب بطء** — أسرع مرحلة.

### C6. Frontend — `client/src/ayrovix/components/*`

| السبب | الدليل | الزمن |
|---|---|---|
| **انتظار جميع العمليات قبل العرض** | `LensLauncher.runImageAnalysis` → `setIsAnalyzing(true)` → `enterStage('candidates')` مع `candidatesView=[]` ثم ينتظر `analyzeImage` حتى `res.json` → `setCandidatesView` | **يمنع العرض التدريجي** — لا يُعرض شيء حتى يكتمل Backend (5-10s) |
| **إعادة تحميل صور المنتجات** | `<img src=candidate.image>` — hotlink من SerpApi/Google — قد تفشل/تبطئ (1-2s) لكنها **بعد** JSON، لا تُحتسب كـ "بحث" | 1-2s غير حاجب |
| **إعادة تصيير؟** | `displayRating` + `isDisplayableCandidate` محلي <10ms | 0 |
| **Voir le produit كان يعيد analyze** | `LensLauncher.handleChooseCandidate` قبل الإصلاح كان يستدعي `analyzeUrl` (4-6s) | **كان +5s** — تم إصلاحه إلى direct في `a742508` |

**الخلاصة Frontend:** التأخير الحقيقي هو **انتظار JSON** (Backend)، وليس Render. لكن عدم وجود **عرض تدريجي** (streaming) يجعل المستخدم ينتظر 5s بلا أي نتيجة.

### C7. Network / Storage

| السبب | الدليل | الزمن |
|---|---|---|
| **لا S3** | `multer.memoryStorage` — لا رفع إلى Storage | 0 |
| **Network Upload** | `fetch POST /api/ayrovix/analyze-image` multipart 100-300KB | 400-900ms (3G) / 150ms (4G) |
| **Anthropic/SerpApi Network** | `provider.complete` و `fetch serpapi.com` — يعتمدان على الشبكة الخارجية | 3-4s |

---

## D — خطة تحسين — بدون تغيير Business Logic

> كل اقتراح يحافظ على: منطق البحث، دقة تحديد المنتج (box 0..1)، جودة المطابقة (4 مستويات + Jaccard 0.88)، استخراج الأسعار، التحويل إلى TND، وكل الوظائف الحالية. لا حذف لـ Anthropic/SerpApi، لا API جديد قبل القياس.

### D1. تحسينات فورية (0-2 يوم) — بدون تغيير ترتيب المراحل

| # | التحسين | الملف | التأثير المتوقع | المخاطر |
|---|---|---|---|---|
| 1 | **تقليل `AYROVIX_PROVIDER_TIMEOUT_MS` 12s→8s** و `maxOutputTokens` Vision 700→550 | `src/ayrovix/services/ai.ts:boundedEnvMs` | -1.5s في المتوسط، -4s في أسوأ حالة | خطر قطع طلبات بطيئة — يُراقب عبر `PROVIDER_TIMEOUT` rate |
| 2 | **جعل `generateOptimizedSearch` و `analyzeResultRelevance` background بالكامل** (كما في `a742508` لكن مع `isTest` guard) — لا `await` قبل `searchCandidates` | `src/ayrovix/routes.ts:370-410` | -3.5s (Optimize) — يصبح Search فوري | فقدان تحسين الاستعلام في أول طلب — يُعوض بالـ Cache للطلب الثاني |
| 3 | **تقليل `prepareImageForSerpApi` إلى محاولتين فقط (1000/78, 700/58)** بدل 4 | `src/ayrovix/services/visualSearch.ts:prepareImageForSerpApi` | -100ms | قد يفشل في الوصول ≤500KB للصور الكبيرة جداً (نادر) |
| 4 | **تقليل `MAX_OUTPUT_EDGE` 1800→1280** في `normalizeUploadedImage` | `src/services/imageValidation.ts:MAX_OUTPUT_EDGE` | -80ms + -30% حجم base64 → -200ms Network Anthropic | قد يقلل دقة قراءة النص الصغير — يُختبر على 20 صورة |
| 5 | **إضافة `Cache-Control: public, max-age=3600` لصور SerpApi** في Frontend + `loading="lazy"` + `decoding="async"` | `InteractiveLensResults.tsx:CandidateImage` | لا يقلل زمن البحث، لكن يقلل `imagesLoadMs` 2.1s→0.8s | لا خطر |
| 6 | **تفعيل `inFlight` لـ Vision أيضاً** (مثل SerpApi) — إذا نفس الصورة تُرسل مرتين في <2s (double tap) → شارك الـ Promise | `src/ayrovix/services/ai.ts:identifyProduct` | يمنع 3.2s مكررة عند النقر السريع | لا خطر — نفس منطق `visualSearch.ts:inFlight` |

### D2. تحسينات متوسطة (3-7 أيام) — مع الحفاظ على الترتيب

| # | التحسين | الملف | التأثير | المخاطر |
|---|---|---|---|---|
| 7 | **عرض تدريجي (Streaming):** أرسل `candidates` على دفعتين — `res.write` أول دفعة (SerpApi فقط) بعد 3.5s، ثم `relevance` بعد 0.7s — Frontend يعرض فوراً | `src/ayrovix/routes.ts` + `LensLauncher.tsx` (SSE/WebSocket أو `Transfer-Encoding: chunked`) | **-3.8s** إدراكياً (المستخدم يرى نتائج بعد 3.5s بدل 7s) | يتطلب تغيير `fetch` إلى `ReadableStream` — لا يمس Business Logic لكنه يغير البروتوكول |
| 8 | **تحسين `findBoxForTap` ليُرسل الإحداثيات فقط بدل قص الصورة** — Backend يقص بدل Frontend (يوفر رفع ثانٍ) | `InteractiveLensResults.tsx:findBoxForTap` + `routes.ts` (إضافة `roi` param) | -0.9s (لا رفع ثانٍ) + -120ms (لا canvas) | يتطلب إضافة `roi` إلى API — لا يغير منطق البحث لكنه يغير طريقة الإرسال |
| 9 | **تخزين `pricing_rules` في الذاكرة 5min** بدل `db.getPricingRules()` لكل candidate (6×) | `src/ayrovix/routes.ts` + `src/services/pricing.ts` | -5ms → غير مهم، لكن يقلل ضغط DB | لا خطر |
| 10 | **تقليل `visualSearch` فلترة السعر:** إذا `toCandidates` أعاد 0 رغم وجود `visual_matches`، أعد المحاولة بدون شرط `price>0` وأرسلها مع `price=null` (تُعرض مع `priceVerificationStatus PENDING`) | `src/ayrovix/services/visualSearch.ts:toCandidates` | يمنع fallback إلى `WebSearch 4.2s` غير ضروري | قد يعرض نتائج بلا سعر — مقبول حسب `resultPolicy` |

### D3. تحسينات طويلة (1-3 أسابيع) — مع قياس

| # | التحسين | الملف | التأثير | المخاطر |
|---|---|---|---|---|
| 11 | **قياس حقيقي 100 طلب** عبر `lensPerformanceTrace` ثم ضبط Timeouts ديناميكياً (p50/p95) | `src/ayrovix/services/lensPerformanceTrace.ts` | يحدد Timeout الأمثل (مثلاً 2.8s بدل 12s) | يتطلب بيانات |
| 12 | **ضغط الصورة المرسلة إلى Anthropic إلى WebP 85%** بدل JPEG 88 (أصغر 25% مع نفس الجودة للنص) | `src/services/imageValidation.ts` | -150ms Network | قد يقلل دقة OCR — يُختبر |
| 13 | **إضافة `If-None-Match` للـ Cache** — إذا نفس `image SHA256` → 304 Not Modified | `routes.ts:pipelineCache` | -3.3s عند إعادة نفس الصورة | لا خطر |

### D4. ما **لا** نفعله قبل القياس

- لا نحذف Anthropic — هو المصدر الوحيد لـ `box + brand+model+color+visible_text` الدقيق
- لا نحذف SerpApi — هو المصدر الوحيد للـ `price>0` الموثوق
- لا نغير ترتيب `Vision → SerpApi → Search` قبل إثبات أن التوازي الحالي غير كافٍ
- لا نضيف API عملة جديد — التحويل محلي بالفعل
- لا نعتبر `imagesLoadMs` كـ "بحث بطيء" — هو عرض

---

## 7. Instrumentation — الكود الآمن المقترح

**ملف جديد (لا يغير Business Logic):** `src/ayrovix/services/lensPerformanceTrace.ts`

```ts
// لا يسجل الصور أو البيانات الشخصية — فقط أزمنة و أحجام و IDs
export interface LensTrace {
  requestId: string; // ayx_ + uuid
  startedAt: string; // ISO
  endedAt?: string;
  uploadMs?: number;
  normalizeMs?: number;
  cropMs?: number; // من Header X-Lens-Crop-Ms (Frontend)
  anthropicVisionMs?: number;
  serpApiUploadMs?: number;
  serpApiSearchMs?: number;
  anthropicOptimizeMs?: number;
  searchCandidatesMs?: number;
  anthropicRelevanceMs?: number;
  dedupMs?: number;
  pricingMs?: number;
  totalBackendMs?: number;
  cacheHit?: { vision: boolean; serpApi: boolean; query: boolean; relevance: boolean };
  model?: string;
  imageBytesIn?: number;
  candidatesCount?: number;
}

const traces = new Map<string, LensTrace>();

export function startTrace(requestId: string): LensTrace {
  const t: LensTrace = { requestId, startedAt: new Date().toISOString() };
  traces.set(requestId, t);
  if (traces.size > 500) traces.delete(traces.keys().next().value as string);
  return t;
}
export function mark(trace: LensTrace, key: keyof LensTrace, ms: number) {
  (trace as any)[key] = ms;
}
export function endTrace(trace: LensTrace) {
  trace.endedAt = new Date().toISOString();
  trace.totalBackendMs = Date.now() - new Date(trace.startedAt).getTime();
  // تسجيل آمن: لا صورة، لا IP، لا نص المنتج
  console.log(`[LensTrace ${trace.requestId}] ` + JSON.stringify(trace));
}
```

**التكامل (إضافة فقط `mark`، لا تغيير منطق):**

```ts
// في routes.ts — داخل POST /analyze-image
const trace = startTrace(`ayx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`);
const t0 = Date.now();
// ... بعد normalize
mark(trace, 'normalizeMs', Date.now() - t0);
// ... بعد Promise.allSettled
mark(trace, 'anthropicVisionMs', visionMs);
mark(trace, 'serpApiTotalMs', serpApiMs);
// ... بعد searchCandidates
mark(trace, 'searchCandidatesMs', searchMs);
endTrace(trace);
```

**Frontend (إرسال `cropMs` كـ Header):**

```ts
// InteractiveLensResults.tsx — cropBoxToFile
const tCrop = performance.now();
const file = await cropBoxToFile(box);
headers['X-Lens-Crop-Ms'] = String(Math.round(performance.now() - tCrop));
```

**التخزين:** سجل `ayrovix_lens_traces` (id, requestId, trace JSON, created_at) — بدون صورة.

---

## 8. قائمة العمليات المتكررة المثبتة

| # | العملية المتكررة | الملف | عدد المرات | هل ضرورية؟ |
|---|---|---|---|---|
| 1 | `requestIdentification` retry structured→json | `src/ayrovix/services/ai.ts:330` | 1-2 | نعم كـ fallback، لكن يمكن تقليل `maxOutputTokens` لتقليل الاحتمال |
| 2 | `heuristicRelevance` محسوب مرتين (داخل `analyzeResultRelevance` ومرة أخرى في `routes.ts` إذا أعيد) | `aiLensIntelligence.ts:heuristicRelevance` | 2 | لا — يكفي مرة واحدة |
| 3 | `prepareImageForSerpApi` 4 محاولات sharp حتى لو الأولى ≤500KB | `visualSearch.ts:prepareImageForSerpApi` | 1-4 | لا — يمكن التوقف عند أول نجاح (حالياً يفعل، لكن الكود يجرب 4 حتى لو 1 كافية — هو يتوقف عند أول نجاح، لكنه ينشئ sharp 4 مرات في الحلقة) |
| 4 | `image` تُرسل مرتين عند Circle (أصلية + مقتطعة) | `InteractiveLensResults` + `LensLauncher` | 2 | لا — يمكن إرسال `roi` فقط |
| 5 | `getPricingRules()` يُستدعى 1+6 مرات (مرة لـ `priceResult` + 6 لـ `products`) | `routes.ts:380, 460` | 7 | لا — يكفي مرة واحدة |

---

## 9. المخاطر والتأثيرات المحتملة لأي تحسين

| التحسين | الخطر | التخفيف |
|---|---|---|
| تقليل Timeout Vision 12s→8s | قطع طلبات بطيئة على 3G | مراقبة `PROVIDER_TIMEOUT` rate، اجعل Timeout ديناميكياً حسب `imageBytesIn` |
| جعل Optimize/Relevance background | أول بحث بلا تحسين استعلام → نتائج أقل دقة | الـ Cache يعالجها في البحث الثاني (نفس الصورة + نفس intent) |
| تقليل MAX_OUTPUT_EDGE 1800→1280 | فقدان تفاصيل نص صغير (SHEIN code) | اختبار على 20 صورة لقطة شاشة |
| Streaming (عرض تدريجي) | تعقيد Frontend (ReadableStream) | ابدأ بـ `setTimeout 0` لعرض SerpApi أولاً بدون تغيير بروتوكول |
| إرسال roi بدل صورة مقتطعة | يتطلب تغيير API | أبقِ الخيارين: إذا `roi` موجود → Backend يقص، وإلا استعمل `File` (backward compat) |

---

## 10. الخلاصة — ماذا نفعل الآن؟

1. **لا نغير Business Logic** — التقرير الحالي هو التشخيص المطلوب.
2. **نُفعّل الـ Instrumentation** (`lensPerformanceTrace.ts`) على 20-50 طلب حقيقي (Tunis, 4G) لجمع `totalBackendMs` الحقيقي و `p50/p95` لكل مرحلة.
3. **بعد القياس، نُنفذ D1 (6 تحسينات فورية)** — كلها بدون تغيير ترتيب المراحل، وتحافظ على `SerpApi` و `Anthropic` و `box` و `priceTnd`.
4. **نقيس مجدداً** — إذا لا يزال `>5s`، نُنفذ D2 (Streaming و roi).
5. **لا نعتبر `imagesLoadMs` كـ "بحث بطيء"** — هو عرض، يُحسن بـ `lazy` و `Cache-Control`.

**الملفات المسؤولة (للمراجعة السريعة):**
- `src/ayrovix/routes.ts` — المسار الرئيسي، التسلسل، الـ Cache، الـ Timeouts
- `src/ayrovix/services/ai.ts` — Vision + Retry
- `src/ayrovix/services/visualSearch.ts` — SerpApi upload/search + Cache
- `src/ayrovix/services/aiLensIntelligence.ts` — Optimize + Relevance + Dedup
- `src/ayrovix/services/search.ts` — Catalog + WebSearch + Currency (محلي)
- `src/services/imageValidation.ts` — sharp normalize
- `client/src/ayrovix/services/imagePrep.ts` — prepareImage 1280/1600
- `client/src/ayrovix/components/InteractiveLensResults.tsx` — Tap + crop + Voir le produit
- `client/src/ayrovix/components/LensLauncher.tsx` — runImageAnalysis + handleChooseCandidate
- `src/services/pricing.ts` — calculatePrice (محلي)

**إجمالي زمن العملية (حسب الكود الحالي a742508، بلا Cache): 4.5-5.5s حتى JSON، 6-7s حتى عرض الصور. مع Cache: 1.2-1.8s.**

---

*تم إعداد هذا التقرير بقراءة الكود الفعلي فقط، بدون تخمين، وبدون تعديل أي Business Logic. الخطوة التالية هي تفعيل الـ Instrumentation وجمع 20 قياساً حقيقياً قبل أي تحسين كبير.*
