# تدقيق AYWEBs الكامل — 2026-10-07

> **طبيعة الملف:** تدقيق **قراءة فقط**. لم يُعدَّل أي ملف من ملفات AYWEBs أثناء إعداده.
> **المرجع الحاكم:** `docs/AYWEBS_ADD_TO_CART_ORDER.md` (أمر المالك الدائم، 2026-10-03).
> **المنهج:** كل رقم وكل ادعاء في هذا الملف مُستخرَج بأمر فعلي على الشيفرة في
> الكوميت `4ee2a8a`، مع ذكر `الملف:السطر`. ما لم يُتحقَّق منه مُعلَّم صراحةً بـ **[غير مُتحقَّق]**.

---

## 0) بطاقة الحالة — ما تغيّر عن بطاقة التسليم السابقة

هذه الجلسة تعمل على حاوية **جديدة** وعلى فرع **مختلف**. الفروق التالية مُتحقَّق منها بأوامر `git`
نفّذتها في هذه الجلسة، وهي تُصحّح ثلاث نقاط في بطاقة التسليم:

| البند | بطاقة التسليم قالت | الواقع المُتحقَّق الآن | الدليل |
|---|---|---|---|
| فرع الجلسة | `arena/c0321e79-ayrovi-beta1` | **`arena/b92dc447-ayrovi-beta1`** | `git rev-parse --abbrev-ref HEAD` |
| `main` | `8e82dea` | **`4ee2a8a`** (2026-10-07 10:21 UTC) | `git ls-remote origin refs/heads/main` |
| فرع «العرض الموقّع» | «يشير لنفس الكوميت ⇒ يبدو مدمجاً» | الفرع عند **`8e82dea`** (2026-10-07 04:08 UTC) أي **كوميت مختلف**، لكنه **مدمج فعلاً في `main`**؛ `main` = الفرع + كوميت واحد فقط (`4ee2a8a` إصلاح CI/sharp) | `git merge-base --is-ancestor 8e82dea HEAD` ⇒ **نعم**؛ `git log --oneline 4ee2a8a ^8e82dea` ⇒ `4ee2a8a` وحده |
| عمل P2 للتطبيق | «تعديلات غير مُودَعة على القرص» | **غير موجودة في هذه الحاوية إطلاقاً**: لا `apps/`، ولا `src/customer/sessionExchange.ts`، ولا `src/services/rateKey.ts`، ولا `tests/customer-mobile-session.test.ts`، ولا `.github/workflows/mobile.yml`؛ وشجرة العمل **نظيفة تماماً** | `ls -d apps` ⇒ `No such file or directory`؛ `git status --porcelain` ⇒ فارغ |
| رموز رفض الالتقاط | من بينها `NO_AVAILABILITY_EVIDENCE` | هذا الرمز **غير موجود في الشيفرة**؛ الموجود 19 رمزاً مختلفاً (القسم 6) | `grep -rn "NO_AVAILABILITY_EVIDENCE" src/aywebs/` ⇒ لا نتيجة |

**الخلاصة العملية:** السؤال المفتوح رقم 1 في البطاقة **مُجاب**: `feat/aywebs-phase1-signed-quote`
مدمج بالكامل في `main`، ولا داعي للتفكير فيه كفرع مستقل. أمّا عمل P2 (تطبيق React Native) فهو
**خارج هذه الحاوية**؛ أي بناء عليه يحتاج إما استرجاعه من حاويته الأصلية أو إعادته.

ملاحظة تقنية: المستودع وصل **مُسطَّحاً** (`git rev-list --count HEAD` = 1)؛ أزلت التسطيح
بـ `git fetch --unshallow origin` فأصبح العدد **595** كوميت — وهذا ما سمح بإثبات الدمج أعلاه.

---

## 1) التعريف والفصل بين الطبقات الثلاث

المشروع يحمل ثلاثة أنظمة متجاورة يخلط بينها الاسم. الفصل الحقيقي **بالملفات والمسارات**:

| النظام | الشيفرة | نقاط الدخول HTTP | الوظيفة |
|---|---|---|---|
| **AYWEBs** | `src/aywebs/` (25 ملفاً) | `/api/v1/aywebs` (`src/server.ts:355`) · `/api/admin/aywebs` (`src/admin/routes.ts:486`) | وكيل شراء (proxy-shopping نوع Buyee): يقرأ فيشة منتج من متجر خارجي، يحسب الثمن بالدينار، يضيف للسلة، يطلب الشراء |
| **AYROVIX** | `src/ayrovix/` | `/api/ayrovix` (`src/server.ts:349`) | العدسة والتحليل: صورة/رابط/باركود/نص ← منتج، مع عقد سعر موقّع في `priceQuote.ts` |
| **Lens** | `src/ayrovix/services/lensEngine.ts` + `src/services/lensMedia.ts` | داخل `/api/ayrovix/analyze-image` | البحث بالصورة |

**حدّ المسؤولية الحاسم:** AYWEBs **لا يثق** بأي سعر قادم من العميل. الالتقاط يُرسل
**نصوصاً فقط** في حقل `capture`، والخادم وحده يحكم (القسم 6). إرسال HTML مرفوض قطعياً:
`rejectProvidedPage` في `src/aywebs/routes.ts:131` يرمي `RAW_PAGE_CAPTURE_DISABLED`، ويُستدعى
في أربعة مواضع: `routes.ts:561, 568, 666, 884`.

---

## 2) الدورة الكاملة (من المتجر إلى الطلب)

```
STORE  →  PRODUCT  →  CAPTURE (WebView)  →  RESOLVE (خادم)  →  VARIANTS
   →  PRICE-QUOTE (موقّع)  →  ADD TO CART  →  CART VERIFY  →  BRIDGE→AYROVI
   →  CHECKOUT PREVIEW  →  ORDER  →  SUBMIT  →  PAYMENT  →  PURCHASE (مراجعة بشرية)
   →  [WAREHOUSE / CONSOLIDATION / SHIPPING = غير مُنفَّذة]
```

نقاط حقيقية مُتحقَّق منها:

