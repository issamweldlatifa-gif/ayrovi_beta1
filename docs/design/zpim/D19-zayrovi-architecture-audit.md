# D19 — ZAYROVI Architecture Audit (ما قبل ZPIC)
**الحالة:** مسودة v1.0 — تدقيق قراءة-فقط للشيفرة الحالية عند commit `c197eb6`. **NO CODE — لم يُعدَّل أي ملف مصدر.**
**المنهج:** كل إجابة مقرونة بمرجع `ملف:سطر` قابل للتحقق. القيود المحترمة: لا تعديل aywebs الداخلي ولا `/api/zayrovix` — القراءة والاستشهاد فقط.

**مقياس المنظومات المفحوصة (أسطر):** `src/sbase/` ≈ 2,318 · `src/zayrovix/services/` ≈ 6,314 · `src/aywebs/` + adapters ≈ 21,640.

---

## س1 · أنظمة جلب البيانات الموجودة حالياً — **خمسة**

| # | النظام | الموقع | المزود الخارجي | البوابة والشاهد |
|---|---|---|---|---|
| 1 | **AYWEBS (تجزئة عالمية)** | `src/aywebs/adapters/` (aliexpress, amazon, shein, temu, capture-only, catalogue + registry + base) | كشط عبر `src/scraper/brightData.ts` — **Bright Data Web Unlocker** (مزوّد مدفوع، `render:true` لـshein/temu فقط لأن الرندر أغلى) | بوابة env صامتة: `BRIGHTDATA_API_KEY+BRIGHTDATA_ZONE` — بلاها `null` بلا أي طلب أو كلفة (`brightData.ts:4-8,29-33`)؛ نداء فعلي من `aywebs/routes.ts` |
| 2 | **Zayrovix / Z Lens (اكتشاف بالصورة)** | `src/zayrovix/services/visualSearch.ts` | **SerpApi Google Lens** (9 أسواق: fr/de/it/es/uk/us/ca/tr/ae) — الصورة تُصغّر بـsharp وتُرفع لـAPI المؤقت بـimage_id قابل للانتهاء، بلا نشر عام | سقوف صارمة ملتقطة: `CACHE_TTL_MS = 10min`، `MAX_CACHE_ENTRIES=100`، `MAX_IN_FLIGHT=12`، حد صورة 500KB (`visualSearch.ts:10-15`) |
| 3 | **S BASE (جملة صينية)** | `src/sbase/apify.ts` + `descriptors.ts` + `routes.ts` | **Apify** — actor `sourabhbgp~1688-scraper` (بحث/تفاصيل) + قناة بحث الصورة = Apify Server actor بـbase64 في POST واحد (`image.ts:1-11`) | توكن في Render env فقط + 11 كود خطأ صادق للصورة (`image.ts:9-11`) + Ali runners ككود ميت لإعادة الدخول بلا حذف |
| 4 | **خط استخراج CRM** | جداول `crm_stores` · `crm_store_source_profiles` · `crm_extraction_jobs` · `crm_extracted_products` (`database.ts:1013-1150`) | مصادر عملاء عبر jobs مجدولة | بنية extraction-as-job كاملة قائمة (المعالجة والنتائج في DB) |
| 5 | **سجل مصادر الاكتشاف (DB)** | جدول `discovery_sources` + `discovery_markets` (`database.ts:163-195`) | — | registry بDB أصلاً: `source_type` enum (`MARKETPLACE/MERCHANT/BRAND/RETAILER/LOCAL_STORE/AGGREGATOR/GENERIC`) + `capabilities` JSON + `reliability 0-100` + `status ACTIVE/PAUSED/ARCHIVED` — **أصل بنيوي جاهز لم يستغله أحد كاملاً** |

**خلاصة س1:** خمسة مسارات اكتساب تعمل بخمسة مزودين خارجيين (Bright Data, SerpApi, Apify, CRM-jobs, direct adapters) وبثلاثة أنماط بوابة مختلفة (env-silent, env-token, job-scheduler) — **بلا طبقة موحّدة واحدة**.

## س2 · وظائف Middleware الموجودة جزئياً

