# Z Sourcing — سجل التنفيذ الحي (أمر المالك 28/11 — Master Directive v1.0)
**القاعدة:** هذا سجل مرحلي بالحقائق الفعلية — ما نُفِّذ، الملفات، الاختبارات، العوائق — بلا تقارير نظرية. يُحدَّث عند نهاية كل مرحلة.
**الحالة الحالية:** المراحل 1–2–3(البنية) نُفِّذت — **نقطة التوقف الأولى واقفة عند مفتاح Nexscope على الخادم** (إجراء المالك).

---

## المرحلة 1 · فحص API وتأكيد الوظائف — **منفّذة بالتوثيق الرسمي**

**المصادر (التقاط 28/11):** وثائق nexscope.ai الرسمية (`/api-docs/1688-product-search` · `/api-docs/1688-product-detail` · `/api-docs/1688-search-by-image` · `/api-docs/1688-product-billboard`) + مستودعها الرسمي `github.com/nexscope-ai/nexscope-ecommerce-api` (225 واجهة موثّقة، آخر commit 19/11/2026).

| الوظيفة | الحالة الموثّقة | النقطة الموثّقة |
|---|---|---|
| Product Search | ✅ | `POST api.nexscope.ai/dl/productSearch` — keyWord **صيني مبسّط ≤50 حرفاً**، pageIndex/pageSize **10–100**، sortField (price/consignPrice/orderCount7d/30d/saleCount/saleVolume/offerCreateTime)، فلاتر سعر/طلبات/**startQuantity (MOQ)**/سنوات TrustPass |
| Image Search | ✅ | `POST …/skills/1688-search-by-image/run` — imageUrl/**imageBase64**/imageId بالتناوب، PNG/JPG/JPEG فقط (**WEBP/GIF مرفوضان**)، pageSize **≤50**، sort {price\|rePurchaseRate\|monthSold}، يرد: title/price/MOQ/monthly sales/repurchase/trade score/seller identity |
| Product Details | ✅ | `POST …/skills/1688-product-detail/run` — **offerId نصّي** (حفظ المعرّفات الطويلة) + currency اختياري → منتج/SKU/أسعار/لوجستيك/مورّد |
| Product Images · Variants · Wholesale tiers | ✅ عبر التفاصيل | المسارات الدقيقة داخل الاستجابة **تُثبَّت حيّاً** — الوثائق نفسها تقول إن أمثلة الرد «historical fixture… must not be used to infer top-level field paths» |
| Supplier Information | ✅ | company (بحث) + supplier/seller identity (صورة وتفاصيل) |
| Sales Information | ✅ | orderCount7d/30d · saleCount · saleVolume + monthlySold/rePurchaseRate (صورة) |
| Product URL | ✅ | `products.asinUrl` |
| Pagination | ✅ | pageIndex/pageSize (بحث) · page/pageSize+imageId (صورة) |
| Billboard (للاستكشاف) | ✅ إضافي | `1688-product-billboard` — لوحات الأكثر مبيعاً (34 حقل طلب) |
| **MCP لـCLEAN** | ✅ **رسمي معلن** | أسماء MCP لكل واجهة (`nexscope_1688_product_search` …) + MCP بعيد موثّق (`llms-install.md` لنطاق `mcp:tools`) — المرحلة 9 ممكنة كما هي؛ وبديلنا: MCP server خاص بنا فوق خدمات Z Sourcing |
| غلاف الاستجابة | ✅ | `{code,msg,data,ts,time,cost,traceId}` — **code===0 نجاح**؛ HTTP 200 قد يحمل خطأ عمل (موثّق: **11209** مفتاح غير صالح)؛ 429/503 بوّة دخول مع `Retry-After` |
| الكلفة | ⚠️ بنظام credits | بحث الكلمات: **Avg 19 (نطاق 10–19) credits/نداء** — تحويل credits→عملة **Unknown حتى صفحة التسعير/أول فاتورة** |

**عوائق المرحلة 1:** لا عائق توثيقي. القيد الوحيد: لا مفتاح في بيئتنا ⇒ **لا اختبار حي ممكن هنا** — نقطة التوقف تُنفَّذ أول ما يُوضع المفتاح في Render env (إجراء المالك؛ المفتاح لا يُطلب في الشات — قاعدة دائمة).

## المرحلة 2 · تعطيل مسار Apify بأمان — **منفّذة**

