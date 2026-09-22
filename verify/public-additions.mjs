import { chromium } from 'playwright';
import fs from 'node:fs';
const base = process.env.AYROVI_BASE_URL;
const output = 'docs/public-additions/evidence'; fs.mkdirSync(output, { recursive: true });
const checks = [], errors = [];
const check = (name, pass, details) => { checks.push({ name, pass: Boolean(pass), details }); if (!pass) throw new Error(name + ': ' + JSON.stringify(details)); };
const browser = await chromium.launch({ headless: true });
try {
  for (const locale of ['fr', 'ar']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale });
    await context.addInitScript(locale => localStorage.setItem('ayrovi.locale.v1', locale), locale);
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));

    // Real application + isolated database. Force valid, deterministic CMS dates only in test responses.
    const original = await (await context.request.get(base + '/api/public/home')).json();
    const stories = await (await context.request.get(base + '/api/public/stories')).json();
    const showcase = await (await context.request.get(base + '/api/public/stories-showcase')).json();
    check(locale + ': seeded story records retained', stories.data?.length > 0);
    let failHome = false, promo = false, order = 1;
    const future = new Date(Date.now() + 86400000 * 5).toISOString();
    await page.route('**/api/public/home', route => failHome ? route.fulfill({ status: 503, json: { success: false } }) : route.fulfill({ json: {
      ...original, serverTime: new Date().toISOString(), data: { ...original.data, arrivals: original.data.arrivals.map(a => ({ ...a, expectedArrivalAt: future })),
        promotions: promo ? [{ id: 'browser-only-campaign', name: 'Published campaign fixture', description: 'CMS description fixture', status: 'ACTIVE', starts_at: new Date(Date.now() - 1000).toISOString(), ends_at: future, image: '/media/hero-femme.jpg', promo_code: 'FIXTURE' }] : [] },
    } }));
    await page.route('**/api/public/stories-showcase', route => route.fulfill({ json: { ...showcase, data: { ...showcase.data, enabled: true, sortOrder: order } } }));
    for (const width of [320, 390, 1360]) {
      await page.setViewportSize({ width, height: 844 }); await page.goto(base); await page.locator('.stories-showcase').waitFor(); await page.evaluate(() => document.fonts.ready);
      check(`${locale}/${width}: original hero remains`, await page.locator('.editorial-hero__title').isVisible());
      check(`${locale}/${width}: original Lens remains`, await page.locator('.lens-feature').count() === 1);
      check(`${locale}/${width}: Stories remain`, await page.locator('.stories-showcase').count() === 1);
      check(`${locale}/${width}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      check(`${locale}/${width}: no duplicate eyebrow`, await page.locator('.editorial-hero__eyebrow').count() === 0);
      check(`${locale}/${width}: header then ad then links then old content`, await page.evaluate(() => {
        const sels = ['.public-site-header', '.public-campaign', '.public-page-links', '[data-public-section=hero]'];
        const boxes = sels.map(s => document.querySelector(s).getBoundingClientRect()); return boxes.every((b, i) => !i || b.top >= boxes[i - 1].bottom - 1);
      }));
      check(`${locale}/${width}: approved ad color and white type`, await page.locator('.public-campaign').evaluate(e => getComputedStyle(e).backgroundColor === 'rgb(211, 69, 31)' && getComputedStyle(e).color === 'rgb(255, 255, 255)'));
      check(`${locale}/${width}: footer is black`, await page.locator('[data-site-footer]').evaluate(e => getComputedStyle(e).backgroundColor) === 'rgb(0, 0, 0)');
      const names = await page.locator('.stories-showcase').innerText();
      check(`${locale}/${width}: showcase still uses original CMS title`, names.includes(showcase.data.title));
      if (width !== 320) { await page.screenshot({ path: `${output}/home-${locale}-${width}.png`, fullPage: true }); await page.locator('[data-site-footer]').screenshot({ path: `${output}/footer-${locale}-${width}.png` }); }
    }
    // Native dialog focus and escape, original messages retained.
    await page.locator('.public-campaign-info').click(); await page.locator('.public-campaign-dialog[open]').waitFor();
    check(locale + ': info contains service messages', await page.locator('.public-campaign-dialog li').count() > 0);
    await page.keyboard.press('Escape'); await page.locator('.public-campaign-dialog[open]').waitFor({ state: 'hidden' });
    check(locale + ': info restores focus', await page.locator('.public-campaign-info').evaluate(e => document.activeElement === e));
    // Both admin-controlled Stories/Lens arrangements are still honored.
    for (const value of [0, 1]) { order = value; await page.goto(base); await page.locator('.stories-showcase').waitFor();
      check(`${locale}: original story order ${value}`, await page.evaluate(value => {
        const stories = document.querySelector('.stories-showcase'), lens = document.querySelector('.lens-feature');
        return Boolean(lens.compareDocumentPosition(stories) & Node.DOCUMENT_POSITION_FOLLOWING) === (value >= 1);
      }, value));
    }
    await page.locator('.stories-showcase button').first().click();
    check(locale + ': original Story interaction still opens', await page.getByRole('dialog').count() > 0);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.goto(base);
    for (const [href, id] of [['/arrivage', 'arrivals'], ['/gift-cards', 'promotions'], ['/magazine', 'news']]) {
      await page.goto(base); await page.locator('.public-page-links').waitFor();
      await page.evaluate(() => { window.__documentProof = 'before'; });

      await page.locator(`.public-page-links a[href="${href}"]`).click();

      await page.waitForURL(base + href, { waitUntil: 'domcontentloaded' });
      await page.locator(`[data-public-page="${id}"]`).waitFor();
      check(`${locale}: ${href} is a new document`, await page.evaluate(() => window.__documentProof === undefined));
      check(`${locale}: ${href} not a homepage panel`, await page.locator('.managed-public-sections').count() === 0 && await page.locator('.public-campaign').count() === 0);
      check(`${locale}: ${href} footer remains`, await page.locator('[data-site-footer]').count() === 1);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        check(`${locale}: ${href}/${width} page fits`, await page.locator('[data-public-page]').evaluate(e => e.scrollWidth <= e.clientWidth));
      }
      await page.getByRole('button', { name: locale === 'ar' ? 'فتح القائمة' : 'Ouvrir le menu', exact: true }).click();
      const menu = page.getByRole('dialog', { name: locale === 'ar' ? 'قائمة AYROVI' : 'Menu AYROVI', exact: true });
      await menu.waitFor();
      check(`${locale}: ${href} menu uses real destination links`, await menu.locator('a[href="/magazine"]').count() === 1);
      await menu.getByRole('button', { name: locale === 'ar' ? 'التواصل' : 'Social', exact: true }).click();
      await page.getByRole('dialog', { name: locale === 'ar' ? 'التواصل' : 'Social', exact: true }).waitFor();
      check(`${locale}: ${href} legacy Social still works`, await page.getByRole('dialog', { name: locale === 'ar' ? 'التواصل' : 'Social', exact: true }).isVisible());
      await page.keyboard.press('Escape'); await menu.waitFor();
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.locator('[data-public-page]').waitFor();
      await page.reload(); await page.locator('[data-public-page]').waitFor();
      check(`${locale}: ${href} reload works`, new URL(page.url()).pathname === href);
      await page.locator('.public-page-back').click(); await page.locator('.stories-showcase').waitFor();
      check(`${locale}: ${href} returns to intact homepage`, await page.locator('.lens-feature').count() === 1);
    }
    promo = true; await page.goto(base); await page.locator('.public-campaign h2').filter({ hasText: 'Published campaign fixture' }).waitFor();
    check(locale + ': ad uses real supplied campaign text', await page.locator('.public-campaign a').getAttribute('href') === '/gift-cards');
    await page.goto(base + '/gift-cards', { waitUntil: 'domcontentloaded' }); await page.getByText('Published campaign fixture', { exact: true }).waitFor();
    check(locale + ': published codes retained under Gift & Cards', await page.getByText(/FIXTURE/).count() > 0);
    failHome = true; await page.goto(base + '/magazine', { waitUntil: 'domcontentloaded' }); await page.locator('[role=alert]').waitFor();
    check(locale + ': failure is explicit, not false empty content', await page.locator('.public-content-state button').count() === 1);
    failHome = false; await page.locator('.public-content-state button').click(); await page.locator('[role=alert]').waitFor({ state: 'hidden' });
    check(locale + ': retry recovers', await page.locator('[data-public-page]').isVisible());
    await context.close();
  }
  check('no browser exceptions', errors.length === 0, errors);
} catch (error) { for (const ctx of browser.contexts()) for (const p of ctx.pages()) { console.log('FAILURE PAGE', p.url()); await p.screenshot({path: output+'/failure.png',fullPage:true}); } errors.push(String(error)); process.exitCode = 1; }
finally { await browser.close(); fs.writeFileSync(output + '/results.json', JSON.stringify({ scope: 'Actual built app, isolated SQLite, deterministic CMS response dates/campaign/error fixtures. No live customer writes.', checks, errors }, null, 2)); }
console.log(`${checks.filter(c => c.pass).length}/${checks.length} public additions checks passed`, errors);