1. **الالتقاط (المرحلة 2.1).** السكربت يُخدَم من الخادم على `GET /api/v1/aywebs/capture/script.js`
   (`routes.ts:550-554`) مع `Cache-Control: public, max-age=300`. فائدته المُصرَّح بها في
   `captureScript.ts:10-15`: إصلاح مُحدِّد (sélecteur) مكسور يصبح **نشر خادم** لا إصدار تطبيق جديد.
2. **الحكم على الالتقاط.** `src/aywebs/webviewCapture.ts` يقارن الالتقاط بإعادة قراءة الخادم
   ويرفض عند التباعد: `PRICE_DIVERGED` / `CURRENCY_DIVERGED` / `AVAILABILITY_DIVERGED` (السطور 434-439).
3. **العرض الموقّع.** `src/aywebs/quoteToken.ts` — إعادة قراءة التاجر تُفرض مجدداً إذا: لا jeton،
   أو منتهي/توقيع خاطئ، أو تجاوز `AYWEBS_QUOTE_FRESH_MS` (الافتراضي **5 دقائق**، السطر 66)،
   أو تجاوز المبلغ `AYWEBS_QUOTE_REVERIFY_TND` (الافتراضي **2000 د.ت**، السطر 67)،
   أو وقعت عيّنة التدقيق `AYWEBS_QUOTE_REVERIFY_SAMPLE` (الافتراضي **5%**).
   **فصل نطاقات التوقيع:** المفتاح **مشتق بـ HKDF-SHA256** من سرّ cotation الخاص بـ AYROVIX
   مع etikette خاصة بـ AYWEBs (تعليق `quoteToken.ts:34-36`) ⇒ jeton سلة AYWEBs لا يصلح لغيرها.
4. **الإضافة للسلة.** `POST /cart/items` (`routes.ts:880`) ثم `POST /cart/verify` (`routes.ts:1053`)
   الذي يفرض `refresh:true` دائماً، ثم `POST /cart/bridge-to-ayrovi` (`routes.ts:1065`).
   **idempotence الجسر** موثّقة في `src/aywebs/ayroviBridge.ts:164` («Idempotence du pont، 04/10/2026»).
5. **الطلب.** `POST /orders` (`routes.ts:1118`) ← `POST /orders/:id/submit` (`routes.ts:1182`).
   عند الإرسال تُوضع بنود الشراء في **`PENDING_INTEGRATION`** مع مراجعة بشرية — لا «purchased»
   وهمي أبداً (`orders.ts:645-649` و`orders.ts:793-803` حيث `reason: 'revue_humaine_requise'`).
6. **المراحل 7 و8 غير مُنفَّذة.** ست نقاط نهاية تُرجع `NOT_IMPLEMENTED` صراحةً
   (`routes.ts:1349-1354`): `/warehouse`، `/warehouse/items/:id`،
   `/warehouse/items/:id/consolidate`، `/shipping/quote`، `/shipping/request`، `/shipping/pay`،
   مع `requiredAction: 'WAIT_FOR_REVIEW'` ورسالة «aucune donnée simulée n'est renvoyée (§48)».
   **تصحيح للبطاقة:** الذي يتحقق منه الكود هو المرحلتان **7 و8**؛ لم أجد في `routes.ts` نقطة
   «PHASE 6» تُرجع `NOT_IMPLEMENTED`.

---

## 3) جرد كامل لمسارات `src/aywebs/routes.ts` (76 ك.ب)

**43 نقطة نهاية** — هذا الجرد exhaustive ومُستخرَج بـ `grep -nE "router\.(get|post|put|patch|delete)\("`
مع أرقام الأسطر الحقيقية:

### 3.1 المتاجر والجلسة والصحة (8)
| # | الطريقة | المسار | السطر |
|---|---|---|---|
| 1 | GET | `/stores` | 245 |
| 2 | GET | `/stores/:id` | 268 |
| 3 | GET | `/stores/:id/capabilities` | 274 |
| 4 | GET | `/home` | 295 |
| 5 | GET | `/session` | 350 |
| 6 | POST | `/session/context` | 377 |
| 7 | GET | `/health` | 397 |
| 8 | GET | `/metrics` | 451 |

### 3.2 الأحداث والتحليل والالتقاط (5)
| # | الطريقة | المسار | السطر |
|---|---|---|---|
| 9 | POST | `/events` | 460 |
| 10 | POST | `/page/analyze` | 488 |
| 11 | GET | `/capture/script.js` | 550 |
| 12 | POST | `/product/resolve` | 556 |
| 13 | POST | `/product/variants` | 661 |

### 3.3 التوفّر والالتقاط القديم والعرض الموقّع (3)
| # | الطريقة | المسار | السطر |
|---|---|---|---|
| 14 | GET | `/product/:id/availability` | 701 |
| 15 | POST | `/capture` | 734 |
| 16 | POST | `/price-quote` | 840 |

### 3.4 السلة (7)
| # | الطريقة | المسار | السطر |
|---|---|---|---|
| 17 | GET | `/cart` | 872 |
| 18 | POST | `/cart/items` | 880 |
| 19 | PATCH | `/cart/items/:id` | 981 |
| 20 | DELETE | `/cart/items/:id` | 1015 |
| 21 | POST | `/cart/items/:id/accept-price` | 1040 |
| 22 | POST | `/cart/verify` | 1053 |
| 23 | POST | `/cart/bridge-to-ayrovi` | 1065 |

### 3.5 الدفع والطلبات (9)
| # | الطريقة | المسار | السطر |
|---|---|---|---|
| 24 | POST | `/checkout/preview` | 1103 |
| 25 | POST | `/orders` | 1118 |
| 26 | GET | `/orders` | 1157 |
| 27 | GET | `/orders/:id` | 1168 |
| 28 | POST | `/orders/:id/submit` | 1182 |
| 29 | GET | `/payments/methods` | 1198 |
| 30 | POST | `/payments/intents` | 1210 |
| 31 | POST | `/payments/confirm` | 1222 |
| 32 | POST | `/orders/:id/payments/transfer-proof` | 1234 |

### 3.6 طلبات الشراء وطلبات المتاجر (5)
| # | الطريقة | المسار | السطر |
|---|---|---|---|
| 33 | POST | `/purchase-requests` | 1273 |
| 34 | GET | `/purchase-requests` | 1292 |
| 35 | GET | `/purchase-requests/:id` | 1303 |
| 36 | POST | `/store-requests` | 1314 |
| 37 | GET | `/store-requests` | 1330 |

