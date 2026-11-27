# SOORCE — دليل الالتقاط الحي في بيئتك (Playwright + REA + HAR)

> لماذا هذا الدليل؟ بيئة تطويرنا تسمح بالوصول الخارجي فقط عبر أداة جلب
> (صفحات مُرندة + GET probes) — لا متصفح كامل ولا اعتراض شبكة. هذا الدليل
> يكمل الدراسة في **بيئتك أنت** بخمس دقائق، فيصبح عندنا HAR حقيقي وREA تعمل
> رسمياً (نسخة Node عندك تتجاوز بوّابة REA).

## 1) تجهيز (مرة واحدة)

```bash
# Node ≥ 22.23.4 (أو 24.22.1+) — بوّابة REA الرسمية
node -v
npm install -g rea-agents@latest        # REA (morluto/rea)
npx playwright install chromium         # متصفح الالتقاط
mkdir soorce-capture && cd soorce-capture
npm init -y && npm i -D playwright
```

## 2) تسجيل الرحلة بـPlaywright مع HAR (سكربت جاهز)

أنشئ `capture.mjs`:

```js
import { chromium } from 'playwright';

const BASE = 'https://soorce.net';
const journey = [
  ['keyword', `${BASE}/fr/search?keyword=${encodeURIComponent('ملابس')}`],
  ['keyword-en', `${BASE}/fr/search?keyword=phone%20case`],
  ['product', `${BASE}/fr/product/978597247613`],
  ['product2', `${BASE}/fr/product/994387606080`],
  ['category', `${BASE}/fr/category/10166?cat_name=Women%27s+Clothing`],
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  recordHar: { mode: 'full', content: 'attach', path: 'soorce.har' },
  viewport: { width: 1366, height: 900 },
});
const page = await context.newPage();

for (const [name, url] of journey) {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `shot-${name}.png`, fullPage: true });
  console.log(name, url, `${Date.now() - t0}ms`);
}

// بحث بالصورة: ارفع صورة إن وُجد زرّها في الصفحة الرئيسية/البحث
await page.goto(`${BASE}/fr/`, { waitUntil: 'networkidle' });
const photoInput = page.locator('input[type=file]').first();
if (await photoInput.count()) {
  await photoInput.setInputFiles('./sample-product-photo.jpg');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'shot-image-search.png', fullPage: true });
  console.log('image-search captured →', page.url());
}
await context.close(); // يُغلق كتابة HAR
await browser.close();
```

ثم:

```bash
node capture.mjs
# الناتج: soorce.har + 5 screenshots (رحلة قابلة للتكرار حرفياً)
```

## 3) تحليل الـHAR بـREA

```bash
rea --help                                  # اقرأ أسماء أدوات الالتقاط في نسختك
rea analyze-network-capture soorce.har      # أو الاسم الموثّق في --help للـHAR
rea analyze-website ${BASE}/fr --json       # إن طلب متصفحاً — chromium مثبّت عندك
```

ما نبحث عنه في تحليل الـHAR (أزِل أي كوكي/توكن قبل المشاركة):
- كل نداءات `/api/*` أثناء البحث بالكلمة والصورة — وخاصة نداء البحث بالصورة
  (POST؟ multipart أم base64؟) — الفجوة الوحيدة المتبقية في دراستنا.
- نداء تفاصيل المنتج (SSR أم XHR؟) وشكله.
- نداءات checkout عند تسجيل الدخول (اختياري — حسابك أنت).

## 4) التنقيح قبل المشاركة

```bash
# حذف أي ترويسات حساسة من الـHAR قبل إرفاقه في المستودع
node -e "
const fs=require('fs');const har=JSON.parse(fs.readFileSync('soorce.har','utf8'));
const scrub=h=>{for(const e of h.log.entries){for(const h2 of e.request.headers)
  if(/cookie|authorization|x-csrf|token/i.test(h2.name)) h2.value='[REDACTED]';
  for(const h2 of e.response.headers||[]) if(/set-cookie/i.test(h2.name)) h2.value='[REDACTED]';}};
scrub(har);fs.writeFileSync('soorce.sanitized.har',JSON.stringify(har,null,2));"
```

## 5) ما يُضاف للمستودع بعد التشغيل

ضع في `docs/design/soorce-artifacts/`: `soorce.sanitized.har` + لقطات الشاشة
+ مخرجات REA (JSON) — وسأدمجها في التقرير كقسم «Live capture findings»
ويُحدَّث جدول Confirmed/Probable/Unknown تلقائياً.
