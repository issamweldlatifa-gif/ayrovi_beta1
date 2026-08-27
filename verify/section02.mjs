import { chromium } from 'playwright';

const browser = await chromium.launch();

async function measure(width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.lens-features', { timeout: 15000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const lens = document.querySelector('.lens-hero');
    const sec = document.querySelector('.lens-features');
    const grid = document.querySelector('.lens-features__grid');
    const head = document.querySelector('.lens-features__head');
    const features = [...document.querySelectorAll('.lens-feature')];
    const gridStyle = getComputedStyle(grid);
    return {
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      lensBottom: Math.round(lens.getBoundingClientRect().bottom + scrollY),
      secTop: Math.round(sec.getBoundingClientRect().top + scrollY),
      headInsideGrid: grid.contains(head),
      columns: gridStyle.gridTemplateColumns.split(' ').length,
      featureCount: features.length,
      firstFeatureWidth: Math.round(features[0].getBoundingClientRect().width),
      gapLensToSection: Math.round(sec.getBoundingClientRect().top - lens.getBoundingClientRect().bottom),
    };
  });
  await page.close();
  return r;
}

for (const width of [360, 375, 390, 414]) {
  console.log(width, JSON.stringify(await measure(width)));
}

// Desktop screenshot
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForSelector('.lens-features', { timeout: 15000 });
await page.waitForTimeout(500);
const d = await page.evaluate(() => {
  const grid = document.querySelector('.lens-features__grid');
  return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, overflow: document.documentElement.scrollWidth > window.innerWidth };
});
console.log('desktop', JSON.stringify(d));
await page.locator('.lens-features').screenshot({ path: 'verify/section02-desktop.png' });
await browser.close();

// Mobile screenshot at 390
const b2 = await chromium.launch();
const m = await b2.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await m.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await m.waitForSelector('.lens-features', { timeout: 15000 });
await m.waitForTimeout(500);
await m.locator('.lens-features').screenshot({ path: 'verify/section02-mobile.png' });
await b2.close();
console.log('screenshots saved');
