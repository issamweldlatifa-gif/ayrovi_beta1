# خطة الإصلاح — تطبيق AYROVI أندرويد
## مواصفة تنفيذية جاهزة للتنفيذ (تصميم فقط — لم يُطبَّق أي سطر كود)

**التاريخ:** 4 أكتوبر 2026 · **الأساس:** `e70ccbd` · **الفرع:** `arena/01a10927-ayrovi-beta1`
**مرجعها:** `docs/AUDIT_ANDROID_2026-10-04_AR.md` (تقرير الفحص الكامل)

> **وضع هذا الملف:** تصميم مقترح للمراجعة. **لا يحتوي على أي تغيير مُطبَّق.** الأسطر البرمجية أدناه مخططات للمراجعة لا شيفرة منفَّذة. التنفيذ يبدأ بعد إذن صريح، مهمةً بمهمة.

---

## 0. قياسات حجم التغيير (مقيسة لا مقدَّرة)

| المهمة | عدد المواضع | الملفات المعنية |
|---|---|---|
| AY-26أ (صور Lens/الوكلاء) | **1 موضع خنق** | `client/src/ayrovix/services/mediaIsolation.ts` (مستورد من 4 ملفات فقط) |
| AY-26ب (صور الواجهة) | ~6 مواضع عرض | `EvergreenHero.tsx:135` · `PartnerBrandsSlider.tsx:53` · `account/AccountCommerce.tsx:13` · `LensHistory.tsx:33` · `design/AppHeader.tsx:56,59` · `social/*` |
| AY-01 (الدخول الاجتماعي) | ~~3 روابط~~ **مُنفَّذ على `main`** | `nativeOAuth.ts` + `AyroviAuthTabPlugin.java` (PR #18) — لم يبقَ أي `<a href="/api` خارج الأدمن |
| AY-02 (الخروج) | **دالة واحدة** | `src/customer/auth.ts:196-199` |
| AY-12 (سلة AYWEBs) | 3 طبقات + قرار أمني | `nativeShell.ts` · `AyWebsBrowsePlugin.java` · `AyWebsBrowseActivity.java` · (+ قرار CSRF في `src/customer/auth.ts`) |
| AY-19 / AY-13 (الطبقات) | 2 سطر CSS/طبقة | `OcerexScreen.tsx:141` · `AyWebsApp.tsx:82` |

**حقل مرجعي:** 50 مرجعًا لحقول صور قادمة من الخادم خارج واجهة الأدمن — لكن **ليست كلها** بحاجة لتعديل: صور التجار مطلقة أصلًا (تُترك كما هي)، والمطلوب فقط ما يعود نسبيًا (`/uploads/…`، `/api/public/media/…`).

---

## المهمة 1 — AY-26: الأصول ذات المسار النسبي داخل APK 🔴

### الجذر (مؤكَّد)
`client/src/services/nativeApiOrigin.ts` يرقع `window.fetch` و`XMLHttpRequest.prototype.open` فقط. أما `<img src>` و`srcSet` و`<video src>` و`poster` فيُحلَّ مقابل `https://localhost` (أصل الحزمة المضمّنة) حيث لا وجود لـ `/uploads` ولا `/api`. ولا يوجد أي مُطبِّع لروابط الصور في العميل (`git grep` لدالة تطبيع = 0 نتيجة).

### التصميم المقترح

**1) دالة نقية واحدة في وحدة محايدة** — على غرار سابقة `apiOrigin.ts` التي أُنشئت خصيصًا لكسر دورة استيراد:

`client/src/services/assetOrigin.ts` (جديد):
```ts
import { AYROVI_API_ORIGIN, normalizeApiOrigin } from './apiOrigin';
import { isNativeApp } from './nativeShell';

/** مطلق مسبقًا (تاجر، data:، blob:) أو أصل محلي مجمَّع → لا يُلمس. */
const leavesAsIs = (value: string) =>
  /^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:');

/**
 * مسار عرض آمن داخل الحزمة المضمّنة.
 * القاعدة الحاكمة (§2): على الويب الدالة **مطابقة تامة** (identity) — صفر انحدار.
 */
export function nativeAssetUrl(url: string | null | undefined, origin = AYROVI_API_ORIGIN): string {
  const value = String(url ?? '').trim();
  if (!value || !value.startsWith('/')) return value;   // لا مسار نسبي من الجذر
  if (leavesAsIs(value)) return value;
  if (!isNativeApp()) return value;                      // الويب: same-origin كما هو
  return `${normalizeApiOrigin(origin) || AYROVI_API_ORIGIN}${value}`;
}
```
ملاحظة الدورة: `assetOrigin → nativeShell → apiOrigin` — بلا دورة (`nativeShell` لا يستورد `assetOrigin`).