### 3.7 المستودع والشحن — غير مُنفَّذة (6)
| # | الطريقة | المسار | السطر | الحالة |
|---|---|---|---|---|
| 38 | GET | `/warehouse` | 1349 | `NOT_IMPLEMENTED` (PHASE 7) |
| 39 | GET | `/warehouse/items/:id` | 1350 | `NOT_IMPLEMENTED` (PHASE 7) |
| 40 | POST | `/warehouse/items/:id/consolidate` | 1351 | `NOT_IMPLEMENTED` (PHASE 7) |
| 41 | POST | `/shipping/quote` | 1352 | `NOT_IMPLEMENTED` (PHASE 8) |
| 42 | POST | `/shipping/request` | 1353 | `NOT_IMPLEMENTED` (PHASE 8) |
| 43 | POST | `/shipping/pay` | 1354 | `NOT_IMPLEMENTED` (PHASE 8) |

### 3.8 الإدارة `/api/admin/aywebs` — 22 نقطة نهاية
`src/aywebs/adminRoutes.ts` (مركّب في `src/admin/routes.ts:486`):
`/overview` (103) · `/stores` (143) · `/adapters` (164) · `/orders` (169) · `/orders/:id` (184) ·
`/orders/:id/purchase/start` (205) · `/orders/:id/purchase/confirm` (215) ·
`/orders/:id/purchase/fail` (226) · `/orders/:id/transition` (243) · `/payments` (257) ·
`/payments/:id/approve` (288) · `/purchase-requests` (303) · `/purchase-requests/:id` (315) ·
`/purchase-requests/:id/decide` (329) · `/store-requests` (344) · `/store-requests/:id/decide` (350) ·
`/exceptions` (363) · `/audit` (383) · `/events` (389) · `/warehouse` (412) · `/consolidation` (413) ·
`/shipping` (414).
الثلاثة الأخيرة تُرجع `NOT_IMPLEMENTED` (`adminRoutes.ts:399-402`) بدل بيانات وهمية.

### 3.9 AYROVIX `/api/ayrovix` — 14 نقطة نهاية
`src/ayrovix/routes.ts`: `/history` (163) · `/live-events` (171) · `/analyze-image` (185) ·
`/analyze-url` (440) · `/analyze-code` (522) · `/analyze-barcode` (546) · `/analyze-text` (570) ·
`/watch` POST (596) · `/watch` GET (613) · `/watch/:id` DELETE (619) · `/review-request` (627) ·
`/review-request/:id` (663) · `/live-stock` (682) · `/choose` (710).

### 3.10 حدود المعدّل الفعلية (`src/server.ts:176-188`)
كلها لكل **10 دقائق**، والقيمة بين قوسين هي قيمة الإنتاج (في الاختبار 1000):
`capture` 20 · `product/resolve` 20 · `product/variants` 40 · `page/analyze` 120 · `price-quote` 60 ·
`events` 120 · `cart` 60 · `checkout` 30 · `orders` 30 · `payments` 30 · `purchase-requests` 20 ·
`store-requests` 20.

---

## 4) الجداول وآلات الحالة

### 4.1 الجداول
`src/aywebs/schema.ts` يحتوي **28 عبارة `CREATE TABLE IF NOT EXISTS`** تغطّي **26 جدولاً متميزاً**
(الاسم `ayweb_cart_ayrovi_links` مذكور مرتين — `uniq -d`):

`ayweb_stores` · `ayweb_store_capabilities` · `ayweb_store_domains` · `ayweb_store_requests` ·
`ayweb_products` · `ayweb_product_variants` · `ayweb_carts` · `ayweb_cart_items` ·
`ayweb_cart_ayrovi_links` · `ayweb_cart_add_requests` · `ayweb_orders` · `ayweb_order_items` ·
`ayweb_payments` · `ayweb_order_links` · `ayweb_purchase_requests` · `ayweb_purchase_attempts` ·
`ayweb_evidence` · `ayweb_domain_events` · `ayweb_audit_logs` · `ayweb_sessions` ·
`ayweb_recent_stores` · `ayweb_checkout_fees` · `ayweb_warehouse_items` · `ayweb_packages` ·
`ayweb_consolidations` · `ayweb_shipping`.

### 4.2 آلات الحالة — 7 آلات في `src/aywebs/stateMachines.ts`
| الآلة | السطر | ملاحظة مُتحقَّق منها |
|---|---|---|
| `ayWebsMasterMachine` | 88 | `CART → CHECKOUT|BROWSING` (71) · `PURCHASE_PENDING → PURCHASING` (75) · `PURCHASED → SUPPLIER_SHIPPED` (77) · `WAREHOUSE_RECEIVED → CONSOLIDATION` (79) |
| `ayWebsOrderMachine` | 174 | `PURCHASE_PENDING → PURCHASING|PENDING_INTEGRATION|MANUAL_REVIEW` (181) · `PURCHASE_FAILED` و`PURCHASED` **نهايتان** (189-190) |
| `ayWebsPurchaseMachine` | 193 | + `ayWebsPurchaseFailureRequiresReason` (200) |
| `ayWebsPurchaseRequestMachine` | 216 | `ORDER_READY` نهاية (213) |
| `ayWebsCartMachine` | 229 | `ORDERED` نهاية (225) |
| `ayWebsWarehouseMachine` | 245 | — |
| `ayWebsPackageMachine` | 260 | — |

الاستثناءات مسموحة فقط من حالات محددة: `ayWebsExceptionAllowed` (115) — مثلاً
`CART → PRICE_CHANGED|VARIANT_UNAVAILABLE|OUT_OF_STOCK` (101) و
`PURCHASE_PENDING → PENDING_INTEGRATION|PURCHASE_FAILED` (105).

**نقطة تصميم مهمة:** `PRODUCT_DETECTED` يسمح بالانتقال إلى `NOT_IMPLEMENTED` (96) — أي أن
«غير مُنفَّذ» حالة نظام شرعية، لا خطأ.

---

## 5) التسعير

