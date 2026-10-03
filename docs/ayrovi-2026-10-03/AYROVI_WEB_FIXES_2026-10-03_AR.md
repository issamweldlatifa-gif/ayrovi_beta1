# AYROVI — سجل الإصلاحات المنفَّذة والتحقّق منها

**التاريخ:** 3 أكتوبر 2026 — **الإصدار:** `3.10.4` — **يعقب:** `AYROVI_المراجعة_العميقة_2026-10-03.md`
**الرقعة:** `AYROVI_إصلاحات_2026-10-03.patch` (266 سطراً، 8 ملفات — تُطبَّق نظيفة على نسخة GitHub الأصلية، مُتحقَّق منها بـ `patch -p1 --dry-run` ✅)

---

## 0. الخلاصة: ماذا تغيّر بالأرقام

| المؤشّر | قبل | بعد | الحكم |
|---|---|---|---|
| **البرتقالي — أعلى قيمة** | **7.248%** ❌ | **2.193%** ✅ | تجاوز 2.4× → **داخل سقف 3%** |
| البرتقالي — الصفحة الرئيسية موبايل | 7.248% | **0.613%** | تحسّن 11.8× |
| البرتقالي — الصفحة الرئيسية ديسكتوب | 4.752% | **0.321%** | تحسّن 14.8× |
| **شاشة LENS** | **«غائب»** ❌ | **0.468% موبايل · 0.212% ديسكتوب** ✅ | قياس حقيقي بدل تقرير خاطئ |
| اختبارات الوحدة/التكامل | 2126/2126 | **2130/2130** ✅ | +4 اختبارات انحدار جديدة |
| `verify:public-additions` | 129/129 | **129/129** ✅ | لم ينكسر مع تغيير CSS |
| مدقّقات CI | 22 | **27** | +5 حرّاس كانوا معطّلين |
| ملفات مُعدَّلة | — | **8** (7 يدوياً + 1 مُولَّد) | الـ patch يطبّقها كلّها |

**الحصيلة:** كل الأخطاء القابلة للحلّ بالكود **أُصلحت وتحقّقت**. ما تبقّى نوعان: **قرار تجاري** (بيانات الدفع — خ/2) و**عمل معماري** (تقسيم الملفات — خ/5).

---

## 1. الإصلاح الأول — تجاوز ميزانية البرتقالي (خ/1)

### 🔍 قبل الإصلاح: سبب حقيقي لم يكن ظاهراً في المراجعة الأولى

المراجعة الأولى قالت: «لون ثابت خارج نظام الثيمة». التتبّع الأعمق كشف **سبباً أهمّ وأخطر**:

```
verify/public-additions.mjs:37
  check(`${locale}/${width}: approved ad color and white type`,
    ...  backgroundColor === 'rgb(211, 69, 31)'  ...)
```

**مدقّق المشروع نفسه كان يفرض لون `#D3451F` كـ«لون إعلاني معتمد»** — بينما مدقّق آخر في نفس المشروع يمنع تجاوز 3% برتقالي. وضبط الفحص أكّد أن أياً من القراءتين لا تنقذ الموقف:

```
ارتفاع الشريط ≈ 245px من شاشة ارتفاعها 844px
نسبته من الشاشة الواحدة = 29.0%   ← تجاوز صارخ للسقف 3% بأي قراءة
```

**السبب الجذري الحقيقي:** ليست «قيمة ثابتة سُرّبت»، بل **مواصفتان متعارضتان داخل نفس المستودع**، واحدتهما فقط مربوطة بـ CI (`public-additions`)، فانتصرت على الأخرى (`audit:design` غير المربوط). هذا يفسّر لماذا ظلّ الانحراف صامتاً.

### 🧪 كشف إضافي: لا يستطيع أحد أن يكتب اللون «صواباً» — هناك برتقاليان

عند محاولة كتابة التأكيد رمزياً اكتشفنا أن `--ayrovi-color-brand-orange` **يُحلّ إلى قيمتين مختلفتين حسب النطاق**:

```
النطاق            القيمة الفعلية
:root (tokens.css)      #ff6900   ← رمز دفتر الشروط، مقفول باختبار
.ay-customer-root       #FF7900   ← يحقنه customerTheme.ts:15 من identity.json
```
`customerTheme.ts` يوثّق ذلك صراحة («Compatibility adapter, not a second palette… The approved editorial contract owns customer colors») → **تصميم مقصود لا خطأ**. لكنها **مصيدة حقيقية**: أوّل نسخة من تعديلنا للفحص فشلت لأن المسبار وُضع في `document.body` (خارج الجذر) فقرأ `#ff6900` بينما الشريط داخله يقرأ `#FF7900`. أُصلح بوضع المسبار **داخل نفس سياق التتالي**.

