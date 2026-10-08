# تدقيق AYWEBs — الحالة الفعلية للمودل

> **التاريخ:** 2026-10-07 · **المصدر:** `main @ 8e82dea` (نسخة مطابقة للمحلي في `src/aywebs/`) · **الفرع:** `arena/c0321e79-ayrovi-beta1`
>
> **المنهج:** قراءة مباشرة للكود والوثائق الملزمة داخل المستودع، ثم **جرد كامل بالـgrep** لمسارات الـAPI وللأعلام البيئية (القسمان §4 و§9) — كل رقم سطر في هذا الملف قابل للتحقق.

---

## 1) ما هو AYWEBs — والفصل بين الأسماء الثلاثة

**AYWEBs = وكيل شراء (proxy-shopping / shopping agent)، على مبدأ Buyee:** العميل يتصفّح متجراً أجنبياً **داخل تجربة المتجر**، يضغط «Add to Cart»، فيُكتب السطر في **سلة AYROVI** بالسعر المحسوب على الخادم (منتج + شحن + ديوانة + أتعاب خدمة، بالدينار)، ثم طلب، ثم شراء بالنيابة وشحن.

| الكيان | المسار في الكود | يُقدَّم على | الدور |
|---|---|---|---|
| **AYWEBs** | `src/aywebs/` | `/api/v1/aywebs` (عمومي) · `/api/admin/aywebs` (إدارة) | وكيل الشراء: متاجر، التقاط، سلة AYWEBs، طلبات، جسر |
| **AYROVIX** | `src/ayrovix/` | `/api/ayrovix` | البحث البصري (Lens) + **عقد السعر** (`priceQuote.ts`، `createAyrovixPriceToken`) + مراقبة الأسعار |
| **Lens** | `src/ayrovix/services/{lensEngine,visualSearch,lensLiveStock}` | داخل AYROVIX | البحث بالصورة (Claude Vision + SerpApi Google Lens) — **ليس AYWEBs** |

**العلاقة:** AYWEBs لا يحسب الثمن لنفسه — ينادي محرّك التسعير المركزي `src/services/pricing.ts`، ويأخذ **رمز سعر** من AYROVIX قبل أن يعبر السطر الجسر إلى سلة AYROVI. «الثمن على الخادم فقط» تعني حرفياً: العميل يرسل رابطاً/منتجاً/متغيّرة/كمية — **ولا يرسل مبلغاً أبداً**.

---

## 2) خريطة المكوّنات (بالبايت — `src/aywebs/`)

| الملف | الحجم | الدور |
|---|---:|---|
| `routes.ts` | 76 049 | الطبقة HTTP: تحقّق، هوية، تسلسل. لا قاعدة تجارية ولا معادلة مالية هنا |
| `cart.ts` | 72 997 | سلة AYWEBs: الإنشاء، الإضافة، اختيار المتغيّرة الإلزامي، منع التكرار، التحقّق |
| `productResolver.ts` | 49 368 | الحلّ: تصنيف الصفحة → محوّل → تطبيع → تسعير → دليل |
| `orders.ts` | 46 239 | الطلبات، الدفع، التحويل البنكي بدليل، الشراء |
| `schema.ts` | 31 050 | 7 جداول + ترقيات |
| `browser.ts` | 20 261 | تحليل الرابط، الجلسة، المتاجر الحديثة |
| `webviewCapture.ts` | 19 729 | **مصادقة التقاط WebView** (المرحلة 2.1) |
| `adminRoutes.ts` | 19 308 | قسم AYWEBs في لوحة التحكم |
| `errors.ts` | 18 435 | عقد الخطأ الموحّد (§44) |
| `captureScript.ts` | 18 403 | **سكربت الالتقاط المُخدَّم للعميل** (ES5، بلا أسرار) |
| `purchaseRequests.ts` | 17 838 | طلبات الشراء وطلبات المتجر |
| `ayroviBridge.ts` | 17 622 | الجسر idempotent إلى سلة AYROVI |
| `events.ts` · `resolveCache.ts` | 15 844 · 15 498 | المقاييس/الأحداث · ذاكرة القراءة |
| `productNormalizer.ts` · `checkoutFees.ts` | 15 087 · 14 398 | التطبيع · **محرّك حساب الدفع** |
| `stateMachines.ts` · `context.ts` | 10 304 · 9 948 | آلات الحالة · السياق والأعلام |
| `adapters/` (base 9 455 · contract 6 226 · registry 5 367 · amazon/shein/temu/aliexpress) | — | عقد المحوّلات + السجل |
| `quoteToken.ts` · `evidence.ts` · `analytics.ts` · `readGate.ts` | 8 716 · 7 781 · 5 331 · 4 853 | رمز السعر · الأدلة · التحليلات · **صمّام التزامن** |

