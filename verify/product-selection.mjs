import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// Test-only quotes make this browser suite hermetic. The cart/page price engine
// itself is verified with the real API in cart-line-identity.test.ts.
buildSync({ entryPoints: ['src/ayrovix/priceQuote.ts'], outfile: '.cache/selection-quote.cjs', bundle: true, platform: 'node', format: 'cjs' });
const { createAyrovixPriceToken, verifyAyrovixPriceToken } = createRequire(import.meta.url)(path.resolve('.cache/selection-quote.cjs'));
const output = 'screenshots/editorial/product-selection';
fs.mkdirSync(output, { recursive: true });
const checks = [], errors = [];
const check = (name, actual, expected = true) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, pass, actual, expected });
  if (!pass) throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const base = {
  title: 'Robe en coton de sélection', sourceUrl: 'https://example.org/product', source: 'Boutique source',
  brand: null, model: null, description: '', image: '', images: [], price: 20, currency: 'EUR',
  priceTnd: null, exchangeRate: null, colors: ['Bleu', 'Rouge'], sizes: ['M', 'L'],
  availability: 'unknown', priceVerified: true, priceVerificationStatus: 'VERIFIED',
};
const token = (price, currency = 'EUR') => createAyrovixPriceToken({ price, currency, title: base.title, referenceUrl: base.sourceUrl, status: 'VERIFIED' });
base.priceToken = token(20);
const variant = (id, size, color, price) => ({ id, label: `${size} · ${color}`, size, color, price, currency: 'EUR', priceTnd: null, priceToken: token(price), available: true });
const blue = variant('blue-M', 'M', 'Bleu', 27);
const red = variant('red-M', 'M', 'Rouge', 35);
const large = variant('blue-L', 'L', 'Bleu', 40);
// Canned UI responses are not a second implementation of production pricing.
const cannedLineQuotes = new Map([[20, 80], [27, 108], [35, 140], [40, 160], [32, 128]]);
const scenarios = [
  { name: 'exact', options: [blue, red], size: 'M', color: 'Bleu', id: 'blue-M', price: 27 },
  { name: 'reordered', options: [red, blue], size: 'M', color: 'Bleu', id: 'blue-M', price: 27 },
  { name: 'size-only', options: [blue, red], size: 'M', color: '', disabled: true, notice: 'ambiguous' },
  { name: 'color-only', options: [blue, large], size: '', color: 'Bleu', disabled: true, notice: 'ambiguous' },
  { name: 'conflicting', options: [blue, variant('other', 'M', 'Bleu', 32)], size: 'M', color: 'Bleu', id: null, price: 20, notice: 'ambiguous' },
  { name: 'custom-absent', options: [blue, red], size: 'XXL', color: '', disabled: true },
  { name: 'unpriced-option', options: [{ ...blue, price: null, currency: null, priceTnd: null, priceToken: null }], size: 'M', color: 'Bleu', id: 'blue-M', price: 20, notice: 'general' },
  { name: 'missing-total', options: [{ ...blue, priceTnd: null }], size: 'M', color: 'Bleu', id: 'blue-M', price: 27 },
  { name: 'missing-token', options: [{ ...blue, priceToken: null }], size: 'M', color: 'Bleu', disabled: true, incomplete: true },
  { name: 'missing-currency', options: [{ ...blue, currency: null }], size: 'M', color: 'Bleu', disabled: true, incomplete: true },
  { name: 'missing-general-token', options: [], size: 'M', color: 'Bleu', price: 20, rejectUnsigned: true, notice: 'general' },
];
const browser = await chromium.launch({ headless: true });
let page;
try {
  for (const locale of ['fr', 'ar']) for (const width of [320, 390]) for (const mode of ['lens', 'sonim']) {
    const ar = locale === 'ar', key = `${mode}/${locale}/${width}`;
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    await context.addInitScript(({ locale, base }) => {
      localStorage.setItem('ayrovi.locale.v1', locale);
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
      localStorage.setItem('ayrovi_assistant_conversations_v1_guest', JSON.stringify([{
        id: 'fixture', title: 'Stored fixture', messages: [{ id: 'product', role: 'assistant', text: 'Historical selection' }],
        selectedProduct: { messageId: 'product', product: base, priceVerified: true },
        createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z',
      }]));
    }, { locale, base });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/assistant/status', route => route.fulfill({ json: { success: true, data: { voiceReady: false } } }));
    await page.route('**/api/ayrovix/history', route => route.fulfill({ json: { success: true, data: [] } }));
    await page.route('**/api/public/commerce-config', route => route.fulfill({ json: { success: true, data: { deposit: { percent: 20 } } } }));
    await page.route('**/api/public/pricing/cart-line', route => {
      const request = route.request().postDataJSON();
      const quote = cannedLineQuotes.get(request.sourcePrice);
      return route.fulfill({ status: quote == null ? 400 : 200, json: quote == null
        ? { success: false, error: 'Quote unavailable' }
        : { success: true, data: { lineTotalTND: quote, originalLineTotalTND: null, promo: null, pricingVersion: 2 } } });
    });
    let fresh = base;
    await page.route('**/api/ayrovix/analyze-url', route => route.fulfill({ json: { success: true, data: { product: fresh, alternates: [], eventId: '' } } }));
    for (const scenario of scenarios) {
      fresh = { ...base, variantOptions: scenario.options, priceToken: scenario.rejectUnsigned ? null : base.priceToken };
      await page.goto(process.env.AYROVI_BASE_URL + `/__verify/sonim?mode=${mode}&case=${scenario.name}`);
      await page.locator('[data-open]').click();
      if (mode === 'lens') {
        await page.locator('.lens-access, #ayrovix-url-input').first().waitFor();
        if (await page.locator('.lens-access').count()) {
          for (const input of await page.locator('.lens-consent input').all()) await input.check();
          await page.locator('.lens-consent .lens-panel-primary').click();
        }
        await page.locator('#ayrovix-url-input').fill(base.sourceUrl);
        await page.getByRole('button', { name: ar ? 'تحليل' : 'Analyser', exact: true }).click();
      } else {
        await page.getByRole('button', { name: ar ? 'تحديث المنتج وفتحه' : 'Actualiser et ouvrir le produit', exact: true }).click();
      }
      const card = page.locator('.flow-product');
      await card.getByRole('heading', { name: base.title }).waitFor();
      const add = card.getByRole('button', { name: ar ? 'زيد للسلة' : 'Ajouter au panier' });
      if (scenario.size === 'XXL') {
        await card.getByRole('button', { name: ar ? 'اختر مقاسك' : 'Votre taille' }).click();
        check(`${key}/${scenario.name}: no size outside sourced options`, await page.getByRole('dialog').last().getByRole('button', { name: 'XXL' }).count(), 0);
        await page.getByRole('dialog').last().getByRole('button', { name: ar ? 'إغلاق' : 'Fermer' }).click();
      } else if (scenario.size) {
        await card.getByRole('button', { name: ar ? 'اختر مقاسك' : 'Votre taille' }).click();
        await page.locator('[role="dialog"] button').filter({ has: page.locator('strong:text-is("M")') }).last().click();
      }
      if (scenario.color) await card.getByRole('radio', { name: ar ? `اللون ${scenario.color}` : `Couleur ${scenario.color}` }).click();
      if (scenario.notice) {
        const notice = await card.locator('[data-variant-selection-notice]').innerText();
        check(`${key}/${scenario.name}: estimate or ambiguity is explicitly labelled`, notice.includes(ar
          ? (scenario.notice === 'ambiguous' ? 'توجد عدة خيارات' : 'تقدير عام')
          : (scenario.notice === 'ambiguous' ? 'Plusieurs variantes' : 'Estimation générale')));
      }
      if (scenario.incomplete) {
        check(`${key}/${scenario.name}: incomplete variant never borrows a token`, await add.isDisabled());
        check(`${key}/${scenario.name}: incomplete quote is explained`, (await card.locator('[data-variant-selection-notice][role="alert"]').count()) > 0);
        continue;
      }
      if (scenario.disabled) {
        check(`${key}/${scenario.name}: both sourced dimensions are required`, await add.isDisabled());
        if (scenario.name === 'size-only') {
          await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
          const notice = card.locator('[data-variant-selection-notice]');
          await notice.scrollIntoViewIfNeeded();
          const box = await notice.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, height: el.clientHeight, content: el.scrollHeight }));
          check(`${key}: ambiguity explanation fits 200% text`, box.scroll <= box.width + 1 && box.content <= box.height + 1);
        }
        continue;
      }
      await card.locator('[data-product-price-tnd]').waitFor();
      check(`${key}/${scenario.name}: quote comes from the selected source amount`, Number(await card.locator('[data-product-price-tnd]').getAttribute('data-product-price-tnd')), cannedLineQuotes.get(scenario.price));
      check(`${key}/${scenario.name}: source currency is displayed`, (await card.innerText()).includes(`${scenario.price.toFixed(2)} EUR`));
      await add.click();
      if (scenario.rejectUnsigned) {
        await card.getByText(ar ? /عرض سعر هذا الاختيار غير مكتمل/ : /Le devis de cette sélection est incomplet/).waitFor();
        check(`${key}/${scenario.name}: unsigned quote cannot acknowledge an order`, await card.getByText(ar ? 'تمت إضافة المنتج' : 'Produit ajouté').count(), 0);
        continue;
      }
      await page.waitForFunction(() => selectionTestOrders.length === 1);
      const sent = await page.evaluate(() => selectionTestOrders[0]);
      check(`${key}/${scenario.name}: only the exact source variant is passed`, sent.externalId, scenario.id);
      check(`${key}/${scenario.name}: selected monetary offer stays coherent`, [sent.sourcePrice, sent.sourceCurrency, sent.priceTND], [scenario.price, 'EUR', 0]);
      check(`${key}/${scenario.name}: parent HMAC fields match source`, verifyAyrovixPriceToken(sent.priceToken, {
        price: sent.sourcePrice, currency: sent.sourceCurrency, title: sent.title,
        referenceUrl: sent.referenceUrl, status: sent.priceVerificationStatus,
      }));
      check(`${key}/${scenario.name}: acknowledgement remains on product page`, await card.getByText(ar ? 'تمت إضافة المنتج' : 'Produit ajouté').count(), 1);
      if (scenario.name === 'exact') await page.screenshot({ path: `${output}/selection-${mode}-${locale}-${width}.png` });
    }
    await context.close();
    page = null;
  }
  check('No uncaught browser errors', errors.length, 0);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  fs.writeFileSync(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
  console.log(`${checks.filter(item => item.pass).length}/${checks.length} product selection assertions passed`);
}
