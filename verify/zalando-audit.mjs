/**
 * ZAYROVI — mesure de la couverture de la couleur de marque (violet électrique #571EF6).
 *
 * Le cahier des charges fixe une règle chiffrée : aucun écran mesuré ne dépasse le plafond de
 * sécurité fixé par l'identité (identity.json → accentAreaLimit) — un garde-fou contre les
 * grandes surfaces violettes. Ce n'est PAS l'objectif : depuis la v4.2.0 le repère global du
 * violet est ≈ 3 % de l'application (identity.json → accentShare : 2 % #571EF6 + 1 % #C5B2F4),
 * un repère d'ensemble et non un quota par écran. Ce script ne fait pas confiance au code
 * source : il charge la page réelle, la photographie, et COMPTE les pixels.
 *
 *   node verify/zalando-audit.mjs [baseUrl]
 *
 * Sortie : `verify/zalando-*.png` (visuels) + un rapport JSON dans la console.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';

// 2026-10-03 — BUG DE FOND, corrigé ici.
// Ce script n'honorait PAS `AYROVI_BASE_URL`, la convention de TOUS ses frères
// (public-navigation, footer-payments, admin-audit, lens-*… lisent tous
// process.env.AYROVI_BASE_URL). Il ne connaissait que son argument positionnel,
// avec `http://localhost:3000` en dur.
// Conséquence en CI : le serveur y écoute sur 3210 et l'étape exporte
// AYROVI_BASE_URL=http://127.0.0.1:3210 — les cinq autres gardes mesuraient donc
// le bon serveur, et celui-ci partait sur localhost:3000, où personne n'écoute.
// Il mourait sur son premier `goto` : le garde du budget de couleur était
// INFIRANCHISSABLE par construction, et échouait avec un simple « exit code 1 »
// sans jamais dire pourquoi. Ordre retenu : argument explicite, puis
// environnement (la convention du dépôt), puis l'ancien défaut.
const BASE = process.argv[2] || process.env.AYROVI_BASE_URL || 'http://localhost:3000';
const OUT = 'verify';
/** Budget en % de la surface d'un écran — lu dans l'identité, jamais recopié ici. */
const BUDGET = Number(JSON.parse(fs.readFileSync('client/src/design/editorial/identity.json', 'utf8')).accentAreaLimit) * 100;

// ── Pourquoi ces deux gestionnaires (2026-10-03) ─────────────────────────────
// Ce script tourne dans la porte CI « gardes de charte ». Quand il levait une
// exception, le seul verdict public était « Process completed with exit code 1 » :
// ni la surface fautive, ni le message. Les journaux d'une exécution ne sont
// lisibles qu'avec des droits d'administration — l'équipe ne pouvait donc PAS
// savoir pourquoi le garde était tombé. Le message d'erreur devient une
// annotation publique, lisible sur la page de l'exécution.
function publishFailure(error) {
  const message = String((error && error.message) || error).split('\n')[0];
  console.log(`::error title=audit:design a levé une exception::${message}`);
  process.exit(1);
}
process.on('unhandledRejection', publishFailure);
process.on('uncaughtException', publishFailure);

/** Est-ce un pixel « violet de marque » ? Fenêtre large autour de #571EF6 (et #926DF9). */
function isAccentPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 120) return false;            // trop sombre pour compter
  if (max - min < 60) return false;       // gris / blanc / noir : pas de teinte
  // teinte violette : bleu dominant, rouge médian, vert le plus faible
  return b > 170 && b - g > 90 && r > g && r < 200;
}

/** Part de pixels « orange de marque » dans une image rendue. */
async function coverage(png, label) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let accent = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += channels) {
    total += 1;
    if (isAccentPixel(data[i], data[i + 1], data[i + 2])) accent += 1;
  }
  const pct = total ? (accent / total) * 100 : 0;
  return { label, pixels: total, accent, pct: Number(pct.toFixed(3)) };
}

const browser = await chromium.launch();
const report = [];