**المتاجر:** Amazon (فعّال) · SHEIN · TEMU · AliExpress (كلها `PARTIALLY_SUPPORTED` ووضع الشراء `MANUAL_REVIEW`) + محوّل `generic` للمتاجر خارج السجل (`URL_REQUEST`).
**قاعدة معمارية ملزمة** (`adapters/contract.ts`): **ممنوع `if (store === 'amazon')` خارج محوّله**. إضافة متجر = سطر في `shared/aywebsStores.ts` + محوّل + مدخل في السجل — لا شيء آخر.
**التبعية:** `src/scraper/` (`probeRace`, `priceIntegrity`, `readerFingerprint`, `amazonPage`, `renderedPageFetcher`) — خارج المودل، لكن لا قراءة بدونه.

---

## 3) الدورة الكاملة

```
(0) عند كل صفحة: POST /page/analyze → store_id + page_type ⇒ يُفعَّل زر Add to Cart أو يبقى معطّلاً
(1) ضغط Add to Cart   → لا سعر، لا حالة، لا HTML من العميل
(2) POST /product/resolve → تصنيف + حلّ + تطبيع (+ إن أرسل العميل «capture» فتُصادق عليه قبل أي شيء)
(3) قراءة التاجر      → ذاكرة 5 دق؟ وإلا سباق متوازٍ: جوال ∥ مكتب ∥ Jina (تبدأ متأخّرة 1.2 ث)
(4) محرّك التسعير المركزي → TND: تحويل + شحن + ديوانة + أتعاب (المبلغ الوحيد الذي «يفعل»)
(5) الدليل            → ayWebsEvidenceHash + تخزين المنتج
(6) ورقة الاختيار فوق صفحة المتجر → إن لزمت متغيّرة، بلا اختيار لا إضافة
(7) POST /cart/items  → تحقّق (متغيّرة منشورة/متاحة، pricing>0) ثم INSERT فعلي + لقطة سعر
(8) الجسر (نفس الطلب) → رمز سعر AYROVIX → db.addItem ⇒ السطر يظهر في سلة AYROVI الموحّدة
(9) تأكيد من بيانات الخادم → خياران فقط: Checkout أو Continue Shopping
(10) POST /cart/bridge-to-ayrovi → POST /checkout/preview → POST /orders → الدفع → الشراء (مراجعة بشرية اليوم)
```

**القواعد الثمانية الثابتة** (`docs/AYWEBS_ADD_TO_CART_ORDER.md` — أمر هندسي دائم، أي PR يخالفه يُرفض):
1. الثمن يُحسب على الخادم فقط (§45) — العميل يرسل منتجاً ومتغيّرة وكمية، لا مبلغاً.
2. صفحة العميل (HTML) **مرفوضة** — الرابط فقط.
3. لا مغادرة للمتجر أثناء الإضافة: الورقة فوق الصفحة، والتأكيد ثم خياران.
4. الزر اسمه «Add to Cart» — لا أزرار موازية ولا بطاقة كبيرة.
5. كل ما يُعرض في التأكيد من السطر الذي يعيده الخادم، لا من نيّة محلية.
6. الجسر idempotent: **مزامنة كمية، لا جمع** — ضغطتان لا تُنتجان قطعتين.
7. إضافة بلا تسعير = ممنوعة، ولا نجاح وهمي: التأكيد بعد 2xx فقط.
8. الأثر الكامل: دليل + حدث + تدقيق لكل سطر يدخل السلة.

