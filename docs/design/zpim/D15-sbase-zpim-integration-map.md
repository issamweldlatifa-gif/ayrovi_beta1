# D15 — S BASE Middleware Integration Map
**الحالة:** مسودة v1.0 — بانتظار مراجعة المالك. **NO CODE — خريطة واجهات وتدفّقات.**
**الغرض:** كيف يتصل ZPIM بمحرك S BASE للنقاط العشر التي حددها المالك — مع المالك الحالي لكل نقطة (كود قائم = مرجع قراءة) والهدف التصميمي.

---

## التدفقات الثلاثة الأساسية

```text
1) SEARCH   S BASE ─query─► ZPIM[Translation→Connector] ─raw─► Normalize ─SbaseItem[]─► S BASE scores/lanes
2) DETAILS  S BASE ─offerId─► ZPIM[Catalog: hit?→return : fetch→Raw→Normalize→cache] ─► بطاقة+SKU
3) REFRESH  Scheduler/On-read ─► ZPIM[stale? TTL] ─► re-acquire ─► diff──► تحديث + تنبيه إن تغيّر السعر>عتبة
```

## نقاط الاتصال العشر

| النقطة | المالك | القائم اليوم (مرجع) | الهدف التصميمي |
|---|---|---|---|
| Search Requests | S BASE→ZPIM | `routes.ts` بحث كلمات عبر actor | + طبقة ترجمة zh قبل النداء + فك سقف العمق (صفحات) عند الحاجة |
| Product Discovery | S BASE | selection/lanes | + تغذية فئات من Catalog (كتالوج مخبأ) بنداء بحث |
| Product Details | ZPIM | `detail.ts` بطاقة كاملة | + TTL + Quarantine + Raw Store مرجع |
| Product Variants | ZPIM→S BASE | SKU مصفوفة في العقد | + مصفوفة كاملة (لون/مقاس/ثمن/صورة/توفر) + `recordVariantContract` يبقى بوابة العقدة التجارية |
| Supplier Data | ZPIM | shop_info مُسقط | تقسيم عام/خاص: عرض مجهول اختياري + الشركة/المتجر/المحافظة للـCRM دائماً |
| Product Availability | ZPIM | غير مخزّن | `state: catalog\|probe\|verified` — التحقق البشري بعد الطلب يبقى هو الرسمي (تسلسل المالك) |
| Original Source URL | ZPIM | رابط `detail.1688.com` في العقد | **لا يُحذف أبداً من العقد** — قرار العرض العام للمالك؛ الـCRM يراه كاملاً |
| Product Refresh | ZPIM | نداء حي لكل طلب (بلا كاش) | TTL + refresh-on-read + scheduler اختياري بعتبة تغيّر |
| Error Handling | كلاهما | أكواد صادقة (errors.ts) | + `SHAPE_UNKNOWN / STALE_BEYOND_TTL / SOURCE_BUDGET_EXCEEDED / SOURCE_RATE_LIMITED` |
| Source Failover | ZPIM | actor واحد (لا بديل) | سلسلة failover: أساسي → بديل مصادق → SUSPENDED بكود — لا بيانات من مصدر غير مصادق |

## قاعدة الاستقلالية — كيف تُضمن بنيوياً

1. **ACL (Anti-Corruption Layer):** محرك S BASE يستدعي واجهات ZPIM المسماة بالتجارة (`discover/details/refresh/availability`) — لا يستدعي Apify أبداً ولا يعرف اسم actor.
2. **Adapter Registry:** كل مصدر يسجّل بعقد موحّد + حالة دورة حياة؛ الدخول للتجارة = integration test + اعتماد المالك.
3. **Failover Chain:** ترتيب مصادر لكل نوع نداء؛ تفعيل البديل آلي عند فشل متكرر، والعودة تتطلب فحصاً — ولا يُضاف مصدر لمجرد وجوده (قاعدة المالك).
4. **Circuit Breaker لكل مصدر:** فشل متتابع ⇒ فتح الدائرة بكود صادق بدل تعليق المستخدم.
5. **عقد ثابت:** `SbaseItem v2` هو الوحيد العابر للحد — تغيّره يتطلب إصداراً جديداً ومراجعة الـE2E الثلاثي.

## تسلسل خطأ نموذجي (تصميم)

```text
search("قفازات نيترويل") ─► translate→zh ─► connector(A) budget-exceeded
  ─► connector(B) إن وُجد مصادق ─► وإلا: 200 + items:[] + code: SOURCE_BUDGET_EXCEEDED
  ─► الواجهة تعرض «تعذر البحث الآن — خطأ مصدر مؤقت» بلا أرقام مفتعلة.
```
