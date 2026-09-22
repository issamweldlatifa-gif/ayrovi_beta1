/**
 * Captures des maquettes HTML + contrôles de qualité (aucun débordement horizontal,
 * aucune requête réseau). Usage : node docs/admin-prototypes-v2/shoot.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const dir = 'docs/admin-prototypes-v2';
const browser = await chromium.launch();
for (const file of fs.readdirSync(dir).filter((f) => /^[a-d]-.*\.html$/.test(f))) {
  const slug = file.replace('.html', '');
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const external = [];
  page.on('request', (r) => { if (!r.url().startsWith('file://')) external.push(r.url()); });
  await page.goto(`file://${process.cwd()}/${dir}/${file}`);
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 2 && r.width > 40) out.push(`${el.tagName}.${el.className || ''}`);
    });
    return out.slice(0, 12);
  });
  await page.screenshot({ path: `${dir}/evidence/${slug}-desktop.jpg`, type: 'jpeg', quality: 82, fullPage: true });
  if (['a-amazon-console', 'd-shopify-console'].includes(slug)) {
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    await mobile.goto(`file://${process.cwd()}/${dir}/${file}`);
    await mobile.waitForTimeout(300);
    await mobile.screenshot({ path: `${dir}/evidence/${slug}-mobile.jpg`, type: 'jpeg', quality: 82, fullPage: true });
    await mobile.close();
  }
  console.log(`${slug} | débordements : ${overflow.length ? JSON.stringify(overflow) : 'aucun'} | requêtes externes : ${external.length}`);
  await page.close();
}
await browser.close();