---

## 4) العقد API — الجرد الكامل (بأرقام السطور)

### 4.1 العمومي — `src/aywebs/routes.ts` (مُركَّب على `/api/v1/aywebs`)

| السطر | المسار | ملاحظة |
|---:|---|---|
| 245 | `GET /stores` | المتاجر + `operational`/`operational_reason` + `purchase_mode` + الأعلام |
| 268 | `GET /stores/:id` | |
| 274 | `GET /stores/:id/capabilities` | |
| 295 | `GET /home` | كل شيء من البيانات |
| 350 | `GET /session` | يتطلب `x-session-id` بصيغة `[A-Za-z0-9._:-]{8,160}` وإلا `SESSION_REQUIRED` |
| 377 | `POST /session/context` | |
| 397 | `GET /health` | `read_gate` · `resolve_cache` · `resolve_failure_cache` · `reader_fingerprints` · `webview_capture` · `purchase_integration_state` |
| 451 | `GET /metrics` | |
| 460 | `POST /events` | 202 · معجم أحداث مغلق |
| 488 | `POST /page/analyze` | تصنيف الصفحة وتفعيل الزر |
| **550** | **`GET /capture/script.js`** | سكربت الالتقاط (Phase 2.1) — `Cache-Control: public, max-age=300` |
| 556 | `POST /product/resolve` | يقبل `capture` (المصادق عليه) و**يرفض** `page` بـ`RAW_PAGE_CAPTURE_DISABLED` |
| 661 | `POST /product/variants` | |
| 701 | `GET /product/:id/availability` | |
| 734 | `POST /capture` | عقد V1 محفوظ — يفوّض لمحرّك المنتج |
| 840 | `POST /price-quote` | تسعير خلفي فقط |
| 872 | `GET /cart` | مجموعات حسب المتجر + `linked_to_ayrovi` |
| 880 | `POST /cart/items` | الإضافة الفعلية |
| 981 | `PATCH /cart/items/:id` | |
| 1015 | `DELETE /cart/items/:id` | |
| 1040 | `POST /cart/items/:id/accept-price` | قبول تغيّر سعر التاجر صراحةً |
| 1053 | `POST /cart/verify` | **يفرض `refresh:true` دائماً** |
| 1065 | `POST /cart/bridge-to-ayrovi` | مزامنة idempotent قبل الدفع |
| 1103 | `POST /checkout/preview` | محرّك الرسوم |
| 1118 | `POST /orders` · 1157 `GET /orders` · 1168 `GET /orders/:id` · 1182 `POST /orders/:id/submit` | |
| 1198 | `GET /payments/methods` · 1210 `POST /payments/intents` · 1222 `POST /payments/confirm` · 1234 `POST /orders/:id/payments/transfer-proof` | |
| 1273 | `POST /purchase-requests` · 1292 `GET /purchase-requests` · 1303 `GET /purchase-requests/:id` | |
| 1314 | `POST /store-requests` · 1330 `GET /store-requests` | «اطلب متجراً» |
| 1349–1354 | `GET /warehouse` · `…/items/:id/consolidate` · `POST /shipping/quote|request|pay` | **`NOT_IMPLEMENTED`** بعقد خطأ — لا نجاح وهمي |

### 4.2 الإدارة — `src/aywebs/adminRoutes.ts` (مُركَّب على `/api/admin/aywebs`)

`GET /overview` (L103) · `GET /stores` (143) · `GET /adapters` (164) · `GET /orders` (169) · `GET /orders/:id` (184) · `POST /orders/:id/purchase/start|confirm|fail` (205/215/226) · `POST /orders/:id/transition` (243) · `GET /payments` (257) · `POST /payments/:id/approve` (288) · `GET|POST /purchase-requests[…]/decide` (303–329) · `GET|POST /store-requests[…]/decide` (344–350) · `GET /exceptions` (363) · `GET /audit` (383) · `GET /events` (389) · `GET /warehouse|consolidation|shipping` (412–414، غير مُنفَّذة).

