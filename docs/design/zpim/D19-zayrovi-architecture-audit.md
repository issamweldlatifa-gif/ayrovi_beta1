# D19 — ZAYROVI Architecture Audit (ما قبل ZPIC)
**الحالة:** **v1.1 — منقّحة بعد مراجعة المالك (26/11) · بانتظار المراجعة النهائية — غير معتمدة للتنفيذ.**
**v1.0:** تدقيق قراءة-فقط للشيفرة عند commit `c197eb6` — لم يُعدَّل أي ملف مصدر. **v1.1:** تصحيح تصنيف مسارات الاكتساب، فصل سجل المصادر عنها، وضبط ملاحظات الملكية (quote-token) والكاش — بلا تغيير في الشواهد.
**المنهج:** كل إجابة مقرونة بمرجع `ملف:سطر` قابل للتحقق. القيود المحترمة: لا تعديل aywebs الداخلي ولا `/api/zayrovix` — القراءة والاستشهاد فقط.

**مقياس المنظومات المفحوصة (أسطر):** `src/sbase/` ≈ 2,318 · `src/zayrovix/services/` ≈ 6,314 · `src/aywebs/` + adapters ≈ 21,640.

## سجل المراجعة

| الإصدار | التصحيح | بناءً على ملاحظة المالك |
|---|---|---|
| v1.0 | — | — |
| v1.1 | س1 أُعيد تصنيفها: **4 مسارات اكتساب ومعالجة** + **سجل مركزي للمصادر** (لم يعد ضمن تصنيف المسارات) | «العنصر الخامس ليس نظام اكتساب بل سجل مركزي» |
| v1.1 | quote-token: التكرار شاهد صحيح، لكن **الملكية ليست لـZPIC** — القرار في D20 §4 | «مرتبطة بالثقة السعرية والمعاملات التجارية» |
| v1.1 | الكاش: الفجوة (S BASE) تُعالج بسياسات **لكل نوع بيانات ولكل مصدر** لا بنفس السياسة | «بيانات السعر تختلف عن الصور والبحث» |

---

## س1 · مسارات اكتساب ومعالجة البيانات الحالية — **أربعة مسارات + سجل مركزي**

**أ) مسارات الاكتساب والمعالجة (4):**

| # | المسار | الموقع | المزود الخارجي | البوابة والشاهد |
|---|---|---|---|---|
| 1 | **AYWEBS (تجزئة عالمية)** | `src/aywebs/adapters/` (aliexpress, amazon, shein, temu, capture-only, catalogue + registry + base) | كشط عبر `src/scraper/brightData.ts` — **Bright Data Web Unlocker** (مزوّد مدفوع، `render:true` لـshein/temu فقط لأن الرندر أغلى) | بوابة env صامتة: `BRIGHTDATA_API_KEY+BRIGHTDATA_ZONE` — بلاها `null` بلا أي طلب أو كلفة (`brightData.ts:4-8,29-33`)؛ نداء فعلي من `aywebs/routes.ts` |
| 2 | **Zayrovix / Z Lens (اكتشاف بالصورة)** | `src/zayrovix/services/visualSearch.ts` | **SerpApi Google Lens** (9 أسواق: fr/de/it/es/uk/us/ca/tr/ae) — الصورة تُصغّر بـsharp وتُرفع لـAPI المؤقت بـimage_id قابل للانتهاء، بلا نشر عام | سقوف صارمة ملتقطة: `CACHE_TTL_MS = 10min`، `MAX_CACHE_ENTRIES=100`، `MAX_IN_FLIGHT=12`، حد صورة 500KB (`visualSearch.ts:10-15`) |
| 3 | **S BASE (جملة صينية)** | `src/sbase/apify.ts` + `descriptors.ts` + `routes.ts` | **Apify** — actor `sourabhbgp~1688-scraper` (بحث/تفاصيل) + قناة بحث الصورة = Apify Server actor بـbase64 في POST واحد (`image.ts:1-11`) | توكن في Render env فقط + 11 كود خطأ صادق للصورة (`image.ts:9-11`) + Ali runners ككود ميت لإعادة الدخول بلا حذف |
| 4 | **خط استخراج CRM** | جداول `crm_stores` · `crm_store_source_profiles` · `crm_extraction_jobs` · `crm_extracted_products` (`database.ts:1013-1150`) | مصادر عملاء عبر jobs مجدولة | بنية extraction-as-job كاملة قائمة (المعالجة والنتائج في DB) |

**ب) سجل مركزي موجود لإدارة المصادر (ليس مسار اكتساب):**

