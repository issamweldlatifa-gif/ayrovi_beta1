# D20 — ZPIC: التصميم النهائي وخطة التنفيذ (بعد تدقيق D19)
**الحالة:** مسودة v1.0 — بانتظار مراجعة المالك. **NO CODE — التنفيذ لا يبدأ قبل توقيع Checklist §8.**
**تعريف الاسم:** **ZPIC = ZAYROVI Product Intelligence Core** — اسم أمر المالك لهذه النواة. علاقته بالحزمة: ZPIM (D14) كان تصميم الطبقة الوسيطة لـS BASE؛ التدقيق (D19) أثبت أن وظائفها مكررة جزئياً في ثلاث منظومات ⇒ **ZPIC هو ZPIM متدرجاً من «وسيط S BASE» إلى «نواة ذكاء منتجات مشتركة» تخدم Z Lens وS BASE وAYWEBS** — قرار تصميمي مرفوع لاعتماد المالك.

---

## §1 · المعمارية النهائية

```text
   Z Lens (zayrovix)      S BASE (sbase)        AYWEBS (aywebs)
   lens·candidates·UX     lanes·scoring·MOQ     adapters §8·متاجر
   ═══════════╦═══════════════╦═════════════════╦════════════
              ║   ACL: عقد ProductIntel + واجهات ZPIC فقط   ║
   ┌──────────▼───────────────▼─────────────────▼──────────┐
   │                    ZPIC CORE                          │
   │ ① Connector Registry (فوق discovery_sources القائم)   │
   │ ② Acquisition Engine + Budget Guard (بوّة واحدة)      │
   │ ③ Raw Store (جديد — درس Soorce D13)                   │
   │ ④ Normalization → ProductIntel v1 (عقد واحد بدل 3)    │
   │ ⑤ Translation Engine (ai-core + معجم zh صناعة)        │
   │ ⑥ Image Line (فوق imageIsolation/imageWork القائمين)  │
   │ ⑦ Dedup (sourceProductId+domain / offer_id)           │
   │ ⑧ Supplier Intelligence (عام مجهول / خاص لـCRM)       │
   │ ⑨ Pricing Integration (قراءة fx_extra_rates فقط)      │
   │ ⑩ Catalog + Cache Layer (سياسة TTL واحدة بدل 3)       │
   │ ⑪ Quote-Token Service (دمج priceQuote+quoteToken)     │
   │ ⑫ Quality & Validation (فهرس أكواد خطأ واحد)          │
   └───────────────────────┬───────────────────────────────┘
     Connectors: Apify(1688) · BrightData(via AYWEBS adapters كما هي)
     · SerpApi(lens يبقى داخلياً في Z Lens — ZPIC لا يعيد بناءه)
     · CRM-jobs · مستقبلاً: Official API / Yiwugo
   Commerce Core ◄── حدود D16 (لا ZPIC فيه ولا Commerce Core في ZPIC)
```

**قواعد بنيوية غير قابلة للتفاوض:**
1. wrap-not-rewrite: أي داخلي قائم يعمل — ZPIC يستهلكه عبر عقده، لا يعيد بناءه.
2. `/api/zayrovix` و`src/aywebs/*` الداخلية **لا تُلمس** (قيد المالك الدائم) — دخولهما لـZPIC تدريجي وبإضافات جديدة فقط.
3. ZPIC لا يستدعي المنظومات ولا Commerce Core — هو مزوّد يُستهلك.
4. S BASE يبقى مستقلاً عن أي مزود: تبديل connector لا يمس المحرك (D15 §الاستقلالية).

## §2 · عقد ProductIntel v1 — توحيد العقود الثلاثة

