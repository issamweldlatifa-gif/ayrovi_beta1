/**
 * Captures du SITE PUBLIC — revue « relation modèle A ↔ site » (2026-09-22).
 * Usage : node docs/admin-model-a/tools/shoot-site.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'docs/admin-model-a/evidence/site';
fs.mkdirSync(out, { recursive: true });
const pages = [['accueil', '/'], ['arrivage', '/arrivage'], ['gift-cards', '/gift-cards'], ['magazine', '/magazine']];
const browser = await chromium.launch();
const findings = [];
for (const [name, path] of pages) {
  for (const [device, viewport] of [['desktop', { width: 1440, height: 940 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport, isMobile: device === 'mobile' });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
    page.on('requestfailed', (r) => errors.push(`FAILED ${r.url().slice(0, 100)}`));
    await page.goto(`http://127.0.0.1:3000${path}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/${name}-${device}.jpg`, type: 'jpeg', quality: 78, fullPage: device === 'desktop' });
    const info = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      footers: document.querySelectorAll('footer').length,
      navs: document.querySelectorAll('nav').length,
      bottomNav: Boolean(document.querySelector('.bottom-nav, .bottom-nav-bar, [class*="bottom-nav"]')),
      pageLinks: document.querySelectorAll('.public-page-links a').length,
      tabstrip: Boolean(document.querySelector('.public-page-links')),
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim().slice(0, 40)),
    }));
    findings.push({ name, device, ...info, errors: [...new Set(errors)].slice(0, 4) });
    await page.close();
  }
}
await browser.close();
for (const f of findings) console.log(`${f.name} (${f.device}) — largeur ${f.scrollWidth}/${f.innerWidth} · footers ${f.footers} · navs ${f.navs} · bandeau-onglets ${f.tabstrip ? f.pageLinks : 'absent'} · h1 ${JSON.stringify(f.h1)}${f.errors.length ? ` · erreurs ${JSON.stringify(f.errors)}` : ''}`);