| العنصر | الموقع | الدور |
|---|---|---|
| **سجل مصادر الاكتشاف** | جدولا `discovery_sources` + `discovery_markets` (`database.ts:163-195`) | تعريف مركزي للمصادر وقدراتها: `source_type` enum (`MARKETPLACE/MERCHANT/BRAND/RETAILER/LOCAL_STORE/AGGREGATOR/GENERIC`) + `capabilities` JSON + `reliability 0-100` + `status ACTIVE/PAUSED/ARCHIVED` — **أصل بنيوي جاهز لم يستغله أحد كاملاً**؛ مرشّح ليكون أساس سجل connectors في ZPIC (قرار D20) |

**خلاصة س1 (منقّحة):** أربعة مسارات اكتساب ومعالجة تعمل بأربعة أنماط مزودين وبثلاثة أنماط بوابة (env-silent, env-token, job-scheduler) — **بلا طبقة موحّدة واحدة**؛ ويوجد سجل مركزي للمصادر منفصل عنها جميعاً وجاهز للتفعيل.

## س2 · وظائف Middleware الموجودة جزئياً

| وظيفة ZPIM (D14) | القائم فعلاً | نضج | الفجوة |
|---|---|---|---|
| Source Connector Layer | عقد AYWEBS §8 («AUCUN if(store==='amazon')» — adapter-per-merchant، `contract.ts:14-19`) + registry كودي + سجل DB مركزي | **عالٍ في AYWEBS** | ثلاثة سجلات متوازية (كود AYWEBS / `descriptors.ts` SBASE / `discovery_sources`) |
| Normalization Engine | 3 عقود خام متوازية: `AyWebsSourceProduct` (بمتغيرات وتوفر وvariantUrl لكل فرعية — `contract.ts:30-45`) · `ZayrovixCandidate` (`zayrovix/types`) · `SbaseItem` (`sbase/extract.ts`) | متوسط | **لا عقد موحّد** — كل منظومة تعيد بناء الحقول بنفسها |
| Raw Product Data Layer | — | **غائب كلياً** | لا تخزين خام في أي مسار |
| Translation Engine | لا ترجمة نصية في أي منظومة؛ `productLocalization.ts` = تثبيت بصري AI (name/category/box/confidence مع رفض غير-المؤسّس، `productLocalization.ts:5-14`) + عقد ترجمة في `ai-core/contracts.ts` | جزئي | **فجوة zh المشتركة** (تؤكدها دراسة Soorce §11) |
| Image Intelligence | `services/imageIsolation.ts` = خط كامل مجاني: SSRF-guard + تحليل حواف + chroma-key + كاش قرص (`imageIsolation.ts:2-10`) + `imagePrep.ts` sharp | **عالٍ وقابل لإعادة الاستخدام مباشرة** | لا سياسة مرآة موحّدة (S BASE بلا مرآة) |
| Cache Management | `aywebs/resolveCache.ts` (كاش قراءة منتج — مشكلة مقيسة: 7s+6s+18s+18s budgets، `resolveCache.ts:3-9`) + كاش visualSearch الداخلي (10د) + كاشات مصادقة | جزئي — **سياسات متوازية بلا إدارة مركزية** | S BASE بلا كاش إطلاقاً؛ المعالجة المستقبلية = **سياسات لكل نوع بيانات ولكل مصدر** (D20 §6)، لا سياسة واحدة |
| Pricing Integration | `pricing_config.fx_extra_rates` في DB (`database.ts:2908,3500,3524`) + `services/pricing.ts` + `cartQuote.ts` + محرك S BASE | **الـFX مخزّن مركزياً جيداً** | محركات قرار التسعير متعددة (صحيح تجارياً) لكن قراءة FX تتم بتكرار |
| **Quote/Price Trust** | `zayrovix/priceQuote.ts` + `aywebs/quoteToken.ts` + enforcement في `services/cartPriceTrust.ts` | مكرر ×2 | **ملكية تجارية-أمنية لا تنتمي لـZPIC** — قرار التوحيد وملكيتها في D20 §4 |
| Supplier Intelligence | حقول shop_info في SBASE + supplier بيانات AYWEBS | جزئي | لا تقسيم عام/خاص ولا حقول ثقة موحّدة |
| Deduplication | `sourceProductId+sourceDomain` ضمني في AYWEBS · `offer_id` ضمني في SBASE | ضعيف | لا مفتاح فريد عابر-المنظومات |
| Quality & Validation | `productLinkAdmission.ts` (بوابة قبول روابط في zayrovix) + سقوف صارمة في visualSearch | جزئي (zayrovix فقط) | لا قواعد رفض موحّدة |
| Budget Guard | بوّات env صامتة (BrightData/Apify) | جزئي | **لا سقف يومي ولا عدّاد كلفة في أي مسار** |

