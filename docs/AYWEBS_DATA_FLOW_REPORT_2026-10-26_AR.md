# تقرير تقني: مسار بيانات AYWEBS بين التطبيق (mobile) والموقع (web)

**التاريخ:** 26/10/2026 — **الفرع:** `arena/032b2b90-ayrovi-beta1` عند الكوميت `dd01a58`
**النوع:** جرد/تتبّع كود فقط — **لم يُغيَّر أي ملف كود**. هذا المستند إضافة وثائقية.
**الصور المرفقة** تطابق فعليًا: قائمة «Recent products» داخل تبويب **Boutiques** في نسخة الويب، ثم ورقة `Select your desired item` بحالة `Reading the merchant page…` ثم تفاصيل المنتج (تقييم، مرجع تاجر، GTIN)، ثم بطاقات المقاسات بأسعارها وحالة كل مقاس.

---

## 0) الخلاصة في عشرة أسطر

1. البطاقة الصغيرة في سجلّ الويب **ليست** نتيجة بحث داخل التطبيق، وليست مخزّنة في المتصفح: هي **آخر صفوف جدول SQLite على الخادم** `ayweb_products` (آخر 6 حسب `resolved_at`).
2. الجدول **عامّ غير مرتبط بجلسة ولا بحساب**: أي منتج حُلَّ لأي مستخدم (من التطبيق أو من الويب) يظهر في «Recent products» للجميع.
3. عند الضغط على البطاقة، الويب **لا يستعمل** `product_id` المحفوظ إطلاقًا: يمرّر فقط `url` + `store_id` إلى الورقة، والورقة تنادي `POST /api/v1/aywebs/product/resolve` من جديد.
4. الخادم عند ذلك الطلب: يقرأ من **كاش ذاكرة** (TTL افتراضي 5 دقائق، مع نافذة SWR 30 دقيقة) وإلا **يعيد قراءة صفحة التاجر** فعليًا عبر الـ adapter. أي: «Reading the merchant page…» في الصورة = قراءة حقيقية (أو كاش داخلي)، لا قراءة من قاعدة البيانات.
5. الحفظ يحدث في كل `resolve` (INSERT/UPDATE على `ayweb_products`) — حتى لو جاءت القراءة من الكاش، مع **إعادة حساب سعر الدينار** في كل مرة.
6. الورقة تجمع مصدرين: استجابة `resolve` (طازجة/كاش) + `POST /product/variants` الذي يقرأ **الصفّ المحفوظ** من SQLite ويعيد تسعير كل خيار. لا يوجد «مصدر ثالث».
7. المحفوظ **يشمل** المقاسات والألوان وسعر كل خيار وتوفّر كل خيار (`variant_groups` + `variants` بصيغة JSON) — وليس الاسم والصورة والسعر فقط.
8. يوجد معرّف ثابت للمنتج (`aywprd_<uuid>`) ومعرّف مصدر (`source_product_id`) و`capture_id` و`evidence_hash` — لكن **الربط بالجلسة أحادي الاتجاه**: الجلسة تعرف منتجها الأخير، والمنتج لا يعرف جلسته.
9. التطبيق والموقع: **نفس الخادم ونفس الجداول**، لكن **نموذجان مختلفان في العميل** ومساران مختلفان: التطبيق يعتمد قراءة WebView محقونة (`capture`) ويفتح الورقة **محليًا بدون نداء خادم**، والموقع لا يستعمل `capture` أبدًا وينتظر قراءة الخادم.
10. نسبة `129,95 EUR ≈ 781.52 DT` ليست تحويل عملة بسيطًا: هي **السعر النهائي ZAYROVI الكامل** (تحويل + شحن + ديوانة + خدمة) كما يخزّنه `pricing_tnd` وقت الحلّ، أي **لقطة وقتية** قد تختلف عن رقم الورقة الذي يُحسب من جديد.

---

## 1) خريطة المسار الكاملة

### 1.A — من التطبيق (Expo / APK): القراءة المحقونة

