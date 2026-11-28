# D14 — ZAYROVI Product Intelligence Middleware (ZPIM) Design
**الحالة:** مسودة v1.0 — بانتظار مراجعة المالك واعتماد T1. **NO CODE — كل ما هنا تصميم؛ التنفيذ لا يبدأ قبل الاعتماد.**
**التعريف:** ZPIM = الطبقة الوسيطة الداخلية لـS BASE تجمع بيانات المنتجات من أي مصدر، تعالجها وتوحّدها، وتخدم محرك S BASE عبر عقد ثابت — بلا أي وظيفة تجارية (سلة/دفع/طلب).

---

## الموقع البنيوي

```text
                       ZAYROVI S BASE (محرك: selection · lanes · scoring)
                                        │ عقد ثابت فقط (D15)
                    ┌───────────────────▼────────────────────┐
                    │        ZPIM — Product Intelligence      │
                    │  Catalog/Cache ◄ Intelligence ◄ Normalize│
                    │         ▲ Raw Store    ▲ Translation     │
                    │         └── Acquisition ◄─ Connectors    │
                    └────────────┬───────────────┬────────────┘
                          1688 actors      مستقبل: Official API /
                          (sourabhbgp الآن) Yiwugo / Commercial APIs
```

**قاعدة الاستقلالية (شرط المالك):** محرك S BASE لا يرى اسم المزود ولا شكله — يرى واجهات ZPIM فقط. تبديل مصدر = connector جديد + mapper، بلا إعادة بناء.

## الوحدات الاثنتا عشرة

| # | الوحدة | المسؤولية | المدخل→المخرج | الربط الحالي (مرجع بلا تعديل) | المستجد التصميمي |
|---|---|---|---|---|---|
| 1 | **Source Connector Layer** | سجل adapters (1688-actors، لاحقاً Official/Yiwugo) بعقد موحّد + حالة `PLANNED\|IN_DEVELOPMENT\|ACTIVE\|SUSPENDED` | استدعاء موحّد → payload خام | `descriptors.ts` + `apify.ts` | adapter registry + حقل ToS + قفل تكلفة/يوم |
| 2 | **Data Acquisition Engine** | تنفيذ النداءات، جدولة، إعادة محاولة، سقف تنفيذ | استعلام → raw payload(s) | `apify.ts` runners | circuit breaker لكل مصدر + budget guard |
| 3 | **Raw Product Data Layer** | أرشفة الخام غير القابل للتغيير | raw → تخزين TTL ~60d | **غير موجود** (Soorce أيضاً بلا ظاهر — قررنا نأخذ النقطة) | تخزين خام + معرّف run للتشخيص |
| 4 | **Product Normalization Engine** | كشف مخطط + mapping → `SbaseItem v2` | raw → عقد موحّد | `extract.ts` + `detail.ts` | shape detection + quarantine للصيغ المعروفة/المجهولة |
| 5 | **Translation Engine** | سؤال→zh قبل النداء؛ محتوى zh→ar/fr بعد التوحيد — بمعجم وحدات | نص → نص مترجم | **غير موجود** | معجم صناعة (jin/قطع/دستة…) + علم جودة ترجمة على البطاقة |
| 6 | **Image Intelligence** | مرآة انتقائية + alt + (P2: بحث صورة) | صور → مراجع مخزنة | `image.ts` | مرآة البطاقة المختارة فقط + سياسة CDN |
| 7 | **Product Deduplication** | توحيد offer_id؛ P2: مطابقة عبر مصادر | عناصر → عناصر فريدة | ضمن selection | مفتاح فريد + جدول mapping عبر-مصادر (P2) |
| 8 | **Supplier Intelligence** | حقول ثقة + تقسيم عام/خاص للبيانات | raw supplier → trust + full | `extract.ts` (shop_info) | عرض عام مجهول **اختياري** + الرابط الكامل لـCRM دائماً |
| 9 | **Pricing Integration** | تمرير اليوان الخام وtiers للعقد؛ **القرار التجاري ليس منها** | tiers CNY → حقول العقد | `pricing.ts` | فصل صارم: ZPIM يجلب، محرك التسعير/Commerce Core يقرر |
| 10 | **Product Catalog** | كتالوج تفاصيل مخبأ (نمط Soorce) + (P2: كتالوج SEO) | offer_id → بطاقة كاملة | `detail.ts` + routes | TTL طبقي + إعادة توليد دورية اختيارية |
| 11 | **Cache Management** | سياسات TTL + إبطال + hit-rate metering | — | **غير موجود** | تفاصيل 7d أسعار/توفر عند-القراءة 24h؛ بحث بلا كاش (حي) |
| 12 | **Data Quality & Validation** | قواعد رفض + عزل + تنبيه drift | عقد → عقد مصادق أو quarantine | ضمن extract | قواعد D13-مرحلة8 + تنبيه تغيّر مخطط المصدر |

## عقد SbaseItem v2 (إضافات مقترحة على الموجود — تصميم لا كود)

```text
SbaseItem v2 = v1 (قائم، مجرّب بالE2E)
  + quantityPrices: [{beginNum, priceCny}]        // سلّم الجملة (شاهد Soorce §2)
  + trust: {shopYears, isSuperFactory, repurchaseRate, saleInfo}
  + translations: {titleZh, titleAr?, titleFr?, quality: "mt|glossary|raw"}
  + availability: {state: "catalog|probe|verified", checkedAt}
  + source: {adapter, runId, fetchedAt, rawRef}   // للتشخيص من Raw Store
  + supplierFull: {company, shopUrl, province}    // خاص — CRM فقط، ليس العرض العام
```

## سياسات حاكمة

- **التكلفة:** سقف يومي لكل adapter من Render env (بلا توكن في الشات — قاعدة دائمة)؛ الرفض بكود `SOURCE_BUDGET_EXCEEDED` صادق.
- **دورة حياة adapter:** `PLANNED|IN_DEVELOPMENT|ACTIVE|SUSPENDED` + الدخول للتجارة فقط بعد integration test + اعتماد المالك (قاعدة قائمة).
- **الفشل:** أكواد صادقة من errors.ts تُمدّ: `SOURCE_TIMEOUT / SOURCE_RATE_LIMITED / NORMALIZATION_FAILED / SHAPE_UNKNOWN / STALE_BEYOND_TTL` — بلا بيانات وهمية أبداً.

## خريطة التنفيذ المرحلية (بعد الاعتماد فقط)

| المرحلة | محتوى ZPIM | المرجع الزمني |
|---|---|---|
| **P0 (موجود فعلاً)** | Connector (1688 actor) + Normalization أساسي + pricing engine + routes + E2E | أنجز — 63cae83/6d88ebe |
| **P1** | Raw Store · Shape detection · Translation Engine + معجم · Trust fields · quantityPrices · Cache Management · صور مرآة | موازٍ لاستكمال Commerce Core P1 (ملاحظة المالك: لا يؤخره) |
| **P2** | مصدر ثانٍ (بنش Yiwugo) + Failover + Catalog SEO + بحث صورة + dedup عبر-مصادر | بعد بنش P2 وأرقام الحجم (D17) |