## س3 · قواعد بيانات وكاشات قابلة لإعادة الاستخدام

**قابلة للإعادة استخدام مباشرة (قراءة فقط الآن):**
1. `discovery_sources`/`discovery_markets` — **أساس سجل connectors المركزي** (بنية capabilities/reliability/status جاهزة).
2. `pricing_config.fx_extra_rates` — مخزن FX المركزي الوحيد (مجرّب بـE2E CNY 0.46).
3. `applied_data_migrations` + `crm_schema_migrations` — انضباط migrations قائم (يحمي قاعدة المالك: لا migrations قبل المراجعة).
4. `imageWork`/disk cache — بنية كاش وسائط جاهزة.
5. نمط بوّات المزود env-silent (`brightDataConfig`) — قابل للتعميم كسقف كلفة.

**كاشات قائمة (كل واحدة بسياستها الخاصة — لا توحيد أعمى):** resolveCache (AYWEBS، الأقدم والأكثر نضجاً بقياس مقيس) · كاش visualSearch (10د/100) · كاشات جلسات. **الغائب:** Raw Store، كاش تفاصيل SBASE، أي TTL موحّد بإدارة مركزية.

## س4 · الوظائف المكررة بين Z Lens وS BASE وAYWEBS

| التكرار | الشواهد | التكلفة الفعلية |
|---|---|---|
| **ثلاثة عقود مصدر متوازية** | `AyWebsSourceProduct` / `ZayrovixCandidate` / `SbaseItem` — نفس المفاهيم (سعر، عملة، متغيرات، صور، توفر، رابط أصلي) بأسماء ودلالات مختلفة | كل ميزة جديدة تُبنى ×3؛ العقد الموحّد أعلى أولوية — **مع الحفاظ على التخصص: MOQ (S BASE)، المتغيرات وروابطها (AYWEBS)، المطابقة البصرية (Z Lens)** عبر حقول امتدادية (D20 §2) |
| **نمط quote-token ×2** | `zayrovix/priceQuote.ts` + `aywebs/quoteToken.ts` + استهلاكهما في `services/cartPriceTrust.ts` | منطق توقيع حساس مكرر — خطر انحراف أمني؛ **الإصلاح بخدمة مشتركة واحدة بملكية Commerce Core (D20 §4)، لا بنقلها لـZPIC** |
| **ثلاثة كاشات بسياسات متباينة** | resolveCache (قاسة بالثواني) / visualSearch (10د) / بلا كاش (SBASE) | سلوك غير متوقع؛ المعالجة: إدارة مركزية **بسياسات متمايزة** لكل نوع/مصدر |
| **خطوط صور فوق بنية مشتركة لا يعرف بعضها** | imageIsolation/imageWork (مشتركة جاهزة) + imagePrep (zayrovix) + قناة image.ts (SBASE) | إعادة تنفيذ للسياسات؛ المرآة والتحويل يُبنى ×3 |
| **بوّات مزودين ×3 أنماط** | env-silent (BrightData) / token-env (Apify) / jobs (CRM) | بلا عدّاد كلفة موحّد — خطر مباشر على رصيد Apify (قاعدة دائمة) |
| **أكواد خطأ بلا فهرس مشترك** | `sbase/errors.ts` + `sbase/image.ts` (11 كوداً) مقابل أساليب أخرى | أخطاء المنظومات لا تُقرأ موحّدات في المراقبة |
| **دلالات توفر متعددة** | `AyWebsAvailabilityState` (enum ناضج) / variantAvailability (zayrovix) / غير موجودة (SBASE) | دمج سلة مستقبلي يواجه 3 لغات توفر |
| **فجوة مشتركة: لا ترجمة zh** | لا شيء في الثلاثة | المؤكدة من Soorce — سدّها مرة واحدة يخدم الجميع، **بلا ربط ZPIC باكتمال AI Core** (D20 §7) |

## س5 · ما يجب أن يكون مشتركاً (منقّح: **ضمن ZPIC** و**خارج ZPIC بملكية أخرى**)