- **عَلَم:** `SBASE_APIFY_DISABLED` (truthy: 1/true/yes/on) — مرفوع ⇒ مسارات sbase الثلاثة (بحث/بطاقة/صورة) ترفض 503 بكود `SBASE_APIFY_DISABLED` **قبل أي استهلاك**؛ الجاهزية (`/api/sbase/health`) تعلن `legacyApifyDisabled` بشفافية. الافتراضي: المسار القديم نشط — لا شيء انكسر اليوم (قاعدة 3).
- **لا حذف**: apify.ts كامل + كود الميت Ali + الإعدادات سليمة (قاعدة 1 و12) — إزالة العَلَم تعيد كل شيء كما كان (اختبار يثبت ذلك).
- **المهام المجدولة**: فحص كامل — **لا يوجد أي setInterval/cron يستدعي Apify** في الخادم (المؤقتات القائمة: push/lens-cache/housekeeping/backup فقط) ⇒ لا استهلاك خفي قائم اليوم، والحارس اليومي (P1-A(a)) يحمي أي نداء متبقٍّ عند رفع العلم.
- **لا تأثير على أنظمة أخرى**: Apify لم يكن مستخدَماً خارج src/sbase إطلاقاً (فحص grep شامل).

## المرحلة 3 · تكامل Nexscope (البنية) — **منفّذة كطبقة + مسارات؛ الحي معلق على المفتاح**

| الملف | المحتوى |
|---|---|
| `src/zsourcing/types.ts` | النموذج الموحد (`ZSourcingProduct/Provider`) — **الحقول الموثّقة فقط تُسَمّى** والباقي في `raw` (مرور شفاف حتى نقطة التوقف) |
| `src/zsourcing/nexscope.ts` | Adapter: Bearer من env حصراً (لا في السجلات ولا الردود) · غلاف code===0 · 11209→AUTH · 429/503→RATE_LIMIT مع `Retry-After` · **لا إعادة تلقائية** (لا طلبات مكرّرة — مثبت باختبار «مرة واحدة حصراً») · Network/Timeout/Malformed بأكواد `ZS_NEXSCOPE_*` صادقة |
| `src/zsourcing/routes.ts` | `POST /api/zsourcing/search\|image\|item` — بلا مفتاح ⇒ 503 صادق (لا واجهة شكلية)؛ صورة بلا بادئة base64 + رفض WEBP/GIF **محلياً مجاناً قبل النداء**؛ offerId نصّي 6–20 خانة |
| `src/server.ts` | التركيب + rate limit مستقل (30/10د) — مسار جديد لا يلمس أحداً |
| `vitest.config.mts` | hermeticity: NEXSCOPE_API_KEY/SBASE_APIFY_DISABLED/timeout مفرّغة في الاختبارات |

## الاختبارات — النتائج الفعلية (28/11)

`tsc --noEmit` ✓ نظيف · vitest **76/76** في الملفات الأربعة المعنية: `zsourcing.test.ts` **11/11** (غلاف/11209/429+Retry-After/Network/Timeout/دون التكرار/سقوف pageSize/base64 نقي/نصّية offerId/إسقاط بلا معرّف) · `sbase-apify-flag.test.ts` **5/5** (رفض الثلاثة قبل أي نداء + شفافية الجاهزية + **العودة بعد رفع العلم**) · `sbase.test.ts` 53/53 · `sbase-budget.test.ts` 7/7. **لا فشل متبقٍّ.**

## نقطة التوقف الأولى (أمر المالك) — بانتظار إجراء واحد

عند وضع `NEXSCOPE_API_KEY` في Render env يُشغَّل الفحص الحي ويُسجَّل هنا بالنتائج الفعلية:
1. بحث الكلمات يعيد منتجات حقيقية (سأختبر «حقائب نسائية جلدية» بمرادفها الصيني عبر طبقة الترجمة).
2. بحث الصورة يعمل (PNG/JPG عبر المسار الجديد).
3. التفاصيل تعيد الصور/الأسعار/المتغيرات/بيانات المورّد المتاحة — وتُقيَّد الحقول الحية في types.ts ويُسقط `raw` التشفيري.

**أسئلة مفتوحة موثّقة بصدق (تُحسم عند نقطة التوقف):** مسارات حقول التفاصيل الحية · شكل سلّم الأسعار في التفاصيل · hasMore/إجمالي الصفحات · تحويل credits→عملة لملاءمة حارس الميزانية · عائد البحث عن كلمات غير صينية قبل ربط الترجمة.

## المراحل 4–11 — بانتظار اجتياز نقطة التوقف (لم يبدأ أي منها)

واجهة البحث (4) · Product Cards (5) · Product Details (6) · Sourcing Cart (7) · Sourcing Request DRAFT→PENDING_REVIEW (8) · MCP/CLEAN (9 — مزوّد MCP رسمي موجود؛ بديلنا: MCP server فوق خدمات Z Sourcing) · الربط مع S BASE/الخدمات المشتركة (10) · اختبارات شاملة على منتجات 1688 حقيقية (11).
