/**
 * Preuve navigateur — moyens de paiement du pied de page (2026-09-22).
 *
 * Ce que cette preuve établit sur l'application réelle, et pas sur une maquette :
 *   1. le pied de page n'affiche QUE les moyens réellement encaissables — le nombre de pastilles est
 *      comparé à la disponibilité calculée depuis `/api/public/commerce-config`, donc la preuve reste
 *      valable après publication d'un RIB ou d'une passerelle, sans être réécrite ;
 *   2. quand rien n'est encaissable (état du 2026-09-22 : passerelle absente, RIB vide, compte postal
 *      vide), le bloc le dit explicitement au lieu d'afficher une vitrine de logos ;
 *   3. aucun visuel de marque tierce n'est imprimé sur la signature publique (ni photo de carte,
 *      ni logo d'opérateur), et aucun lien externe n'est fabriqué ;
 *   4. la mise en forme tient : bande de trois colonnes en 1360, une colonne en 390, aucun
 *      débordement horizontal, ordre de lecture conservé en arabe (RTL) ;
 *   5. les invariants historiques du pied de page survivent : noir, quatre canaux, trois documents.
 *
 * Usage : AYROVI_BASE_URL=http://127.0.0.1:3000 node verify/footer-payments.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.env.AYROVI_BASE_URL;
if (!base) { console.error('AYROVI_BASE_URL est requis.'); process.exit(1); }
const output = 'docs/footer-payments/evidence';
fs.mkdirSync(output, { recursive: true });

const checks = [];
const check = (name, pass, details) => { checks.push({ name, pass: Boolean(pass), details }); if (!pass) throw new Error(`${name}: ${JSON.stringify(details)}`); };

/** La même règle que `client/src/commerce/paymentMethods.ts`, appliquée au payload réel du serveur. */
function availableCount(data) {
  const deposit = data?.deposit ?? {};
  const text = (value) => typeof value === 'string' ? value.trim() : '';
  return [
    data?.capabilities?.cardGateway === true,       // CARD
    false,                                          // FLOUCI — jamais sans passerelle réelle
    Boolean(text(deposit.bankRib)),                 // BANK_TRANSFER
    Boolean(text(deposit.posteAccount)),            // POSTE
  ].filter(Boolean).length;
}

const browser = await chromium.launch({ headless: true });
try {
  const apiContext = await browser.newContext();
  const config = await apiContext.request.get(`${base}/api/public/commerce-config`);
  const payload = (await config.json()).data;
  await apiContext.close();
  const expectedChips = availableCount(payload);
  const today = expectedChips === 0;

  for (const [locale, suffix] of [['fr', 'fr'], ['ar', 'ar']]) {
    for (const [width, height] of [[390, 900], [1360, 900]]) {
      const view = `${suffix}-${width}`;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: locale === 'ar' ? 'ar-TN' : 'fr-TN' });
      await context.addInitScript(value => { try { window.localStorage.setItem('ayrovi.locale.v1', value); } catch { /* stockage restreint */ } }, locale);
      const page = await context.newPage();
      const crashes = [];
      const serverErrors = [];
      const expectedProbes = [];
      page.on('pageerror', error => crashes.push(error.message));
      page.on('response', response => {
        if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
        if (response.status() === 401) expectedProbes.push(response.url());
      });

      await page.goto(base, { waitUntil: 'networkidle' });
      const footer = page.locator('[data-site-footer]');
      await footer.first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(800);

      check(`${view} : un seul pied de page`, await footer.count() === 1, await footer.count());
      check(`${view} : pied de page noir`, await footer.first().evaluate(node => getComputedStyle(node).backgroundColor) === 'rgb(0, 0, 0)');
      check(`${view} : quatre canaux, aucun inventé`, await page.locator('.public-footer-socials a').count() + await page.locator('.public-footer-social-unavailable').count() === 4);
      check(`${view} : documents légaux complets`, (await page.locator('.public-footer-bottom a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))).join(',') === '/privacy.html,/terms.html,/data-deletion.html');
      check(`${view} : aucun visuel de marque tierce`, await footer.locator('img[src^="/media/payments/"]').count() === 0);
      check(`${view} : aucune marque réseau écrite`, !/VISA|Mastercard/i.test(await footer.first().innerText()));
      check(`${view} : aucun lien externe fabriqué`, await footer.locator('a[href^="https://"]').count() === 0);

      // ── Le cœur : le nombre de pastilles suit la disponibilité réelle, ni plus ni moins ──────
      const chips = await footer.locator('li.public-footer-payment').count();
      check(`${view} : pastilles = moyens réellement encaissables (${expectedChips})`, chips === expectedChips, chips);
      if (today) {
        const statement = await footer.locator('.public-footer-payment-state strong').innerText();
        check(`${view} : l’absence d’encaissement est dite explicitement`,
          locale === 'fr' ? statement === 'Aucun encaissement en ligne n’est ouvert aujourd’hui.' : /[\u0600-\u06FF]/.test(statement), statement);
        check(`${view} : la règle des 20 % reste affichée`, (await footer.locator('.public-footer-payment-rules dd').first().innerText()).startsWith('20'));
      }
      check(`${view} : détail légal atteignable depuis le bloc`, await footer.locator('.public-footer-payment-link[href="/terms.html"]').count() === 1);

      // ── Mise en forme ────────────────────────────────────────────────────────────────────────
      const layout = await footer.first().evaluate(node => {
        const columns = node.querySelector('.public-footer-columns');
        return {
          columns: getComputedStyle(columns).gridTemplateColumns.split(' ').length,
          overflow: node.scrollWidth > node.clientWidth + 1,
          rtl: document.documentElement.dir === 'rtl',
        };
      });
      check(`${view} : colonnes adaptées à la largeur`, layout.columns === (width >= 768 ? 3 : 1), layout);
      check(`${view} : aucun débordement horizontal`, layout.overflow === false, layout);
      check(`${view} : sens de lecture correct`, layout.rtl === (locale === 'ar'), layout);
      check(`${view} : aucune exception JavaScript`, crashes.length === 0, crashes);
      check(`${view} : aucune erreur serveur`, serverErrors.length === 0, serverErrors);
      check(`${view} : seules les sondes anonymes répondent 401`, expectedProbes.every(url => url.endsWith('/api/customer/auth/me')), expectedProbes);

      await footer.first().screenshot({ path: `${output}/${view}-footer.png` });
      if (width === 390) await page.screenshot({ path: `${output}/${view}-page.png`, fullPage: true });
      await context.close();
    }
  }

  fs.writeFileSync(`${output}/report.json`, JSON.stringify({ checkedAt: new Date().toISOString(), expectedChips, today, checks }, null, 2));
  console.log(`✅ pied de page & paiements : ${checks.length} vérifications passées (moyens encaissables aujourd’hui : ${expectedChips})`);
} finally {
  await browser.close();
}
