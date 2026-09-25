import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Server-signed source-like records exercise the actual Lens and SONIM parents.
// Production discovery continues to use SerpAPI; this fixture makes no live search.
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
const signed = (price, status = 'VERIFIED') => createAyrovixPriceToken({ price, currency: 'EUR', title, referenceUrl: sourceUrl, status });
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 580"><rect width="400" height="580" fill="#eee"/><path d="M120 440h190v45H100z" fill="#aaa"/></svg>')}`;
const product = {
  title, sourceUrl, brand: null, model: null, description: '', image, images: [image], source: 'Boutique source',
  price: 20, currency: 'EUR', priceTnd: null, exchangeRate: null, priceToken: signed(20),
  priceVerified: true, priceVerificationStatus: 'VERIFIED', colors: ['Bleu', 'Rouge'], sizes: ['42'], availability: 'unknown',
  variantOptions: [
    { id: 'blue-42', label: '42 · Bleu', size: '42', color: 'Bleu', available: true, price: 24, currency: 'EUR', priceTnd: null, priceToken: signed(24) },
    { id: 'red-42', label: '42 · Rouge', size: '42', color: 'Rouge', available: true, price: 29, currency: 'EUR', priceTnd: null, priceToken: signed(29) },
  ],
};
const browser = await chromium.launch({ headless: true });
let page;
try {
  for (const mode of ['lens', 'sonim']) {
    for (const scenario of ['success', 'missing-token']) {
      const sourceProduct = scenario === 'success' ? product : {
        ...product, priceToken: null, variantOptions: product.variantOptions.map(option => ({ ...option, priceToken: null })),
      };
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      // This test chooses the URL entry rather than a real physical camera.
      if (mode === 'lens') await context.addInitScript(() => {
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
      });
      if (mode === 'sonim') await context.addInitScript(value => {
        localStorage.setItem('ayrovi.locale.v1', 'fr');
        localStorage.setItem('ayrovi_assistant_conversations_v1_guest', JSON.stringify([{
          id: 'parent-fixture', title: 'Question produit', messages: [{ id: 'message', role: 'assistant', text: 'Produit enregistré pour vérification' }],
          selectedProduct: { messageId: 'message', product: value, priceVerified: true },
          createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z',
        }]));
      }, sourceProduct);
      page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let failNextPost = scenario === 'success';
      let releasePost;
      await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const resource = url.pathname + url.search;
        if (resource === '/api/ayrovix/analyze-url') {
          return route.fulfill({ json: { success: true, data: { product: sourceProduct, alternates: [], eventId: '' } } });
        }
        if (resource === '/api/ayrovix/history') return route.fulfill({ json: { success: true, data: [] } });
        if (resource === '/api/assistant/status') return route.fulfill({ json: { success: true, data: { voiceReady: false } } });
        if (resource === '/api/cart/items' && request.method() === 'POST') {
          if (failNextPost) {
            failNextPost = false;
            return route.fulfill({ status: 503, json: { success: false, error: 'PANIER_INDISPONIBLE_TEST' } });
          }
          if (releasePost) {
            const release = releasePost;
            releasePost = null;
            await release.promise;
          }
        }
        const headers = { ...request.headers() };
        delete headers.host;
        const response = await fetch(api + resource, {
          method: request.method(), headers,
          body: ['POST', 'PUT', 'PATCH'].includes(request.method()) ? request.postData() : undefined,
        });
        return route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/json', body: await response.text() });
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
      const card = page.locator('.flow-product');
      await card.getByRole('heading', { name: title }).waitFor();
      await card.getByRole('button', { name: 'Votre taille' }).click();
      await page.locator('[role="dialog"] button').filter({ hasText: '42' }).last().click();
      check(`${mode}/${scenario}: multiple colors require selection`, await card.getByRole('button', { name: 'Ajouter au panier' }).isDisabled());
      await card.getByRole('radio', { name: 'Couleur Bleu' }).click();
      await card.locator('[data-product-price-tnd]').waitFor();
      const shown = Number(await card.locator('[data-product-price-tnd]').getAttribute('data-product-price-tnd'));
      check(`${mode}/${scenario}: variant source price is shown`, (await card.innerText()).includes('24.00 EUR'));

      if (scenario === 'missing-token') {
        await card.getByRole('button', { name: 'Ajouter au panier' }).click();
        await card.getByText(/Le devis de cette sélection est incomplet ou indisponible/).waitFor();
        check(`${mode}: unsigned quote never acknowledges a cart write`, await card.getByText('Produit ajouté').count(), 0);
        check(`${mode}: failed quote stays on the product`, await card.getByRole('heading', { name: title }).count(), 1);
      } else {
        await card.getByRole('button', { name: 'Ajouter au panier' }).click();
        await card.getByText('PANIER_INDISPONIBLE_TEST').waitFor();
        check(`${mode}: failed cart write is not acknowledged`, await card.getByText('Produit ajouté').count(), 0);
        check(`${mode}: failed write stays on the product`, await card.getByRole('heading', { name: title }).count(), 1);
        const blockedPost = {};
        blockedPost.promise = new Promise(resolve => { blockedPost.resolve = resolve; });
        releasePost = blockedPost;
        await card.getByRole('button', { name: 'Ajouter au panier' }).click();
        await card.locator('.ay-cart-loading').waitFor();
        check(`${mode}: real request keeps the loader visible`, await card.getByText('Produit ajouté').count(), 0);
        check(`${mode}: cart does not auto-open`, await page.getByRole('heading', { name: /Mon panier/ }).count(), 0);
        blockedPost.resolve();
        await card.getByRole('button', { name: 'Produit ajouté' }).waitFor();
        check(`${mode}: acknowledgement stays on product`, await card.getByRole('heading', { name: title }).count(), 1);
        check(`${mode}: successful action disables duplicate submission`, await card.getByRole('button', { name: 'Produit ajouté' }).getAttribute('aria-disabled'), 'true');
        await page.screenshot({ path: `${output}/${mode}-added.png` });
        await card.getByRole('button', { name: 'Ouvrir le panier' }).click();
        await page.getByRole('heading', { name: /Mon panier/ }).waitFor();
        const cartLine = Number(await page.locator('[data-cart-line-tnd]').first().getAttribute('data-cart-line-tnd'));
        check(`${mode}: source-backed variant quote equals cart line`, shown, cartLine);
        check(`${mode}: selected variant identity reaches cart`, (await page.getByText('Taille 42 · Couleur Bleu').count()) > 0);
      }
      check(`${mode}/${scenario}: no page errors`, errors.length, 0);
      await context.close();
      page = null;
    }
  }
  writeFileSync(`${output}/checks.json`, JSON.stringify({ checks }, null, 2));
  console.log(`${checks.length}/${checks.length} production-parent purchase assertions passed`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png` });
  writeFileSync(`${output}/checks.json`, JSON.stringify({ checks, error: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
