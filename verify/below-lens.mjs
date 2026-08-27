import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForSelector('.lens-hero', { timeout: 15000 });
await page.waitForTimeout(900);

const info = await page.evaluate(() => {
  const lens = document.querySelector('.lens-hero');
  const footer = document.querySelector('footer');
  const lensBottom = lens ? Math.round(lens.getBoundingClientRect().bottom + window.scrollY) : null;
  return {
    pageHeight: Math.round(document.body.scrollHeight),
    lensBottom,
    footerExists: Boolean(footer),
    visibleSections: [...document.querySelectorAll('.managed-public-section')]
      .map((s) => ({ id: s.getAttribute('data-public-section'), height: Math.round(s.getBoundingClientRect().height) })),
    // ما المسافة بين نهاية LENS ونهاية الصفحة؟ (يجب أن تكون صغيرة = مجرد padding)
    gapBelowLens: Math.round(document.body.scrollHeight - (lens ? lens.getBoundingClientRect().bottom + window.scrollY : 0)),
  };
});
console.log(JSON.stringify(info, null, 2));

// لقطة لآخر الشاشة (نهاية الصفحة) للتأكد بصرياً
await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, info.pageHeight - 844));
await page.waitForTimeout(300);
await page.screenshot({ path: 'verify/below-lens-after.png' });
await browser.close();