**حاجزان على كل فعل**: `requireAdmin(db, …)` (جلسة + CSRF) ثم محرّك ERP `can()` على الوحدة `aywebs`.
**خرائط الحاجز القديم**: `read → commerce:read` · `write → orders:write` · `approve → payments:write`.
**الصلاحيات كبيانات** (`permissions.ts`): الوحدة `aywebs`، الأفعال `read|write|approve`، 12 مورداً (store, store_adapter, order, order_item, purchase_request, store_request, payment, exception, audit, warehouse, package, shipping). ADMIN: كامل · ORDER_MANAGER: قراءة فقط. البذر idempotent ولا يُعيد تفعيل صفّاً `granted=0`.

### 4.3 عقد الخطأ والالتقاط

- **عقد الخطأ (§44)**: `errorCode · userMessage · technicalMessage · recoverable · retryAllowed · requiredAction` مع رموز مثل `INVALID_URL`/`RAW_PAGE_CAPTURE_DISABLED`, `PRODUCT_PAGE_REQUIRED`, `STORE_UNKNOWN|STORE_MISMATCH`, `PRODUCT_NOT_FOUND`, `VARIANT_REQUIRED|UNKNOWN|UNAVAILABLE`, `OUT_OF_STOCK`, `PRICE_UNAVAILABLE`, `PRICE_CHANGED`, `CART_LOCKED`, `AYWEBS_DISABLED|CAPTURE_DISABLED`, `SESSION_REQUIRED`, `ORDER_STATE_INVALID`, `PERMISSION_DENIED`, `NOT_IMPLEMENTED`.
- **ردّ `POST /product/resolve` (201)**: `capture_id · status (READY|NEEDS_SELECTION) · data · from_cache · cache_age_ms · cache_kind · served_stale · missing · capture{used, fingerprint, price_source, corroborated, rejection} · price_rejection · quote_token · quote_expires_at · product · normalized_product`.
- **التقاط WebView (Phase 2.1)**: السكربت يُخدَم من الخادم (ES5، بلا أسرار، لا كوكيز/لا HTML/لا fetch)، والعميل يرسل نواتجه في حقل **`capture`**؛ الحكم على الخادم في `webviewCapture.ts`: نسخة العقد `AYWEBS_CAPTURE_VERSION=1`، نفس المضيف إلزاماً، سقف `maxBytes 64 000`، عمر أقصى `10 دقائق` + تسامح ساعة `60 ث`، ترتيب الثقة `json_ld > microdata > meta > dom`، **السعر لا يُصدَّق إلا إذا نشره JSON-LD أو اتفق مصدران مستقلان**، العملة تُثبَت بكود ISO، التوفّر من **معجم مغلق** وإلا `UNKNOWN`، ثم بصمة SHA-256.
  **رموز الرفض**: `NOT_AN_OBJECT · BAD_VERSION · TOO_LARGE · URL_HOST_MISMATCH · CANONICAL_HOST_MISMATCH · STALE_CAPTURE · FUTURE_CAPTURE · NO_PRICE_TEXT · PRICE_REJECTED · AMBIGUOUS_PRICE · PRICE_NOT_CORROBORATED · NO_AVAILABILITY_EVIDENCE`.

---

## 5) البيانات والحالات

**الجداول (`schema.ts`)**: `ayweb_products` · `ayweb_product_variants` · `ayweb_carts` · `ayweb_cart_items` · `ayweb_evidence` · `ayweb_domain_events` · `ayweb_audit_logs` (+ طلبات، مدفوعات، طلبات شراء/متجر).
`ayweb_cart_items`: `item_number` (`AYWITEM-…`), `unit_price`, `currency`, `variant_snapshot`, `price_snapshot`, `pricing_tnd`, `evidence_hash`, `status` (ACTIVE / PRICE_CHANGED / VARIANT_UNAVAILABLE / OUT_OF_STOCK / REMOVED). السلة مسقوفة بـ**60 سطراً** وتُرفض في `CHECKOUT/ORDERED` بـ`CART_LOCKED`.