| الملف | الدور | أرقام مُتحقَّق منها |
|---|---|---|
| `src/services/pricing.ts` | تحويل العملة + الجمارك + حساب السعر | `MAX_ORDER_TOTAL_TND = 100_000` (45) · `HEAVY_CARGO_KG_THRESHOLD = 5` كغ (54) · `millimes()` (210) — الحساب **بالمليم** لا بالفاصلة العائمة · `getEffectiveExchangeRate` (227) · `classifyCustomsCategory` (265) · `calculatePrice` (299) |
| `src/aywebs/checkoutFees.ts` | بنود الفاتورة | 7 أنواع: `PRODUCT_SUBTOTAL` (197) · `AYROVI_SERVICE` (204) · `IMPORT_DUTY` (210) · `SHIPPING_ESTIMATE` (217) · `OTHER` = `LOCAL_DELIVERY` (230) / `EXPRESS_SUPPLEMENT` (238) / `DISCOUNT` (245) |
| `src/services/fxRates.ts` | أسعار الصرف | — |
| `src/ayrovix/priceQuote.ts` | عقد السعر الموقّع لـ AYROVIX | — |

**القاعدة الحاكمة (§45):** السعر يُحسب على الخادم، ويُربط ببند السلة لحظة الإضافة،
ولا يُعاد حسابه عند كل عرض. `docs/AYWEBS_ADD_TO_CART_SPEED_AR.md:110` يثبت أن السعر
**يُعاد حسابه** حتى عند خدمة الفيشة من الذاكرة (`109 USD ≈ 583.01 TND` في الباستين).

---

## 6) الحماية: رموز الرفض وحدود الالتقاط

### 6.1 رموز رفض الالتقاط — 19 رمزاً موجوداً فعلاً
مُستخرجة من `src/aywebs/webviewCapture.ts`:

**سلامة الحمولة:** `NOT_AN_OBJECT` (174) · `BAD_VERSION` (177) · `TOO_LARGE` (185)
**سلامة المصدر:** `URL_HOST_MISMATCH` (190) · `CANONICAL_HOST_MISMATCH` (195)
**الطزاجة:** `STALE_CAPTURE` (199) · `FUTURE_CAPTURE` (202)
**السعر:** `NO_PRICE_TEXT` (226) · `PRICE_REJECTED` (226) · `AMBIGUOUS_PRICE` (243) · `PRICE_NOT_CORROBORATED` (251) · `WEBVIEW_PRICE_SINGLE_SOURCE` (368)
**التباعد مع إعادة قراءة الخادم:** `PRICE_DIVERGED` (434) · `CURRENCY_DIVERGED` (436) · `AVAILABILITY_DIVERGED` (439)
**حالات التوفّر:** `AVAILABLE` (64) · `LOW_STOCK` (60) · `OUT_OF_STOCK` (52) · `UNKNOWN` (148)

> ⚠️ **تصحيح:** `NO_AVAILABILITY_EVIDENCE` المذكور في بطاقة التسليم **لا وجود له في الشيفرة**.
> عند الرفض يُبنى السبب ديناميكياً: `availabilityReason: 'capture_rejected:' + rejection` (السطر 148).

### 6.2 حدود السكربت (`captureScript.ts:32`)
```
LIMITS = { priceCandidates: 4, variantTexts: 30, selectedTexts: 5, images: 4, label: 60, text: 300 }
```
`AYWEBS_CAPTURE_VERSION = 1` (`shared/aywebsCapture.ts:34`) · `AYWEBS_ADAPTER_CONTRACT_VERSION = 2`
(`src/aywebs/adapters/contract.ts:144`).

### 6.3 قاعدة العملة الحالية (مهمّة للمهمة M2)
`webviewCapture.ts:257-267`:
```ts
const currencyVerified = /\b[A-Z]{3}\b/.test(currencyEvidence.toUpperCase())
  || /\b(?:EUR|USD|GBP|JPY|TND)\b/.test(candidateCurrencyEvidence);
```
**النتيجة المباشرة:** صفحة تعرض رمزاً فقط (`$` أو `€` أو `د.ت`) دون رمز ISO صريح
**لا تُعتبر عملتها مُثبتة** ⇒ `currencyVerified: false`. هذا هو بالضبط ما يجعل البند (ب) من
المهمة M2 ضرورياً، ويؤكد أن الحل المقترح (قاعدة خادمية مغلقة `‎$→USD, €→EUR, £→GBP, ¥→JPY,
د.ت→TND` مقصورة على متجر **مسجَّل** في `shared/aywebsStores.ts`) هو المسار الصحيح — لأنه
يبقى **قراراً خادمياً** ولا يُدخل أي HTML ولا أي سعر من العميل.

### 6.4 قاعدة السعر داخل السكربت
`captureScript.ts:22-25`: نص سعر **بلا رقم وبلا عملة** ليس مرشحاً — لتفادي فخّ الأسعار
«المقطوعة» (أمازون ينشر الجزء الصحيح والجزء العشري في span منفصلين: «6» + «99»).
ترتيب موثوقية المصادر: `json_ld: 0, microdata: 1, meta: 2, dom: 3` (`webviewCapture.ts:43`).

### 6.5 بوابة القراءة (`readGate.ts`)
| الثابت | القيمة | السطر |
|---|---|---|
| `DEFAULT_CONCURRENCY` | 3 | 27 |
| `MAX_CONCURRENCY` | 16 | 28 |
| `DEFAULT_MAX_WAIT_MS` | 20 000 | 29 |
| `MAX_MAX_WAIT_MS` | 120 000 | 30 |

السياق المقيس المذكور في التعليق (السطور 5-9): قراءة واحدة = `fetch` بين **700 ك.ب و1,9 م.ب**
+ تحليل DOM كامل؛ وقياس 06/10/2026: **~21 ثانية CPU لعشرين قراءة**. البوابة FIFO
**ولا ترفض أبداً**: بعد `maxWait` يمرّ النداء بلا خانة ويُحسب `bypassed` — والعدّادات مكشوفة
في `/health`.