| المفهوم | AYWEBS اليوم | S BASE اليوم | Z Lens اليوم | **ProductIntel v1** |
|---|---|---|---|---|
| هوية المصدر | `sourceProductId+sourceDomain` | `offer_id` (1688) | ضمن candidate | `source{kind, sourceId, domain, nativeId}` |
| سعر وعملة | `price+currency` | `price/currency` + tiers CNY | ضمن candidate | `price{amount, currency, tiers[]}` — القرار التجاري خارج العقد |
| متغيرات | `variantGroups+variants` (متوفر لكل فرعية + `variantUrl`) | SKU مصفوفة + `recordVariantContract` | ضمن candidate | `variants[]` + `variantGroups[]` (دلالات AYWEBS تعمم) |
| توفر | `AyWebsAvailabilityState` | غير موجود | variantAvailability | `availability{state, reason, checkedAt}` — enum AYWEBS يعمم |
| صور | `images[]` | img + متغيرات | ضمن candidate | `images[]` + مرجع مرآة اختياري |
| مورّد | بيانات متجر | shop_info مسقط | — | `supplier{public, private}` — الخاص لـCRM فقط |
| ثقة | — | shop_years/super_factory خام | — | `trust{}` |
| رابط أصلي | `sourceUrl` | رابط detail.1688 في العقد | — | `sourceUrl` — **لا يُحذف أبداً (D15)** |
| أصل خام | — | — | — | `raw{runId, fetchedAt, ref→Raw Store}` |
| ترجمة | — | — | — | `translations{zh, ar?, fr?, quality}` |

**قاعدة التطور:** العقد يُضاف إليه فقط (v1→v2 additive)؛ أي كسر حقل = إصدار جديد + مراجعة الـE2E الثلاثي.

## §3 · استراتيجية الترحيل (additive فقط)

1. **لا migrations قبل المراجعة النهائية** (قاعدة المالك). التصميم يحتاج جديدين فقط: `zpic_raw_items` (خام TTL) و`zpic_cache_meta` — والباقي قراءة جداول قائمة (`discovery_sources`, `pricing_config`, `crm_extracted_products`).
2. **الترتيب الاتصالي:** S BASE أولاً (عميل أول، لأنه الأحدث والأصغر 2,318 سطراً وبلا كاش) → ثم استهلاك اختياري من Z Lens وAYWEBS عند ملامسة ميزات جديدة فقط — **لا إعادة كتابة رجعية**.
3. quote-token: الخدمة الموحّدة تُبنى بالتوازي، والنقاط القديمة (`priceQuote`/`quoteToken`) تعمل حتى ترحيل نقاط الاستدعاء واحدة-واحدة مع اختباراتها — الصفر-تعطيل للسلة أثناء الترحيل.
4. كل مرحلة تنتهي بـintegration test أخضر + مراجعة المالك قبل التالية.

## §4 · خطة التنفيذ المرحلية (بوّات صارمة)

| المرحلة | المحتوى | بوّة الخروج |
|---|---|---|
| **P0 — تم** | دراسة Soorce (D11) + مقارنة المزودين (D12) + تصميم (D13–D15) + حدود (D16) + كلفة (D17) + توصية (D18) + **تدقيق البنية (D19)** + هذا التصميم | موافقة المالك (Checklist §8) |
| **P1-A أمنية وبنية لا تنتظر** | Budget Guard (سقف يومي لكل مزود، env-gate موحّد) + Quote-Token Service الموحّدة + فهرس أكواد الخطأ | اختبارات السلة/التوكن خضراء 100% بلا أي تغيير سلوك للعميل |
| **P1-B عقد وسجل** | ProductIntel v1 + تفعيل `discovery_sources` كسجل connectors + S BASE ينتقل للعقد (خلفه Mapper لـSbaseItem الحالي) | E2E الثلاثي AYR-299819 يبقى أخضر |
| **P1-C طبقات المعرفة** | Raw Store + Cache Layer (تستوعب resolveCache وتعمل كاش SBASE الأول) + Translation Engine zh + خط الصور الموحّد فوق imageIsolation | قياس hit-rate أول أسبوع + عينات ترجمة بمعجم تُعرض للمالك |
| **P2 — التوسع المشروط** | Dedup عابر-المصادر + بنش المصدر الثاني (Yiwugo / مرشح nice_dev عبر البروتوكول الخماسي) + كتالوج SEO + failover chain + بحث صورة موحّد | قرار بالأرقام الحقيقية من D17 (عتبة Custom-scrapping) |
| **موازٍ دائماً** | Commerce Core P1 (trio → T1 → Approval) + فجوة born-AWAITING_DEPOSIT في P2 له | لا تؤخَّر لأجل ZPIC إطلاقاً (ملاحظة المالك) |

