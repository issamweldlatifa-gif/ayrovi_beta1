/**
 * Preuve navigateur — barre publique sous l'en-tête (décision produit du 2026-09-22).
 *
 * Ce que la preuve vérifie sur l'application réelle :
 *   1. la barre sous l'en-tête est pilotée par l'Admin : un renommage publié change le libellé servi ;
 *   2. un onglet masqué disparaît, et tout masquer retire la barre (jamais de barre fantôme) ;
 *   3. les pages plein écran (Arrivage, Gift & Cards, Magazine) ne recopient plus le pied de page ;
 *   4. le pied de page de l'accueil reste en place, en noir, avec ses documents légaux et la zone
 *      « Nos canaux officiels » (canaux non renseignés inertes, jamais inventés).
 *
 * Usage : AYROVI_BASE_URL=http://127.0.0.1:3000 AYROVI_ADMIN_PASSWORD=… node verify/public-navigation.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.env.AYROVI_BASE_URL;
if (!base) { console.error('AYROVI_BASE_URL est requis.'); process.exit(1); }
const email = process.env.AYROVI_ADMIN_EMAIL || 'admin@ayrovi.tn';
const password = process.env.AYROVI_ADMIN_PASSWORD || 'AyroviBeta2026!';
const output = 'docs/public-navigation/evidence';
fs.mkdirSync(output, { recursive: true });

const checks = [];
const check = (name, pass, details) => { checks.push({ name, pass: Boolean(pass), details }); if (!pass) throw new Error(`${name}: ${JSON.stringify(details)}`); };

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // ── 1. Barre publique servie, dans l'ordre publié ───────────────────────────────────────────
  const navigation = await (await context.request.get(`${base}/api/public/navigation`)).json();
  check('trois destinations officielles servies', navigation.data?.length === 3, navigation.data);
  check('chemins réels du contrat partagé', navigation.data.map((item) => item.href).join(',') === '/arrivage,/gift-cards,/magazine', navigation.data);

  await page.goto(base);
  await page.locator('.public-page-links').waitFor();
  check('barre visible sur l’accueil', await page.locator('.public-page-links a').count() === 3);
  check('pied de page présent sur l’accueil', await page.locator('[data-site-footer]').count() === 1);
  check('pied de page noir', await page.locator('[data-site-footer]').evaluate((node) => getComputedStyle(node).backgroundColor) === 'rgb(0, 0, 0)');
  check('zone « Nos canaux officiels » présente', await page.locator('#nos-canaux').count() === 1);
  check('aucun faux compte social', await page.locator('.public-footer-socials a').count() + await page.locator('.public-footer-social-unavailable').count() === 4);
  await page.screenshot({ path: `${output}/home-footer.png`, fullPage: true });

  // ── 2. Administration : renommer, masquer, tout masquer ─────────────────────────────────────
  await page.goto(`${base}/admin`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForTimeout(1500);
  await page.goto(`${base}/admin?section=public-nav`);
  await page.waitForSelector('table tbody tr', { timeout: 20000 });
  check('l’écran Admin liste les trois onglets publiés', await page.locator('table tbody tr').count() === 3);
  await page.screenshot({ path: `${output}/admin-public-nav.png` });

  // Le jeton CSRF est publié par `/auth/me` (rotation à chaque lecture) : la preuve rejoue
  // exactement ce que fait le client Admin, sans jamais contourner la protection CSRF.
  const adminApi = async (path, method = 'GET', body) => page.evaluate(async ([path, method, body]) => {
    const session = await (await fetch('/api/admin/auth/me')).json();
    const response = await fetch(`/api/admin${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': session.data?.csrfToken || '' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, [path, method, body || null]);

  const list = (await adminApi('/public-nav')).payload.data;
  const arrivals = list.find((row) => row.destination === 'arrivals' && row.active === 1);
  const others = list.filter((row) => row.id !== arrivals.id && row.active === 1);

  const renamed = await adminApi(`/public-nav/${arrivals.id}`, 'PUT', { label_fr: 'Nouveautés AYROVI', label_ar: 'جديد AYROVI' });
  check('renommage accepté', renamed.status === 200, renamed.payload);
  await page.goto(base);
  // La barre est alimentée par `/api/public/navigation` : on attend le libellé publié,
  // jamais le repli local (qui n'est qu'un rendu immédiat avant réponse de l'API).
  await page.locator('.public-page-links a', { hasText: 'Nouveautés AYROVI' }).waitFor({ timeout: 15000 });
  check('le site sert le libellé publié', (await page.locator('.public-page-links a').first().innerText()).includes('Nouveautés AYROVI'));
  await page.locator('.public-page-links').screenshot({ path: `${output}/tabstrip-renamed.png` });

  for (const row of others) await adminApi(`/public-nav/${row.id}`, 'PUT', { active: 0 });
  await page.goto(base);
  await page.waitForTimeout(1500);
  check('un onglet masqué disparaît', (await page.locator('.public-page-links a').allInnerTexts()).length === 1, await page.locator('.public-page-links a').allInnerTexts());

  await adminApi(`/public-nav/${arrivals.id}`, 'PUT', { active: 0 });
  await page.goto(base);
  await page.waitForTimeout(1200);
  check('tout masquer retire la barre', await page.locator('.public-page-links').count() === 0);

  await adminApi(`/public-nav/${arrivals.id}`, 'PUT', { active: 1 });
  for (const row of others) await adminApi(`/public-nav/${row.id}`, 'PUT', { active: 1 });

  // ── 3. Pages plein écran : plus de copie du pied de page ───────────────────────────────────
  for (const [href, id] of [['/arrivage', 'arrivals'], ['/gift-cards', 'promotions'], ['/magazine', 'news']]) {
    await page.goto(base + href);
    await page.locator(`[data-public-page="${id}"]`).waitFor({ timeout: 20000 });
    check(`${href} : aucun pied de page dupliqué`, await page.locator('[data-site-footer]').count() === 0);
    check(`${href} : page accessible`, page.url().endsWith(href));
    await page.screenshot({ path: `${output}/page${href.replace('/', '-')}.png` });
  }

  // ── 4. Retour à l'état semé (preuve rejouable) ─────────────────────────────────────────────
  await adminApi(`/public-nav/${arrivals.id}`, 'PUT', { label_fr: 'Arrivage', label_ar: 'Arrivage' });
  await page.goto(base);
  await page.locator('.public-page-links a', { hasText: 'Arrivage' }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  check('libellés officiels restaurés', (await page.locator('.public-page-links a').allInnerTexts()).join('|') === 'Arrivage|Gift & Cards|Magazine', await page.locator('.public-page-links a').allInnerTexts());
  check('aucune erreur JavaScript', errors.length === 0, errors);

  console.log(`✅ barre publique : ${checks.length} vérifications passées`);
} finally {
  await browser.close();
}