**آلات الحالة (`stateMachines.ts`)**: مصدر واحد للانتقالات —
- Master (24 حالة): `DISCOVERY → STORE_SELECTED → BROWSING → PRODUCT_DETECTED → PRODUCT_RESOLVED → VARIANT_REQUIRED → VARIANT_SELECTED → AVAILABILITY_CONFIRMED → CART → CHECKOUT → PAYMENT_PENDING → PAID → PURCHASE_PENDING → PURCHASING → PURCHASED → SUPPLIER_SHIPPED → WAREHOUSE_RECEIVED → CONSOLIDATION → PACKED → SHIPPING_PAYMENT → DISPATCHED → IN_TRANSIT → DELIVERED`.
- **جدول استثناءات لكل مرحلة** (`PRICE_CHANGED`, `VARIANT_UNAVAILABLE`, `OUT_OF_STOCK`, `CAPTCHA_REQUIRED`, `AUTH_REQUIRED`, `PENDING_INTEGRATION`, `PAYMENT_FAILED`, `SHIPPING_FAILED`, `NOT_IMPLEMENTED`…) — استثناء خارج سياقه = خطأ، لا حالة.
- آلة الطلب + آلة الشراء (`PURCHASE_PENDING → PURCHASING → PURCHASED | PRICE_CHANGED | VARIANT_UNAVAILABLE | OUT_OF_STOCK | PURCHASE_FAILED | REQUIRES_REVIEW | PENDING_INTEGRATION`) — **لا حالة فشل بلا سبب**.
- إسقاط العميل: `ayWebsCustomerTimeline` (done/current/pending) — العميل لا يرى الحالات التقنية.

---

## 6) التسعير والرسوم

`checkoutFees.ts` هو **المصدر الوحيد** لِما يُعرض في الدفع، وقاعدتان مُفروضتان بتحقّق لا بعُرف:
1. `payable = Σ سطور الرسوم` (assertion).
2. **التسليم المحلي مرة واحدة لكل طلب** — السطور تُعاد بحساب `includeLocalDelivery:false` وسطر مخصّص يحمل التسليم (لا ازدواج).

كل سطر يحمل `checkoutReady · restricted · uncertain`، و`blockers` تمنع الدفع (`PRODUCT_RESTRICTED`, سطر غير جاهز)، و`warnings` تُصرّح بالجهل: `STOCK_UNKNOWN` («سيُتحقق قبل الشراء») · `LOW_STOCK` · `CATEGORY_UNCERTAIN` · `WEIGHT_VALIDATION`.
مصدر الأسعار: `src/services/pricing.ts` (الديوانة/الشحن/الأتعاب) + سعر صرف مركزي (`services/fxRates.ts`). لقطة السعر (`price_snapshot` + `pricing_version`) تُختم لحظة الإضافة.
**عرض موقّع (Phase 1)**: `quote_token` من `quoteToken.ts` (TTL افتراضي 5 دقائق، حدّ إعادة تحقّق 2 000 TND، عيّنة تدقيق 5%).

---

## 7) الحماية

| الطبقة | ما تفعله |
|---|---|
| القائمة البيضاء | المتاجر من `shared/aywebsStores.ts` فقط، مطابقة نطاق أساسي/subdomain، **https فقط** |
| SSRF | الحماية القائمة في `safeUrl`/`SmartLinkScraper` (DNS pinning، رفض العناوين الخاصة) |
| إدخال العميل | HTML خام **مرفوض** على `product/resolve` و`product/variants`؛ الالتقاط الوحيد المقبول هو عقد Phase 2.1 المحدود |
| تكامل السعر | `checkPriceText` (`src/scraper/priceIntegrity.ts`) يرفض القوالب («{priceToPay}») وأسعار التقسيط والسعر المشطوب |
| الصلاحيات | بيانات في محرّك ERP (بذر idempotent) + حاجزان على كل فعل إداري؛ **من يوافق على الدفع ≠ من يُدخل** |
| الأثر | `ayweb_audit_logs` + `ayweb_domain_events` + `ayweb_evidence` + `X-Request-ID` لكل طلب |
| حدّ المعدّل | مستقل للالتقاط/الحلّ/الأحداث/المطالبة (في `server.ts`) |
| القياس | أحداث قمع بلا PII (`aywebs_open → capture_succeeded → add_to_cart_succeeded`)، hash جلسة |

