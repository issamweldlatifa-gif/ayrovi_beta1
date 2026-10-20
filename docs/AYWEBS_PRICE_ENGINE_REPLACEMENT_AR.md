# استبدال نواة التقاط السعر في AYWEBS

## المصدر والأساس

- أساس المشروع: `arena/651cd581-ayrovi-beta1` عند `5e631eae7cef7b6e2dbca293c1cac02d320ff071`.
- مصدر نواة السعر: `arena/fc3cce38-ayrovi-beta1` عند `22951a954e8ab8543f80cdecc41d3f81f8344779`.
- التنفيذ على فرع الجلسة `arena/abfb8d6e-ayrovi-beta1`، وليس على الفرعين المصدرين.
- التغييرات المحلية السابقة محفوظة في stash بعنوان `Backup before 651cd581 price engine replacement`.

## نطاق التغيير مقارنة بأساس 651cd581

نُقلت الملفات التالية كما هي من مصدر المحرك:

- `src/aywebs/captureScript.ts`
- `src/aywebs/webviewCapture.ts`
- `src/scraper/productPageParser.ts`

ونُقل عقد `shared/aywebsCapture.ts` مع الاحتفاظ بأنواع Amazon وحقول التشخيص وأكواد الرفض القديمة لتوافق العملاء الحاليين.

عُدّل `src/aywebs/productResolver.ts` لربط اختيار المتغيرات المقروءة بالمحرك الجديد وتطبيق حارسه الخاص بإصدار عرض السعر. احتُفظ بتحسينات الفرع الأساس، ومنها التخزين المؤقت والتشخيص والتمييز بين الحقول الناقصة والحقول المانعة.

لم تُستبدل واجهات التطبيق أو واجهات API، ولم تتغير إعدادات مزود القراءة الشبكية Bright Data في الفرع الأساس؛ الاستبدال يشمل نواة قراءة الصفحة والسعر والتحقق منه، وليس ترحيل البنية الشبكية إلى مزود مختلف.

## الفحوص

نجح `npm run typecheck` للخادم والعميل.

نجحت الاختبارات التالية (64 اختبارًا):

```sh
npx vitest run tests/aywebs-capture-amazon-fc3cce38.test.ts -t '^(?!.*\/health)'
# 28 passed; health integration test excluded
npx vitest run tests/aywebs-webview-capture.test.ts -t 'lecteur client|verdict serveur'
# 17 passed; other integration groups excluded
npx vitest run tests/scraper-money-integrity.test.ts
# 15 passed
npx vitest run tests/aywebs-price-engine-replacement.test.ts
# 4 passed
```

محاولة تشغيل مجموعات التكامل الكاملة توقفت عند غياب ملف الربط الأصلي لمكتبة `better-sqlite3`. محاولة إعادة بنائها فشلت بسبب تعذر تنزيل مكونات البناء في البيئة. لذلك لا تُعد اختبارات قاعدة البيانات أو اختبار جهاز WebView الحقيقي متحققة هنا.

أُرفقت اختبارات Amazon من المحرك المصدر ونسخة منفصلة من fixture الخاص بها، دون تعديل fixture الفرع الأساس.