**2) تطبيقها عند موضع الخنق أولًا (يُغلق AY-26أ دفعة واحدة):**
في `mediaIsolation.ts` تُغلَّف مخرجات الدوال الثلاث: `isolatedMediaUrl` و`composedMediaUrl` و`proxiedMediaUrl`. بهذا تُصلَح كل أسطح Lens وShopBag من **ملف واحد** (مستورد من 4 ملفات فقط).

**3) ثم مواضع العرض القادمة من الخادم (AY-26ب):** `EvergreenHero` (الصورة + عناصر `srcset`)، `PartnerBrandsSlider`، `AccountCommerce` (سطور السلة)، `LensHistory`، `AppHeader` (`logoUrl`)، و`src`/`poster` في `social/*`.

### الخيار البديل (يُعرض للقرار لا للتنفيذ الآن)
شبكة أمان عالمية: داخل التطبيق فقط، مُراقب `MutationObserver` يعيد كتابة أي `src` نسبي إلى مطلق. **المكسب:** يغطي أي سطح مستقبلي بلا تعديل مواضع. **الكلفة:** جزء متحرك إضافي يعمل دائمًا، وأصعب في الاختبار. **التوصية:** البدء بالخيار الصريح (1+2+3) لأنه قابل للاختبار وحدةً وحدةً، واللجوء للمراقب إن أظهر فحص الجهاز صورًا مكسورة متبقية.

### حارس الانحدار والاختبارات
- اختبار جديد `tests/native-asset-origin.test.ts`: مسار `/uploads/…` داخل التطبيق → مطلق؛ **نفس المدخل على الويب → unchanged (حارس §2)**؛ رابط تاجر مطلق → unchanged؛ `data:`/`blob:` → unchanged؛ قيمة فارغة → `''`.
- ثابت في `scripts/check-android-shell.mjs`: مخرجات `mediaIsolution` تمرّ عبر `nativeAssetUrl`.
- **اختبار سلبي إلزامي:** إرجاع الدالة إلى `identity` في الوضع الأصلي يجب أن يُسقط الاختبار (يثبت أن للحارس أنيابًا، لا أنه يمرّ بلا فحص — خطأ وقع سابقًا في `tests/android-shell.test.ts` وصُحِّح).

### معايير القبول
1. داخل APK: صورة الهيرو، صور أقسام CMS، الماركات، صور سطور السلة، وصور Lens تظهر بتركيبها/عزلها كما على الويب.
2. `npm run typecheck` + `npm run build` + `vitest run` = **2,158/2,158 دون انخفاض** + `android:check` 22/22.
3. **صفر تغيير سلوكي على الويب** (الدالة مطابقة هناك).

---

## المهمة 2 — AY-01: الدخول الاجتماعي داخل التطبيق 🔴 — **أُلغيت: نُفِّذت على `main`**