---

## 8) الأداء — أرقام مقيسة (وثيقة `AYWEBS_ADD_TO_CART_SPEED_AR.md`، 05–06/10)

| الحالة | قبل | بعد (مقيس على الإنتاج) |
|---|---|---|
| أول قراءة أمازون من Render (عنوان مركز بيانات) | 20–49 ث | **~21 ث** (المصدر الذي نجح: مزوّد الرسم المدفوع بعد فشل المباشر وJina) |
| إعادة فتح نفس المنتج (≤5 دق) | 20–40 ث كل مرة | **111 ملّي** (−99.5%) |
| منتج بلا سعر منشور | حتى ~49 ث | **1.7–2.3 ث** ثم رسالة صريحة |
| طلبان متزامنان نفس المنتج | قراءتان | **قراءة واحدة** (single-flight) |
| CPU: 20 قراءة | بلا سقف | ~21 ث CPU ⇒ `readGate` سقف **3** قراءات متزامنة، لا يرفض أبداً (بعد 20 ث انتظار يمرّ موسوماً `bypassed`) |
| نوم Render (خطة مجانية) | فشل مؤكَّد (مهلة 20 ث < استيقاظ 65 ث) | مهل 15/60 + إعادة محاولة واحدة + `warmUpApi()` عند فتح المتجر |

السباق المتوازي: مباشر جوال ∥ مكتب ب`AYROVIX_DIRECT_TIMEOUT_MS=6500`، وقارئ Jina يبدأ بعد `AYROVIX_JINA_HEADSTART_MS=1200`، والمزوّد المدفوع في المرحلة B بعد استنفاد المجاني.

---

## 9) الأعلام البيئية — الجرد الكامل

### 9.1 أعلام منطقية (تُقرأ بـ`envFlag` في `src/aywebs/context.ts`)

| العلم | الافتراضي | المعنى |
|---|---|---|
| `AYWEBS_ENABLED` | `true` | تشغيل المودل |
| `AYWEBS_CAPTURE_ENABLED` | `true` | الالتقاط عموماً |
| `AYWEBS_<STORE>_CAPTURE_ENABLED` | `true` | لكل متجر (`AMAZON/SHEIN/TEMU/ALIEXPRESS`) |
| `AYWEBS_AI_EXTRACTION_ENABLED` | `false` | استخراج بالذكاء الاصطناعي — مغلق افتراضياً |
| `AYWEBS_PURCHASE_INTEGRATION_ENABLED` | `false` | الشراء الآلي — **غير مربوط** |
| `AYWEBS_WAREHOUSE_ENABLED` | `false` | المرحلة 6 |
| `AYWEBS_SHIPPING_ENABLED` | `false` | المرحلة 8 |

### 9.2 مفاتيح رقمية

`AYWEBS_READ_CONCURRENCY` (3، 1–16) · `AYWEBS_READ_GATE_MAX_WAIT_MS` (20000) · `AYWEBS_RESOLVE_CACHE_TTL_MS` (300000؛ 0=تعطيل) · `AYWEBS_RESOLVE_CACHE_MAX` (400) · `AYWEBS_RESOLVE_STALE_MS` · `AYWEBS_RESOLVE_FAILURE_TTL_MS` · `AYWEBS_QUOTE_TTL_MS` · `AYWEBS_QUOTE_FRESH_MS` (5 دق) · `AYWEBS_QUOTE_REVERIFY_TND` (2000) · `AYWEBS_QUOTE_REVERIFY_SAMPLE` (0.05) · `AYWEBS_HOST_CIRCUIT` · `AYWEBS_WEBVIEW_VERIFY_SAMPLE`.