### 6.6 ذاكرة القراءة (`resolveCache.ts`)
`AYWEBS_RESOLVE_CACHE_TTL_MS` افتراضي **300 000** (0 = تعطيل، السطر 51) ·
`AYWEBS_RESOLVE_CACHE_MAX` افتراضي **400** (السطر 56) · **نافذة SWR = 30 دقيقة**
(`DEFAULT_STALE_MS = 30 * 60_000`، السطر 54) تخدم قراءة منتهية مع `served_stale: true`
(السطور 112-119) — أي أن النافذة **ستة أضعاف** عمر الصلاحية، وهذا ما يجعل إعادة الفتح
السريعة ممكنة حتى بعد انتهاء TTL · ذاكرة فشل قصيرة `AYWEBS_RESOLVE_FAILURE_TTL_MS` =
**90 ثانية** (السطر 330) بحدّ **200 مدخل** (332) · **single-flight**: نداءان متزامنان لنفس
المنتج = قراءة تاجر واحدة · الذاكرة **محمولة من مصدر القراءة** فلا تعبر حدّ إعداد (السطور 8-13).

---

## 7) الأرقام المقيسة

**تنبيه صريح:** الأرقام التالية **ليست قياساً جديداً من هذه الجلسة**، بل هي أرقام مسجّلة في
`docs/AYWEBS_ADD_TO_CART_SPEED_AR.md` (قياس على الإنتاج 06/10/2026، من GitHub Actions إلى
`https://ayrovi-beta1.onrender.com`، على `https://www.amazon.com/dp/B0GYM3V9H5`):

| القياس | القيمة | المرجع |
|---|---|---|
| أول قراءة حقيقية (`refresh:true`) | **20 896 ملّي** (≈21 ث) — المصدر الناجح هو مزوّد الرسم المدفوع بعد فشل المباشر وJina | السطر 106 |
| إعادة الفتح من الذاكرة (<5 دق) | **111 ملّي** (−99,5%، ~188 مرة أسرع) | السطر 107 |
| منتج بلا سعر منشور | **1,7–2,3 ث** ثم رسالة صريحة (كان حتى ~49 ث) | السطر 108 |
| عدّادات الذاكرة بعد القياس | `enabled=true ttl=300000 entries=1/400 hits=6 misses=3 writes=2` | السطر 109 |
| السعر في الباستين | `109 USD ≈ 583.01 TND` — **يُعاد حسابه** | السطر 110 |

القياس الحيّ الجديد (`npm run verify:aywebs-latency -- --base https://ayrovi-beta1.onrender.com ...`)
**لم يُنفَّذ في هذه الجلسة**: نطاق `onrender.com` خارج قائمة النطاقات المسموح الخروج إليها من
هذه الحاوية (المسموح: github.com · codeload.github.com · api.github.com · registry.npmjs.org ·
pypi.org · files.pythonhosted.org). **[غير مُتحقَّق حياً]** — يحتاج تنفيذاً من GitHub Actions
أو من جلسة بنفاذ شبكي أوسع.

---

## 8) عشر نقاط هشاشة (كل واحدة بدليلها)

1. **القراءة الأولى ~21 ثانية** على المنتجات التي يحجب فيها التاجر خادم Render
   (`docs/AYWEBS_ADD_TO_CART_SPEED_AR.md:106,117`). الحل المُخطَّط: القراءة المُسبقة في أندرويد +
   بدء المزوّد المدفوع بالتوازي.
2. **العملة الرمزية غير مُثبتة.** قاعدة `webviewCapture.ts:260-261` تشترط ISO صريحاً؛ أي متجر
   يعرض `$` فقط يفشل في `currencyVerified` ⇒ هذا يسدّ مسار إضافة كامل (انظر 6.3).
3. **ثلاثة متاجر بلا أسعار.** `shein` و`temu` و`aliexpress` حالتها `beta` في
   `shared/aywebsStores.ts` (السطور 101 و122 و143) مقابل `amazon` = `active` (80)، وتعتمد على
   مزوّد رسم مدفوع: `renderedProviderReady()` في `routes.ts:206` يُرجع
   `RENDER_PROVIDER_NOT_CONFIGURED`.
4. **الشراء الآلي غير مربوط.** `purchaseIntegrationEnabled` افتراضياً **`false`**
   (`context.ts:63`) ⇒ `/health` يُعلن `purchase_integration_state: 'PENDING_INTEGRATION'`
   (`routes.ts:441`)، والبنود تنتظر مراجعة بشرية (`orders.ts:649, 803`).
5. **المستودع والشحن واجهة فارغة.** 6 نقاط نهاية عميل + 3 نقاط إدارة تُرجع
   `NOT_IMPLEMENTED` (`routes.ts:1349-1354`، `adminRoutes.ts:412-414`). الجداول موجودة
   (`ayweb_warehouse_items`, `ayweb_packages`, `ayweb_consolidations`, `ayweb_shipping`) بلا منطق.
6. **البوابة لا ترفض.** `readGate.ts` يمرّر النداء `bypassed` بعد 20 ث — حماية من panne مُصطنَعة،
   لكن under load يعني تحليلات DOM متوازية في **نفس خيط التنفيذ**. الحل المؤجَّل (worker threads)
   معلَّل في التعليق (السطور 20-24) بعائق حقيقي: حزمة الخادم ملف واحد بـ esbuild.
7. **سكربت الالتقاط مخبوء 300 ثانية.** `Cache-Control: public, max-age=300` (`routes.ts:553`):
   إصلاح عاجل لمُحدِّد مكسور قد يتأخر حتى 5 دقائق عند بعض العملاء.
8. **عيّنة إعادة التحقق 5%.** `AYWEBS_QUOTE_REVERIFY_SAMPLE` يعني أن نسبة من العروض تُقبل بلا
   إعادة قراءة — مقبول تجارياً لكنه يعني أن كشف التباعد **احتمالي** وليس شاملاً.
9. **المتجر الخارجي صفر نطاقات.** `AYWEBS_EXTERNAL_STORE.domains.length` مكشوف في `/health`
   (`routes.ts:430-433`) والتعليق يقول: «Zéro domaine, toujours : le serveur ne la devine jamais
   depuis une URL» ⇒ أي متجر خارج السجل يبقى بلا قدرة تكيّف خاصة.
10. **حدود المعدّل لكل IP.** `capture` و`product/resolve` عند **20 طلباً/10 دق** لكل IP
    (`server.ts:176-177`) — ضيق وراء NAT مشترك (مقهى/عائلة)، وقد يظهر كـ«عطل» لدى العميل.

