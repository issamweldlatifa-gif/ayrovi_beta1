/**
 * Captures de l'admin pour le passage au modèle A (Amazon Seller Central).
 * Usage : node docs/admin-model-a/tools/shoot-admin.mjs [avant|apres]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const phase = process.argv[2] || 'apres';
const out = `docs/admin-model-a/evidence/${phase}`;  // chemins depuis la racine du dépôt
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 940 } });
const page = await context.newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });
page.on('pageerror', (error) => errors.push(`PAGEERROR ${String(error).slice(0, 200)}`));

await page.goto('http://127.0.0.1:3000/admin', { waitUntil: 'domcontentloaded' });
await page.fill('input[type="email"]', 'admin@ayrovi.tn');
await page.fill('input[type="password"]', 'AyroviBeta2026!');
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);

const shots = [
  ['tableau-de-bord', '?section=dashboard'],
  ['commandes', '?section=orders'],
  ['barre-publique', '?section=public-nav'],
  ['catalogue', '?section=catalogue-products'],
];
for (const [name, query] of shots) {
  await page.goto(`http://127.0.0.1:3000/admin${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 80 });
}
const mobile = await context.newPage();
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto('http://127.0.0.1:3000/admin?section=orders', { waitUntil: 'domcontentloaded' });
await mobile.waitForTimeout(2200);
await mobile.screenshot({ path: `${out}/commandes-mobile.jpg`, type: 'jpeg', quality: 80 });

console.log('erreurs console :', errors.length ? JSON.stringify([...new Set(errors)].slice(0, 8), null, 1) : 'aucune');
await browser.close();
