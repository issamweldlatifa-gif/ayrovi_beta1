# ZPIM — حزمة دراسة وتصميم Middleware لـS BASE (D11–D18)
**الحالة:** مسودة v1.0 — بانتظار مراجعة المالك واعتمادها (T1) قبل أي تنفيذ.
**التاريخ:** 26/11/2026 · الفرع: `arena/e328c2d5-ayrovi-beta1` · **دراسة وتصميم فقط: NO CODE · NO PRODUCTION CHANGES · NO ACTOR CHANGES · NO API PURCHASES · NO COMMERCE CORE MODIFICATIONS · NO LIVE PROCUREMENT.**
**المنهج الثابت:** كل بند مرجعه شاهد محفوظ في المستودع؛ ما لا يُثبت يُسجَّل Unknown بلا تخمين؛ القيود الأخلاقية (لا اختراق/لا حسابات غير مصرحة/لا استنزاف/لا بيانات خاصة) مطبقة على كل الشواهد.

## الوثائق الثمانية

| ID | الوثيقة | المسار | سطر واحد |
|---|---|---|---|
| D11 | Soorce Middleware Architecture Investigation | `D11-soorce-middleware-investigation.md` | تشريح الطبقة الوسيطة لSoorce (Acquisition/Processing/Intelligence/Pricing/Catalog) بالشواهد المُقاسة |
| D12 | Data Acquisition Methods & API Comparison | `D12-acquisition-methods-api-comparison.md` | مقارنة 5 خيارات (Official/Commercial/Apify/Custom/Providers) × الوظائف والكلفة والقانوني — **بلا افتراض ارتباط Soorce بأي منها** |
| D13 | Product Data Processing Architecture | `D13-product-data-processing-architecture.md` | خط معالجة 10 مراحل، كل مرحلة مقرونة بشاهد Soorce وقرارنا |
| D14 | ZPIM Design | `D14-zpim-middleware-design.md` | الوحدات الـ12 + عقد `SbaseItem v2` + سياسات TTL/كلفة/فشل + خريطة P0/P1/P2 |
| D15 | S BASE Middleware Integration Map | `D15-sbase-zpim-integration-map.md` | نقاط الاتصال العشر + ضمان استقلالية المحرك عن المزود (ACL/registry/failover) |
| D16 | Commerce Core Integration Boundaries | `D16-commerce-core-boundaries.md` | حدود المسؤوليات الخمسة + نقطة الالتحام الوحيدة (SbaseItem→سطر سلة) + منع تكرار المحركات |
| D17 | Cost, Reliability & Scalability | `D17-cost-reliability-scalability.md` | كلفة شهرية بثلاثة سيناريوهات (82.8$/405.9$/1591$ بافتراضات معلنة) + مخاطر الموثوقية + التوسع |
| D18 | Recommended S BASE Architecture | `D18-recommended-sbase-architecture.md` | التوصية النهائية: تبنّي/رفض من Soorce + خريطة الدمج + Roadmap مرتب + Checklist مراجعة المالك (10 بنود) |
| D19 | **ZAYROVI Architecture Audit · v1.1 منقّحة** | `D19-zayrovi-architecture-audit.md` | تدقيق قراءة-فقط (منقّح بعد مراجعة المالك): **4 مسارات اكتساب + سجل مركزي منفصل**، 3 عقود متوازية، quote-token مكرر بملكية خارج ZPIC، كاش بسياسات متمايزة — إجابات أسئلة المالك الستة بمراجع أسطر |
| D20 | **ZPIC Final Design & Execution Plan · v1.1 منقّح** | `D20-zpic-final-design-execution-plan.md` | التصميم المنقّح بعد مراجعة المالك: مبدأ «تنظّم لا تستحوذ»، اتجاهات تبعية بلا دورات، ProductIntel بإثبات المصدر والحداثة، ملكية Quote-Token لـCommerce Core، سياسات Raw/كاش/ترجمة صريحة غير معلقة على AI Core، وجدول ملكية جامع |
| GLO | **المعجم المؤسسي — التعريف الرسمي للأنظمة** | `GLOSSARY-systems-definition.md` | التعريف المؤسسي المنقول عن المالك حرفياً (Z Lens/AYWEBS/S BASE/Commerce Social/Commerce Core + المبادئ الخمسة + المبدأ المركزي) + قراءة حالة كل بند من الكود (مثبت/مجدول/رؤية) — **مرجع ملزم يُقرأ أولاً** |

## حزمة شواهد SOORCE المحفوظة (المصدر المرجعي للجميع)

| الملف | المحتوى |
|---|---|
| `docs/design/soorce-investigation.md` | التقرير الأم (§0–§12): 1688 CONFIRMED + تحديد نوع التكامل §11 + توصيات §12 |
| `docs/design/soorce-artifacts/api-search-response-sample.json` | استجابة `/api/search` حرفية + ملاحظات تحليلية |
| `docs/design/soorce-artifacts/api-search-probe2-samples.json` | شواهد تحديد التكامل: مخططا البحث/التغذية، اعتصر 2000، انجراف العدّادات، 12 زوج هامش، مقارنة بصمة الحقول |
| `docs/design/soorce-artifacts/capture-runbook.md` | دليل الالتقاط الحي عند المالك (Playwright+HAR+REA) — يحسم نقطتَي Probable |

## خلاصة الحزمة في 5 أسطر

1. Soorce = وسيط رقيق بمرور خام + طبقات إثراء — **ليست API رسمية ولا تجارية مُطبِّعة**؛ المزود الفعلي Unknown (وهذا كافٍ معمarilyاً).
2. بنيتنا القائمة (actor + SbaseItem + pricing بإصدار) هي **النوع نفسه** — لا تغيير بنيوي مطلوب، وتوحيد+كاش+ترجمة هي الفجوات الوحيدة.
3. ZPIM يضيف الطبقات الناقصة خلف عقد ثابت، مع Raw Store وShape Detection وFailover — استقلالية كاملة عن المزود.
4. الكلفة تحت السيناريوهات الثلاثة ≤ ~1600$/شهر عند توسع كبير، محمية بسقف يومي وكاش — وقرار السحب الذاتي مؤجل لما بعد P2.
5. **التدقيق (D19) غيّر النطاق**: الوظائف مكررة جزئياً في ثلاث منظومات ⇒ النواة تتدرج من ZPIM إلى **ZPIC مشتركة** (D20) — wrap-not-rewrite، بلا مساس بـaywebs الداخلي ولا `/api/zayrovix`.
6. **Commerce Core أولاً**: الحزمة جاهزة لخريطة S BASE ولا تعطّل الترتيب المتفق عليه — التنفيذ بعد التوقيع فقط (D18-10 + D20-16).

## التحميل

كل ملف فوقه متاح للتحميل من GitHub: افتح الملف → زر **Raw** → حفظ (أو `git pull` على هذا الفرع).
