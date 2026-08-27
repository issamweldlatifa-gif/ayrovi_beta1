import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:390,height:900} });
await p.goto('http://localhost:3000/', { waitUntil:'networkidle' });
await p.waitForSelector('.lens2', { timeout:15000 });
await p.waitForTimeout(500);
const r = await p.evaluate(() => ({
  featuresGone: !document.querySelector('.lens-features'),
  lens2Present: !!document.querySelector('.lens2'),
  overflow: document.documentElement.scrollWidth > window.innerWidth,
  pageH: Math.round(document.body.scrollHeight),
}));
console.log(JSON.stringify(r));
await b.close();
