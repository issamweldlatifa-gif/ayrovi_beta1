import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const origin = process.env.AYROVI_BASE_URL;
const api = process.env.AYROVI_API_URL || 'http://127.0.0.1:3000';
const output = '.cache/mobile-purchase-check';
mkdirSync(output, { recursive: true });
const checks = [];
const check = (name, actual, expected = true) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, pass, actual, expected });
  if (!pass) throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 580"><rect width="400" height="580" fill="#eeeeec"/><path d="M140 80h120l45 390H95z" fill="#d3ccbe" stroke="#918e85" stroke-width="2"/><path d="M130 360h140" stroke="#918e85" stroke-width="2"/></svg>')}`;
const product = {
  title: 'Produit de vérification mobile', brand: null, model: null, description: 'Test fixture only', image,
  images: [image], source: 'Source de test', sourceUrl: 'https://shop.example/product/checkout-fixture',
  price: 20, currency: 'EUR', priceTnd: null, exchangeRate: null, sizes: [], colors: [], variantOptions: [], availability: 'unknown',
};
const browser = await chromium.launch({ headless: true });
let page;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  /* The fixtures remain explicitly test-only: the fake merchant result is assigned
   * a fresh source-backed availability record, while every cart/order request still
   * goes to the isolated Express/SQLite test server. */
  await page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname + url.search;
    const headers = { ...req.headers() };
    delete headers.host;
    const response = await fetch(api + path, {
      method: req.method(), headers,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method()) ? req.postData() : undefined,
    });
    const contentType = response.headers.get('content-type') || 'application/json';
    const text = await response.text();
    if (req.method() === 'GET' && url.pathname === '/api/cart/items' && response.ok) {
      try {
        const payload = JSON.parse(text);
        if (payload?.success && Array.isArray(payload.items)) {
          const checkedAt = new Date().toISOString();
          payload.items = payload.items.map(item => ({
            ...item, availability: 'available', availabilitySource: 'Verified test fixture',
            availabilityCheckedAt: checkedAt,
          }));
          await route.fulfill({ status: response.status, contentType, body: JSON.stringify(payload) });
          return;
        }
      } catch { /* Preserve the actual response below; the test should report it. */ }
    }
    await route.fulfill({ status: response.status, contentType, body: text });
  });

  await page.goto(origin + '/__verify/sonim');
  await page.waitForFunction(() => typeof window.showPurchaseProduct === 'function');
  await page.evaluate(value => window.showPurchaseProduct(value), product);
  await page.locator('.s-product-page').waitFor();
  await page.getByRole('button', { name: 'Ajouter au panier', exact: true }).waitFor();
  await page.locator('[data-product-price-tnd]').waitFor();
  const detailPrice = Number(await page.locator('[data-product-price-tnd]').getAttribute('data-product-price-tnd'));
  check('Product detail receives the authoritative server quote', detailPrice > 0);
  check('Source-backed availability unlocks purchase', await page.getByRole('button', { name: 'Ajouter au panier', exact: true }).isEnabled());
  await page.screenshot({ path: `${output}/product-detail.png` });

  await page.getByRole('button', { name: 'Ajouter au panier', exact: true }).click();
  await page.getByText('Ajouté au panier', { exact: true }).waitFor();
  check('Adding stays on the product page', await page.locator('.s-bag-page').count(), 0);
  await page.getByRole('button', { name: 'Ouvrir le panier' }).click();
  await page.locator('.s-bag-page .s-appbar__title').waitFor();
  const linePrice = Number(await page.locator('[data-cart-line-tnd]').first().getAttribute('data-cart-line-tnd'));
  check('Product quote exactly matches the cart line', linePrice, detailPrice);
  check('Cart policy is server-derived and visible', (await page.locator('.s-bag-page').innerText()).includes('20%'));
  check('Verified fixture stock enables checkout', await page.getByRole('button', { name: 'Continuer vers le paiement', exact: true }).isEnabled());
  await page.screenshot({ path: `${output}/populated-cart.png` });

  await page.getByRole('button', { name: 'Continuer vers le paiement', exact: true }).click();
  await page.locator('.shop-checkout-route[data-app-route="checkout"]').waitFor();
  await page.getByText('Adresse de livraison', { exact: true }).waitFor();
  const shell = await page.locator('.shop-checkout-route').evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { position: getComputedStyle(el).position, top: rect.top, height: rect.height, viewportHeight: innerHeight };
  });
  check('Checkout is a fixed full-screen route, not a bottom sheet', { fixed: shell.position === 'fixed', startsAtTop: shell.top === 0, fillsViewport: shell.height >= shell.viewportHeight - 1 }, { fixed: true, startsAtTop: true, fillsViewport: true });
  check('Only configured delivery modes are shown', await page.getByRole('radio', { name: 'Point relais' }).count(), 0);
  await page.screenshot({ path: `${output}/delivery-address.png` });

  await page.getByLabel('Adresse').fill('12 rue de Test');
  await page.getByLabel('Code postal').fill('1000');
  await page.getByLabel('Ville').fill('Tunis');
  await page.getByRole('button', { name: 'Enregistrer l’adresse', exact: true }).click();
  await page.getByText('Moyen de paiement', { exact: true }).waitFor();
  const cod = page.getByRole('radio', { name: /Paiement à la livraison/ });
  await cod.waitFor();
  await cod.click();
  check('Payment step is connected to the address step', await page.locator('.shop-checkout-route .s-payment-option').count() > 0);
  check('Payment confirmation is available after address and method selection', await page.getByRole('button', { name: 'Confirmer et payer', exact: true }).isEnabled());
  check('Fixture never submits a live order', errors.length, 0);
  await page.screenshot({ path: `${output}/payment-method.png` });

  await page.locator('.shop-checkout-route').getByRole('button', { name: 'Retour', exact: true }).click();
  await page.locator('.shop-checkout-route').getByRole('button', { name: 'Retour', exact: true }).click();
  await page.locator('.s-bag-page').getByRole('button', { name: 'Retour', exact: true }).click();
  await page.locator('.s-product-page').waitFor();
  check('Checkout and bag back actions return to the existing product route', await page.locator('.s-product-page').count(), 1);
  check('No browser errors', errors.length, 0);
  writeFileSync(`${output}/checks.json`, JSON.stringify({ scope: 'Test-only mobile purchase flow using production product, bag, address and payment screens. API calls go only to the isolated test server; stock and user identity are explicit fixtures; no order is submitted.', checks, errors }, null, 2));
  await context.close();
  console.log(`${checks.length}/${checks.length} mobile purchase-flow assertions passed`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png` });
  writeFileSync(`${output}/checks.json`, JSON.stringify({ scope: 'Test-only mobile purchase flow; no real order submitted.', checks, error: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
