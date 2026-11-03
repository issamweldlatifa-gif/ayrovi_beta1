# Ayrovi Extracted Sans

هذه هي العائلة اللاتينية المعتمدة في واجهة Ayrovi على الويب وتطبيق الهاتف. أصولها الحالية مشتقة من ملف WOFF2 المتغيّر الذي تحققنا من تحميله فعليًا من موقع Zalando؛ اسم الأسرة داخل المشروع هو **Ayrovi Extracted Sans** لتجنّب الخلط مع اسم المصدر المحجوز، وليست إصدارًا رسميًا من Zalando أو تأييدًا منه.

## مصدر الحقيقة وإعادة البناء

الملف المصدر المخزّن هو [`source/extracted-site-variable-v1.7.woff2`](source/extracted-site-variable-v1.7.woff2)، وبصمته SHA-256 هي `ba6fc11db691debbd271564b194e37d96fab6d3d58c96574c58ce15696196a8f`. هذا الملف وحده هو نقطة الاشتقاق؛ لا نعيد استخراج الحروف عند بناء التطبيق أو إضافة وزن. لتجديد ملفات الويب والتطبيق وPDF شغّل:

```bash
python3 -m pip install -r scripts/requirements-fonts.txt
npm run fonts:build
```

سكربت [`scripts/build-ayrovi-extracted-fonts.py`](../../scripts/build-ayrovi-extracted-fonts.py) يصدّر متغير الويب إلى `client/public/fonts/editorial/ayrovi-extracted-sans.woff2` ويولّد أوزان الهاتف/PDF 400 و600 و700 من المحور نفسه عند `wdth=100`. لإضافة وزن ثابت لاحقًا، تُضاف قيمة الوزن إلى `WEIGHTS` في السكربت ثم يُعاد البناء من الملف المخزّن؛ لا حاجة لإعادة الاستخراج. لا تغيّر عائلة الاسم إلى اسم المصدر upstream.

## تحقق القياسات والارتكاز

المحاور الأصلية هي `wght=200..900` (الافتراضي 400) و`wdth=75..125` (الافتراضي 100). المقياس `unitsPerEm=1000`. قياسات الارتفاع المحفوظة: `hhea` و`OS/2 sTypo` = صعود 964، نزول −250، و`lineGap=0`؛ حدود Windows = صعود 964 ونزول 255؛ `capHeight=714` و`xHeight=514`.

يحفظ التطبيق هذه المقاييس الرأسية نفسها في الأوزان الثلاثة. كما يقارن سكربت البناء جدول `GPOS` كاملًا (مواضع/تباعد OpenType، بما فيه أي بيانات ارتكاز) بين كل نسخة ثابتة والمثيل المقابل من المصدر، ويتطلب تطابقه تمامًا. إحداثيات TTF الصحيحة العددية قد تقرّب بعض النقاط العشرية في المصدر؛ حدّ التحقق هو وحدة واحدة من 1000 وحدة em، والعروض المتقدمة للحروف تبقى متطابقة. نتيجة كل بناء وبصمات الملفات موجودة في [`ayrovi-extracted-fonts.json`](ayrovi-extracted-fonts.json) و[`manifest.json`](manifest.json).

## الترخيص

مشتقّات الملفات مرخّصة وفق SIL Open Font License 1.1؛ راجع [`AyroviExtracted-OFL.txt`](AyroviExtracted-OFL.txt) و[`AyroviExtracted-NOTICE.txt`](AyroviExtracted-NOTICE.txt). يحتفظ ملف المصدر والترخيص بحقوق ونسبة المؤلف upstream المطلوبة.
