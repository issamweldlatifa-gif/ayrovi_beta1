import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// Exercise the real merchant parser and shared product UI, without a network
// dependency or a second implementation of the site's pricing engine.
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
    const card = page.locator('.flow-product');
    const add = () => card.getByRole('button', { name: ar ? 'زيد للسلة' : 'Ajouter au panier' });
    const show = async (value, history = false) => {
      await page.evaluate(({ value, history }) => window.setVariantFixture(value, history), { value, history });
      await card.getByRole('heading', { name: value.title, exact: true }).waitFor();
    };
    const openSizes = async () => {
      await card.getByRole('button', { name: ar ? 'اختر مقاسك' : 'Votre taille' }).click();
      return page.locator('[role="dialog"]').last();
    };
    const choose = async () => {
      await openSizes();
      await page.locator('[role="dialog"] button').filter({ has: page.locator('strong:text-is("M")') }).last().click();
      const color = card.getByRole('radio', { name: ar ? 'اللون Bleu' : 'Couleur Bleu' });
      if (await color.count()) await color.click(); // A single sourced color is already selected.
    };
    const order = async () => {
      await add().click();
      await page.waitForFunction(() => window.variantTestOrders.length === 1);
      return page.evaluate(() => window.variantTestOrders[0]);
    };

    for (const [name, flag, schema, label] of [
      ['unknown', {}, undefined, ar ? 'التوفر يحتاج إلى تأكيد' : 'Disponibilité à confirmer'],
      ['negative', {}, 'https://schema.org/OutOfStock', ar ? 'غير متوفر' : 'Rupture signalée'],
      ['conflict', { available: true }, 'https://schema.org/OutOfStock', ar ? 'التوفر يحتاج إلى تأكيد' : 'Disponibilité à confirmer'],
      ['limited', { available: true }, 'https://schema.org/LimitedAvailability', ar ? 'مخزون محدود' : 'Stock limité'],
      ['positive', { available: true }, 'https://schema.org/InStock', ar ? 'متوفر' : 'Disponible'],
    ]) {
      const value = product(`Stock ${name}`, flag, schema);
      await show(value);
      check(`${key}/${name}: parser evidence reaches the availability badge`, (await card.getByText(label, { exact: true }).count()) > 0);
      if (value.availability === 'out_of_stock') {
        check(`${key}/${name}: known out-of-stock product cannot be added`, await add().isDisabled());
        continue;
      }
      await choose();
      const selected = await order();
      check(`${key}/${name}: source variant and manual choices survive`, [selected.size, selected.color, selected.option?.id, selected.option?.price], ['M', 'Bleu', 'variant-M-blue', 27]);
      check(`${key}/${name}: no stock count was invented`, await card.getByText('Il en reste 2').count(), 0);
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
      check(`${key}/${name}: history keeps message and priced variant`, [history.result.status, history.result.conversations[0].messages[0].text, history.result.conversations[0].selectedProduct.product.variantOptions[0].price], ['ready', 'PRESERVED_TEXT / نص محفوظ بالكامل', 27]);
      check(`${key}/${name}: invalid availability normalizes to non-selectable`, history.result.conversations[0].selectedProduct.product.variantOptions[0].available, false);
      check(`${key}/${name}: reading history never mutates the stored source`, JSON.stringify(history.raw.selectedProduct.product.variantOptions[0].available) === JSON.stringify(available));
      const dialog = await openSizes();
      check(`${key}/${name}: invalid variant cannot be selected in the size drawer`, await dialog.locator('button').filter({ has: page.locator('strong:text-is("M")') }).isDisabled());
      await dialog.getByRole('button', { name: ar ? 'إغلاق' : 'Fermer' }).click();
      check(`${key}/${name}: no cart action without a sourced selectable size`, await add().isDisabled());
    }
    const valid = product('Known eligible history', { available: true });
    valid.availability = 'unknown';
    await show(valid, true); await choose();
    check(`${key}: boolean eligibility survives history`, (await order()).option?.priceToken, 'TEST_VARIANT_QUOTE');

    const malformed = product('Fresh malformed payload', { available: true });
    malformed.variantOptions[0].available = 'false';
    malformed.availability = 'unknown';
    await show(malformed); await choose();
    check(`${key}: malformed live evidence cannot select a variant-specific quote`, (await order()).option, null);
    await page.evaluate(() => document.querySelectorAll('details').forEach(details => { details.open = true; }));
    const notice = card.locator('[data-variant-stock-notice]');
    check(`${key}: shared UI explains selection versus stock`, await notice.innerText(), ar
      ? 'اختيار المقاس أو اللون لا يؤكّد توفره لدى المتجر.'
      : 'Le choix d’une taille ou couleur ne confirme pas son stock.');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await notice.scrollIntoViewIfNeeded();
    const layout = await notice.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, height: el.clientHeight, content: el.scrollHeight,
      docWidth: document.documentElement.clientWidth, docScroll: document.documentElement.scrollWidth }));
    check(`${key}: stock explanation remains complete at 200% text`, layout.scroll <= layout.width + 1 && layout.content <= layout.height + 1 && layout.docScroll <= layout.docWidth + 1);
    const quantity = card.getByRole('spinbutton', { name: ar ? 'الكمية' : 'Quantité', exact: true });
    await quantity.fill('99');
    const control = await quantity.evaluate(el => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const style = getComputedStyle(el);
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return { width: el.getBoundingClientRect().width, textWidth: ctx.measureText(el.value).width,
        height: el.getBoundingClientRect().height, buttons: [...el.parentElement.querySelectorAll('button')].map(button => button.getBoundingClientRect().width) };
    });
    check(`${key}: two-digit quantity and step controls remain accessible`, control.width >= Math.max(44, control.textWidth + 24) && control.height >= 44 && control.buttons.every(value => value >= 44));
    await card.getByRole('button', { name: ar ? 'تقليل الكمية' : 'Diminuer la quantité', exact: true }).click();
    check(`${key}: decrement preserves actual quantity`, await quantity.inputValue(), '98');
    await card.getByRole('button', { name: ar ? 'زيادة الكمية' : 'Augmenter la quantité', exact: true }).click();
    check(`${key}: increment stops at 99`, [await quantity.inputValue(), await card.getByRole('button', { name: ar ? 'زيادة الكمية' : 'Augmenter la quantité', exact: true }).isDisabled()], ['99', true]);
    await page.screenshot({ path: `${output}/variant-stock-${locale}-${width}.png` });
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
