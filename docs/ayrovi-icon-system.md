# نظام أيقونات AYROVI

> المرجع البصري: `file_00000000697c81f4bbd9d7abfd6842b7.png` (1254 × 1254 px)

## 1. دراسة النموذج المرجعي

النموذج يحتوي على خمسة رموز وظيفية: حقيبة تسوق، منزل، قائمة، قلب، ومستخدم. اللغة البصرية المشتركة بينها هي:

- **Monoline** بلا تعبئة افتراضية.
- لون الرسم يتبع `currentColor`، لذلك لا يُثبت اللون داخل SVG.
- نهايات الخطوط والوصلات دائرية: `stroke-linecap="round"` و`stroke-linejoin="round"`.
- هندسة بسيطة وقليلة العقد، مع منحنيات واسعة ومقروئية جيدة في الأحجام الصغيرة.
- سماكة الخط المرصودة في الملف تقارب 12 px ضمن رموز بعرض يقارب 200–280 px؛ التطبيع المناسب على شبكة 24 هو **1.5 وحدة**.
- لا توجد حاويات أو خلفيات جزءًا من الأيقونة نفسها.

### قياسات الأشكال في المرجع

| الرمز | صندوق الرسم التقريبي داخل الملف | الملاحظة الهندسية |
|---|---:|---|
| حقيبة | 278 × 308 px | جسم بحواف دائرية ومقبض قوسي منفصل |
| منزل | 265 × 284 px | محيط واحد وسقف لين وباب مركزي مفتوح بصريًا |
| قائمة | 169 × 139 px | ثلاثة خطوط متساوية، نهايات دائرية |
| قلب | 205 × 184 px | محيط متناظر بلا تعبئة |
| مستخدم | 208 × 194 px | رأس دائري وقوس كتفين مستقل |

## 2. مواصفة AYROVI المعتمدة

| الخاصية | القيمة |
|---|---|
| Canvas | `24 × 24` |
| ViewBox | `0 0 24 24` |
| Stroke | `1.5` عبر `--ayrovi-icon-stroke` |
| Line cap / join | `round / round` |
| Default fill | `none` |
| Colour | `currentColor` |
| Optical scaling | `vector-effect: non-scaling-stroke` |
| أحجام الاستخدام | 16 للبيانات الكثيفة، 20 للتحكم، 24 للتنقل، 28–32 للحالات البارزة |
| حالة Active | اللون الدلالي؛ التعبئة محجوزة فقط لحالات liked/saved/selected الصريحة |

## 3. الجرد الحالي

المسح الساكن داخل `client/src` وجد **89 اسمًا دلاليًا مستعملًا** من البوابة المركزية، عبر 289 موضع استيراد مسمى:

`AlertCircle`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `ArrowRightLeft`, `ArrowUp`, `ArrowUpRight`, `Barcode`, `Bell`, `Bookmark`, `Box`, `Calculator`, `Calendar`, `Camera`, `ChartLine`, `Check`, `CheckCircle2`, `ChevronDown`, `ChevronLeft`, `ChevronRight`, `Clipboard`, `Copy`, `CreditCard`, `Eye`, `EyeOff`, `FigLeaf`, `FileText`, `Gift`, `Globe2`, `Grid`, `Heart`, `HeartFilled`, `History`, `Home`, `Hourglass`, `Image`, `Info`, `LayoutGrid`, `LensBox`, `Link2`, `Loader2`, `LocateFixed`, `LogOut`, `Mail`, `MapPin`, `Menu`, `MessageCircle`, `MessageSquare`, `Mic`, `Minus`, `Monitor`, `Moon`, `MoreVertical`, `MousePointer2`, `Navigation`, `Package`, `PackageCheck`, `Palette`, `Pause`, `PenSquare`, `Pencil`, `Percent`, `Phone`, `Plug`, `Plus`, `RefreshCw`, `RotateCcw`, `Save`, `Search`, `Settings`, `Share2`, `ShieldCheck`, `ShoppingBag`, `SlidersHorizontal`, `Sparkles`, `Square`, `Star`, `Tag`, `ThumbsDown`, `ThumbsUp`, `Trash2`, `Truck`, `Type`, `User`, `Video`, `Volume2`, `VolumeX`, `X`, `Zap`.

كما تحافظ البوابة على أسماء توافق إضافية تستخدمها الواجهات أو يمكن أن تستخدمها إعدادات Admin من دون ربط المكونات بالمكتبة الخارجية مباشرة.

## 4. بنية التنفيذ

### البوابة المركزية

`client/src/components/QatafoIcons.tsx` هي مصدر الأيقونات الوحيد للمتجر، حساب العميل، AYROVIX، الواجهات الاجتماعية، وAdmin.

- أعيد رسم `ShoppingBag`, `Home`, `Menu`, `Heart`, `User` كأشكال AYROVI أصلية مبنية على المرجع.
- أُعيد رسم الرموز العامة الأكثر ظهورًا أيضًا: `Eye`, `MessageCircle`, `MessageSquare`, `Package`, `PackageCheck`, `ShieldCheck`, `Truck`, `Sparkles`, `ArrowRightLeft`, `Percent`, `FileText`, `MapPin`, `Info`, `Globe2`, `Search`, `X`, و`Grid`.
- بُني `ShoppingBagPlus` من هندسة الحقيبة نفسها للمحافظة على عائلة شكلية واحدة.
- احتُفظ بعلامات المنتج الخاصة `FigLeaf`, `LensBox`, و`AiMark` كرسومات AYROVI، لا كرموز عامة.
- كل رمز دلالي ثانوي يمر الآن عبر مكوّن AYROVI فعلي يحمل `data-ayrovi-icon` وسماكة `1.5` بدل الاكتفاء بإعادة تصديره من المكتبة الخارجية.

### التطبيق الشامل

`client/src/index.css` يطبق عقد الرسم على `.lucide` و`.qatafo-icon` في كامل التطبيق، بما فيه Admin، بدل تكرار خصائص SVG داخل كل صفحة.

### واجهتي

تبقى حزم الأيقونات الخمس في **واجهتي** متاحة للمقارنة والاختيار. حزمة `ayrovi` هي النظام الجديد، بينما Lucide وFont Awesome وBootstrap وMaterial خيارات معاينة مستقلة وليست بديلًا عن بوابة التطبيق المركزية.

## 5. الاستثناءات المتعمدة

- شعارات Google وFacebook وInstagram وTikTok وWhatsApp تبقى علامات تجارية أصلية من `react-icons` أو SVG مخصص.
- تعبئة `HeartFilled` وBookmark المحفوظ والنجمة التقييمية مقصودة لأنها تنقل حالة وظيفية.
- علامات AYROVIX/AYVISI المميزة لا تُستبدل بأيقونات عامة لأن شكلها جزء من هوية المنتج.

## 6. قواعد الإضافة مستقبلًا

1. لا تستورد أيقونة جديدة في صفحة المنتج مباشرة من مكتبة خارجية؛ أضفها أولًا إلى `QatafoIcons.tsx`.
2. استعمل شبكة 24، وقلل عدد المسارات والعقد، واختبر الرمز عند 16 و20 و24 px.
3. لا تثبت لونًا داخل SVG ولا تضف خلفية إلى هندسة الأيقونة.
4. لا تستخدم التعبئة إلا لحالة مختارة واضحة، مع بقاء النسخة غير النشطة outline.
5. لا تغيّر سماكة أيقونة منفردة إلا بسبب بصري موثق؛ القيمة الافتراضية هي `--ayrovi-icon-stroke: 1.5`.
6. لا تُعد رسم شعار تجاري كرمز خطي عام.
