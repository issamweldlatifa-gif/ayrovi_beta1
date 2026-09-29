/* Browser-only fixture: candidate discovery -> source enrichment -> current shared product UI.
 * The fake merchant does not provide a server-verifiable stock contract, so the test checks
 * that source details are enriched but the unknown sizes remain deliberately non-orderable. */
import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

buildSync({ entryPoints: ['src/ayrovix/priceQuote.ts'], outfile: '.cache/lens-enrichment-quote.cjs', bundle: true, platform: 'node', format: 'cjs' });
const { createAyrovixPriceToken } = createRequire(import.meta.url)(path.resolve('.cache/lens-enrichment-quote.cjs'));
const origin = process.env.AYROVI_BASE_URL;
const output = '.cache/lens-enrichment-check';
mkdirSync(output, { recursive: true });
const checks = [];
function check(name, actual, expected = true) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, actual, expected, pass });
  if (!pass) throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const title = 'Chaussures de course source';
const sourceUrl = 'https://shop.example.com/stocked-running';
const status = 'PENDING_MANUAL';
const signed = (price, currency) => createAyrovixPriceToken({ price, currency, title, referenceUrl: sourceUrl, status });
const candidate = {
  id: 'source-candidate', kind: 'external', title, brand: null, model: null,
  description: 'Description courte fournie par la recherche', source: 'Source marchande', sourceUrl,
  image: '', images: [], price: 20, currency: 'EUR', priceTnd: null, match: 85,
  priceToken: signed(20, 'EUR'), priceVerificationStatus: status,
  sizes: [], colors: [], availability: 'unknown',
};
const full = {
  ...candidate, description: 'Description détaillée publiée sur la vraie page du marchand.',
  images: [], exchangeRate: null, sizes: ['43', '42'], colors: [],
  availability: 'unknown',
  variantOptions: [
    { id: 'sku-42', label: 'Pointure 42', size: '42', color: null, available: true, availability: 'unknown', price: 32, currency: 'USD', priceTnd: null, priceToken: signed(32, 'USD') },
    { id: 'sku-43', label: 'Pointure 43', size: '43', color: null, available: true, availability: 'unknown', price: 38, currency: 'USD', priceTnd: null, priceToken: signed(38, 'USD') },
  ],
};
const browser = await chromium.launch({ headless: true });
let page;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('ayrovi.locale.v1', 'fr');
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const resource = new URL(request.url()).pathname + new URL(request.url()).search;
    if (resource === '/api/ayrovix/analyze-text') return route.fulfill({ json: { success: true, data: { query: title, candidates: [candidate], eventId: '' } } });
    if (resource === '/api/ayrovix/analyze-url') return route.fulfill({ json: { success: true, data: { product: full, alternates: [], eventId: '' } } });
    if (resource === '/api/ayrovix/history') return route.fulfill({ json: { success: true, data: [] } });
    return route.fulfill({ status: 503, json: { success: false, error: 'Fixture endpoint not required' } });
  });

  await page.goto(origin + '/__verify/sonim?mode=lens');
  await page.locator('[data-open]').click();
  await page.locator('.lens-access, #ayrovix-text-input').first().waitFor();
  if (await page.locator('.lens-access').count()) {
    for (const input of await page.locator('.lens-consent input').all()) await input.check();
    await page.locator('.lens-consent .lens-panel-primary').click();
  }
  await page.locator('#ayrovix-text-input').fill(title);
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await page.getByRole('button', { name: `Voir le produit : ${title}` }).click();
  const screen = page.locator('.s-product-page');
  await screen.getByRole('button', { name: 'Votre pointure', exact: true }).waitFor();
  await screen.getByRole('button', { name: 'Votre pointure', exact: true }).click();
  const dialog = page.locator('.s-drape[role="dialog"]');
  const sizes = await dialog.locator('.s-size strong').allTextContents();
  check('Enrichment exposes only source-listed sizes', [...sizes].sort(), ['42', '43']);
  check('Unconfirmed source stock is labelled unknown', await dialog.locator('.s-size').evaluateAll(items => items.every(item => item.getAttribute('data-state') === 'unknown')));
  check('Unknown sizes cannot be selected', await dialog.locator('.s-size').evaluateAll(items => items.every(item => item.disabled)));
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
  check('Unknown stock blocks add-to-bag', await screen.getByRole('button', { name: 'Ajouter au panier', exact: true }).isDisabled());
  check('Enrichment replaces the search snippet with the merchant description', (await screen.locator('.s-desc').innerText()).includes('Description détaillée publiée sur la vraie page du marchand.'));
  check('No browser errors', errors, []);
  await page.screenshot({ path: `${output}/enriched-unknown-stock.png` });
  await context.close();
  writeFileSync(`${output}/checks.json`, JSON.stringify({ scope: 'Test-only discovery/enrichment fixture; unavailable source contract prevents ordering.', checks }, null, 2));
  console.log(`${checks.length}/${checks.length} candidate-enrichment assertions passed`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png` });
  writeFileSync(`${output}/checks.json`, JSON.stringify({ checks, error: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
