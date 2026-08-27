import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [w,h,name] of [[390,900,'lens2-mobile'],[1440,900,'lens2-desktop']]) {
  const p = await b.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:2 });
  await p.goto('http://localhost:3000/', { waitUntil:'networkidle' });
  await p.waitForSelector('.lens2', { timeout:15000 });
  await p.waitForTimeout(700);
  const m = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth, has: !!document.querySelector('.lens2__phone'), steps: document.querySelectorAll('.lens2__step').length, merchants: document.querySelectorAll('.lens2__merchant').length, minis: document.querySelectorAll('.lens2__mini').length }));
  console.log(name, JSON.stringify(m));
  await p.locator('.lens2').screenshot({ path:`verify/${name}.png` });
  await p.close();
}
await b.close(); console.log('saved');