| وظيفة ZPIM (D14) | القائم فعلاً | نضج | الفجوة |
|---|---|---|---|
| Source Connector Layer | عقد AYWEBS §8 («AUCUN if(store==='amazon')» — adapter-per-merchant، `contract.ts:14-19`) + registry كودي | **عالٍ في AYWEBS** | ثلاثة سجلات متوازية (كود AYWEBS / `descriptors.ts` SBASE / DB `discovery_sources`) |
| Normalization Engine | 3 عقود خام متوازية: `AyWebsSourceProduct` (بمتغيرات وتوفر وvariantUrl لكل فرعية — `contract.ts:30-45`) · `ZayrovixCandidate` (`zayrovix/types`) · `SbaseItem` (`sbase/extract.ts`) | متوسط | **لا عقد موحّد** — كل منظومة تعيد بناء الحقول بنفسها |
| Raw Product Data Layer | — | **غائب كلياً** | لا تخزين خام في أي مسار |
| Translation Engine | لا ترجمة نصية في أي منظومة؛ `productLocalization.ts` = تثبيت بصري AI (name/category/box/confidence مع رفض غير-المؤسّس، `productLocalization.ts:5-14`) + عقد ترجمة في `ai-core/contracts.ts` | جزئي | **فجوة zh المشتركة** (تؤكدها دراسة Soorce §11) |
| Image Intelligence | `services/imageIsolation.ts` = خط كامل مجاني: SSRF-guard + تحليل حواف + chroma-key + كاش قرص (`imageIsolation.ts:2-10`) + `imagePrep.ts` sharp | **عالٍ وقابل لإعادة الاستخدام مباشرة** | لا سياسة مرآة موحّدة (S BASE بلا مرآة) |
| Cache Management | `aywebs/resolveCache.ts` (كاش قراءة منتج — مشكلة مقيسة: 7s+6s+18s+18s budgets، `resolveCache.ts:3-9`) + كاش visualSearch الداخلي + كاشات مصادقة | جزئي — **3 سياسات متوازية بلا طبقة واحدة** | S BASE بلا كاش إطلاقاً (حي لكل نداء) |
| Pricing Integration | `pricing_config.fx_extra_rates` في DB (`database.ts:2908,3500,3524`) + `services/pricing.ts` + `cartQuote.ts` + محرك S BASE | **الـFX مخزّن مركزياً جيداً** | محركات قرار التسعير متعددة (صحيح تجارياً) لكن قراءة FX تتم بتكرار |
| Supplier Intelligence | حقول shop_info في SBASE + supplier بيانات AYWEBS | جزئي | لا تقسيم عام/خاص ولا حقول ثقة موحّدة |
| Deduplication | `sourceProductId+sourceDomain` ضمني في AYWEBS · `offer_id` ضمني في SBASE | ضعيف | لا مفتاح فريد عابر-المنظومات |
| Quality & Validation | `productLinkAdmission.ts` (بوابة قبول روابط في zayrovix) + سقوف صارمة في visualSearch | جزئي (zayrovix فقط) | لا قواعد رفض موحّدة |
| Budget Guard | بوّات env صامتة (BrightData/Apify) | جزئي | **لا سقف يومي ولا عدّاد كلفة في أي مسار** |

## س3 · قواعد بيانات وكاشات قابلة لإعادة الاستخدام

**قابلة للإعادة استخدام مباشرة (قراءة فقط الآن):**
1. `discovery_sources`/`discovery_markets` — **أساس سجل connectors الم central** (بنية capabilities/reliability/status جاهزة).
2. `pricing_config.fx_extra_rates` — مخزن FX المركزي الوحيد (مجرّب بـE2E CNY 0.46).
3. `applied_data_migrations` + `crm_schema_migrations` — انضباط migrations قائم (يحمي قاعدة المالك: لا migrations قبل المراجعة).
4. `imageWork`/disk cache — بنية كاش وسائط جاهزة.
5. نمط بوّات المزود env-silent (`brightDataConfig`) — قابل للتعميم كسقف كلفة.

**كاشات قائمة:** resolveCache (AYWEBS، الأقدم والأكثر نضجاً بقياس مقيس) · كاش visualSearch (10د/100) · كاشات جلسات. **الغائب:** Raw Store، كاش تفاصيل SBASE، أي TTL موحّد.

## س4 · الوظائف المكررة بين Z Lens وS BASE وAYWEBS