> **تحديث 05-10-2026:** بينما كانت هذه الخطة قيد المراجعة، دُمج على `main` الالتزام
> `23bcf1b` (PR #18) بعنوان «Google 404 fix and native Google sign-in». التحقق من الكود
> (لا من العنوان) يُثبت أن الحل هو نفس النهج الموصى به هنا:
> • `client/src/customer/nativeOAuth.ts` (جديد) — `oauthStartUrl(...)` + `createHandoffCode()` + `claimNativeSession(handoff)` لاسترجاع `native_session_token`؛
> • مكوّن جافا `AyroviAuthTabPlugin.java` + صفحة `client/public/auth/native-done.html` (تبويب داخل التطبيق)؛
> • `CustomerAccountPage.tsx:778-795` — في الحزمة: `<button onClick={startNativeProvider(...)}>` (لا رابط نسبي)، وعلى الويب: `<a href=...>` كما كان (صفر انحدار)؛
> • `tests/customer-native-oauth-handoff.test.ts` — **7 اختبارات ناجحة**، وCI أخضر.
>
> **ما بقي غير مُتحقَّق منه:** التشغيل على جهاز حقيقي (إعادة توجيه الموفّر → الرمز → جلسة نشطة).
> **مهمة المتابعة الوحيدة المقترحة:** فحص يدوي على APK تصحيح؛ فإن ظهرت أي ثغرة، تُفتح مهمة فرعية.
>
> **ترتيب المهام بعد الإلغاء:** 1 ← AY-26 ✅ · 2 ← **AY-02** · 3 ← AY-12 · 4 ← AY-19/AY-13 · 5 ← AY-27.
>
> النص الأصلي للمهمة محفوظ أدناه كمرجع تشخيصي (يبقى صحيحًا كوصف للمشكلة).

### الجذر (مؤكَّد)
الأزرار **روابط HTML** (`<a href="/api/customer/auth/google/start?…">`) لا تمرّ بجسر `fetch`. داخل الحزمة المضمّنة: `WebViewLocalServer.java:425` (مع `html5mode=true`) يعيد `index.html`، فيُقلع التطبيق على مسار `/api/...` → `unknownPath` → **شاشة 404**. ولو صار المسار مطلقًا، `allowNavigation: []` يفتحه خارج التطبيق، والرد (`routes.ts:687-770`) ينتهي بكوكي على أصل API وتحويل إلى `returnTo` — فلا يصل `native_session_token` إلى التطبيق أبدًا.

### الخيارات

| الخيار | الوصف | الحكم |
|---|---|---|
| أ | تحويل الروابط إلى مطلق | ❌ غير كافٍ: يفتح المتصفح الخارجي، والكوكي يضيع هناك |
| ب | إضافة مضيف API إلى `allowNavigation` | ⚠️ يبقيه داخل الـ WebView لكنه يُحمّل الموقع من أصل آخر بلا تسليم رمز للتطبيق |
| **ج** | **رابط عميق للعودة**: النداء يعيد التوجيه إلى `ayrovi://auth?token=…`، و`MainActivity` يستلمه، و`rememberNativeSessionToken` يخزّنه | ✅ **الحل الصحيح** — لكنه يلمس الخادم + المانيفست + الجافا + العميل |
| **د** | **تخفيف فوري:** داخل التطبيق، إخفاء أزرار Google/Facebook/Apple مع رسالة صادقة، وتوجيه المستخدم للبريد/SMS (يعملان عبر `fetch` + Bearer) | ✅ يُنهي الطريق المسدود فورًا |

**التوصية:** **د فورًا** (تغيير صغير آمن يمنع شاشة 404)، ثم **ج** كمهمة مستقلة باختبار جهاز.

### حارس الانحدار
ثابت جديد في الحارس: «لا رابط `<a … href>` في واجهة الحساب يبقى نسبيًا داخل التطبيق» — مع استثناءات موثَّقة، ونزع التعليقات قبل التأكيد (قاعدة المستودع).

---

## المهمة 3 — AY-02: الخروج لا يُبطل الجلسة 🟠

### الجذر (مؤكَّد)
`src/customer/auth.ts:196-199` يقرأ الرمز من **الكوكي فقط**، والكوكي غائب داخل التطبيق.

### التغيير المقترح (دالة واحدة)
```ts
export function destroyCustomerSession(db: QatafoDatabase, req: Request): void {
  // كان: parseCookie(req.headers.cookie, COOKIE_NAME) → لا يرى Bearer
  const token = sessionTokenFromRequest(req);            // كوكي (ويب) أو Bearer (تطبيق)
  if (token) db.run('DELETE FROM customer_sessions WHERE id=?', hashToken(token));
}
```
`sessionTokenFromRequest` موجودة ومستخدمة أصلًا في `resolveCustomer` — إذن التغيير **يعيد استخدام المصدر الوحيد القائم** ولا يضيف مسارًا ثانيًا. على الويب: السلوك مطابق تمامًا.

### الاختبار (supertest)
دخول بترويسة `x-ayrovi-native: 1` → التقاط `native_session_token` → `GET /auth/me` بـ Bearer = 200 → `POST /auth/logout` بـ Bearer → `GET /auth/me` = **401**. مع اختبار عدم انحدار لمسار الكوكي على الويب.

---

## المهمة 4 — AY-12: نسبة سلة AYWEBs للحساب 🔴 (اشتباه قوي)

### الجذر (مؤكَّد بالكود)
`AyWebsBrowseActivity.post()` يرسل `x-session-id` فقط → `optionalAyWebsCustomer = optionalCustomer` → `accountId = null` → الجسر يكتب `account_id = NULL`، والقراءة بـ `cartOwner(accountId)` لا تراه. الترميم الوحيد حاليًا هو `attachCartToAccount`، ويعمل فقط إن صدر طلب سلة موثَّق **بنفس معرّف الجلسة**.

### التغيير المقترح
1. `nativeShell.openAyWebsNativeBrowser` يضيف `authToken: getNativeSessionToken()` إلى حمولة `plugin.open` (يرسل `apiOrigin` أصلًا).
2. `AyWebsBrowsePlugin.open` يتحقق (نمط `http(s)`/`Bearer` آمن) ويمرّره في `EXTRA_AUTH_TOKEN`.
3. `AyWebsBrowseActivity.post` يرسل `Authorization: Bearer …` + `x-ayrovi-native: 1`.

### قرار أمني مطلوب منك (لا أتخذه وحدي)
`optionalCustomer` يفرض `x-csrf-token` على الطلبات غير GET **عند المصادقة**. القشرة لا تملك رمز CSRF، فإضافة Bearer وحدها ستقلب الفشل من «سطر غير منسوب» إلى **403 INVALID_CSRF**. الخياران:
- **أ)** تمرير رمز CSRF أيضًا إلى القشرة (يحتاج تمريره من العميل وتخزينه)؛
- **ب)** إعفاء الجلسات القادمة من ترويسة `Authorization` (لا كوكي) من فحص CSRF — **مبرَّر أمنيًا**: الرمز في الترويسة لا يضيفه المتصفح تلقائيًا، فهو غير قابل للتزييف عبر المواقع (تعليق `auth.ts` يصف Bearer فعلًا بأنه «insensible au CSRF»).