### 9.3 فجوات `.env.example` (تحتاج تصحيحاً — بند M1)

- **ميت**: `AYWEBS_OCR_FALLBACK_ENABLED=true` ما زال في `.env.example` (السطر 188) بينما الكود **أزال العلم** (لا يوجد كود OCR في المستودع) — أُزيل من `/stores` لأنه كان يعلن قدرة غير موجودة. يجب حذفه من الملف.
- **ناقص في `.env.example`**: `AYWEBS_PURCHASE_INTEGRATION_ENABLED`, `AYWEBS_WAREHOUSE_ENABLED`, `AYWEBS_SHIPPING_ENABLED`, `AYWEBS_READ_CONCURRENCY`, `AYWEBS_READ_GATE_MAX_WAIT_MS`, `AYWEBS_RESOLVE_STALE_MS`, `AYWEBS_RESOLVE_FAILURE_TTL_MS`, `AYWEBS_QUOTE_*` (الأربعة), `AYWEBS_HOST_CIRCUIT`, `AYWEBS_WEBVIEW_VERIFY_SAMPLE`.
- المفاتيح الموجودة فعلاً في `.env.example`: `AYWEBS_ENABLED`, `AYWEBS_CAPTURE_ENABLED`, `AYWEBS_*_CAPTURE_ENABLED` (×4), `AYWEBS_AI_EXTRACTION_ENABLED`, `AYWEBS_OCR_FALLBACK_ENABLED` (ميت), `AYWEBS_RESOLVE_CACHE_TTL_MS`, `AYWEBS_RESOLVE_CACHE_MAX` + كل مجموعة `AYROVIX_*`.

---

## 10) نقاط الهشاشة (مرتّبة)

1. **جدار المتاجر**: Amazon يخدم عناوين مراكز البيانات صفحة قشرة بلا سعر؛ أفضل قراءة أولى ≈21 ث، وSHEIN/TEMU/AliExpress **معطّلة السعر** فعلياً حتى يُضبط مزوّد رسم مدفوع (`RENDER_PROVIDER_NOT_CONFIGURED`).
2. **لا شراء آلي**: `purchase_integration_state: PENDING_INTEGRATION`، والمراحل 6–8 تُرجع `NOT_IMPLEMENTED`. الطلب يصل «مدفوع + مراجعة بشرية».
3. **سلالان**: سلة AYWEBs + سلة AYROVI مع حالة ربط (`linked_to_ayrovi`, `unlinked_units`) — الجسر متين، لكنه أكبر تعقيد بنيوي في المودل.
4. **الخادم على خطة نائمة**: كل «أول» استخدام يدفع زمن الاستيقاظ.
5. **تبعية خارجية للقراءة**: قارئ Jina (طرف ثالث) + مزوّد رسم مدفوع — تكلفة وتوفّر خارج سيطرتنا.
6. **ذاكرة 5 دقائق** قد تُخفي تغيّر سعر حتى `verify` (وهو يفرض `refresh:true دائماً`).
7. **`readGate` يمرّ بعد 20 ث انتظار** (مقصود: لا نصنع عطلاً بأنفسنا) — الحماية الكاملة (workers) مؤجّلة بقياس يبرّرها.
8. **تسجيل دخول Google داخل التطبيق**: Custom Tab اليوم؛ المنتقي الأصلي يحتاج من المالك **Web Client ID + SHA-1**.
9. **الالتقاط خارج السجل** (`AYWEBS_EXTERNAL_STORE`, صفر نطاقات) مشروط بالتقاطع — أي توسيع يجب أن يحفظ الشرط.
10. **سابقة الصدق**: `ocr_fallback_enabled` أُزيل لأنه كان يعلن قدرة غير موجودة ⇒ القاعدة: لا علم/زر يمثّل قدرة غير منفَّذة.

---

## 11) الواجهات