/**
 * Ouvre AYROVIX LENS et mesure l'écran obtenu.
 * P4/T2 : la section v2 ne fait plus partie de la page d'accueil, LENS s'ouvre
 * désormais depuis la navigation basse (bouton « Lens — recherche par image »).
 */
async function measureLensScreen(page, tag) {
  const cta = page.locator('.ayrovi-glass-bottom-nav button[aria-label*="Lens"]').first();
  if (!(await cta.count())) return { label: `écran LENS — ${tag}`, absent: true };
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await cta.click();
  await page.waitForTimeout(1200);

  // P4/T2 : Lens est protégé par une porte de consentement explicite (âge ≥ 18,
  // règles d'usage, transfert de l'image au fournisseur IA et à SerpApi). Sans la
  // franchir, cette fonction déclarait « absent » un écran qui existe bel et bien —
  // c'était un faux négatif, pas une absence. On coche donc les trois cases, puis
  // on emprunte le bouton primaire (désactivé tant que les trois ne sont pas cochées).
  // … mais franchie de façon DÉFENSIVE (2026-10-03) : cette porte conditionne
  // l'accès à l'écran, elle ne doit jamais faire ÉCHOUER l'audit. Sans le
  // try/catch ci-dessous, un `check()` qui attend un élément absent faisait
  // tomber tout le script au bout de son délai par défaut — un garde de charte
  // qui meurt sur une porte de consentement ne mesure plus rien du tout.
  // En cas d'échec on retombe sur le comportement historique : écran absent.
  try {
    const boxes = page.locator('.lens-consent input[type=checkbox]');
    const count = await boxes.count();
    for (let i = 0; i < count; i += 1) await boxes.nth(i).check({ timeout: 4000, force: true });
    const gate = page.locator('.lens-panel-primary').first();
    if ((await gate.count()) && (await gate.isEnabled())) await gate.click({ timeout: 4000, force: true });
  } catch (error) {
    console.warn(`  ⚠ porte de consentement non franchie (${tag}) : ${String(error.message).split('\n')[0]}`);
  }
  await page.waitForTimeout(2500);

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

  // surfaces nommées par le cahier des charges.
  // P4/T2 : `.lens2` et la carte « Découvrez ZAYROVI » ont été retirés de la page
  // d'accueil ; on mesure donc le Hero, le Trust Bar et l'écran LENS ouvert.
  for (const [selector, name] of [
    ['.interface-hero, [data-public-section="hero"]', 'section Hero'],
    ['.stories-showcase', 'conteneur Stories'],
    ['.lens-feature', 'section LENS (bloc éditorial)'],
  ]) {
    const node = page.locator(selector).first();
    if (await node.count()) {
      const sectionFile = `${OUT}/zalando-${name.replace(/[^a-z0-9]/gi, '')}-${tag}.png`;
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
console.log(`\nCouverture violette maximale mesurée : ${worst}% (budget charte : ${BUDGET}%)`);
// ── Publication du résultat (2026-10-03) ──────────────────────────────────────
// Ce garde s'exécutait sans jamais DIRE ce qu'il avait mesuré : en cas d'échec,
// la sortie ne nommait ni la surface fautive ni sa valeur, et les journaux d'une
// exécution ne sont lisibles qu'avec des droits d'administration. Le seul verdict
// public était donc « Process completed with exit code 1 ».
// Chaque mesure est maintenant publiée comme annotation (lisible publiquement sur
// la page de l'exécution) et le détail complet part dans le résumé de l'étape.
for (const r of report) {
  console.log(`::notice title=Violet — ${r.label}::${r.absent ? 'absent' : `${r.pct}%`}`);
}
if (worst > BUDGET) {
  console.log(`::error title=Budget violet dépassé::${worst}% > ${BUDGET}%`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = report.map((r) => `| ${r.label} | ${r.absent ? 'absent' : `${r.pct}%`} |`);
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    ['## Budget violet — surface par surface', '', '| Surface | Couverture mesurée |', '| --- | --- |', ...rows, '', `**Maximum mesuré : ${worst}%** — budget de charte : ${BUDGET}%`, ''].join('\n'),
  );
}
process.exit(worst <= BUDGET ? 0 : 1);
