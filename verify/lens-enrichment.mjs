/* Browser-only signed fixture: candidate discovery -> source enrichment ->
 * variant-specific USD quote -> actual cart endpoint. SerpAPI remains the
 * production discovery provider; no live provider credentials are used here. */
import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

buildSync({ entryPoints: ['src/ayrovix/priceQuote.ts'], outfile: '.cache/lens-enrichment-quote.cjs', bundle: true, platform: 'node', format: 'cjs' });
const { createAyrovixPriceToken } = createRequire(import.meta.url)(path.resolve('.cache/lens-enrichment-quote.cjs'));
const origin = process.env.AYROVI_BASE_URL;
const api = process.env.AYROVI_API_URL || 'http://127.0.0.1:3000';
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
  variantOptions: [
    { id: 'sku-42', label: 'Pointure 42', size: '42', color: null, available: true, price: 32, currency: 'USD', priceTnd: null, priceToken: signed(32, 'USD') },
    { id: 'sku-43', label: 'Pointure 43', size: '43', color: null, available: true, price: 38, currency: 'USD', priceTnd: null, priceToken: signed(38, 'USD') },
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
  const writes = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const resource = new URL(request.url()).pathname + new URL(request.url()).search;
    if (resource === '/api/ayrovix/analyze-text') return route.fulfill({ json: { success: true, data: { query: title, candidates: [candidate], eventId: '' } } });
    if (resource === '/api/ayrovix/analyze-url') return route.fulfill({ json: { success: true, data: { product: full, alternates: [], eventId: '' } } });
    if (resource === '/api/ayrovix/history') return route.fulfill({ json: { success: true, data: [] } });
    if (request.method() === 'POST' && resource === '/api/cart/items') writes.push(request.postDataJSON());
    const headers = { ...request.headers() };
    delete headers.host;
    const response = await fetch(api + resource, {
      method: request.method(), headers,
      body: ['POST', 'PUT', 'PATCH'].includes(request.method()) ? request.postData() : undefined,
    });
    return route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/json', body: await response.text() });
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
  const card = page.locator('.flow-product');
  await card.getByRole('button', { name: 'Votre taille' }).waitFor();
  await card.getByRole('button', { name: 'Votre taille' }).click();
  check('Enrichment exposes only sourced sizes', await page.locator('[role="dialog"] button strong').allTextContents(), ['42', '43']);
  await page.locator('[role="dialog"] button').filter({ has: page.locator('strong').getByText('43', { exact: true }) }).click();
  await card.locator('[data-product-price-tnd]').waitFor();
  const quote43 = Number(await card.locator('[data-product-price-tnd]').getAttribute('data-product-price-tnd'));
  await card.getByRole('button', { name: '43' }).click();
  await page.locator('[role="dialog"] button').filter({ has: page.locator('strong').getByText('42', { exact: true }) }).click();
  await card.locator('[data-product-price-tnd]').waitFor();
  const quote42 = Number(await card.locator('[data-product-price-tnd]').getAttribute('data-product-price-tnd'));
  check('Each source variant changes its actual quoted price', quote42 !== quote43);
  check('Selected variant keeps USD rather than EUR base currency', (await card.innerText()).includes('32.00 USD'));
  await card.getByRole('button', { name: 'Ajouter au panier' }).click();
  await card.getByText('Produit ajouté', { exact: true }).waitFor();
  check('No automatic cart navigation', await page.getByRole('heading', { name: /Mon panier/ }).count(), 0);
  check('Whole variant identity is sent to the cart', writes.map(({ sourcePrice, sourceCurrency, priceToken, externalId, priceVerificationStatus }) =>
    ({ sourcePrice, sourceCurrency, signed: priceToken === full.variantOptions[0].priceToken, externalId, priceVerificationStatus })),
  [{ sourcePrice: 32, sourceCurrency: 'USD', signed: true, externalId: 'sku-42', priceVerificationStatus: status }]);
  await card.getByRole('button', { name: 'Ouvrir le panier' }).click();
  await page.getByRole('heading', { name: /Mon panier/ }).waitFor();
  check('Enriched variant quote equals real cart line', Number(await page.locator('[data-cart-line-tnd]').first().getAttribute('data-cart-line-tnd')), quote42);
  check('No browser errors', errors, []);
  await page.screenshot({ path: `${output}/signed-variant-cart.png` });
  await context.close();
  writeFileSync(`${output}/checks.json`, JSON.stringify({ checks }, null, 2));
  console.log(`${checks.length}/${checks.length} candidate-enrichment purchase assertions passed`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png` });
  writeFileSync(`${output}/checks.json`, JSON.stringify({ checks, error: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
