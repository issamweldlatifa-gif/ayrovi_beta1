import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

/* Exercise the real parser, history decoder, and current shared product screen. */
buildSync({ entryPoints: ['src/scraper/productPageParser.ts'], outfile: '.cache/variant-parser.cjs', bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
const { parseProductPageHtml } = createRequire(import.meta.url)(path.resolve('.cache/variant-parser.cjs'));
const output = 'screenshots/editorial/variant-availability';
fs.mkdirSync(output, { recursive: true });
const checks = [], errors = [];
const check = (name, actual, expected = true) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, pass, actual, expected });
  if (!pass) throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
function product(name, flags = {}, schema) {
  const title = `Robe ${name}`;
  const raw = { title, options: ['Size', 'Color'], variants: [{ id: 'variant-M-blue', option1: 'M', option2: 'Bleu', price: 27, ...flags }] };
  const html = `<head><script type="application/json">${JSON.stringify(raw)}</script><script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: title, offers: { price: 20, priceCurrency: 'EUR', availability: schema } })}</script></head>`;
  const parsed = parseProductPageHtml(html, 'https://example.org/product', 'generic');
  return {
    title: parsed.title, sourceUrl: 'https://example.org/product', source: 'Boutique source', brand: null, model: null,
    description: '', image: '', images: [], price: parsed.price, currency: parsed.currency,
    priceTnd: null, exchangeRate: null, colors: parsed.variants.colors, sizes: parsed.variants.sizes,
    availability: parsed.availability,
    variantOptions: parsed.variants.details.map(option => ({
      ...option, currency: parsed.currency, priceTnd: null, priceToken: 'TEST_VARIANT_QUOTE',
    })),
  };
}
const browser = await chromium.launch({ headless: true });
let page;
try {
  for (const locale of ['fr', 'ar']) for (const width of [320, 390]) {
    const ar = locale === 'ar', key = `${locale}/${width}`;
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    await context.addInitScript(language => localStorage.setItem('ayrovi.locale.v1', language), locale);
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/public/pricing/cart-line', route => {
      const source = route.request().postDataJSON();
      const lineTotalTND = source.sourcePrice === 27 ? 108 : source.sourcePrice === 20 ? 80 : null;
      return route.fulfill({ status: lineTotalTND == null ? 400 : 200, json: lineTotalTND == null
        ? { success: false, error: 'Test quote unavailable' }
        : { success: true, data: { lineTotalTND, originalLineTotalTND: null, promo: null, pricingVersion: 2 } } });
    });
    await page.goto(process.env.AYROVI_BASE_URL + '/__verify/sonim');
    await page.waitForFunction(() => typeof window.setVariantFixture === 'function');
    const card = page.locator('.s-product-page');
    const add = () => card.getByRole('button', { name: ar ? 'أضف إلى السلة' : 'Ajouter au panier', exact: true });
    const show = async (value, history = false) => {
      await page.evaluate(({ value, history }) => window.setVariantFixture(value, history), { value, history });
      await card.getByRole('heading', { name: value.title, exact: true }).waitFor();
    };
    const openSizes = async () => {
      await card.getByRole('button', { name: ar ? 'قياسك' : 'Votre taille', exact: true }).click();
      return page.locator('.s-drape[role="dialog"]').last();
    };
    const sizeOption = dialog => dialog.locator('.s-sizes .s-size').first();

    for (const [name, flag, schema] of [
      ['unknown', {}, undefined],
      ['negative', {}, 'https://schema.org/OutOfStock'],
      ['conflict', { available: true }, 'https://schema.org/OutOfStock'],
      ['limited', { available: true }, 'https://schema.org/LimitedAvailability'],
      ['positive', { available: true }, 'https://schema.org/InStock'],
    ]) {
      const value = product(`Stock ${name}`, flag, schema);
      await show(value);
      check(`${key}/${name}: current product page shows source availability`, await card.locator('.s-availability').count(), 1);
      await openSizes();
      const dialog = page.locator('.s-drape[role="dialog"]').last();
      const option = sizeOption(dialog);
      check(`${key}/${name}: source variant remains visible`, await option.count(), 1);
      const state = await option.getAttribute('data-state');
      if (state !== 'available') {
        check(`${key}/${name}: unconfirmed or unavailable size cannot be selected`, await option.isDisabled());
        await dialog.getByRole('button', { name: ar ? 'إغلاق' : 'Fermer' }).click();
        check(`${key}/${name}: unavailable evidence blocks add-to-bag`, await add().isDisabled());
        continue;
      }
      await option.click();
      await page.waitForFunction(() => {
        const button = document.querySelector('.s-product-page .s-buybar--product .s-cta');
        return button instanceof HTMLButtonElement && !button.disabled;
      });
      await add().click();
      await page.waitForFunction(() => window.variantTestOrders.length === 1);
      const selected = await page.evaluate(() => window.variantTestOrders[0]);
      check(`${key}/${name}: selected source size and color reach the host`, [selected.size, selected.color, selected.quantity], ['M', 'Bleu', 1]);
      check(`${key}/${name}: UI never invents stock counts`, await card.getByText('Il en reste 2').count(), 0);
    }

    for (const [name, available] of [
      ['false-string', 'false'], ['true-string', 'true'], ['missing', undefined], ['null', null],
      ['zero', 0], ['object', {}], ['array', []], ['known-false', false],
    ]) {
      const value = product(`History ${name}`, { available: true });
      value.availability = 'unknown';
      value.variantOptions[0].available = available;
      await show(value, true);
      const history = await page.evaluate(() => ({
        result: window.variantTestHistory,
        raw: JSON.parse(localStorage.getItem('ayrovi_assistant_conversations_v1_guest'))[0],
      }));
      check(`${key}/${name}: history keeps original message and quote`, [history.result.status, history.result.conversations[0].messages[0].text, history.result.conversations[0].selectedProduct.product.variantOptions[0].price], ['ready', 'PRESERVED_TEXT / نص محفوظ بالكامل', 27]);
      check(`${key}/${name}: malformed eligibility normalizes to non-selectable`, history.result.conversations[0].selectedProduct.product.variantOptions[0].available, false);
      check(`${key}/${name}: history read does not mutate its stored source`, JSON.stringify(history.raw.selectedProduct.product.variantOptions[0].available) === JSON.stringify(available));
      const dialog = await openSizes();
      check(`${key}/${name}: invalid variant remains disabled in the current size picker`, await sizeOption(dialog).isDisabled());
      await dialog.getByRole('button', { name: ar ? 'إغلاق' : 'Fermer' }).click();
      check(`${key}/${name}: invalid variant cannot enable purchase`, await add().isDisabled());
    }

    const sourced = product('Sourced availability', { available: true }, 'https://schema.org/InStock');
    sourced.variantOptions[0].availability = 'available';
    await show(sourced);
    const sourcedDialog = await openSizes();
    const sourcedSize = sizeOption(sourcedDialog);
    check(`${key}: explicit variant stock evidence is selectable`, await sourcedSize.isEnabled());
    await sourcedSize.click();
    await page.waitForFunction(() => {
      const button = document.querySelector('.s-product-page .s-buybar--product .s-cta');
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    await add().click();
    await page.waitForFunction(() => window.variantTestOrders.length === 1);
    const selected = await page.evaluate(() => window.variantTestOrders[0]);
    check(`${key}: sourced variant reaches the current order callback`, [selected.size, selected.color, selected.quantity], ['M', 'Bleu', 1]);
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
  console.log(`${checks.filter(item => item.pass).length}/${checks.length} variant availability assertions passed`);
}