| التكرار | الشواهد | التكلفة الفعلية |
|---|---|---|
| **ثلاثة عقود مصدر متوازية** | `AyWebsSourceProduct` / `ZayrovixCandidate` / `SbaseItem` — نفس المفاهيم (سعر، عملة، متغيرات، صور، توفر، رابط أصلي) بأسماء ودلالات مختلفة | كل ميزة جديدة تُبنى ×3؛ العقد الموحّد أعلى أولوية |
| **نمط quote-token ×2** | `zayrovix/priceQuote.ts` (توقيع/تحقق/فحص) + `aywebs/quoteToken.ts` + استهلاكهما في `services/cartPriceTrust.ts` | منطق توقيع حساس مكرر — خطر انحراف أمني |
| **ثلاثة كاشات بسياسات متباينة** | resolveCache (قاسة بالثواني) / visualSearch (10د) / بلا كاش (SBASE) | سلوك غير متوقع لكل ميزة؛ فرصة توفير كلفة ضائعة |
| **خطوط صور فوق بنية مشتركة لا يعرف بعضها** | imageIsolation/imageWork (مشتركة جاهزة) + imagePrep (zayrovix) + قناة image.ts (SBASE) | إعادة تنفيذ للسياسات؛ المرآة والتحويل يُبنى ×3 |
| **بوّات مزودين ×3 أنماط** | env-silent (BrightData) / token-env (Apify) / jobs (CRM) | بلا عدّاد كلفة موحّد — خطر مباشر على رصيد Apify (قاعدة دائمة) |
| **أكواد خطأ بلا فهرس مشترك** | `sbase/errors.ts` + `sbase/image.ts` (11 كوداً) مقابل أساليب أخرى | أخطاء المنظومات لا تُقرأ موحّدات في المراقبة |
| **دلالات توفر متعددة** | `AyWebsAvailabilityState` (enum ناضج) / variantAvailability (zayrovix) / غير موجودة (SBASE) | دمج سلة مستقبلي يواجه 3 لغات توفر |
| **فجوة مشتركة: لا ترجمة zh** | لا شيء في الثلاثة | المؤكدة من Soorce — سدّها مرة واحدة يخدم الجميع |

## س5 · ما يجب أن يكون **مشتركاً داخل ZPIC** (قراءة من التدقيق)

1. **سجل connectors واحد** فوق بنية `discovery_sources` القائمة (استبدال 3 سجلات توازية تدريجياً).
2. **عقد منتج موحّد واحد** (`ProductIntel` = اتحاد العقود الثلاثة) — أساس كل شيء.
3. **Raw Store واحد** (غائب اليوم — درس Soorce D13).
4. **طبقة كاش واحدة** بسياسة TTL طبقية (تفاصيل/بحث/صور) — تستوعب resolveCache وكاش lens.
5. **خدمة quote-token واحدة** (تجميع priceQuote+quoteToken خلف توقيع واحد) — استهلاكها في cartPriceTrust يبقى كما هو.
6. **خط صور واحد** فوق imageIsolation/imageWork (جلب+مرآة انتقائية+تحويل+alt).
7. **محرك ترجمة واحد** (ai-core + معجم وحدات zh) — الفجوة المشتركة المؤكدة.
8. **بوّة مزودين واحدة + Budget Guard** (env-gate + سقف يومي + عدّاد).
9. **فهرس أكواد خطأ واحد** (تعميم نمط sbase).
10. **عملة توفر واحدة** (تعميم enum AYWEBS).

## س6 · ما يجب أن يبقى **مستقلاً** في كل نظام

| النظام | يستقل بـ | السبب/القيد |
|---|---|---|
| **Z Lens (zayrovix)** | SerpApi lens UX، ترتيب المرشحين، productLinkAdmission، grounding البصري، `/api/zayrovix` | قيد المالك: لا تُمَس الداخليات — ZPIC يستهلك مخرجاتها لا يعيد بناءها |
| **S BASE** | lanes/scoring/selection، تحقق MOQ، دلالات الجملة (سلّم/كميات) | جوهر التمييز التجاري؛ يستهلك ZPIC كعملاء أول |
| **AYWEBS** | طبقة adapters §8 كاملة (Master Order)، سلوك المتاجر، captureControl | قيد المالك: الداخليات لا تُلمس — ZPIC يتعامل معها عبر عقد `AyWebsSourceProduct` كما هو |
| **Commerce Core** | سلة/طلبات/تسعير تجاري/دفع/عربون + الفجوة P2 المعروفة | حد D16 صارم |
| **CRM / arrival-ingestion / ERP / finance** | دورة الشراء والاستلام والحسابات | خارج نطاق ذكاء المنتجات |

**القاعدة المستخلصة:** ZPIC = **مزوّد خدمات ذكاء منتجات** يستهلكه الثلاثة عبر ACL — لا يستدعي أي منظومة، ولا يُعاد بناء أي داخلي قائم (wrap-not-rewrite).

---

## الجدول الحاسم: الاكتشاف مقابل القرار

| اكتشاف التدقيق | القرار في D20 |
|---|---|
| 5 مسارات اكتساب بلا طبقة موحّدة | ZPIC connector registry فوق `discovery_sources` |
| 3 عقود متوازية | عقد `ProductIntel` واحد بإصدار |
| quote-token مكرر ×2 | خدمة توقيع واحدة (أولوية أمنية P0) |
| Raw Store غائب | أقرب بناء جديد في P1 |
| `discovery_sources` جاهز ومهمَل | تفعيله كسجل المركز بدل جدول جديد |
| imageIsolation جاهز وقوي | خط صور ZPIC يبنى فوقه لا بجانبه |
| فجوة zh مشتركة | محرك ترجمة واحد يخدم الثلاثة (P1) |
| بلا budget guard | بوّة+سقف موحّد قبل أي توسيع مصادر |