---

## 9) الواجهات

### 9.1 العميل — `client/src/features/aywebs/` (10 ملفات)
`AyWebsApp.tsx` · `api.ts` · `aywebs.css` · `useAyWebsFavorites.ts` ·
`components/AyWebsCartScreen.tsx` · `components/AyWebsStoresScreen.tsx` ·
`components/AyWebsVariantSheet.tsx` · `components/AyWebsFavoriteSheet.tsx` ·
`components/AyWebsWishScreen.tsx` · `components/AyWebsTabBar.tsx`.

`AyWebsVariantSheet.tsx` هو **منتقي المتغيرات bottom sheet فوق صفحة التاجر** الذي يفرضه أمر
المالك (`docs/AYWEBS_ADD_TO_CART_ORDER.md`) — لا Product Card كبيرة ولا مغادرة للمتجر.

### 9.2 الإدارة
لا توجد شاشة AYWEBs مستقلة في `client/src/admin/`؛ المرجعان الوحيدان هما
`client/src/admin/AdminApp.tsx` و`client/src/admin/InterfaceStudio.tsx`، إضافة إلى
`GET /api/admin/aywebs/analytics` (`src/admin/routes.ts:986`) وملخّص `ayWebsAnalyticsSummary`
ضمن لوحة القياسات (`src/admin/routes.ts:982`).
**فجوة:** واجهة المراجعة البشرية لبنود `PENDING_INTEGRATION` غير موجودة في العميل — وهي
المسار الوحيد لإتمام الشراء اليوم.

### 9.3 التطبيق (React Native)
**غير موجود في هذه الحاوية** — لا `apps/` إطلاقاً (القسم 0).

---

## 10) خريطة «التحديث ← الملفات»

| نوع التحديث | الملفات التي تلمسها | ملاحظة |
|---|---|---|
| متجر جديد | `shared/aywebsStores.ts` + `src/aywebs/adapters/<store>.ts` + `src/aywebs/adapters/registry.ts` | `adapters.ts` اليوم **مجرّد إعادة تصدير** للتوافق؛ المنطق في `./adapters/` |
| تعديل التقاط/مُحدِّدات | `src/aywebs/captureScript.ts` (ES5، يُخدَم من الخادم) + `src/aywebs/webviewCapture.ts` (الحكم) | **صفر تغيير في Java/APK** |
| التقاط ↔ قارئ الخادم | `src/scraper/amazonPage.ts` + `src/scraper/readerFingerprint.ts` | يجب أن يتفقا على نفس المبلغ (اختبار تقاطع) |
| تسعير/رسوم | `src/services/pricing.ts` + `src/aywebs/checkoutFees.ts` + `src/services/fxRates.ts` | الحساب بالمليم |
| حالات/آلات | `shared/aywebsTypes.ts` + `src/aywebs/stateMachines.ts` | 7 آلات |
| سلة/جسر | `src/aywebs/cart.ts` (72 ك.ب) + `src/aywebs/ayroviBridge.ts` | idempotence في `ayroviBridge.ts:164` |
| عقد السعر الموقّع | `src/aywebs/quoteToken.ts` + `src/ayrovix/priceQuote.ts` | فصل النطاقات بـ HKDF |
| جدول/هجرة | `src/aywebs/schema.ts` | 26 جدولاً |
| أخطاء | `src/aywebs/errors.ts` | كتالوج `NOT_IMPLEMENTED` (223) و`PENDING_INTEGRATION` (228) |
| إدارة/صلاحيات | `src/aywebs/adminRoutes.ts` + `src/aywebs/permissions.ts` + `src/admin/routes.ts:486` | — |

---

## 11) جرد كامل لأعلام `AYWEBS_*` و`AYROVIX_*`

**المنهج:** `AYWEBS_*` تُقرأ بثلاث طرق في الشيفرة — `process.env.X` مباشرة، أو دوال مساعدة
(`envFlag`/`integerEnv`/`numberEnv`)، أو **اسم مُركَّب** للمتاجر. لذلك اعتمدتُ ثلاث عمليات
`grep` مختلفة لا واحدة. كثير مما يظهر في `grep` العام (`AYWEBS_SCHEMA_SQL`،
`AYWEBS_CART_STATUSES`…) **أسماء ثوابت ومعرّفات SQL لا أعلام بيئة** — استبعدتُها.

### 11.1 أعلام `AYWEBS_*` — 22 علماً حقيقياً (في 19 سطراً: صف المتاجر يجمع 4 أعلام)
| العلم | القيمة الافتراضية | موثّق في `.env.example`؟ | أين يُقرأ |
|---|---|---|---|
| `AYWEBS_ENABLED` | `true` | ✅ سطر 181 | `context.ts:60` |
| `AYWEBS_CAPTURE_ENABLED` | `true` | ✅ سطر 182 | `context.ts:61` |
| `AYWEBS_AI_EXTRACTION_ENABLED` | `false` | ✅ سطر 189 | `context.ts:62` |
| `AYWEBS_PURCHASE_INTEGRATION_ENABLED` | `false` | ❌ | `context.ts:63` |
| `AYWEBS_WAREHOUSE_ENABLED` | `false` | ❌ | `context.ts:64` |
| `AYWEBS_SHIPPING_ENABLED` | `false` | ❌ | `context.ts:65` |
| `AYWEBS_<STORE>_CAPTURE_ENABLED` (مركّب: AMAZON/SHEIN/TEMU/ALIEXPRESS) | `true` | ✅ سطور 184-187 | `context.ts:79` — `` `AYWEBS_${store.id.toUpperCase()}_CAPTURE_ENABLED` `` |
| `AYWEBS_RESOLVE_CACHE_TTL_MS` | `300000` | ✅ سطر 123 | `resolveCache.ts:34` |
| `AYWEBS_RESOLVE_CACHE_MAX` | `400` | ✅ سطر 124 | `resolveCache.ts:35` |
| `AYWEBS_RESOLVE_STALE_MS` | `1800000` (30 دق) — نافذة SWR | ❌ | `resolveCache.ts:54,119` |
| `AYWEBS_RESOLVE_FAILURE_TTL_MS` | `90000` (90 ث؛ الأقصى 600000) + `DEFAULT_FAILURE_MAX_ENTRIES = 200` | ❌ | `resolveCache.ts:330-332` |
| `AYWEBS_READ_CONCURRENCY` | `3` (الأقصى 16) | ❌ | `readGate.ts:12` |
| `AYWEBS_READ_GATE_MAX_WAIT_MS` | `20000` (الأقصى 120000) | ❌ | `readGate.ts:14` |
| `AYWEBS_QUOTE_TTL_MS` | `600000` (10 دق) | ❌ | `quoteToken.ts:63,77` |
| `AYWEBS_QUOTE_FRESH_MS` | `300000` (5 دق) | ❌ | `quoteToken.ts:66,82` |
| `AYWEBS_QUOTE_REVERIFY_TND` | `2000` | ❌ | `quoteToken.ts:67,87` |
| `AYWEBS_QUOTE_REVERIFY_SAMPLE` | 5% | ❌ | `quoteToken.ts:30` |
| `AYWEBS_HOST_CIRCUIT` | **مفعّل افتراضياً**؛ يُعطَّل بـ `=off` | ❌ | `productResolver.ts:168-170` (`process.env` مباشر) |
| `AYWEBS_WEBVIEW_VERIFY_SAMPLE` | **10%** (عيّنة تحقق حتمية) | ❌ | `webviewCapture.ts:407-413`؛ مكشوف في `/health` عبر `routes.ts:421` |

