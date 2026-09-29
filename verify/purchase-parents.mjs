import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/* Both production parents must land on the current shared product + bag screens. */
buildSync({ entryPoints: ['src/ayrovix/priceQuote.ts'], outfile: '.cache/purchase-parent-quote.cjs', bundle: true, platform: 'node', format: 'cjs' });
const { createAyrovixPriceToken } = createRequire(import.meta.url)(path.resolve('.cache/purchase-parent-quote.cjs'));
const origin = process.env.AYROVI_BASE_URL;
const api = process.env.AYROVI_API_URL || 'http://127.0.0.1:3000';
const output = '.cache/purchase-parents-check';
mkdirSync(output, { recursive: true });
const checks = [];
const check = (name, actual, expected = true) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, pass, actual, expected });
  if (!pass) throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const sourceUrl = 'https://shop.example.com/parent-selection';
const title = 'Chaussures de running source';
const signed = price => createAyrovixPriceToken({ price, currency: 'EUR', title, referenceUrl: sourceUrl, status: 'VERIFIED' });
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 580"><rect width="400" height="580" fill="#eee"/><path d="M120 440h190v45H100z" fill="#aaa"/></svg>')}`;
const checkedAt = new Date().toISOString();
const product = {
  title, sourceUrl, brand: null, model: null, description: '', image, images: [image], source: 'Boutique source',
  price: 20, currency: 'EUR', priceTnd: null, exchangeRate: null, priceToken: signed(20),
  priceVerified: true, priceVerificationStatus: 'VERIFIED', colors: ['Bleu', 'Rouge'], sizes: ['42'],
  availability: 'in_stock', availabilityCheckedAt: checkedAt, availabilityExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  variantOptions: [
    { id: 'blue-42', label: '42 · Bleu', size: '42', color: 'Bleu', available: true, availability: 'available', price: 24, currency: 'EUR', priceTnd: null, priceToken: signed(24) },
    { id: 'red-42', label: '42 · Rouge', size: '42', color: 'Rouge', available: true, availability: 'available', price: 29, currency: 'EUR', priceTnd: null, priceToken: signed(29) },
  ],
};
const browser = await chromium.launch({ headless: true });
let page;
try {
  for (const mode of ['lens', 'sonim']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    if (mode === 'lens') await context.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    });
    if (mode === 'sonim') await context.addInitScript(value => {
      localStorage.setItem('ayrovi.locale.v1', 'fr');
      localStorage.setItem('ayrovi_assistant_conversations_v1_guest', JSON.stringify([{
        id: 'parent-fixture', title: 'Question produit', messages: [{ id: 'message', role: 'assistant', text: 'Produit enregistré pour vérification' }],
        selectedProduct: { messageId: 'message', product: value, priceVerified: true },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }]));
    }, product);
    page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const resource = url.pathname + url.search;
      if (resource === '/api/ayrovix/analyze-url') {
        return route.fulfill({ json: { success: true, data: { product, alternates: [], eventId: '' } } });
      }
      if (resource === '/api/ayrovix/history') return route.fulfill({ json: { success: true, data: [] } });
      if (resource === '/api/assistant/status') return route.fulfill({ json: { success: true, data: { voiceReady: false } } });
      if (url.pathname === '/api/public/commerce-config') {
        return route.fulfill({ json: { success: true, data: { deposit: { percent: 20, cardDiscountPercent: 5 }, capabilities: { cardGateway: false } } } });
      }
      const headers = { ...request.headers() };
      delete headers.host;
      const response = await fetch(api + resource, {
        method: request.method(), headers,
        body: ['POST', 'PUT', 'PATCH'].includes(request.method()) ? request.postData() : undefined,
      });
      const body = await response.text();
      return route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/json', body });
    });

    await page.goto(origin + `/__verify/sonim?mode=${mode}`);
    await page.locator('[data-open]').click();
    if (mode === 'lens') {
      await page.locator('.lens-access, #ayrovix-url-input').first().waitFor();
      const access = page.locator('.lens-access');
      if (await access.count()) {
        for (const input of await page.locator('.lens-consent input').all()) await input.check();
        await page.locator('.lens-consent .lens-panel-primary').click();
      }
      await page.locator('#ayrovix-url-input').fill(sourceUrl);
      await page.getByRole('button', { name: 'Analyser', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Actualiser et ouvrir le produit' }).click();
    }

    const screen = page.locator('.s-product-page');
    await screen.getByRole('heading', { name: title, exact: true }).waitFor();
    await screen.getByRole('button', { name: 'Votre pointure', exact: true }).click();
    const size = page.locator('.s-drape[role="dialog"] .s-size').filter({ hasText: /42/ }).first();
    await size.waitFor();
    check(`${mode}: fresh variant stock evidence enables the source size`, await size.isEnabled());
    await size.click();
    await screen.getByRole('button', { name: 'Bleu', exact: true }).click();
    await screen.locator('.s-buybar--product .s-cta:not(.s-cta--ghost):not(:disabled)').waitFor();
    check(`${mode}: valid size and color expose the current add action`, await screen.getByRole('button', { name: 'Ajouter au panier', exact: true }).isEnabled());
    check(`${mode}: product screen remains mounted under the same production parent`, await screen.getByRole('heading', { name: title, exact: true }).count(), 1);
    await page.screenshot({ path: `${output}/${mode}-product.png` });

    await screen.getByRole('button', { name: 'Ouvrir le panier' }).click();
    await page.locator('.s-bag-page .s-appbar__title').waitFor();
    check(`${mode}: production parent opens the current bag screen`, await page.locator('.s-bag-page').count(), 1);
    check(`${mode}: no unsubmitted fixture product is fabricated in the bag`, await page.locator('.s-bag-line__title').count(), 0);
    check(`${mode}: no uncaught browser errors`, errors.length, 0);
    await page.screenshot({ path: `${output}/${mode}-bag.png` });
    await context.close();
    page = null;
  }
  writeFileSync(`${output}/checks.json`, JSON.stringify({ scope: 'Current production Lens and SONIM parents, shared ShopProductScreen and ShopBagScreen; isolated APIs and test-only product fixture; no order submitted.', checks }, null, 2));
  console.log(`${checks.length}/${checks.length} production-parent purchase assertions passed`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png` });
  writeFileSync(`${output}/checks.json`, JSON.stringify({ checks, error: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