### ✅ التغيير

`client/src/styles/public-discovery.css:2`
```css
/* قبل */
.public-campaign{background:#D3451F;color:#FFFFFF;border-bottom:3px solid #9E3317}

/* بعد */
.public-campaign{background:var(--ayrovi-ink-deep);color:var(--ayrovi-white);
                 border-bottom:3px solid var(--ayrovi-color-brand-orange)}
```
نستعمل `--ayrovi-ink-deep` — الرمز الرسمي الذي يصف نفسه في `tokens.css:143` بـ«Hero, **announcement**, coquille Lens, rails»، أي أنّه **مخصّص لهذا الشريط بالاسم**. البرتقالي يبقى موجوداً كـ**توقيع 3px** لا كمساحة.

`verify/public-additions.mjs:37` — التأكيد صار **مقوداً بالرمز لا بالحرف**:
```js
check(`${locale}/${width}: approved ad treatment and white type`, await page.evaluate(() => {
  const el = document.querySelector('.public-campaign');
  if (!el) return false;
  const s = getComputedStyle(el);
  const probe = document.createElement('span');
  probe.style.color = 'var(--ayrovi-color-brand-orange)';
  el.appendChild(probe);                    // داخل نفس سياق التتالي — انظر الملاحظة أعلاه
  const orange = getComputedStyle(probe).color;
  probe.remove();
  return s.backgroundColor === 'rgb(0, 0, 0)' && s.color === 'rgb(255, 255, 255)'
      && s.borderBottomColor === orange && parseFloat(s.borderBottomWidth) === 3;
}));
```
هذا يُلغي **صنف الخطأ نفسه** الذي سبّب التعارض: لون مكتوب حرفياً في مكانين.

### 📊 الدليل بعد الإصلاح
```
Couverture orange maximale mesurée : 2.193% (budget charte : 3%)     ← قبل: 7.248%
  0.613%  accueil mobile (page entière)        ← قبل: 7.248%
  0.321%  accueil desktop (page entière)       ← قبل: 4.752%
  2.193%  conteneur Stories — mobile           ← صار هو الأعلى (لم يُلمس)
  0.865%  section Hero — mobile
```
و`verify:public-additions` → **129/129 ✅** (لم ينكسر). حارس الجرد اشتغل بالضبط كما يجب عند التعديل: `Design inventory stale: run npm run design:inventory` ثم `Design inventory up to date`.

### ⚠️ قرار تصميمي يحتاج إمضاءك
هذا **تغيير مرئي مقصود**: الشريط صار أسود بعُرف برتقالي بدل أحمر-برتقالي كامل. البديل المحافظ — لو أردتم الاحتفاظ باللون كبيان علامة — هو **تعديل الرقم في دفتر الشروط** (3% → 8%) بدل تغيير التصميم. الرقعة الحالية تختار الشارتة لأنها المواصفة الأدقّ تعبيراً.

---

## 2. الإصلاح الثاني — أداة التدقيق تُبلّغ «LENS غائب» (خ/3)

### 🔍 السبب
`verify/zalando-audit.mjs:50-58` ينقر زر Lens ثم يبحث فوراً عن `.lens-home`. لكن `LensHelp.tsx:61` يضع قبله **بوابة موافقة إلزامية** (3 مربّعات: السنّ + القواعد + نقل الصورة إلى مزوّد خارجي) والزر `disabled` حتى تُقرأ كلها. الأداة كانت تفسّر الحاجب كغياب.

### ✅ التغيير
تجاوز البوابة قبل القياس (نصّ الرقعة في `AYROVI_إصلاحات_2026-10-03.patch`)، مع تعليق يشرح أن البوابة **مطلب قانوني** لا عيب.

### 📊 الدليل بعد الإصلاح
```
غائب : écran LENS — mobile          ←  قبل
غائب : écran LENS — desktop         ←  قبل

0.468%  écran LENS ouvert — mobile     ←  بعد
0.212%  écran LENS ouvert — desktop    ←  بعد
```
مع لقطات جديدة: `verify/zalando-lens-screen-{mobile,desktop}.png`. الشاشة كانت **داخل الميزانية طوال الوقت** وكانت غير مرئية للوحة القيادة.

