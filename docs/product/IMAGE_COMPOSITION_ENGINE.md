# AYROVI — Image Composition Engine (المرحلة 2)

> `Approved Prototype → Engineering Rules → Image Composition Engine` — منفَّذة.
> المرجع: `prototype-image-composition/ENGINEERING_RULES.md` (خارج المستودع).
> التاريخ: 2026-09-25.

---

## 1. ما الذي تغيّر بالضبط

| الملف | الطبيعة | المحتوى |
|---|---|---|
| `src/services/imageComposition.ts` | **جديد** | المحرّك: الهندسة النقية + الطبقات + الـpipeline + الـcache + عقد القبول |
| `src/services/segmentation.ts` | إصلاح | `firstChannel()` · `containBox()` · `fillMaskHoles()` + ربطها في `segmentBuffer` |
| `src/services/imageIsolation.ts` | إصلاح/إضافة | `decontaminateFringe()` + خيار `treatWhiteAsUniform` |
| `src/public/routes.ts` | إضافة | `GET /api/public/media/card` |
| `client/src/ayrovix/services/mediaIsolation.ts` | إضافة | `composedMediaUrl()` · `isComposedUrl()` + ترتيب سلسلة الاحتياط |
| `client/src/ayrovix/components/LensProductCard.tsx` | إضافة | وسم `data-composed` على الصورة المعروضة |
| `client/src/ayrovix/components/lens-product-card.css` | إضافة | قاعدة `img[data-composed="true"]` → `contain` بلا `multiply` |
| `tests/image-composition.test.ts` | **جديد** | 29 اختبارًا = عقد قابل للتنفيذ |
| `verify/image-composition.ts` | **جديد** | `npm run verify:image-composition` على صور حقيقية |

**لم يُحذف ولم يُكسر أي سلوك قائم**: مسار `/media/isolated` و`/media/img` كما هما، وسلسلة الاحتياط في الواجهة تُبقي الصورة الأصلية كملاذ أخير.

---

## 2. ثلاثة أخطاء حقيقية في الإنتاج اكتُشفت أثناء التنفيذ

### 2.1 القناع كان يُقرأ بثلث عرضه — **سبب «الصورة تتشوه»**
`sharp` يرقّي مُدخلًا RAW بقناة واحدة إلى مُخرَج sRGB بـ**ثلاث قنوات**. الكود كان يفهرس المخزن الناتج كقناة واحدة (البكسل `i` بدل `3i`)، فيُقرأ القناع بثلث عرضه: المنتج مخطّط، مُزاح، «مشوّه».
**الإصلاح:** `toColourspace('b-w')` + دالة `firstChannel()` النقية.

### 2.2 القناع لم يكن منطبقًا على المنتج
الصورة تُرسَل للموديل بـ`fit:'contain'` (أي داخل مربّع 320×320 مع padding)، لكن القناع الناتج كان يُمدَّد بـ`fit:'fill'` إلى الحجم الأصلي **بما في ذلك الـpadding** → حافة مقصوصة من جهة وخلفية باقية من الجهة الأخرى.
**الإصلاح:** `containBox()` تستخرج منطقة المحتوى من المربّع قبل إعادة التحجيم.

### 2.3 الفتحات الحقيقية كانت تُسدّ
سدّ الثقوب كان شاملًا: يد الحقيبة أو الفراغ بين قطعتين يمتلئ بقرص من خلفية التاجر.
**الإصلاح:** `fillMaskHoles()` تسدّ فقط ما هو < 0.8 % من مساحة المنتج.

> هذه الثلاثة كانت موجودة قبل المرحلة 2 وتؤثر على مسار العرض الحالي أيضًا — إصلاحها يفيد `/media/isolated` مباشرة.

---

## 3. القواعد كما هي مطبَّقة في الكود

كل الأرقام **نِسب**، ولا يوجد أي بُعد ثابت مرتبط بصورة:

```ts
CARD_ASPECT 9/13 · CARD_CANVAS #F0F2F2 · CARD_RADIUS_RATIO 18/760     // عقد الـCSS
SAFE_INLINE 8.5 % · SAFE_TOP 7 % · SAFE_BOTTOM 9 %                    // منطقة الأمان
OPTICAL_CENTER_Y 48 % · CENTROID_PULL 0.35                            // التوسيط البصري
MAX_UPSCALE ×3.2 · IDEAL_FRAME_WIDTH 900                              // حدّ الجودة
```

