# AyWebs V1 — بنية التنفيذ داخل AYROVI

تاريخ الحالة: 2026-10-02

## القرار التنفيذي

AyWebs ليست متجرًا أو تطبيقًا أو سلة مستقلة. هي مدخل شراء داخل جلسة AYROVI نفسها:

`AyWebsScreen → Store Registry → Capture API → ProductDrawer / ShopProductScreen → AYROVI Cart`

لا تُنسخ هوية أو واجهة Buyee. المرجع استُخدم لفهم رحلة التصفح والتقاط المنتج والفشل البديل فقط.

## ما يعمل في V1

1. الدخول من أيقونة AyWebs الأصلية في شريط تنقل AYROVI.
2. اختيار متجر من Store Registry المشترك بين الخادم والعميل.
3. البحث داخل المتجر في تبويب خارجي مدعوم، لأن مواقع التجارة قد تمنع `iframe`.
4. العودة ولصق رابط صفحة المنتج المباشرة، أو مشاركة الرابط إلى AYROVI من Share Sheet عند تثبيت الـPWA.
5. التحقق من البروتوكول والدومين وصفحة المنتج قبل جلبها.
6. التقاط Amazon وSHEIN وTEMU وAliExpress عبر Adapters مستقلة تغلف `SmartLinkScraper` الحالي، مع إبقاء المتاجر الثلاثة الأخيرة في حالة Beta قابلة للإيقاف منفردة.
7. إعادة حساب السعر في الخادم بواسطة Price Engine المركزي.
8. فتح شاشة التأكيد الحالية لاختيار المقاس واللون والكمية والملاحظة.
9. الإضافة إلى سلة AYROVI الحالية والجلسة/الحساب الحالي؛ إذا تكرر نفس المنتج والـvariant يُحدّث السطر الموجود وتظهر رسالة تمنع الالتباس.
10. إظهار مسارات فشل صريحة: إعادة المحاولة، رابط مباشر، أو Screenshot عبر Lens.

## Store Registry

المصدر الوحيد هو `shared/aywebsStores.ts`. الواجهة لا تحتوي أسماء متاجر أو domains أو روابط بحث مشفرة داخل المكوّن.

| المتجر | التصفح | الالتقاط | المرحلة |
|---|---:|---:|---:|
| Amazon | مفعّل | مفعّل | 1 |
| SHEIN | مفعّل خارجيًا | Beta مفعّل | 2 |
| TEMU | مفعّل خارجيًا | Beta مفعّل | 2 |
| AliExpress | مفعّل خارجيًا | Beta مفعّل | 2 |

ظهور متجر في Registry لا يعني أن الالتقاط مفعّل؛ يعيد API الحقل `capture_supported` صراحة.

## API

المسار الأساسي: `/api/v1/aywebs`

- `GET /stores`: المتاجر وحالات الدعم وRuntime Feature Flags.
- `GET /session`: يؤكد أن AyWebs يستخدم Session وسلة AYROVI المشتركة.
- `GET /health`: جاهزية Adapters وJina وRendered Provider وAI Provider دون كشف أسرار.
- `POST /capture`: يتحقق من الرابط والمتجر، يستدعي Adapter، يطبّع المنتج، ويحسب السعر.
- `POST /price-quote`: يعيد تسعيرًا خلفيًا فقط؛ لا توجد معادلة سعر في Frontend.
- `POST /events`: أحداث رحلة AyWebs من دون بيانات شخصية.

استجابة الالتقاط الناجحة تُرجع:

- `product`: عقد `ScrapedProduct` المتوافق مع رحلة التأكيد الحالية.
- `normalized_product`: عقد موحّد يحوي `source`, `product`, `pricing`, `variants`, `availability`.
- `capture_id` وحالة `READY`.

حالات الفشل المهمة: `UNSUPPORTED`, `NEEDS_SELECTION`, `FAILED`، مع codes تفصيلية مثل `DOMAIN_NOT_ALLOWED`, `PRODUCT_PAGE_REQUIRED`, `CAPTURE_INCOMPLETE`.

## الحماية

- Allowlist من Store Registry، ومطابقة صحيحة للنطاق الأساسي أو subdomain فقط.
- رفض HTTP في الالتقاط وقبول HTTPS فقط.
- استمرار حماية SSRF وDNS pinning الموجودة في `safeUrl` و`SmartLinkScraper`.
- Rate limits مستقلة للالتقاط والتسعير والأحداث.
- السعر النهائي يُحسب في الخادم، ويعاد التحقق منه عند الإضافة إلى السلة.
- لا يُدّعى توفر variant من الواجهة وحدها؛ تبقى بوابة variant الحالية فعالة.
- لا يعتمد V1 على AI؛ العلم `AYWEBS_AI_EXTRACTION_ENABLED` مغلق افتراضيًا.

## Runtime flags

توجد في `.env.example` ويمكن تغييرها ثم إعادة تشغيل الخدمة من دون إعادة بناء العميل:

- `AYWEBS_ENABLED`
- `AYWEBS_CAPTURE_ENABLED`
- `AYWEBS_AMAZON_CAPTURE_ENABLED`
- `AYWEBS_SHEIN_CAPTURE_ENABLED`
- `AYWEBS_TEMU_CAPTURE_ENABLED`
- `AYWEBS_ALIEXPRESS_CAPTURE_ENABLED`
- `AYWEBS_OCR_FALLBACK_ENABLED`
- `AYWEBS_AI_EXTRACTION_ENABLED`

## القياس

يسجل `aywebs_events` الأحداث التالية بلا PII، مع hash للجلسة عند توفر سر الخادم:

- `aywebs_open`
- `store_selected`
- `product_page_detected`
- `capture_started`
- `capture_succeeded`
- `capture_failed`
- `add_to_cart_clicked`
- `add_to_cart_succeeded`

## ما أُكمل في المرحلة الثانية

1. Adapters مخصصة لـ SHEIN وTEMU وAliExpress مع اختبارات contract لكل متجر.
2. سلسلة استخراج مرتبة: Structured Data/Embedded State ثم DOM/Meta ثم Jina ثم Rendered Provider المسموح.
3. Feature Flag مستقل لكل Adapter لإيقاف متجر واحد دون تعطيل Browser Layer.
4. لوحة تشغيل داخل Dashboard تعرض نجاح الالتقاط حسب المتجر وأهم أسباب الفشل ونسبة Capture → Cart.
5. ربط `capture_id` بأحداث السلة، وتحديث سطر السلة الموجود بدل إنشاء duplicate.

## تشغيل الإنتاج المتبقي

1. ضبط Rendered Provider واحد على الأقل في بيئة الإنتاج للمتاجر التي تفرض bot-wall.
2. تشغيل روابط staging حقيقية دورية لكل نطاق ومراقبة تغيّر DOM ومعدلات الحظر.
3. إبقاء AI extraction مغلقًا افتراضيًا؛ لا يُفعّل إلا عند وجود Provider مضبوط وعتبة ثقة وعرض مصدر واضح للمستخدم.