---

## 3. الإصلاح الثالث — ربط الحرّاس بـ CI (خ/4)

### ✅ التغيير
`ci.yml`: من **38 إلى 41 خطوة**، مع تشغيل خادم حقيقي (المدقّقات الثلاثة لا تُضيف خادمها بنفسها مثل باقي runners):

```yaml
- name: Start the real server for charter guards
  run: |
    npm run build:server
    NODE_ENV=development PORT=3210 ADMIN_EMAIL=… ADMIN_PASSWORD=… \
      nohup node dist/server.js > /tmp/ayrovi-server.log 2>&1 &
    for i in $(seq 1 60); do
      curl -sf http://127.0.0.1:3210/api/public/commerce-config >/dev/null && exit 0
      sleep 1
    done
    tail -40 /tmp/ayrovi-server.log; exit 1

- name: Enforce charter guards the build must never break again
  env: { AYROVI_BASE_URL: http://127.0.0.1:3210 }
  run: |
    npm run verify:public-nav
    npm run verify:footer-payments
    npm run verify:customer-auth
    npm run verify:product-variants
    npm run verify:image-composition
    npm run audit:design          # ← ميزانية 3%
```

**لماذا `NODE_ENV=development` عن قصد:** القاعدة تُزرع بمحتوى عرضي **حتمي**، فيوجد شريط حملة حقيقي يُقاس. لو استعملنا قاعدة فارغة لَمرّ الحارس **على الفارغ** — وهو أسوأ من غيابه. مكتوب في تعليق داخل الملف كي لا يُغيَّر سهواً.

**مُتحقَّق منه:** `ci.yml` صالح كـ YAML، والخطوات الثلاث ظاهرة في الوظيفة `typecheck-test`، والمدقّقات الثلاثة كلّها ✅ محلياً بنفس الترتيب.

---

## 4. الإصلاح الرابع — السكرابر يخترع معرّفات (خ/7)

### 🔍 قبل / السبب
`src/scraper/scraper.ts` (كتلة الاحتياط) كانت:
```ts
} catch {}                                                          // الخطأ يُمحى بلا أثر
return { …, externalId: 'ITEM-' + Math.floor(Math.random() * 899999 + 100000) };
```
عيشان حقيقيان: **(1)** إعادة كشط نفس الرابط تُنتج معرّفاً جديداً كل مرة → سطر جديد بدل مطابقة السطر نفسه (والتخزين يعتمد على هذه المفتاح: `database.ts:3120 if (item.externalId)`). **(2)** رقم عشوائي لا يمكن تمييزه من معرّف تاجر حقيقي.

### ✅ التغيير
```ts
} catch (error: any) {
  console.warn('[scraper] extraction depuis l’URL échouée', { url: rawUrl, store, message: error?.message });
}
return {
  …,
  externalId: `UNRESOLVED-${createHash('sha1').update(rawUrl).digest('hex').slice(0, 12)}`,
};
```
الآن: **حتمي** (نفس الرابط ⇒ نفس المعرّف) و**صادق** (البادئة تقول إنّه ليس معرّف تاجر). والفرع الشقيق `aliexpress` كان يفعل ذلك أصلاً (`id ? \`AE-${id}\` : ''`) — أي أن الاحتياط كان **الشاذّ** لا القاعدة.

### 📊 الدليل — اختبار انحدار جديد
`tests/scraper-unresolved-identity.test.ts` — **4/4 ✅**:
```
✓ produit la MÊME identité pour la même url (réanalyser ne duplique plus)
✓ produit des identités DIFFÉRENTES pour des urls différentes
✓ annonce la vérité : préfixe UNRESOLVED- et jamais un faux identifiant marchand
✓ ne dépend d’aucun aléatoire (Math.random interdit sur ce chemin)   ← يفشل لو رجع أحد للعشوائية
```

---

## 5. الإصلاح الخامس — تجربة المطوّر الجديد (خ/10 + خ/11)

### ✅ التغيير
- `package.json`: سكريبت جديد `"verify:setup": "npx playwright install --with-deps chromium firefox"`.
- `README.md`: قسم «Vérificateurs de navigateur — à lire avant le premier lancement» يشرح: الخطوة الإلزامية مرّة واحدة، الرسالة المضلّلة التي تظهر بدونها، `AYROVI_BASE_URL` لمن يحتاجه، وأيّ runners تُضيف خادمها بنفسها. وجدول يفرّق بين **مدقّق آلي** و**أداة يدوية** (`verify:lens-probe` تحتاج `SERPAPI_KEY` فعلياً وتستهلك حصة).