- **Smart Scale** = `min(safeW/assetW, safeH/assetH)` → معامل واحد لـX وY ⇒ النسبة محفوظة رياضيًا (لا تستطيع الدالة أن تمدّد حتى لو أردنا).
- **Contain** ⇒ القصّ مستحيل بنيويًا، لا استثناءات.
- **Smart Position** على `alphaCentroid` وليس على مركز الـbbox، ثم clamp داخل منطقة الأمان.
- **Quality-bounded resolution** ⇒ الصورة الصغيرة تُرسم بإطار أصغر بنفس النِّسب بدل أن تُنفَخ وتتشوّش.
- **الطبقات**: `paintMockupLayer()` ثم `buildContactShadow()` ثم `compositeOver()` — الدمج آخر خطوة، والظل طبقة مستقلة لا تلمس بكسلات المنتج.

### عقد القبول (`acceptComposition`) يُنفَّذ قبل الـcache
```
aspect_ratio_preserved · no_crop · inside_safe_area · frame_ratio_official · coverage_balanced
```
إذا سقط شرط واحد → لا تُخزَّن ولا تُقدَّم الصورة المركّبة، ويُعاد توجيه المتصفح إلى الأصل.

---

## 4. النتائج المقيسة

### `npm run verify:image-composition` — الكود الإنتاجي على 6 صور حقيقية

| الصورة | المسار | الإطار | التحجيم | Δالنسبة | الإشغال |
|---|---|---|---|---|---|
| باقة مكياج (خلفية معقدة) | segmentation | 900×1300 | ×1.78 | 0.000 % | 39.4 % |
| جاكيت على مانيكان | segmentation | 900×1300 | ×2.25 | 0.054 % | 28.8 % |
| هاتف (خلفية داكنة) | segmentation | 900×1300 | ×2.38 | 0.020 % | 55.8 % |
| لابتوب (منظور 3/4) | segmentation | 900×1300 | ×1.79 | 0.047 % | 21.6 % |
| حقيبة يد | segmentation | 900×1300 | ×2.54 | 0.032 % | 43.3 % |
| حذاء (183×275، إسفلت) | segmentation | 586×846 | ×3.20 | 0.012 % | 24.8 % |

**6/6 مطابقة.** أقصى انحراف في النسبة: **0.054 %** (العتبة 0.5 %).

### الاختبارات
- `tests/image-composition.test.ts` — **29/29**.
- السويت الكاملة — **1712/1712** بعد `npm run build` (الـ5 السواقط قبله كانت بسبب غياب `dist/` فقط، لا علاقة لها بالتغيير).
- `npx tsc --noEmit` + `tsc -p tsconfig.client.json --noEmit` — نظيفان.

### حيّ عبر HTTP
```
GET /api/public/media/card?u=<merchant-url>&w=900
→ 200 image/png 900×1300 (ratio 0.6923 = 9/13) في 0.64 ث
→ الطلب الثاني من الـcache: 0.004 ث
```

---

## 5. حدود معروفة (صادقة)

1. **منتج بلون خلفيته** (حذاء أحمر على خلفية حمراء): الموديل يُبقي هالة من الخلفية. هذه حدود العزل لا التركيب — الحل مستقبلًا نموذج matting أو trimap، وليس تعديل قواعد التركيب.
2. **صور على مانيكان حي**: المعزول هو الشخص كاملًا، وهو السلوك الصحيح لبطاقة ملابس، لكن يجب أن يكون قرارًا منتجيًا واعيًا.
3. **زمن أول معالجة** ≈ 0.6 ث لكل صورة (inference + تركيب)، ثم من الـcache. يُنصح بتفعيل `warmIsolation` المكافئ للتركيب على نتائج Lens.
4. مسار العرض القديم `/media/isolated` ما زال يستعمل `object-fit: cover` + `multiply` عند الاحتياط — مقصود، حتى لا ينكسر أي رندر قائم.

## 6. الخطوة التالية المقترحة
- تمرير نتائج Lens/SerpApi عبر تسخين cache التركيب (مثل `warmIsolation`).
- إدخال `verify:image-composition` في CI (`.github/workflows/ci.yml`).
- توسيع الاستعمال إلى بطاقة المنتج المفصّلة والمجلّة بعد مراقبة الأداء.
