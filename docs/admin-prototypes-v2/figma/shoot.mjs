/**
 * Captures des cadres Figma (SVG) — un aperçu JPG par cadre, dans figma/apercu/.
 * Usage : node docs/admin-prototypes-v2/figma/shoot.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const dir = 'docs/admin-prototypes-v2/figma';
fs.mkdirSync(`${dir}/apercu`, { recursive: true });
const browser = await chromium.launch();
for (const file of fs.readdirSync(`${dir}/cadres`).filter((f) => f.endsWith('.svg'))) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`file://${process.cwd()}/${dir}/cadres/${file}`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${dir}/apercu/${file.replace('.svg', '.jpg')}`, type: 'jpeg', quality: 80 });
  await page.close();
}
await browser.close();
console.log('aperçus des cadres régénérés');