---

## 6. ✋ تصحيحات على تقرير المراجعة الأولى (شفافية)

خطأان في التقرير الأول يجب أن يُقرآ قبل الاعتماد عليه:

### 6.1 خ/11 — ادّعاء خاطئ: رمز الخروج
**ما كتبناه:** «`verify:lens-probe` يخرج بالرمز `0` (نجاح) رغم عدم تنفيذ أي شيء — نجاح كاذب لو رُبط بـ CI».
**الحقيقة:** رمز الخروج **1**.
```
$ npm run verify:lens-probe > /tmp/lp.log 2>&1; echo $?
1
```
**سبب الخطأ عندنا:** قرأنا `exit_code` من **سطر الأنبوب** (`| grep | tail`) لا من السكربت. السكربت سليم، `verify/lens-probe.ts:29-32` يفشل بـ`process.exit(1)` كما ينبغي. **لم نصلح شيئاً في الكود** — لأن لا عيب فيه. الإضافة الحقيقية الوحيدة كانت التوثيق.

### 6.2 خ/1 — السبب الجذري كان ناقصاً
قلنا «لون ثابت خارج نظام الثيمة». الأصحّ: **تعارض بين مواصفتين داخل المستودع**، وكان نصفه مخفياً في `verify/public-additions.mjs:37` (يفرض اللون) — وهو ما جعل الانحراف ممكناً وصامتاً. التفاصيل في القسم 1 أعلاه.

> هذه ليست تفاصيل هامشية: تقرير مراجعة ينسب خطأً إلى مكان خاطئ يقود الفريق إلى إصلاح بلا أثر. سجّلناها بنصّها.

---

## 7. 🔎 ملاحظتان جديدتان (لم تكونا في التقرير الأول)

### 7.1 مصيدة نطاق الرمز: برتقاليان لنفس الاسم
`--ayrovi-color-brand-orange` = `#ff6900` على `:root` و`#FF7900` داخل `.ay-customer-root` (يحقنه `customerTheme.ts:15` من `identity.json`).
**ليس خطأ** (موثّق كعقد تحريري مقصود)، لكنه فخّ: أي قياس أو اختبار يُنفَّذ خارج الجذر يقرأ قيمة أخرى. **التوصية:** لا تقارن ألواناً مكتوبة حرفياً في أي مدقّق — اقرأ الرمز من داخل نفس الجذر (هذا ما بُني عليه إصلاح `public-additions`).

### 7.2 اهتزاز المدقّقات تحت الحمل
عند تشغيل **10 مدقّقات متصفّح متتالية في نفس الصدفة**، سقط `verify:lens-results` مرّة:
```
Error: SONIM checks failed: 1
```
وفي **4 إعادات منفصلة → 135/135 ✅ كل مرّة**. إذن `verify:lens-results` **مستقرّ في العزل، هشّ تحت الحمل** (كل مدقّق يفتح متصفّحاً + يبني بـesbuild + يُشغّل خادماً؛ الانتظارات ثابتة `waitForTimeout` بلا إعادة محاولة).
**التوصية:** في CI لا يضرّ (كل خطوة في عملية منفصلة). محلياً: شغّلها فرادى أو أضف إعادة محاولة واحدة على المدقّقات الثلاثة عشر ذات المتصفّح. **لا تُبلَّغ كنتيجة فشل حتمية.**

---

## 8. حالة المستودع بعد الإصلاح

### الملفات الثمانية المعدّلة
| الملف | التغيير | يدوي/مُولَّد |
|---|---|---|
| `client/src/styles/public-discovery.css` | خلفية الشريط → رمز + عُرف 3px | يدوي |
| `verify/public-additions.mjs` | تأكيد مقود بالرمز + مسبار داخل الجذر | يدوي |
| `verify/zalando-audit.mjs` | تجاوز بوابة موافقة Lens | يدوي |
| `.github/workflows/ci.yml` | +3 خطوات: خادم + 6 حرّاس + أرشيف أدلّة | يدوي |
| `README.md` | قسم تجهيز المتصفّحات + آلي/يدوي | يدوي |
| `package.json` | `verify:setup` | يدوي |
| `src/scraper/scraper.ts` | تسجيل الخطأ + معرّف حتمي | يدوي |
| `docs/editorial/source-inventory.json` | تجديد آلي (سطر واحد فعلياً + الألوان) | **مُولَّد** — `npm run design:inventory` |
| `tests/scraper-unresolved-identity.test.ts` | **جديد** — 4 اختبارات انحدار | جديد |