**توصيتي:** (ب) مع اختبار صريح يمنع أن يمتد الإعفاء إلى مسار الكوكي — لأن (أ) يضاعف الأسرار المحفوظة في القشرة بلا مكسب أمني.

---

## المهمة 5 — AY-19 / AY-13: الطبقات المتراكبة 🟠

| الشاشة | الوضع الحالي | المقترح |
|---|---|---|
| OCEREX (`OcerexScreen.tsx:141`) | `fixed inset-x-0 top-16 z-20` + ارتفاع `auto` | `fixed inset-0 z-[45] overscroll-contain` + `padding-bottom` لشريط التنقل، أو إخفاء الشريط السفلي أثناء فتحها |
| AYWEBs (`AyWebsApp.tsx:82`) | `fixed inset-0 z-[25]` — تحت الشريط السفلي (`z-30`)، فشريطها الخاص (`.ayw-tabs`, `z-30`) مدفون داخل سياق `z-25` | رفعها إلى `z-[45]` **أو** إخفاء الشريط السفلي العام على مسار AYWEBs (أنظف: لا شريطين) |

الطبقات المقيسة: Lens `z-[75]` · الكاميرا `z-[76]` · المساعد `z-[80]` · القائمة `z-[85]` · الترويسة `z-40` · الشريط السفلي `z-30`. القيمة `z-[45]` تضع الشاشة فوق الترويسة والشريط وتحت الطبقات المودالية العليا.

---

## 6. إجراء التنفيذ لكل مهمة

1. **فرع مهمة** مشتق من فرع الجلسة: `fix/ay-26-native-assets`، `fix/ay-01-native-oauth`، `fix/ay-02-bearer-logout`، `fix/ay-12-aywebs-identity`، `fix/ay-19-13-layers`.
2. **التزام واحد دقيق** لكل مهمة + اختباره + ثابت انحدار + **اختبار سلبي يثبت أن الحارس يمسك الرجوع**.
3. **PR** إلى `arena/01a10927-ayrovi-beta1` بوصف: المشكلة، الدليل قبل/بعد، الملفات، الاختبارات، خطة التراجع.
4. **بوابات المرور:** `typecheck` · `build` · `vitest` (دون انخفاض عن 2,158) · `android:check` · `design:check` · `identity:check`.
5. **التراجع:** `git revert <sha>` — لا هجرات مخطط، لا تغيير معماري، لا تعديل على `main`.

## 7. أوامر تحقق جاهزة (للاستخدام بعد كل مهمة)

```bash
# صحة الكامل قبل/بعد
npm run typecheck && npm run build && ./node_modules/.bin/vitest run   # 2158/2158
npm run android:check                                                   # 22/22 (يرتفع مع الثوابت الجديدة)

# AY-26: هل محتوى الإنتاج يستخدم مسارات نسبية؟ (يحتاج جهازك — الشبكة محجوبة هنا)
curl -s https://ayrovi-beta1.onrender.com/api/public/hero/active | head -c 400

# AY-02: إبطال الجلسة عبر Bearer
# (اختبار supertest الموصوف أعلاه، لا curl يدوي — السر لا يظهر في السجلات)
```

> **تحذير سري:** لا تُلصق أي `native_session_token` أو قيمة `Authorization` في تذكرة أو سجلّ. الاختبارات تلتقط القيم داخل العملية ولا تطبعها.

---

*هذه المواصفة تصميم للمراجعة. لم يُعدَّل أي سطر من شيفرة التطبيق، ولم يُلتزم بأي تغيير، ولم يُبنَ APK.*