- **الويب** (`client/src/features/aywebs/`): AyWebsApp (رئيسية/متجر/منتج/متصفّح/طلبات)، تبويب «المفضلة» **داخلي** متزامن مع `/api/customer/account/favorites` (لا localStorage)، «حسابي» وحده يخرج (خروج مقصود)، شريط واحد، صور `contain` بحارس اختبار.
- **أندرويد** (`android/.../AyWebsBrowseActivity.java`): متصفّح أصلي + زر عائم + ورقة متغيّرات Dialog فوق الصفحة + دروج السلة/المفضّلة فوق الصفحة (لا `finish()` يقتل المتجر) + `onBackPressed` + قراءة مُسبقة `prefetchResolve` + مهل 15/60 + `EXTRA_CUSTOMER_TOKEN` للحساب + Custom Tab (`AyroviAuthTabPlugin.java`). آخر إصدار موثّق: **1.0.5 / versionCode 5**.
- **CRM**: `/api/admin/aywebs` (Dashboard · Stores · Adapters · Orders · Purchase Requests · Exceptions · Payments · Audit · Events؛ Warehouse/Consolidation/Shipping تعرض «غير منفَّذ» بدل بيانات مُتخيَّلة).
- **تطبيق AYROVI الجديد** (React Native، `apps/mobile/`): `app/(tabs)/aywebs.tsx` **عنصر نائب** — P3 لم تبدأ بعد قائمة التحديثات.

---

## 12) القوابض والتحقق

```bash
npm run typecheck
npx vitest run tests/aywebs-shopping-journey.test.ts tests/aywebs-resolve-cache.test.ts \
              tests/scraper-probe-race.test.ts tests/amazon-product-extraction.test.ts \
              tests/aywebs-ui-remarks.test.ts
npm run design:check
node scripts/check-android-shell.mjs
npm run verify:purchase-flow
npm run verify:aywebs-latency -- --base <origin> --url "https://www.amazon.com/dp/B0GYM3V9H5"
```
أرقام تاريخية موثّقة: 2 152 اختباراً (04/10) ← 2 190 (UI remarks) ← 2 211 (round 3) — وكلها خضراء يوم تشغيلها.

---

## 13) خريطة «تحديث ← ملفات» والحالة

| نوع التحديث | الملفات التي يُلمسها حتماً |
|---|---|
| واجهة/تدفّق المتجر أو الورقة | `client/src/features/aywebs/*` + `android/.../AyWebsBrowseActivity.java` + `shared/aywebsStores.ts` |
| إضافة/إيقاف متجر | `shared/aywebsStores.ts` + `src/aywebs/adapters/<store>.ts` + `registry.ts` |
| التسعير/الرسوم | `src/services/pricing.ts` + `src/aywebs/checkoutFees.ts` |
| حالات الطلب/الشراء | `shared/aywebsTypes.ts` + `stateMachines.ts` + `orders.ts` |
| السلة/الكميات/الحذف | `cart.ts` + `ayroviBridge.ts` |
| الدفع/التحويل البنكي | `orders.ts` + `purchaseRequests.ts` + `adminRoutes.ts` |
| لوحة التحكم | `adminRoutes.ts` + `client/src/admin/…` |
| الرسائل والأخطاء | `errors.ts` (عقد §44) |
| السرعة/القراءة | `src/scraper/{probeRace,scraper,amazonPage}.ts` + `resolveCache.ts` + `readGate.ts` |
| الالتقاط من العميل | `captureScript.ts` (المُخدَّم) + `webviewCapture.ts` + `shared/aywebsCapture.ts` + `GET /capture/script.js` |
| التتبّع/القياس | `analytics.ts` + `events.ts` |

**الحالة**: هذا الملف يُغلق بندَي M1 (جرد المسارات + جرد الأعلام). يبقى **التحديث رقم 1** (دمج قارئ أمازون المحسَّن في `captureScript.ts` + إثبات العملة من رمز مغلق لمتجر مسجَّل + زر معطّل لا يُقرأ كمتوفر + اختبار fixture يقارن قارئ العميل بـ`src/scraper/amazonPage.ts`)، ثم **قائمة تحديثات المالك** بالترتيب.