### التحقّق النهائي الكامل (بعد كل التعديلات)
```
✅ npm test                       2130/2130   (154 ملف)
✅ npm run typecheck              نظيف (خادم + عميل)
✅ npm run design:check           الجرد محدَّث · 250 ملف · 0 خرق · الهوية سليمة
✅ npm run audit:design           2.193% ≤ 3%  (كان 7.248%)
✅ verify:public-nav              20/20
✅ verify:footer-payments         68/68  (0 وسيلة قابلة للتحصيل — خ/2، قرار تجاري)
✅ verify:public-additions        129/129
✅ verify:customer-auth           PASS 23
✅ verify:product-variants        CONFORME (7 بطاقات)
✅ verify:image-composition       6/6
✅ verify:purchase-flow           12+13+6
✅ verify:editorial-customer      235/235
✅ verify:editorial-states        1229/1229
✅ verify:editorial-account       PASS 134
✅ design:browser                 41/41
✅ verify:lens-camera             135/135
✅ verify:lens-results            135/135  (4/4 إعادات مستقرة)
✅ verify:lens-cards              105/105
✅ verify:variant-availability    249/249
✅ verify:product-selection       393/393
✅ verify:sonim-actions           185/185
✅ verify:sonim-history           157/157
✅ verify:sonim-media             161/161
✅ verify:sonim-playback           85/85
✅ verify:sonim-handsfree          73/73
```
**≫ 6,000 تأكيد أخضر. صفر فشل.**

### الرقعة
`AYROVI_إصلاحات_2026-10-03.patch` — 266 سطراً، 8 ملفات، تُطبَّق بـ:
```bash
git apply AYROVI_إصلاحات_2026-10-03.patch     # من جذر المستودع
```
مُتحقَّق منها: `patch -p1 --dry-run` على نسخة مطابقة لأصل GitHub → **تقبل الملفات الثمانية كلّها بلا رفض**.

---

## 9. ما تبقّى — وفيه قرارك أنت

| # | البند | النوع | لماذا لم يُنفَّذ الآن |
|---|---|---|---|
| **خ/2** | نشر `bank_rib` + `poste_account` + مفتاح Konnect | **قرار تجاري + بيانات** | ليس كوداً: يُنشر من لوحة الأدمين. مفتاح Konnect يحتاج حساباً بنكياً حقيقياً |
| **خ/5** | تقسيم `database.ts` (3700 سطر) و`admin/routes.ts` (2260) | **عمل معماري** | نقل كود واسع، يجب أن يكون commit مستقلاً بلا تغييرات وظيفية — يستحقّ جلسة خاصة |
| **خ/6** | 12 سكريبت تدقيق يتيم | **نظافة** | بعضها قد يكون مرجعاً لك؛ الحذف قرارك (التفاصيل موصوفة في التقرير الأول §خ/6) |
| **خ/8** | 610 KB حزمة أدمين في كل APK وكل زيارة | **هندسة بناء** | يحتاج فصلاً في `vite.config.mts` + تعديل `android-apk.yml` — أُجّل لأنه يلمس مسار الإصدار |
| **خ/9** | باقي الألوان الثابتة في نفس ملف CSS (‏`#FF7900`‏، `#8A8A8A`، `#BDBDBD`، `#262626`…) | **اتّساق** | أصلحنا **مصدر الخرق الوحيد** (شريط الحملة). الباقي لا يؤثّر على أي ميزانية (أكبر مساهم آخر = 0.074%) — تحويله كله مخاطرة بلا مكسب الآن |
| **7.2** | إعادة محاولة للمدقّقات تحت الحمل | **موثوقية أدوات** | يلمس 13 ملف مدقّق؛ موصوف ومقاس، والقرار لك |

**التوصية بالترتيب:** خ/2 (قرار + بيانات، بلا كود) ← خ/8 (مكسب حجم مباشر في APK) ← خ/6 (نظافة سريعة) ← خ/5 (جلسة معمارية مستقلّة).

---
*كل رقم في هذا السجل مأخوذ من مخرج أُعيد تشغيله بعد التعديل، لا من تقدير. والتصحيحان في القسم 6 مذكوران بنصّهما لأن الأمانة في المراجعة تسبق جمال التقرير.*