```
apps/mobile/app/(tabs)/aywebs.tsx        → StoresContent (لا يوجد قسم "منتجات حديثة")
        ↓ فتح متجر
apps/mobile/app/aywebs/browser.tsx       → WebView + إعادة توجيه المتجر
        ↓ POST (قراءة الصفحة)
GET  /api/v1/aywebs/capture/script.js    → src/aywebs/captureScript.ts (1782 سطرًا)
        ↓ يُحقن في WebView  (buildAyWebsCaptureInjection)
WebView → postMessage(capture)           → parseAyWebsCaptureMessage
        ↓ "Add to Cart" (زر داخل صفحة التاجر)
apps/mobile/app/aywebs/browser.tsx:377   → مسار محلي: localProduct + AddToCartSheet (بلا خادم)
                                      أو :403 مسار خادم: POST /product/resolve مع capture
        ↓ تأكيد الإضافة
POST /api/v1/aywebs/cart/items           → addAyWebsCartItem → resolve(refresh:true) → persist
```

- `fetchAyWebsCaptureScript` و`buildAyWebsCaptureInjection`: `apps/mobile/src/api/aywebs.ts:385` و`:439`.
- المسار المحلي: `apps/mobile/app/aywebs/browser.tsx:377-400` (تعليق صريح: «aucun appel au serveur à l'appui»).
- بناء المنتج المحلي: `apps/mobile/src/features/aywebs/localProduct.ts` → `productFromCapture()` (السعر `null` دائمًا، والأبعاد من `capture`).

### 1.B — من الموقع (نسخة الويب): قراءة الخادم

```
client/src/features/aywebs/AyWebsApp.tsx
  openStore → client/src/services/nativeShell.ts:74 openMerchantPage()
              web  = window.open(url, '_blank')     ← لا حقن أي سكريبت
              APK  = WebView أصلية
```

- لا وجود لأي استعمال لـ `capture/script.js` في `client/src` (تحقّقنا بـ grep: صفر نتيجة).
- إذن في الويب كل قراءة منتج هي **قراءة خادم** (fetch + parse داخل Express).

### 1.C — الطريق المشترك: `POST /api/v1/aywebs/product/resolve`

| الطبقة | الملف | الدالة/السطر |
|---|---|---|
| التوجيه | `src/aywebs/routes.ts` | `router.post('/product/resolve', …)` — السطر 599 |
| هوية الجلسة | `src/aywebs/routes.ts:149` | `identityOf` → `requireAyWebsSession` + `resolveAyWebsIdentity` |
| محرّك الحلّ | `src/aywebs/productResolver.ts:202` | `resolveAyWebsProduct()` |
| بوابة القراءة | `src/aywebs/readGate.ts` | `withAyWebsReadSlot` (تزامن افتراضي 3) |
| كاش القراءة (ذاكرة) | `src/aywebs/resolveCache.ts` | TTL `300000ms` (السطر 51)، SWR `30min` (السطر 54) |
| حفظ المنتج | `src/aywebs/productResolver.ts:1033` | `persistAyWebsProduct()` |
| حساب السعر | `src/services/pricing.ts:299` | `calculatePrice()` |

القرار داخل المحرّك (السطور 327-460):

```
cacheAllowed = !refresh && !pageHtml && !captureUsed
cached       = cacheAllowed ? readAyWebsResolveCache(...) : null
captureUsed  → بناء المنتج من كائن capture (بلا شبكة وبلا كاش)
cached       → الخدمة من ذاكرة القراءة (fromCache=true, cacheAgeMs, servedStale)
failureMemo  → قراءة فاشلة محفوظة 90 ثانية
hostCircuit  → رفض سريع إن كان المضيف في راحة
else         → adapter.resolveProduct(url)   ← قراءة صفحة التاجر فعليًا
ثم: calculatePrice(...) → persistAyWebsProduct(...) → emit AYWEB_PRODUCT_RESOLVED
```

### 1.D — بطاقة «Recent products» في الويب

```
GET /api/v1/aywebs/home                        src/aywebs/routes.ts:307
  └─ listAyWebsRecentProducts(db, 6)           src/aywebs/productResolver.ts:1231
       └─ SELECT * FROM ayweb_products
          ORDER BY resolved_at DESC LIMIT 6    (بلا أي شرط session/account)
  └─ mapping الحقول                            src/aywebs/routes.ts:311-324
```

العميل: `client/src/features/aywebs/components/AyWebsStoresScreen.tsx:93-135`
- `getAyWebsHome()` في `client/src/features/aywebs/api.ts:413`.
- العنوان، الصورة، `price` + `currency`، `pricing_tnd`، `availability`، `source_url`، `resolved_at`.
- الشروط المعروضة: `price > 0` للسعر، `pricing_tnd > 0` لسطر الدينار، وحالة `AVAILABLE`/`OUT_OF_STOCK` فقط (حالة `UNKNOWN` لا تُعرض).
- قلب المفضّلة يفتح درج المفضلة ويكتب في حساب ZAYROVI (`useAyWebsFavorites`, بلا `localStorage`).

### 1.E — الضغط على البطاقة

```
AyWebsStoresScreen.tsx:132  onClick={() => onOpenProduct(product.source_url, product.store_id)}
AyWebsApp.tsx:119           onOpenProduct={(url, storeId) => setSheet({ url, storeId })}
AyWebsVariantSheet.tsx:92   resolveAyWebsProduct({ url, store })          ← لا product_id
AyWebsVariantSheet.tsx:105  getAyWebsVariants({ product_id })             ← ثم قراءة الصفّ
```

**الملاحظة الحاسمة:** `product.product_id` موجود في البطاقة لكنه **لا يُمرَّر**؛ الهوية تُعاد بناؤها من الـ URL.

---

## 2) أجوبة الأسئلة الثمانية

### س1 — من أين تأتي بيانات البطاقة؟ بيانات محفوظة من بحث التطبيق أم بحث جديد؟

**محفوظة على الخادم، وليست بحثًا لحظة العرض.** البطاقة تقرأ من جدول `ayweb_products` مباشرة (`SELECT … ORDER BY resolved_at DESC LIMIT 6`).
- مصدر الصفوف: كل `resolve` ناجح — من التطبيق (عند الإضافة/`resolve` مع `capture`) أو من الويب (عند فتح ورقة أو محاولة إضافة).
- **مهم:** مسار التطبيق المحلي (`local:true`) **لا يكتب شيئًا**؛ فمنتج جُرد داخل التطبيق دون إضافة لا يظهر في قائمة الويب.
- **مؤكد:** القائمة عامّة، غير مفلترة بالجلسة/الحساب (السطر 1234 من `productResolver.ts`). لا يوجد جدول «recent products» بالجلسة، خلافًا للمتاجر الحديثة (`ayweb_recent_stores` فيها `session_id`/`account_id`).

### س2 — أين تُحفظ البيانات؟

| الموقع | المحتوى | المصدر |
|---|---|---|
| **SQLite** `qatafo.sqlite` (`DATABASE_PATH`) | `ayweb_products`، `ayweb_product_variants`، `ayweb_evidence`، `ayweb_cart_items`، `ayweb_events`، `ayweb_sessions` | `src/db/database.ts:329-332`؛ القرص 1GB في `render.yaml` (`/opt/render/project/src/data`) |
| **ذاكرة العملية** (Map على كائن الـ scraper) | كاش قراءة المنتج (5 دقائق + 30 دقيقة SWR) + «mémo échec» 90 ثانية | `src/aywebs/resolveCache.ts` |
| **AsyncStorage (الهاتف فقط)** | المتاجر المحفوظة فقط | `apps/mobile/src/features/aywebs/savedStores.ts` |
| **لا شيء في المتصفح** | لا `localStorage` لبيانات AYWEBS في الويب | تعليق صريح في `client/src/features/aywebs/useAyWebsFavorites.ts:15` |

الكاش الذاكري **ليس** قاعدة بيانات: يضيع عند إعادة تشغيل/نشر الخدمة، ولا تُخزَّن فيه الأسعار المحسوبة (كل نداء يعيد `calculatePrice`).

### س3 — عند الضغط على البطاقة: استرجاع المحفوظ، أم فتح صفحة التاجر وإعادة الاستخراج؟

**إعادة استخراج (أو كاش ذاكرة قصير)، لا قراءة من قاعدة البيانات.**

- الطلب لا يحمل `refresh` ولا `capture` ولا `product_id` ⇒ `cacheAllowed = true`.
- احتمال 1 (شائع): كاش ذاكرة سليم (< 5 دقائق) ⇒ `from_cache: true` + `cache_kind: "read"`.
- احتمال 2: كاش متأخر زمنيًا (5–35 دقيقة) ⇒ يُقدَّم الصفّ **معلَّمًا `served_stale: true`** مع إعادة قراءة في الخلفية.
- احتمال 3 (ما يُفسّر «Reading the merchant page…» ~30 ثانية في الصورة): لا كاش ⇒ **قراءة حقيقية لصفحة التاجر** من سيرفر ZAYROVI عبر الـ adapter (`src/aywebs/adapters/zalando.ts` مثلًا)، تحت سقف تزامن 3 ودائرة حماية المضيف.
- في الحالات الثلاث: `persistAyWebsProduct` تُنفَّذ وتعيد كتابة نفس الصف (المفتاح: `store_id + source_product_id + source_url`).

**إذن:** الصفّ المحفوظ يُستخدم كـ«ذاكرة معروضات» للبطاقة فقط، وليس كمصدر للورقة.

### س4 — ورقة اختيار المنتج: بيانات البحث الأصلية، استخراج جديد، أم تجميع؟

**تجميع من مصدرين، وكلاهما «حديث» وليس «الأصلي»:**

1. `POST /product/resolve` (نفس ما في س3): العنوان، الصور، السعر، العملة، `price_verified`/`currency_verified`، الحالة (`condition`)، `gtin`، `sku`، `seller`، `rating`/`review_count`، التوفّر، `ayrovi_pricing`، `variant_groups`، `variant_details`، `variant_quotes`. مُسلسَلة في `productPayload()` — `src/aywebs/routes.ts:1449`.
2. `POST /product/variants` بـ`product_id` — `src/aywebs/routes.ts:706` → يقرأ الصفّ من SQLite (`readAyWebsProduct`) ويعيد `ayWebsVariantPricingPayload` (السطر 1415): سعر كل خيار + سعره بالدينار + صورته + توفّره. **بلا أي شبكة** (الفرع `stored ? null : resolve(...)`).

الصور والأسعار لكل مقاس في الصورتين 3 و4 تأتي من `variant_details[].image` و`quoted_price`/`ayrovi_pricing.total_tnd` (أي من الحقل `variants` المخزّن كـ JSON).
في التطبيق، إذا كان المسار محليًا، تأتي البطاقات من `capture.amazon.options`/`variantGroups` مباشرة، والسعر المحلي **لا يُحسب** (`localProduct: cardPrice` نصّ كما في الصفحة، و`total_tnd: null`).

### س5 — ماذا تشمل البيانات المحفوظة: الاسم/الصورة/السعر/الرابط فقط؟

**لا — أوسع بكثير.** أعمدة `ayweb_products` (`src/aywebs/schema.ts:100-140`):

```
id, store_id, source_url, source_domain, source_product_id,
title, description, brand, images(JSON[]), price, currency,
price_verified, currency_verified,
variant_groups(JSON), variants(JSON),           ← المقاسات/الألوان + سعر كل خيار + توفّر كل خيار + صورة كل خيار
condition, gtin, sku, seller, rating, review_count,
availability, availability_reason, availability_checked_at,
purchase_mode, integration_type, page_type,
pricing_tnd, pricing_version, pricing_breakdown(JSON),
evidence_hash, capture_id, resolved_at, created_at, updated_at
```

جدول مرافق: `ayweb_product_variants` (سطر 143) — **يُكتب ولا يُقرأ أبدًا**: لا يوجد `SELECT` عليه في المشروع كله (تحقّق grep)، ولا عمود `image` فيه. القراءة الفعلية من JSON في `ayweb_products`.

**ما لا يُحفظ:**
- صفحة التاجر الخام (HTML) — تُرفض أصلًا من الـ API (`rejectProvidedPage`).
- `capture` الخاص بالـ WebView (الهيكل الكامل، البصمة `fingerprint`، قيم `priceCandidates`): تُستعمل داخل الطلب ثم تُهمَل. فقط `capture_id` ونتيجة مركّبة تُحفظ.
- `variantGroups` المقروءة من capture (الدليل لكل قيمة): تُغذّي `recordAyWebsVariantContract` (حالة ذاكرة) ولا تُخزَّن.
- `quote_token` (التوقيع) و`quote_expires_at`: يُشتقّان لكل استجابة، لا يُخزَّنان.
- هوية الطالب (`session_id`/`account_id`) على صفّ المنتج.
- `variant_quotes` المحسوبة لكل قيمة.

### س6 — هل توجد معرّفات ثابتة تربط البطاقة بالمنتج الأصلي ونتيجة الاستخراج وجلسة AYWEBS؟

| المعرّف | الثبات | أين | ملاحظة |
|---|---|---|---|
| `product_id` = `aywprd_<uuid>` | ثابت عبر عمليات الحلّ المتتالية | `ayweb_products.id` | يُعاد استخدامه عبر البحث بـ `store_id + source_product_id + source_url` (السطور 1049-1055) |
| `source_product_id` (ASIN/SKU…) + `source_url` + `source_domain` | من المصدر | نفس الصفّ | فهرس فريد `idx_ayweb_products_source_unique` |
| `capture_id` = `ayw_<uuid>` | **متغيّر في كل resolve** | عمود + فهرس + `ayweb_domain_events.payload` | يُستبدل في كل تحديث ⇒ لا يمثّل «الكابتشر الذي جاءت منه البطاقة» |
| `evidence_hash` | ثابت ما دامت البيانات لم تتغيّر | الصفّ + `ayweb_evidence` | يمكن تتبّع نسخ القراءة الزمنية عبر `ayweb_evidence(product_id, retrieved_at)` |
| الجلسة | **غير مرتبطة بالمنتج** | `ayweb_sessions.current_product_id/current_store_id/current_url/selected_variant` تُحدَّث في كل resolve (`src/aywebs/context.ts:225`) | علاقة اتجاه واحد: الجلسة → المنتج الأخير فقط |
| الحساب | **غير مرتبط بالمنتج** | `ayweb_domain_events.account_id` للأحداث | لا عمود account على `ayweb_products` |

**نتيجة عملية:** يمكن الإجابة «ما هو آخر منتج حلّه هذا المستخدم؟» لكن **لا يمكن** الإجابة «من أنشأ/فتح هذا الصفّ؟» ولا نسب بطاقة في القائمة إلى صاحبها.

### س7 — هل التطبيق والموقع يستعملان نفس Backend ونفس نموذج بيانات المنتج؟

**نفس الخادم والجداول: نعم. نفس النموذج في العميل: لا.**

- **الخادم:** تطبيق واحد. التطبيق يضرب `API_BASE_URL = https://ayrovi-beta1-moo8.onrender.com` (`apps/mobile/src/api/config.ts:19`) و`AYWEBS_BASE = '/api/v1/aywebs'` (`apps/mobile/src/api/aywebs.ts:16`). الويب يضرب نفس المسارات نسبيًا لأن Express نفسه يقدّم SPA (`src/server.ts:403,559`) و`app.use('/api/v1/aywebs', createAyWebsRouter(...))` في السطر 469.
- **نموذج الويب:** استهلاك مباشر لحِمْل الخادم بصيغة `snake_case` (`client/src/features/aywebs/api.ts` — `AyWebsProductPayload`)، مع `quoteToken` و`cacheKind` و`servedStale`.
- **نموذج التطبيق:** تحويل إلى `camelCase` عبر `parseAyWebsResolvedProduct` (`apps/mobile/src/api/aywebs.ts:259`) ⇒ `AyWebsResolvedProduct` + `AyWebsVariantOption` + `AyWebsVariantQuote`.
- **نموذج ثالث محلي في التطبيق فقط:** `AyWebsResolvedProduct` مصنوع من `capture` (`localProduct.productFromCapture`): `productId` = ASIN، `price: null`، `currency: ''`، `ayroviPricing: null`، `variantGroups` من الصفحة، `LocalVariant.cardPrice` نصّ.

**الفروق الوظيفية المثبتة بالكود:**

| المحور | الويب | التطبيق |
|---|---|---|
| مصدر قراءة الصفحة | fetch خادم (`adapter.resolveProduct`) | WebView محقون داخل الجهاز (`captureScript.ts`) |
| إرسال `capture` إلى API | **أبدًا** (لا أثر في `client/src`) | دائمًا في المسار المحقون |
| فتح ورقة الاختيار | ينتظر `resolve` من الخادم («Reading the merchant page…») | **محلي فوري** بلا خادم إذا كان `captureAllowed` |
| كاش | ذاكرة الخادم فقط | + `prefetch` في العميل (`canReusePrefetch`, 30 ثانية) + إعادة محاولة قراءة السعر (`captureFlow.ts`, مرّتان) |
| صفحة المقاس المنفصل | غير موجودة | `variantPage.ts` + قراءة WebView مخفي (`readVariant`) |
| قائمة «منتجات حديثة» | نعم (`/home`) | **لا** — لا نداء لـ `/home` في التطبيق، ولا قسم في `StoresContent.tsx` |
| حساب السعر بالدينار | خادم (`ayrovi_pricing`) | خادم فقط، و`selectionQuote.ts` يختار سطرًا ولا يحسب |

### س8 — المسار الفعلي في الكود (فهرس الملفات والدوال والـ endpoints)

**Endpoints AYWEBS ذات الصلة** (كلها تحت `/api/v1/aywebs`):

| Endpoint | الملف/السطر | الوظيفة |
|---|---|---|
| `GET /home` | `routes.ts:307` | المتاجر + `recent_stores` + **`recent_products`** + ملخّص السلة |
| `POST /product/resolve` | `routes.ts:599` | حلّ منتج (كاش/شبكة/capture) + تسعير + حفظ |
| `POST /product/variants` | `routes.ts:706` | خيارات + أسعار بالدينار من الصفّ المحفوظ |
| `GET /product/:id/availability` | `routes.ts:746` | إعادة فحص التوفّر |
| `GET /capture/script.js` | `routes.ts:593` | سكريبت القراءة (للتطبيق فقط) |
| `POST /capture` | `routes.ts:779` | تعاقد V1 للالتقاط |
| `POST /cart/items` | `routes.ts:928` | إضافة (devis موقّع أو إعادة قراءة `refresh:true`) |
| `POST /session/context` · `GET /session` | `routes.ts:389` / `:362` | سياق الجلسة |
| `GET /health` · `GET /metrics` | `routes.ts:409` / `:480` | الحالة والمقاييس |

**الدوال المفتاحية:**
- `resolveAyWebsProduct` — `src/aywebs/productResolver.ts:202`
- `persistAyWebsProduct` — `src/aywebs/productResolver.ts:1033`
- `readAyWebsProduct` / `hydrateStoredProduct` — `:1218` / `:1237`
- `listAyWebsRecentProducts` — `:1231`
- `readAyWebsResolveCache` / `writeAyWebsResolveCache` / `runAyWebsResolveOnce` — `src/aywebs/resolveCache.ts:162 / 206 / 237`
- `addAyWebsCartItem` — `src/aywebs/cart.ts` (نداء `resolveAyWebsProduct(..., refresh: true)` في السطر 438)
- `calculatePrice` — `src/services/pricing.ts:299`
- التتبّع: `trackAyWebsNavigation` — `src/aywebs/context.ts:225`

**العميل (ويب):**
- `client/src/features/aywebs/AyWebsApp.tsx:119` — فتح الورقة
- `client/src/features/aywebs/components/AyWebsStoresScreen.tsx:93-135` — البطاقة
- `client/src/features/aywebs/components/AyWebsVariantSheet.tsx:92,105` — resolve ثم variants
- `client/src/features/aywebs/api.ts:413,428,448` — `getAyWebsHome` / `resolveAyWebsProduct` / `getAyWebsVariants`

**العميل (تطبيق):**
- `apps/mobile/app/aywebs/browser.tsx:377-435` — المسار المحلي ثم `resolve` مع `capture`/`refresh:true`
- `apps/mobile/src/api/aywebs.ts:538,585` — `resolveAyWebsProductWithCapture` / `resolveAyWebsProduct`
- `apps/mobile/src/features/aywebs/localProduct.ts` — `productFromCapture`, `localVariantsFromCapture`, `localAddReadiness`
- `apps/mobile/src/features/aywebs/captureFlow.ts` — قرار الإضافة وإعادة المحاولة
- `apps/mobile/src/features/aywebs/selectionQuote.ts` — اختيار سطر السعر (بلا حساب)

---

## 3) جدول: ما يُحفظ / ما يُعاد استخراجه / ما يُفقد

| المعلومة | البطاقة (ويب) | ورقة الويب | ورقة التطبيق (محلي) | أين تعيش |
|---|---|---|---|---|
| العنوان + الصورة | من DB | من `resolve` | من `capture` | DB + capture |
| السعر الأصلي والعملة | من DB (`price`,`currency`) | من `resolve` (طازج) | نصّ الصفحة فقط | DB |
| الرقم بالدينار | `pricing_tnd` **لقطة** وقت آخر حلّ | يُعاد حسابه الآن | `null` (لا يظهر) | DB / حساب لحظي |
| المقاسات/الألوان | لا تُعرض | `variant_groups` + بطاقات | `capture` | DB (JSON) |
| سعر كل خيار | لا | `variant_details`/`variant_quotes` | `cardPrice` نصّ | DB (JSON) |
| توفّر كل خيار | لا (فقط توفّر المنتج) | `variants[].availability` | `capture` | DB (JSON) |
| «تمّ التحقق من السعر/العملة» | غير معروض | يمنع/يسمح الإضافة | — | `price_verified` |
| دليل القراءة (`evidence_hash`) | غير معروض | غير معروض | غير موجود | DB + `ayweb_evidence` |
| حداثة القراءة (`from_cache`, `served_stale`) | غير معروض | **يُستقبل ولا يُعرض** | — | استجابة API |
| بيانات `capture` الخام | — | — | في الذاكرة فقط | **يُفقد** بعد الطلب |
| الجلسة صاحبة القراءة | — | — | — | **يُفقد** (لا عمود) |

---

## 4) ملاحظات معمارية مؤكَّدة بالكود (لا تغيير كود في هذه المرحلة)

1. **هوية مزدوجة غير مستغلّة:** البطاقة تملك `product_id`، لكن الورقة تُعيد الحلّ بالـ URL فقط. النتيجة: كل فتحة بطاقة = قراءة تاجر محتملة + كتابة على الصفّ + تغيير ترتيب «Recent products» (الترتيب بـ `resolved_at`).
2. **قائمة «أحدث المنتجات» عامّة:** `listAyWebsRecentProducts(db, limit)` بلا `session_id`/`account_id` (مقارنةً بـ `listAyWebsRecentStores(db, sessionId, accountId, …)` في `browser.ts:542`). أثرها: تسريب بصري لمنتجات مستخدمين آخرين + ضجيج اختبار.
3. **تفاوت سعر البطاقة/الورقة:** `pricing_tnd` مخزّن وقت الحلّ، بينما الورقة و`/product/variants` يعيدان التسعير بقواعد/أسعار صرف حالية (`pricingVersion`). بطاقة قديمة + سعر صرف جديد ⇒ رقمان مختلفان لنفس المنتج.
4. **جدول `ayweb_product_variants` مكتوب وغير مقروء** (لا `SELECT`)، وبلا عمود صورة؛ القراءة الفعلية من JSON. تكلفة كتابة ومساحة بلا فائدة حالية.
5. **`capture_id` يُستبدل في كل resolve:** لا يمكن استعماله لتتبّع «الكابتشر الأصلي» لبطاقة، بينما `ayweb_evidence` (بـ`evidence_hash` + `retrieved_at`) هو السجل الزمني الصحيح.
6. **اختلاف الويب/التطبيق في نقطة الحقيقة:** الويب لا يستطيع الاستفادة من قراءة المتصفح المحلية (لا حقن)، والتطبيق يفتح الورقة قبل أي تحقق خادم (المخزون «غير مؤكد» يظهر كما في الصورة 2). النموذج المحلي يعيد تنفيذ جزء من قواعد الخادم (`localAddReadiness` مقابل منطق `productResolver`) — أي منطق مكرّر في مكانين.
7. **كاش الذاكرة غير مشترك بين العمليات:** كاش `resolveCache` معلّق بكائن الـ scraper داخل العملية الواحدة؛ مع أكثر من نسخة (scale) أو إعادة نشر، يُفقد الكاش ⇒ انتشار حالات «Reading the merchant page…» الطويلة.
8. **لا يوجد «recent products» للتطبيق:** الواجهة موجودة في الويب فقط؛ أي تطوير لاحق سيضطر إمّا لاستدعاء `/home` من التطبيق أو لإنشاء مورد مشترك.
9. **`source_url` هو المفتاح الحقيقي للتنقّل** (بطاقة → ورقة، مفضّلة → ورقة) وليس `product_id`؛ أي تغيير في الصفحة (بارامترات تتبّع) يُعامل ككيان جديد عند الاختلاف، مع أن كاش الحلّ يطبّع بارامترات التتبّع (`TRACKING_PARAMS` في `resolveCache.ts`) بينما فهرس قاعدة البيانات لا يطبّعها.

---

## 5) نقاط لم أستطع إثباتها من الكود (غير مؤكّدة)

1. **مصدر الصفوف التي ظهرت في صورك تحديدًا** (من التطبيق أم من الويب): ممكن تقنيًا من الاثنين، ولا يوجد عمود يميّز من أنشأ الصفّ. ما يمكن إثباته: كل مصفوفة `recent_products` تُقرأ من `ayweb_products` وحدها.
2. **هل كانت قراءة Zalando في صورتك من كاش أم شبكة:** الكود يعطي الحقلين `from_cache` و`cache_kind` في الاستجابة، لكن لا سجلات متاحة هنا لأربط 30 ثانية بمصدر محدد. المدة الطويلة تُرجّح قراءة شبكة (سقف الانتظار في بوابة القراءة 20 ثانية + زمن الـ adapter)، لكن هذا **استنتاج لا إثبات**.
3. **سلوك Render مع SQLite تحت أكثر من نسخة:** `render.yaml` يعرّف خدمة واحدة وقرصًا واحدًا؛ إن رُفعت النسخ مستقبلًا فستكون مشكلة (ملف واحد + كتابة متزامنة) — لم أتحقق من إعداد النسخ الحالي في لوحة Render.
4. **قيمة سعر الصرف المستعملة في `781.52 DT`:** الرقم نهائي من `calculatePrice` (تحويل + شحن + ديوانة + خدمة + توصيل محلي)، ولا أستطيع من الكود تحديد توزيع المبلغ في تلك اللحظة لأن `pricing_breakdown` مخزّن في الصفّ وليس في السجلّ المرفق.
5. **دور `readAyWebsProductBySource`:** معرّفة في `productResolver.ts:1225` لكن بلا أي مستدعٍ في المشروع ⇒ تبدو غير مستعملة (لم أُثبت أنها ميتة 100% لأنها قد تُستدعى من سكربتات خارج الحزمة).

---

## 6) خطوات تالية مُقترحة (بدون تنفيذ الآن)

للنقاش فقط، مرتّبة بنداء الكود الذي تحلّه:

1. تمرير `product_id` من البطاقة إلى الورقة، وفتح الورقة من الصفّ المحفوظ فورًا ثم إعادة التحقق في الخلفية (يعالج ملاحظة 1 و3 و7).
2. جعل «المنتجات الحديثة» مرتبطة بالجلسة/الحساب مثل `ayweb_recent_stores` (يستدعي جدولًا جديدًا أو عمودًا).
3. قرار موحّد: هل `source_url` أم `(store_id, source_product_id)` هو مفتاح العرض؟ وتطبيع بارامترات التتبّع في الفهرس أيضًا.
4. توحيد النموذج بين التطبيق والويب على payload واحد (`shared/aywebsTypes.ts` موجود أصلًا ويُستعمل في الخادم فقط) بدل ثلاث صور للمنتج.
5. إمّا حذف `ayweb_product_variants` أو جعله المصدر الوحيد للقراءة، مع إضافة عمود `image`.
6. عرض حداثة القراءة (`from_cache`, `served_stale`) في الواجهتين — البيانات موجودة في الاستجابة ولا تُعرض اليوم.

---

_انتهى التقرير. لم يُعدَّل أي كود؛ الملف المُضاف هو هذا التقرير فقط._
