import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
await p.goto('http://localhost:3000/', { waitUntil:'networkidle' });
await p.waitForTimeout(800);
// افتح Lens من شريط التنقل السفلي
await p.locator('button', { hasText: 'Lens' }).first().click();
await p.waitForSelector('.lens-home', { timeout: 10000 });
await p.waitForTimeout(400);
await p.screenshot({ path:'verify/lens-home.png' });
// ارفع صورة -> preview -> Analyser -> analyzing
await p.setInputFiles('.lens-home input[type=file]', 'client/public/media/lens-sneakers.jpg');
await p.waitForSelector('.lens-analyzing, [class*=preview]', { timeout: 8000 }).catch(()=>{});
// إن وصلنا preview اضغط Analyser
const analyzeBtn = p.locator('button', { hasText: 'Analyser ce produit' });
if (await analyzeBtn.count()) { await analyzeBtn.click(); }
await p.waitForSelector('.lens-analyzing', { timeout: 8000 }).catch(()=>{});
await p.waitForTimeout(500);
await p.screenshot({ path:'verify/lens-analyzing.png' });
console.log('home+analyzing captured');
await b.close();
