/**
 * AYROVI — P4/T1 « Zalando Strategy » : mesure de la couverture orange.
 *
 * Le cahier des charges fixe une règle chiffrée : l'orange ne doit pas dépasser 3 %
 * de la surface d'un écran. Ce script ne fait pas confiance au code source : il
 * charge la page réelle, la photographie, et COMPTE les pixels.
 *
 *   node verify/zalando-audit.mjs [baseUrl]
 *
 * Sortie : `verify/zalando-*.png` (visuels) + un rapport JSON dans la console.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = 'verify';

/** Est-ce un pixel « orange de marque » ? Fenêtre large autour de #FF6900. */
function isOrangePixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 120) return false;            // trop sombre pour compter
  if (max - min < 60) return false;       // gris / blanc / noir : pas de teinte
  // teinte orangée : rouge dominant, vert médian, bleu faible
  return r > 190 && g > 55 && g < 190 && b < 110 && r - b > 110;
}

/** Part de pixels « orange de marque » dans une image rendue. */
async function coverage(png, label) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let orange = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += channels) {
    total += 1;
    if (isOrangePixel(data[i], data[i + 1], data[i + 2])) orange += 1;
  }
  const pct = total ? (orange / total) * 100 : 0;
  return { label, pixels: total, orange, pct: Number(pct.toFixed(3)) };
}

const browser = await chromium.launch();
const report = [];

/** Ouvre le tiroir AYROVIX LENS depuis le CTA de la section v2 et mesure l'écran obtenu. */
async function measureLensScreen(page, tag) {
  const cta = page.locator('.lens2__cta').first();
  if (!(await cta.count())) return { label: `écran LENS — ${tag}`, absent: true };
  await cta.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await cta.click();
  await page.waitForTimeout(2200);
  const opened = await page.locator('.lens-home, .lens-drop').count();
  if (!opened) return { label: `écran LENS — ${tag}`, absent: true };
  const file = `${OUT}/zalando-lens-screen-${tag}.png`;
  await page.screenshot({ path: file, fullPage: true });
  return coverage(file, `écran LENS ouvert — ${tag}`);
}

for (const [w, h, tag] of [[390, 844, 'mobile'], [1440, 900, 'desktop']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  // déclenche le chargement différé de toutes les sections
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(700);

  const file = `${OUT}/zalando-home-${tag}.png`;
  await page.screenshot({ path: file, fullPage: true });
  report.push(await coverage(file, `accueil ${tag} (page entière)`));

  // sections nommées par le cahier des charges
  for (const [selector, name] of [
    ['.lens2', 'section LENS v2'],
    ['.transition-card-fade', 'carte « Découvrez AYROVI »'],
  ]) {
    const node = page.locator(selector).first();
    if (await node.count()) {
      const sectionFile = `${OUT}/zalando-${selector.replace(/[^a-z0-9]/gi, '')}-${tag}.png`;
      await node.screenshot({ path: sectionFile }).catch(() => undefined);
      report.push(await coverage(sectionFile, `${name} — ${tag}`));
    } else {
      report.push({ label: `${name} — ${tag}`, absent: true });
    }
  }
  report.push(await measureLensScreen(page, tag));
  await page.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
const worst = report.filter((r) => !r.absent).reduce((m, r) => Math.max(m, r.pct), 0);
console.log(`\nCouverture orange maximale mesurée : ${worst}% (budget charte : 3%)`);
process.exit(worst <= 3 ? 0 : 1);