**غير أعلام (أُزيلت من الجرد عمداً):** `AYWEBS_OCR_FALLBACK_ENABLED` (سطر 188 في
`.env.example`) — **موثّق لكن لا يُقرأ في أي مكان في `src/`** ⇒ علم ميت.
وكذلك `AYWEBS_CAPTURE_SCRIPT`/`AYWEBS_CAPTURE_SCRIPT_PATH` (ثوابت مُصدَّرة،
`captureScript.ts:29-30`)، و`AYWEBS_CAPTURE_VERSION`/`AYWEBS_CAPTURE_LIMITS` (ثوابت في
`shared/aywebsCapture.ts`).

### 11.2 أعلام `AYROVIX_*` — 20 علماً حقيقياً
| العلم | موثّق؟ | أين يُقرأ |
|---|---|---|
| `AYROVIX_PROVIDER_TIMEOUT_MS` (8000، بين 5000-20000) | ✅ 81 | `ayrovix/services/ai.ts:340` |
| `AYROVIX_LENS_IP_DAILY_LIMIT` (40) | ✅ 84 | — |
| `AYROVIX_VISUAL_SEARCH_TIMEOUT_MS` | ✅ 88 | — |
| `AYROVIX_LENS_COUNTRY` (`fr`) | ✅ 89 | — |
| `AYROVIX_SEARCH_TIMEOUT_MS` | ✅ 99 | — |
| `AYROVIX_AI_WEB_SEARCH` | ✅ 101 | — |
| `AYROVIX_DIRECT_TIMEOUT_MS` | ✅ 116 | — |
| `AYROVIX_JINA_HEADSTART_MS` (الافتراضي = `readerFallbackDelayMs() + 500`) | ✅ 117 | `scraper/readerFingerprint.ts:127` |
| `AYROVIX_JINA_TIMEOUT_MS` | ✅ 118 | — |
| `AYROVIX_RENDER_PROVIDER` (`auto`) | ✅ 130 | — |
| `AYROVIX_RENDER_TIMEOUT_MS` | ✅ 131 | — |
| `AYROVIX_SCRAPER_COUNTRY` (`fr`) | ✅ 132 | — |
| `AYROVIX_SCRAPER_PREMIUM` (`false`) | ✅ 135 | — |
| `AYROVIX_SCRAPINGBEE_STEALTH` (`false`) | ✅ 138 | — |
| `AYROVIX_QUOTE_SECRET` | ✅ 147 | سرّ الاشتقاق لـ AYWEBs أيضاً (HKDF) |
| `AYROVIX_OCR_TIMEOUT_MS` | ✅ 149 | — |
| `AYROVIX_ANTHROPIC_WEB_SEARCH` | ❌ | — |
| `AYROVIX_LENS_LIVE_ENABLED` | ❌ | — |
| `AYROVIX_READER_PROFILE` (+ `AYROVIX_READER_PROFILE_<STORE>`, `AYROVIX_READER_PROFILE_AMAZON`) | ❌ | `scraper/readerFingerprint.ts` |
| `AYROVIX_READER_FALLBACK_MS` | ❌ | `scraper/readerFingerprint.ts` |

**غير أعلام:** `AYROVIX_INTERNAL_ERROR`، `AYROVIX_QUOTE_SECRET_INVALID`،
`AYROVIX_QUOTE_SECRET_NOT_CONFIGURED`، `AYROVIX_UNAVAILABLE`، `AYROVIX_PRICE_TOKEN`،
`AYROVIX_REVIEWS`، `AYROVIX_REVIEW_STATUSES` — رموز أخطاء/معرّفات.

**الفجوة الإجمالية (بالأعداد المُتحقَّق منها):**
- `.env.example` يحوي **10 أسطر `AYWEBS_*`** و**16 سطراً `AYROVIX_*`** (`grep -cE "^AY..._="`).
- الشيفرة تقرأ **22 علماً `AYWEBS_*`** ⇒ **13 علماً غير موثّق**، و**علماً واحداً موثّقاً ميتاً**
  (`AYWEBS_OCR_FALLBACK_ENABLED`: موجود في `.env.example:188` ولا يُقرأ في أي ملف
  `.ts/.tsx/.mjs/.js/.yaml` في المستودع — `grep` شامل بلا نتيجة).
- الشيفرة تقرأ **20 علماً `AYROVIX_*`** (عدا الصيغ الديناميكية `AYROVIX_READER_PROFILE_<STORE>`)
  ⇒ **4 أعلام غير موثّقة**.
- المجموع: **17 علماً مقروءاً غير موثّق + علم واحد ميت**.

هذه قائمة «إغلاق البند 2» من المهمة M1 — وهي **جرد فقط**، لم أضف شيئاً إلى `.env.example`
لأن البطاقة تمنع تعديل كود AYWEBs قبل وصول قائمة المالك.

