/** Real built application, isolated test DB; no remote providers or production data. */
import { chromium, firefox, type Page } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { writeSimplePdf } from '../src/services/simplePdf';
import { buildInvoiceHtml } from '../src/services/invoice';
import { pdf } from 'pdf-to-img';
const output = 'docs/identity-a/evidence';
fs.mkdirSync(output, { recursive: true });
const checks: unknown[] = [], fonts: unknown[] = [], errors: string[] = [];
const check = (label: string, value: unknown, details?: unknown) => { checks.push({ label, pass: Boolean(value), details }); assert.ok(value, label + ': ' + JSON.stringify(details)); };
async function inspect(page: Page, label: string) {
  await page.evaluate(() => document.fonts.ready);
  const state = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    bad: [...document.querySelectorAll<HTMLElement>('h1,h2,h3,p,button,input,select,textarea,strong,small,code')].filter(e => e.getBoundingClientRect().height > 0).map(e => ({ tag: e.tagName, family: getComputedStyle(e).fontFamily })).filter(e => !e.family.includes('Zalando Sans') || !e.family.includes('Noto Sans Arabic')),
    loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family),
  }));
  check(label + ': responsive', !state.overflow);
  check(label + ': all visible text and controls use the official stack', !state.bad.length, state);
  check(label + ': actual local Latin font loaded', state.loaded.some(f => f.includes('Zalando Sans')));
  return state;
}
async function main() {
  Object.assign(process.env, { NODE_ENV: 'test', DATABASE_PATH: ':memory:', ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'Test-admin-password-123!', CUSTOMER_AUTH_SECRET: 'identity-test-secret-only-01234567890123456789', MAIL_PROVIDER: '', MAIL_API_KEY: '', MAIL_FROM: '', CUSTOMER_OTP_PROVIDER: 'console', GOOGLE_CLIENT_ID: '', FACEBOOK_APP_ID: '', APPLE_CLIENT_ID: '' });
  const { app, db } = await import('../src/server');
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    for (const [name, browserType] of [['Chromium', chromium], ['Firefox', firefox]] as const) {
      const browser = await browserType.launch({ headless: true });
      try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr' });
        const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
        const remoteFonts: string[] = [];
        page.on('request', r => { if (r.resourceType() === 'font' && !r.url().startsWith(base)) remoteFonts.push(r.url()); });
        for (const locale of ['fr', 'ar']) {
          await page.goto(base); await page.evaluate(l => localStorage.setItem('ayrovi.locale.v1', l), locale); await page.reload();
          await page.locator('.editorial-hero__title').waitFor();
          check(name + ': actual locale ' + locale, (await page.locator('html').getAttribute('lang'))?.startsWith(locale));
          for (const width of [320, 390, 768, 1360]) {
            await page.setViewportSize({ width, height: 900 });
            await inspect(page, `${name}/${locale}/${width}`);
          }
          await page.screenshot({ path: `${output}/${name.toLowerCase()}-home-${locale}.png` });
        }
        // Isolated new account, real server-owned cart, real quantity/price change.
        const register = await context.request.post(base + '/api/customer/auth/email/register', { data: { displayName: 'محمد Éléonore', email: `${name.toLowerCase()}@identity.test`, password: 'Identity-test-password-123!' } });
        check(name + ': account created', register.ok());
        const id = (await register.json()).data.account.id, now = new Date().toISOString();
        db.run("INSERT INTO cart_items(id,session_id,account_id,store,source_url,title,source_price,source_currency,price_tnd,quantity,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", `identity-${name}`, 'identity-fixture', id, 'OTHER', 'https://example.com/item', 'Everyday shoes — Édition 2026 — منتج', 10, 'TND', 10, 1, now, now);
        await page.evaluate(() => localStorage.setItem('ayrovi.locale.v1', 'fr'));
        await page.goto(base + '/?customerAuth=login'); await page.locator('.ac-profile-card').waitFor();
        await page.locator('.ac-shortcuts').getByRole('button', { name: /Panier/ }).click();
        await page.locator('.ac-cart-description strong').waitFor();
        const before = await page.locator('.ac-cart-description strong').innerText();
        await page.getByRole('button', { name: /Augmenter la quantité/ }).click();
        await page.waitForFunction(() => document.querySelector('.ac-quantity span')?.textContent === '2');
        const after = await page.locator('.ac-cart-description strong').innerText();
        check(name + ': price really changed', before !== after, { before, after });
        check(name + ': quantity persisted to DB', db.get<any>('SELECT quantity FROM cart_items WHERE id=?', `identity-${name}`).quantity === 2);
        await inspect(page, name + '/dynamic-price');
        if (name === 'Chromium') {
          const cdp = await context.newCDPSession(page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
          const { root } = await cdp.send('DOM.getDocument');
          for (const selector of ['.ac-cart-description strong', '.ac-cart-description h2']) {
            const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
            const actual = await cdp.send('CSS.getPlatformFontsForNode', { nodeId }); fonts.push({ selector, ...actual });
            check('actual rendered glyphs use only downloaded approved fonts: ' + selector, actual.fonts.length && actual.fonts.every(f => f.isCustomFont && /Zalando|Noto Sans Arabic/.test(f.familyName)), actual);
          }
        }
        await page.screenshot({ path: `${output}/${name.toLowerCase()}-cart.png` });
        for (const file of ['privacy', 'terms', 'data-deletion']) {
          await page.goto(`${base}/${file}.html`); await inspect(page, name + '/' + file);
        }
        await page.goto(base + '/admin'); await page.locator('input[type=email]').fill('admin@example.com'); await page.locator('input[type=password]').fill('Test-admin-password-123!'); await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
        await page.locator('.bo-shell').waitFor(); await inspect(page, name + '/admin');
        await page.screenshot({ path: `${output}/${name.toLowerCase()}-admin.png` });
        await page.getByRole('button', { name: 'Basculer le thème sombre / clair' }).click();
        await inspect(page, name + '/admin-dark');
        check(name + ': no external font requests', !remoteFonts.length, remoteFonts);
      } finally { await browser.close(); }
    }
    const now = new Date().toISOString();
    db.run('INSERT INTO customers(id,name,phone,registered_at,updated_at) VALUES(?,?,?,?,?)','identity-customer','محمد Éléonore','+21620123456',now,now);
    db.run("INSERT INTO orders(id,order_number,customer_id,status,subtotal_tnd,total_tnd,pricing_snapshot,governorate,address,phone,created_at,updated_at) VALUES(?,?,?,'AWAITING_DEPOSIT',189.9,189.9,'{}','Tunis','Adresse de démonstration','+21620123456',?,?)",'identity-order','AY-IDENTITY-TEST','identity-customer',now,now);
    const invoiceHtml = buildInvoiceHtml(db, 'identity-order');
    fs.writeFileSync(`${output}/invoice-sample.html`, invoiceHtml);
    const documentBrowser = await chromium.launch({headless:true});
    try {
      const p = await documentBrowser.newPage({viewport:{width:1360,height:900}});
      await p.setContent(invoiceHtml); await inspect(p, 'generated invoice HTML');
      await p.screenshot({path:`${output}/invoice-sample.png`});
    } finally { await documentBrowser.close(); }
    await writeSimplePdf([
      { text: 'AYROVI — Identité A / Validation PDF', size: 22, bold: true },
      { text: 'Éléonore — été, Noël, 189.900 TND, 90,00 €', size: 14 },
      { text: 'مرحبا بكم في أيروفي', size: 22, right: true },
      { text: 'فاتورة AYROVI 189.900 TND (2026)', size: 18, right: true },
      { text: 'Client: محمد علي', size: 16 },
      { text: 'هُوِيَّة أَيْرُوفِي', size: 22, right: true },
    ], `${output}/official-fonts.pdf`);
    const rendered = await pdf(`${output}/official-fonts.pdf`, { scale: 1.5 });
    for await (const image of rendered) { fs.writeFileSync(`${output}/official-fonts-pdf.png`, image); break; }
    check('no browser exceptions', !errors.length, errors);
  } finally {
    fs.writeFileSync(`${output}/runtime.json`, JSON.stringify({ checks, fonts, errors, scope: 'Real built app; isolated SQLite and fictional accounts; no live providers' }, null, 2));
    await new Promise<void>(r => server.close(() => r())); db.close();
  }
}
main().then(() => console.log(`PASS: ${checks.length} identity runtime checks`)).catch(e => { console.error(e); process.exitCode = 1; });
