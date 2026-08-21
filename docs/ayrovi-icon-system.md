# نظام أيقونات AYROVI — النسخة المعتمدة (2026-08-21)

> **Style Zalando : monoline fine 1.5 sur grille 24, coins arrondis, currentColor, monochrome strict — aucun point, aucun accent.**

## 1. مواصفة التنفيذ

| الخاصية | القيمة |
|---|---|
| Canvas / ViewBox | `24 × 24` / `0 0 24 24` |
| Stroke | **1.5** عبر `--ayrovi-icon-stroke` (تناسبية مع الحجم — `vector-effect: none`) |
| Line cap / join | `round / round` |
| Default fill | `none` (التعبئة لحالات selected/liked فقط) |
| Colour | `currentColor` — لا لون مثبت داخل SVG |
| Monochrome | `currentColor` فقط — لا نقاط ولا ألوان داخل الأيقونات (قرار العميل 2026-08-21) |
| أحجام الاستخدام | 16 / 20 / 24 / 28–32 |

## 2. بنية التنفيذ

- `client/src/components/icons/ayrovi/AyroviIcon.tsx` — الأساس: `AyroviSvg` + `AyroviSignature` + `createAyroviIcon` + الثوابت.
- `client/src/components/icons/ayrovi/catalog.tsx` — **الكتالوج الوحيد**: 89 أيقونة، أيقونة لكل مفهوم (لا نسخ).
- `client/src/components/QatafoIcons.tsx` — **البوابة الوحيدة**: 90 اسما مستعملا فعلا في الواجهة، والدوال المكررة مفهوميا تشير إلى أيقونة واحدة (Grid = LayoutGrid, Package = Box = Cube…).
- `client/src/index.css` + `client/src/design/tokens.css` — عقد الرسم: ممنتوج واحد `.ayrovi-icon`، سمك 1.5، نقاط الـ signature.
- `docs/ayrovi-icon-family.html` — contact sheet للعائلة الكاملة (توليد: `scripts/family-sheet-entry.tsx`).
- `docs/brand-clone/` (أرشيف دراسة): الاستنساخ من المواقع الرسمية (Apple / Zalando / Amazon).

## 3. قرارات نظيفة (2026-08-21)

1. **حذف كامل** للإصدارات القديمة: ملفات الأبطال الخمسة المستقلة، الكتالوج الموسع (140+)، الشيم `Icons.tsx` — مع إبقاء كل سياق الاستخدام يعمل (البوابة تغطي كل الأسماء المستوردة فعلا).
2. **إزالة مكتبة lucide-react كليا** (0 مرجع في الكود، 0 في package.json) — أداة «واجهتي» تحتفظ بموديل AYROVI الوحيد.
3. **تقليص العدد**: من 140+ إلى 89 أيقونة (أيقونة/مفهوم)، و90 اسما في البوابة (كلها مستعملة).
4. **السمك 2 → 1.5** (نمط زلاندو) مع بقاء تناسبية الخط في كل الأحجام.
5. الاختبارات (`tests/icon-system.test.tsx`) تثبّت: 24px/1.5/round، مواضع النقاط، عدم وجود lucide، دمج المكرر.

## 4. الاستثناءات الموثقة

- علامات Google/Facebook/Instagram/TikTok/WhatsApp تبقى من `react-icons` (هويات تجارية).
- `HeartFilled` معبّأ مقصودا (حالة وظيفية).

## 5. قواعد الإضافة

1. أضف الرمز إلى `catalog.tsx` أولًا، ثم اسمه في `QatafoIcons.tsx`.
2. شبكة 24، خط 1.5، قلل المسارات، جرّب عند 16/20/24 px.
3. لا زخرفة إضافية ولا نقاط ولا ألوان داخل الأيقونات.
4. لا لون داخل SVG إطلاقًا (hويات تجارية فقط).
5. شغّل `npm run typecheck` + `npm test` بعد كل تعديل.
