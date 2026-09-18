const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SID = fs.readFileSync('/tmp/ayrovi-session-id.txt', 'utf8').trim();
const cookieLine = fs.readFileSync('/tmp/ayrovi-cookies.txt', 'utf8')
  .split('\n').find(l => l.includes('ayrovi_customer_session'));
const COOKIE = cookieLine ? cookieLine.split('\t')[6] : '';
const ROOT = 'screenshots';
const errors = [];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function makeContext(browser, viewport, dsf, dir) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf });
  if (COOKIE) await ctx.addCookies([{ name: 'ayrovi_customer_session', value: COOKIE, url: 'http://localhost:3000' }]);
  await ctx.addInitScript((sid) => { try { localStorage.setItem('ayrovi_session_id', sid); } catch (e) {} }, SID);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${dir}] ${e.message}`));
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(2200);
  return { ctx, page };
}

async function shot(page, name, { fullPage = false } = {}) {
  await sleep(600);
  const p = path.join(ROOT, name);
  await page.screenshot({ path: p, fullPage });
  console.log('OK', p);
}

async function closeOverlays(page) {
  for (let round = 0; round < 5; round++) {
    const dialogs = await page.locator('[role="dialog"]').count();
    if (dialogs === 0) break;
    for (const sel of ['button[aria-label="Fermer le menu"]', 'button[aria-label="Fermer le panier"]', 'button[aria-label="Retour"]', 'button[aria-label="Fermer"]']) {
      try {
        const b = page.locator(sel).last();
        if (await b.isVisible({ timeout: 400 })) { await b.click({ timeout: 1200 }); await sleep(500); break; }
      } catch (e) {}
    }
    try { await page.keyboard.press('Escape'); await sleep(250); } catch (e) {}
  }
  try {
    const logo = page.locator('button[aria-label="AYROVI"]').first();
    if (await logo.isVisible({ timeout: 500 })) { await logo.click({ timeout: 1500 }); await sleep(600); }
  } catch (e) {}
  try { await page.evaluate(() => window.scrollTo(0, 0)); } catch (e) {}
}

async function openMenu(page) {
  await page.locator('button[aria-label="Ouvrir le menu"]').first().click({ timeout: 5000 });
  await sleep(900);
}

async function openAccount(page) {
  await page.locator('button[aria-label="Ouvrir mon espace"]').first().click({ timeout: 5000 });
  await sleep(1800);
}

async function clickAccountSection(page, label) {
  // section list items are buttons with the exact label, may be below the fold
  const item = page.getByRole('button', { name: label, exact: true }).first();
  await item.scrollIntoViewIfNeeded({ timeout: 4000 });
  await sleep(400);
  await item.click({ timeout: 4000 });
  await sleep(1200);
}

(async () => {
  const browser = await chromium.launch();

  /* ============================== MOBILE 390x844 ============================== */
  {
    const { ctx, page } = await makeContext(browser, { width: 390, height: 844 }, 2, 'mobile');
    const M = (n) => `mobile/${n}`;

    await shot(page, M('01-home-full.png'), { fullPage: true });

    // 02 menu drawer
    await openMenu(page);
    await shot(page, M('02-menu.png'));

    // 03 product search (from menu: Tous les produits)
    try {
      await page.getByText('Tous les produits', { exact: false }).first().click({ timeout: 4000 });
      await sleep(1500);
      await shot(page, M('03-product-search.png'));
    } catch (e) { console.log('SKIP product-search:', e.message); }
    await closeOverlays(page);

    // 04 Lens
    try {
      await page.locator('button[aria-label*="Lens"]').first().click({ timeout: 5000 });
      await sleep(2500);
      await shot(page, M('04-lens.png'));
    } catch (e) { console.log('SKIP lens:', e.message); }
    await closeOverlays(page);

    // 05 Assistant SONIM
    try {
      await page.locator('button[aria-label*="SONIM"]').first().click({ timeout: 5000 });
      await sleep(2000);
      await shot(page, M('05-assistant.png'));
    } catch (e) { console.log('SKIP assistant:', e.message); }
    await closeOverlays(page);

    // 06 Vision
    try {
      await page.locator('button[aria-label*="Vision"]').first().click({ timeout: 5000 });
      await sleep(1200);
      await shot(page, M('06-vision.png'));
    } catch (e) { console.log('SKIP vision:', e.message); }
    await closeOverlays(page);

    // 07 Account → Panier section (items)
    await openAccount(page);
    await shot(page, M('07-account-home.png'));
    try {
      await clickAccountSection(page, 'Panier');
      await shot(page, M('08-account-cart.png'));
    } catch (e) { console.log('SKIP account-cart:', e.message); }

    // 09 Cart drawer (from "Ouvrir le panier")
    try {
      const openCart = page.getByText('Ouvrir le panier', { exact: false }).first();
      if (await openCart.isVisible({ timeout: 2500 })) {
        await openCart.click({ timeout: 4000 });
        await sleep(1600);
        await shot(page, M('09-cart-drawer.png'));
      } else console.log('SKIP cart-drawer: CTA invisible');
    } catch (e) { console.log('SKIP cart-drawer:', e.message); }

    // 10 Checkout
    try {
      const cta = page.getByText('Continuer vers la livraison', { exact: false }).first();
      if (await cta.isVisible({ timeout: 2500 })) {
        await cta.click({ timeout: 4000 });
        await sleep(1800);
        await shot(page, M('10-checkout.png'));
      } else console.log('SKIP checkout: CTA invisible');
    } catch (e) { console.log('SKIP checkout:', e.message); }
    await closeOverlays(page);

    // 11-15 Account sections (open once; list is on Aperçu on mobile → back after each)
    try {
      await openAccount(page);
      for (const [name, label] of [
        ['11-account-orders.png', 'Mes commandes'],
        ['12-account-addresses.png', 'Adresses'],
        ['13-account-payments.png', 'Paiements & transactions'],
        ['14-account-security.png', 'Sécurité'],
        ['15-account-settings.png', 'Paramètres'],
      ]) {
        try {
          await clickAccountSection(page, label);
          await shot(page, M(name));
          const back = page.locator('div.mb-5 button').first();
          if (await back.isVisible({ timeout: 800 })) { await back.click({ timeout: 2000 }); await sleep(900); }
        } catch (e) { console.log('SKIP', name, ':', e.message); }
      }
    } catch (e) { console.log('SKIP account-bulk:', e.message); }
    await closeOverlays(page);

    // 16 Story viewer
    try {
      const stories = page.locator('button:has(img)');
      const n = await stories.count();
      if (n > 0) {
        await stories.nth(0).click({ timeout: 4000 });
        await sleep(2200);
        await shot(page, M('16-story-viewer.png'));
      } else console.log('SKIP stories: no circles found');
    } catch (e) { console.log('SKIP stories:', e.message); }
    await ctx.close();
  }

  /* ============================== DESKTOP 1440x900 ============================== */
  {
    const { ctx, page } = await makeContext(browser, { width: 1440, height: 900 }, 1, 'desktop');
    const D = (n) => `desktop/${n}`;

    await shot(page, D('01-home-full.png'), { fullPage: true });

    // 02 cart (account → panier → drawer)
    try {
      await openAccount(page);
      await clickAccountSection(page, 'Panier');
      const openCart = page.getByText('Ouvrir le panier', { exact: false }).first();
      if (await openCart.isVisible({ timeout: 2500 })) {
        await openCart.click({ timeout: 4000 });
        await sleep(1600);
        await shot(page, D('02-cart.png'));
      } else console.log('SKIP d-cart: CTA invisible');
    } catch (e) { console.log('SKIP d-cart:', e.message); }

    // 03 checkout
    try {
      const cta = page.getByText('Continuer vers la livraison', { exact: false }).first();
      if (await cta.isVisible({ timeout: 2500 })) {
        await cta.click({ timeout: 4000 });
        await sleep(1800);
        await shot(page, D('03-checkout.png'));
      } else console.log('SKIP d-checkout: CTA invisible');
    } catch (e) { console.log('SKIP d-checkout:', e.message); }
    await closeOverlays(page);

    // 04 account
    try {
      await openAccount(page);
      await shot(page, D('04-account.png'));
    } catch (e) { console.log('SKIP d-account:', e.message); }
    await closeOverlays(page);

    // 05 lens
    try {
      await page.locator('button[aria-label*="Lens"]').first().click({ timeout: 5000 });
      await sleep(2500);
      await shot(page, D('05-lens.png'));
    } catch (e) { console.log('SKIP d-lens:', e.message); }

    await ctx.close();
  }

  await browser.close();
  console.log('--- PAGE ERRORS:', errors.length ? errors.join(' | ') : 'none');
  console.log('TOUR_DONE');
})().catch(e => { console.error('TOUR_FAIL', e); process.exit(1); });