---

## 12) الاختبارات والبوابات

### 12.1 ملفات الاختبار ذات الصلة (19 من أصل 130 ملف اختبار)
`aywebs-analytics` · `aywebs-availability-fallback` · `aywebs-foundation` · `aywebs-price-integrity` ·
`aywebs-published-fields-ui` (.tsx) · `aywebs-reader-fingerprint` · `aywebs-resolve-cache` ·
`aywebs-resolve-swr` · `aywebs-shopping-journey` · `aywebs-signed-quote` ·
`aywebs-store-capabilities` · `aywebs-ui-remarks` · `aywebs-unified-cart` ·
`aywebs-webview-capture` · `quote-security` · `scraper-extended-fields` · `scraper-money-integrity` ·
`scraper-probe-race` · `scraper-unresolved-identity`.

### 12.2 ما شُغّل فعلاً في هذه الجلسة — النتائج الحقيقية
| الأمر | النتيجة |
|---|---|
| `npm ci` | فشل أول مرة: `better-sqlite3` يحتاج build أصلي و`nodejs.org` محجوب (`ECONNRESET` على `node-v22.22.3-headers.tar.gz`). **الحل:** الرؤوس موجودة محلياً في `/usr/local/include/node` ⇒ `npm_config_nodedir=/usr/local npm ci` ⇒ **`added 512 packages in 1m`** |
| `npm run typecheck` | ✅ **أخضر** — `tsc --noEmit && tsc -p tsconfig.client.json --noEmit`، **exit 0** |
| `npx vitest run` (16 ملف AYWEBs/scraper/quote) | ✅ **`Test Files 16 passed (16)` · `Tests 260 passed (260)`** في 29,61 ث |
| `npm run design:check` | ✅ **exit 0** — «Design inventory up to date» · «Icon contract: 256 source files; 2 reviewed SVG roots; **0 violations**» · «AYROVI A: source, stack, pure neutrals, local assets and font hashes verified» |
| `node scripts/check-android-shell.mjs` | ✅ **exit 0** — «**Coque Android : 45 invariants vérifiés, 0 rupture**». السكربت يطبع **34 سطراً بعلامة ✓** (`grep -c '✓'`)، منها **21 سطراً تخصّ `AyWebsBrowseActivity`** و2 تخصّ `capacitor.config.ts` و1 يخصّ `strings.xml` و10 سواها. ومن ثوابت `AyWebsBrowseActivity` المُتحقَّق منها: درج السلة/المفضلة **الداخلي** بدل مغادرة المتجر، سقف الدرج **82% من الشاشة**، منع الإضافة عند stock غير معروف، خروجَان فقط من الدرج (الدفع والاتصال)، وjeton **الحساب** على المفضلة |
| `npm run verify:aywebs-latency` | ❌ **لم يُنفَّذ** — `ayrovi-beta1.onrender.com` خارج النطاقات المسموح الخروج إليها من هذه الحاوية (المسموح: github.com · codeload.github.com · api.github.com · registry.npmjs.org · pypi.org · files.pythonhosted.org). يُنفَّذ من GitHub Actions أو من جلسة بنفاذ أوسع |

**ملاحظة على مخرَج الاختبارات تستحق التسجيل:** `tests/quote-security.test.ts` يطبع تحذيراً حقيقياً:
> `[AYROVIX] AYROVIX_QUOTE_SECRET absent : clé de cotation dérivée de CUSTOMER_AUTH_SECRET (HKDF). Définissez un secret dédié pour séparer complètement les domaines de signature.`

أي أن فصل نطاقات التوقيع المذكور في القسم 2 يعمل، لكن في غياب `AYROVIX_QUOTE_SECRET` يُشتق
المفتاح من `CUSTOMER_AUTH_SECRET` — والفصل **لا يكون كاملاً** إلا بتعريف السرّ المخصص. هذا
بند نشر (Render) لا بند شيفرة.

كما أن `tests/aywebs-published-fields-ui.test.tsx` يثبت الحالتين الحرجتين لأمازون حرفياً:
«le prix concaténé ne devient plus 6996.99 — la grappe rend 6.99» و
«le prix d'une publicité (18.74 €, autre ASIN) n'est plus publié» — وهما بالضبط ما يجب أن
يحافظ عليه اختبار التقاطع المطلوب في المهمة M2.

### 12.3 فِخاخ تثبيت مُتحقَّق منها في هذه الحاوية
- `node_modules` **غير موجود افتراضاً** في حاوية جديدة — يجب `npm ci` قبل أي بوابة.
- `better-sqlite3` يفشل بلا `npm_config_nodedir=/usr/local` (رؤوس Node موجودة في
  `/usr/local/include/node`).
- لا JDK ولا Android SDK ⇒ **لا بناء APK هنا** (`npm run android:apk` مستحيل).
- المستودع يصل shallow ⇒ `git merge-base` يفشل حتى `--unshallow`.

---

## 13) الخطوة التالية وما ينتظر المالك

**جاهز للتنفيذ فوراً (لا يمسّ كود AYWEBs):**
- المهمة **M2** (قارئ أمازون داخل `captureScript.ts`) — لكن **بعد** موافقة المالك، لأن البطاقة
  تمنع تعديل كود AYWEBs قبل وصول قائمة التحديثات. القسمان 6.3 و10 يقدّمان الأساس التقني
  الكامل لها: نقطة الدخول الواحدة `GET /api/v1/aywebs/capture/script.js`، الإصدار يبقى `1`،
  وقاعدة العملة المغلقة تبقى قراراً خادمياً.

**ينتظر جواب المالك:**
1. ~~هل `feat/aywebs-phase1-signed-quote` مدمج؟~~ ⇒ **مُجاب: نعم، مدمج بالكامل** (القسم 0).
2. بقية بنود قائمة تحديثات AYWEBs (وصل بند واحد: سكربت أمازون).
3. **سؤال جديد فرضته هذه الجلسة:** عمل P2 للتطبيق (`apps/mobile/`) غير موجود في هذه الحاوية.
   هل يُسترجع من الحاوية الأصلية/فرعه، أم يُعاد بناؤه؟ لا يمكن بدء P3 قبل حسم هذا.
