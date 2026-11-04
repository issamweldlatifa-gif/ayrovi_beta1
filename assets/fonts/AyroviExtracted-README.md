# Ayrovi Extracted Sans

هذه هي العائلة اللاتينية المعتمدة في واجهة Ayrovi على الويب وتطبيق الهاتف. أصولها الحالية مشتقة من ملف WOFF2 المتغيّر الذي تحققنا من تحميله فعليًا من موقع Zalando؛ اسم الأسرة داخل المشروع هو **Ayrovi Extracted Sans** لتجنّب الخلط مع اسم المصدر المحجوز، وليست إصدارًا رسميًا من Zalando أو تأييدًا منه.

## مصدر الحقيقة وإعادة البناء

الملف المصدر المخزّن هو [`source/extracted-site-variable-v1.7.woff2`](source/extracted-site-variable-v1.7.woff2)، وبصمته SHA-256 هي `ba6fc11db691debbd271564b194e37d96fab6d3d58c96574c58ce15696196a8f`. هذا الملف وحده هو نقطة الاشتقاق؛ لا نعيد استخراج الحروف عند بناء التطبيق أو إضافة وزن. لتجديد ملفات الويب والتطبيق وPDF شغّل:

```bash
python3 -m pip install -r scripts/requirements-fonts.txt
npm run fonts:build
```

سكربت [`scripts/build-ayrovi-extracted-fonts.py`](../../scripts/build-ayrovi-extracted-fonts.py) يصدّر متغير الويب إلى `client/public/fonts/editorial/ayrovi-extracted-sans.woff2`، ويولّد ملفات الهاتف/PDF الثابتة من المصدر نفسه: 400 و520 و650 و700 عند `wdth=102.5`، ونسخة عناوين 520 عند `wdth=112.5`. قيم المحاور تُقرأ من `client/src/design/editorial/identity.json`؛ تعديلها وإعادة البناء لا يتطلبان إعادة استخراج الحروف. لا تغيّر اسم الأسرة إلى اسم المصدر upstream.

## تحقق القياسات والارتكاز

المحاور الأصلية هي `wght=200..900` (الافتراضي 400) و`wdth=75..125` (الافتراضي 100). المقياس `unitsPerEm=1000`. قياسات الارتفاع المحفوظة: `hhea` و`OS/2 sTypo` = صعود 964، نزول −250، و`lineGap=0`؛ حدود Windows = صعود 964 ونزول 255؛ `capHeight=714` و`xHeight=514`.

يحفظ التطبيق هذه المقاييس الرأسية نفسها في الأوزان الثلاثة. كما يقارن سكربت البناء جدول `GPOS` كاملًا (مواضع/تباعد OpenType، بما فيه أي بيانات ارتكاز) بين كل نسخة ثابتة والمثيل المقابل من المصدر، ويتطلب تطابقه تمامًا. إحداثيات TTF الصحيحة العددية قد تقرّب بعض النقاط العشرية في المصدر؛ حدّ التحقق هو وحدة واحدة من 1000 وحدة em، والعروض المتقدمة للحروف تبقى متطابقة. نتيجة كل بناء وبصمات الملفات موجودة في [`ayrovi-extracted-fonts.json`](ayrovi-extracted-fonts.json) و[`manifest.json`](manifest.json).

## الترخيص

مشتقّات الملفات مرخّصة وفق SIL Open Font License 1.1؛ راجع [`AyroviExtracted-OFL.txt`](AyroviExtracted-OFL.txt) و[`AyroviExtracted-NOTICE.txt`](AyroviExtracted-NOTICE.txt). يحتفظ ملف المصدر والترخيص بحقوق ونسبة المؤلف upstream المطلوبة.

## قياسات الواجهة الحية (محاكاة الهاتف)

هذه القيم مقاسة من الأنماط المحسوبة في المتصفح وليست تقديرات بصرية. تم الالتقاط في 2026-11-03 على نافذة CSS ‏390×844، بمحاكاة Android 15 / Pixel 9 Pro / Chrome 130، ومقياس جهاز 2.75. صفحات المصدر: [الصفحة الرئيسية](https://www.zalando.fr/)، [تصنيف الأحذية](https://www.zalando.fr/chaussures-femme/)، و[السلة](https://www.zalando.fr/cart/). ملف الخط الحي الذي طابق ملف المصدر بايتًا ببايت: [WOFF2 المتغير](https://mosaic02.ztat.net/zds/assets/fonts/ZalandoSans%5Bwdth%2Cwght%5D.ba6fc11d.woff2)؛ وملف CSS المرجعي: [stylesheet](https://mosaic01.ztat.net/base-assets/9-1-0/assets/style.css).

| الدور | الحجم | الوزن | ارتفاع السطر | `wdth` | تباعد الحروف |
|---|---:|---:|---:|---:|---|
| نص الجسم | 16px | 400 | 24px | 102.5% | عادي |
| رابط التنقل | 16px | 650 | 24px | 102.5% | عادي |
| عنوان قسم، مثال «Plus de marques» | 20px | 520 | 24px | 112.5% | عادي |
| عنوان حالة فارغة | 16px | 650 | 24px | 102.5% | عادي |
| السعر الحالي | 14px | 650 | 20px | 102.5% | عادي |
| السعر المرجعي المشطوب | 12px | 400 | 16px | 102.5% | عادي |

لذلك لا تُفرض قاعدة واحدة على كل `h2`: العنوان الكبير، عنوان القسم، وحالة السلة أدوار منفصلة. ملف `client/src/styles/ayrovi-extracted-typography.css` والتوكنات الدلالية يحددان الأساس، فيما تحافظ المكونات على الاستثناءات المسمّاة. الأمر `npm run typography:check` يفحص الأسرة والأوزان والمحاور لهذه الأدوار عبر المسارات المكتشفة للهاتف وسطح المكتب.
