// Browser verification against a built, isolated application. Never accesses a deployed database.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { chromium } = require('playwright');
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_PATH: ':memory:', ZAYROVI_BACKGROUND_JOBS: 'off',
  ADMIN_EMAIL: 'workbench-admin@example.invalid', ADMIN_PASSWORD: randomBytes(32).toString('hex'),
});
const { app, db } = require('../dist/server.js');
const now = new Date().toISOString();
const customer = 'workbench-fixture-customer';
db.run('INSERT INTO customers (id,name,phone,governorate,address,registered_at,updated_at) VALUES (?,?,?,?,?,?,?)', customer, 'Client de démonstration', '22000001', 'Tunis', 'Adresse fictive', now, now);
const statuses = ['DELIVERED', 'CONFIRMED', 'PREPARING', 'AWAITING_DEPOSIT', 'AWAITING_PAYMENT_VERIFICATION', 'CANCELLED', 'IN_TRANSIT'];
for (let i = 0; i < 66; i++) {
  const date = new Date(Date.now() - ((i * i + i + 11) % 32) * 86400000).toISOString();
  db.run(`INSERT INTO orders (id,order_number,customer_id,source,status,payment_status,subtotal_tnd,total_tnd,pricing_snapshot,governorate,address,phone,created_at,updated_at)
    VALUES (?,?,?,'ZALANDO',?,'PENDING',?,?,'{}','Tunis','Adresse fictive','22000001',?,?)`,
  `workbench-order-${i}`, `AY-DEMO-${5000 + i}`, customer, statuses[i % statuses.length], 45 + i * 2, 45 + i * 2, date, date);
}
db.run("INSERT INTO crm_arrivals (id,name,status,created_at,updated_at) VALUES ('workbench-review','Arrivage Démo','REVIEW',?,?)", now, now);

async function login(page, email, password) {
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
}
async function main() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  let browser;
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1020 }, colorScheme: 'light' });
    page.setDefaultTimeout(12_000);
    const exceptions = [];
    page.on('pageerror', error => exceptions.push(error.message));
    const capture = name => process.env.ADMIN_SCREENSHOT_DIR && page.screenshot({ path: `${process.env.ADMIN_SCREENSHOT_DIR}/${name}.png`, fullPage: true });
    await page.goto(`${origin}/admin`);
    await login(page, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    await page.getByRole('heading', { name: 'Centre de pilotage' }).waitFor();
    await page.getByRole('region', { name: 'Volume de commandes' }).waitFor();
    await page.getByRole('heading', { name: 'Dernières commandes' }).waitFor();
    await page.locator('.office-volume-plot [data-chosen]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await capture('dashboard');
    const tabs = page.getByRole('navigation', { name: 'Onglets de travail' });
    await page.getByRole('button', { name: /Arrivages à valider/ }).click();
    await page.getByText('Arrivage Démo', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Statut des arrivages').inputValue(), 'REVIEW');
    assert.equal(new URL(page.url()).searchParams.get('request'), 'REVIEW');
    await tabs.getByRole('button', { name: 'Tableau de bord', exact: true }).click();
    await page.getByRole('button', { name: /Acomptes à vérifier/ }).click();
    await tabs.getByRole('button', { name: 'Commandes & factures', exact: true }).waitFor();
    await tabs.getByRole('button', { name: 'Arrivals CRM', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('request'), 'REVIEW');
    await tabs.getByRole('button', { name: /Fermer.*arrivals/i }).click();
    assert.equal(new URL(page.url()).searchParams.get('section'), 'orders');
    assert.equal(new URL(page.url()).searchParams.get('request'), 'AWAITING_PAYMENT_VERIFICATION');
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Palette de commandes' });
    await palette.getByRole('textbox').fill('centre des modules');
    await palette.getByRole('button', { name: /Centre des modules/ }).waitFor();
    await capture('palette');
    await page.keyboard.press('Enter');
    await page.locator('[data-module="sales"]').getByText('En service · historique').waitFor();
    await page.getByRole('button', { name: 'Planifiés', exact: true }).click();
    await page.locator('[data-module="accounting"]').getByText('Planifié · indisponible').waitFor();
    assert.equal(await page.locator('[data-module="sales"]').count(), 0);
    await capture('modules');
    await page.getByRole('button', { name: 'Réduire la navigation' }).click();
    assert.equal(await page.locator('#office-navigation').evaluate(node => node.getBoundingClientRect().width), 64);
    await page.getByRole('button', { name: 'Développer la navigation' }).click();
    await tabs.getByRole('button', { name: 'Tableau de bord', exact: true }).click();
    await page.getByRole('region', { name: 'Volume de commandes' }).waitFor();
    await page.getByRole('button', { name: 'Basculer le thème sombre / clair' }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await capture('dashboard-dark');
    await page.getByRole('button', { name: 'Basculer le thème sombre / clair' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'العربية (RTL)' }).click();
    await page.getByRole('heading', { name: 'مركز القيادة' }).waitFor();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'RTL mobile viewport must not overflow');
    await page.getByRole('button', { name: 'افتح القائمة' }).click();
    await page.getByRole('button', { name: 'اغلق القائمة', exact: true }).first().click();
    await capture('dashboard-mobile-rtl');

    const editor = await page.evaluate(async () => {
      const response = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': sessionStorage.getItem('zayrovi_admin_csrf') }, body: JSON.stringify({ name: 'Éditeur de démonstration', email: 'editor@example.invalid', password: 'Demo-only-in-memory-001', role: 'CONTENT_MANAGER' }) });
      return response.status;
    });
    assert.equal(editor, 201);
    const scoped = await browser.newPage({ viewport: { width: 1440, height: 1020 } });
    const technicalReads = [];
    scoped.on('request', req => { if (req.url().includes('/api/admin/core/environment')) technicalReads.push(req.url()); });
    await scoped.goto(`${origin}/admin`);
    await login(scoped, 'editor@example.invalid', 'Demo-only-in-memory-001');
    await scoped.getByRole('heading', { name: 'Mon espace de travail' }).waitFor();
    assert.equal(await scoped.locator('.office-kpi-grid').count(), 0);
    await scoped.goto(`${origin}/admin?section=erp-environment`);
    await scoped.locator('[data-module="sales"]').waitFor();
    assert.equal(await scoped.locator('[data-module="sales"] button').count(), 0);
    assert.deepEqual(technicalReads, []);
    assert.deepEqual(exceptions, []);
    console.log('Workbench: dashboards, work tabs, queue filters, launcher, module permission boundaries, themes and mobile RTL passed.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