**ضمن ZPIC (ذكاء بيانات المنتجات):**
1. **سجل connectors واحد** فوق بنية `discovery_sources` القائمة (استبدال 3 سجلات توازية تدريجياً).
2. **عقد منتج موحّد واحد** (`ProductIntel` مع حقول امتدادية لكل مصدر) — أساس كل شيء.
3. **Raw Store واحد** بسياسة تخزين صريحة (D20 §5) — غائب اليوم.
4. **إدارة كاش مركزية بسياسات لكل نوع/مصدر** (D20 §6) — تستوعب resolveCache وكاش lens كما هما عند الترحيل.
5. **خط صور واحد** فوق imageIsolation/imageWork (جلب+مرآة انتقائية+تحويل+alt).
6. **محرك ترجمة واحد عبر provider-adapter مستقل** (D20 §7) — الفجوة المشتركة المؤكدة.
7. **بوّة مزودين واحدة + Budget Guard** (env-gate + سقف يومي + عدّاد).
8. **فهرس أكواد خطأ واحد** (تعميم نمط sbase).
9. **دلالة توفر واحدة** (تعميم enum AYWEBS).

**خارج ZPIC بملكية أخرى (لا تستحوذ عليها النواة):**
- **خدمة توقيع/تحقق السعر**: مالكها حد الثقة التجارية في **Commerce Core** — تُوحَّد تنفيذياً فقط (D20 §4).
- **Analytics · محرك التوصيات · Best Sellers**: مالكها Analytics/Recommendation — ZPIC تزوّدها ببيانات منتج منظمة عند الطلب فقط (D20 §10).

## س6 · ما يجب أن يبقى مستقلاً في كل نظام

| النظام | يستقل بـ | السبب/القيد |
|---|---|---|
| **Z Lens (zayrovix)** | SerpApi lens UX، ترتيب المرشحين، productLinkAdmission، grounding البصري، `/api/zayrovix` | قيد المالك: لا تُمَس الداخليات — ZPIC يستهلك مخرجاتها لا يعيد بناءها |
| **S BASE** | lanes/scoring/selection، تحقق MOQ، دلالات الجملة (سلّم/كميات) | جوهر التمييز التجاري؛ يستهلك ZPIC كعملاء أول |
| **AYWEBS** | طبقة adapters §8 كاملة (Master Order)، سلوك المتاجر، captureControl، **مزوّد BrightData الخاص بها** | قيد المالك: الداخليات لا تُلمس — ومزوّدها لا يُشارَك مع ZPIC (اتجاهات D20 §8) |
| **Commerce Core** | سلة/طلبات/تسعير تجاري/دفع/عربون + خدمة الثقة السعرية + الفجوة P2 المعروفة | حد D16 صارم |
| **CRM / arrival-ingestion / ERP / finance** | دورة الشراء والاستلام والحسابات | خارج نطاق ذكاء المنتجات |
| **Analytics / Recommendations / Best Sellers** | تحليل المبيعات، التوصيات، الأكثر مبيعاً من المبيعات الفعلية | ZPIC مزوّد بيانات لهم، لا بديل عنهم |

**القاعدة المستخلصة:** ZPIC = **مزوّد خدمات ذكاء منتجات** يستهلكه الثلاثة عبر ACL — لا يستدعي أي منظومة، ولا يُعاد بناء أي داخلي قائم (wrap-not-rewrite)، ولا يستحوذ على مسؤوليات غيرها.

---

## الجدول الحاسم: الاكتشاف مقابل القرار (منقّح)

| اكتشاف التدقيق | القرار في D20 |
|---|---|
| 4 مسارات اكتساب بلا طبقة موحّدة | ZPIC connector registry |
| سجل مركزي (`discovery_sources`) جاهز ومهمَل — منفصل عن المسارات | تفعيله كسجل connectors المركز |
| 3 عقود متوازية | عقد `ProductIntel` واحد + امتدادات لكل مصدر + fieldProvenance |
| quote-token مكرر ×2 | **توحيد تنفيذي بملكية Commerce Core** — خارج ZPIC |
| Raw Store غائب | بناء جديد في P1 بسياسة صريحة (حجم/احتفاظ/حذف/ربط/حماية) |
| كاشات ×3 بلا إدارة مركزية | إدارة مركزية بمصفوفة TTL لكل نوع/مصدر |
| imageIsolation جاهز وقوي | خط صور ZPIC يبنى فوقه لا بجانبه |
| فجوة zh مشتركة | محرك ترجمة بـprovider-adapter مستقل — غير معلق على AI Core |
| بلا budget guard | بوّة+سقف موحّد ضمن ZPIC قبل أي توسيع مصادر |