## §5 · ما لا يفعله ZPIC ابداً

- لا يعيد بناء adapters AYWEBS ولا منطق lens ولا `/api/zayrovix` (قيد المالك).
- لا يقرر أسعاراً ولا هامشاً ولا عروضاً — يجلب ويوحّد ويكاش (القرار التجاري: محرك التسعير + Commerce Core).
- لا يكتب في سلّة/طلبات/دفع ولا يستدعي CRM مباشرة (CRM مستقبِل عبر مسار الطلب).
- لا يفتح مزوداً جديداً بلا بنش خماسي + اعتماد مالك + حماية رصيد Apify.
- لا يُخفي أخطاء ولا يقدّم بيانات وهمية — أكواد صادقة فقط.

## §6 · مخاطر الترحيل والرد

| خطر | الرد |
|---|---|
| كسر السلة أثناء توحيد التوكن | ترحيل نقاط الاستدعاء واحدة-واحدة خلف اختبارات cartPriceTrust |
| انحراف عقد ProductIntel ليعود بثلاثة عقود | Mapper واحد لكل مصدر + اختبار مطابقة لكل mapper + حظر حقول خارج العقد |
| كاش موحّد يبطئ AYWEBS المضبوطة بثوانٍ | سياسة TTL لكل connector (resolveCache تنتقل كما هي أولاً — لا تغيير أرقامها) |
| ترجمة بلا معجم | المعجم شرط إطلاق (درس jin — D13) |
| زحف نطاق ZPIC نحو Commerce | حد D16 + سؤال «أي صندوق؟» إلزامي لكل ميزة |

## §7 · معايير القبول لكل مرحلة (قابلة للفحص)

1. P1-A: `SOURCE_BUDGET_EXCEEDED` مُختبر؛ توقيع/تحقق توكن من خدمة واحدة فقط عبر grep لا يعيد ثانية.
2. P1-B: كل نداء S BASE يمر عبر ZPIC (لا استيراد مباشر لapify.ts خارج connector)؛ E2E الثلاثي أخضر.
3. P1-C: Raw Store يستعيد عنصراً حرفياً من run قديم؛ hit-rate مقيّس؛ ترجمة «斤»→كغ مثبتة باختبار.
4. P2: فشل مزود أساسي ⇒ بديل مصادق يجيب بكود واحد موحّد، والعميل يرى رسالة صادقة.
5. عام: صفر تعديل في `src/aywebs/adapters/*` و`src/zayrovix/` الداخلي (فحص git diff نصي في كل PR).

## §8 · Checklist قرار المالك — ZPIC (يُضاف إلى D18-10)

11. اعتماد التسمية والنطاق: ZPIC = نواة مشتركة للثلاث منظومات (تدرّج ZPIM).
12. اعتماد إيجادات D19 الستة وأسطر الشواهد.
13. اعتماد استراتيجية wrap-not-rewrite وترتيب الترحيل (S BASE أولاً، بلا رجعية).
14. اعتماد الجدولين الجديدين فقط (`zpic_raw_items`, `zpic_cache_meta`) عند بوّة P1-C — لا migrations قبلها.
15. اعتماد أولوية P1-A الأمنية (Budget Guard + توكن موحّد) كأول كود بعد التوقيع.
16. تأكيد نهائي: ZPIC لا يؤخر Commerce Core — الجدولان موازيان ببوّات مستقلة.
