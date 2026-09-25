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
const base = (title, suffix, extras = {}) => ({
  title, brand: null, model: null, description: '', image, images: [image], source: 'Exemple source',
  sourceUrl: `https://shop.example/product/${suffix}`, price: 20, currency: 'EUR', priceTnd: null,
  exchangeRate: null, sizes: [], colors: [], variantOptions: [], availability: 'unknown', ...extras,
});
const browser = await chromium.launch({ headless: true });
let page;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let releasePost;
  await page.route('**/api/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname + new URL(req.url()).search;
    if (req.method() === 'POST' && path === '/api/cart/items' && releasePost) {
      const release = releasePost;
      releasePost = null;
      await release.promise;
    }
    const headers = { ...req.headers() };
    delete headers.host;
    const response = await fetch(api + path, { method: req.method(), headers, body: ['POST', 'PUT', 'PATCH'].includes(req.method()) ? req.postData() : undefined });
    await route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/json', body: await response.text() });
  });
  await page.goto(origin + '/__verify/sonim');
  await page.waitForFunction(() => typeof window.showPurchaseProduct === 'function');
  await page.getByRole('button', { name: 'Open cart' }).click();
  await page.getByText('Votre panier est vide').waitFor();
  check('Empty cart has no order CTA', await page.getByRole('button', { name: 'Commander' }).count(), 0);
  await page.screenshot({ path: `${output}/empty-cart.png` });
  await page.getByRole('button', { name: 'Retour au produit' }).click();

  const shoe = base('Chaussures de running', 'shoe', {
    sizes: ['43', '42'],
    variantOptions: [
      { id: 'size-42', label: 'Pointure 42', size: '42', color: null, available: true, price: 22, currency: 'EUR', priceTnd: null },
      { id: 'size-43', label: 'Pointure 43', size: '43', color: null, available: true, price: 26, currency: 'EUR', priceTnd: null },
    ],
  });
  await page.evaluate(value => window.showPurchaseProduct(value), shoe);
  await page.locator('.ayrovix-product-gallery-stage').waitFor();
  const layout = await page.evaluate(() => {
    const header = document.querySelector('.flow-product > div');
    const media = document.querySelector('.flow-media > div');
    return { headerLeft: header.getBoundingClientRect().left, mediaLeft: media.getBoundingClientRect().left,
      mediaWidth: media.getBoundingClientRect().width, viewportWidth: innerWidth,
      thumbnails: document.querySelectorAll('.ayrovix-thumbnail-strip').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  check('Product stage and header align on mobile', layout.headerLeft, layout.mediaLeft);
  check('Product stage is large and integrated', layout.mediaWidth > 340);
  check('No separate thumbnail boxes', layout.thumbnails, 0);
  check('No horizontal overflow', layout.overflow, false);
  await page.screenshot({ path: `${output}/shoes-product.png` });
  check('Size is required before adding', await page.getByRole('button', { name: 'Ajouter au panier' }).isDisabled());
  await page.getByRole('button', { name: 'Votre taille' }).click();
  check('Only sourced sizes are present', await page.locator('[role="dialog"] button strong').allTextContents(), ['42','43']);
  await page.screenshot({ path: `${output}/shoe-sizes.png` });
  await page.locator('[role="dialog"] button').filter({ hasText: '42' }).click();
  await page.locator('[data-product-price-tnd]').waitFor();
  const price = Number(await page.locator('[data-product-price-tnd]').getAttribute('data-product-price-tnd'));
  const blockedPost = {}; blockedPost.promise = new Promise(resolve => { blockedPost.resolve = resolve; }); releasePost = blockedPost;
  await page.getByRole('button', { name: 'Ajouter au panier' }).click();
  await page.locator('.ay-cart-loading').waitFor();
  const loadingVisual = await page.locator('.ay-cart-loading').evaluate(spinner => ({
    dashed: getComputedStyle(spinner).borderTopStyle === 'dashed',
    animating: getComputedStyle(spinner).animationName === 'ay-cart-loading-spin',
    buttonOpacity: getComputedStyle(spinner.closest('button')).opacity,
    busy: spinner.closest('button').getAttribute('aria-busy'),
  }));
  check('Dashed rotating loader retains full-contrast CTA', loadingVisual, { dashed: true, animating: true, buttonOpacity: '1', busy: 'true' });
  check('Adding does not open the cart', await page.getByText('Mon panier').count(), 0);
  await page.screenshot({ path: `${output}/adding.png` });
  blockedPost.resolve();
  await page.getByText('Produit ajouté', { exact: true }).waitFor();
  check('Acknowledgment stays on product page', await page.getByText('Mon panier').count(), 0);
  check('Confirmed add cannot submit a duplicate', await page.getByRole('button', { name: 'Produit ajouté' }).getAttribute('aria-disabled'), 'true');
  await page.getByRole('button', { name: 'Ouvrir le panier' }).click();
  await page.getByRole('heading', { name: /Mon panier/ }).waitFor();
  const line = Number(await page.locator('[data-cart-line-tnd]').first().getAttribute('data-cart-line-tnd'));
  check('Product price is numerically identical to cart line', price, line);
  check('Deposit matches actual site policy', (await page.locator('summary').allTextContents()).some(text => text.includes('20%')));
  await page.screenshot({ path: `${output}/populated-cart.png` });
  await page.getByRole('button', { name: 'Commander' }).click();
  await page.getByText('Renseignez votre adresse').waitFor();
  check('Address step is connected', await page.locator('[data-checkout-address-step]').count(), 1);
  check('No unsupported pickup option', await page.getByText('Point relais').count(), 0);
  const addressHeader = await page.locator('[data-checkout-flow] .interface-app-header').evaluate(header => {
    const back = header.querySelector('button[aria-label="Revenir au panier"]');
    const title = header.querySelector('strong');
    return { backLeft: back?.getBoundingClientRect().left, titleLeft: title?.getBoundingClientRect().left };
  });
  check('Address back arrow leads title in French layout', addressHeader.backLeft < addressHeader.titleLeft);
  await page.screenshot({ path: `${output}/delivery-address.png` });
  await page.getByRole('button', { name: 'Revenir au panier' }).click();
  await page.getByRole('button', { name: 'Retour au produit' }).click();

  const categoryCases = [
    ['robe', base('Robe en coton', 'robe', { sizes: ['S','M','L'] }), 'Votre taille'],
    ['cosmetics', base('Sérum visage 30 ml', 'serum', { sizes: ['30 ml','50 ml'] }), 'Choisir une contenance'],
    ['makeup', base('Fond de teint 30 ml', 'makeup', { sizes: ['30 ml','50 ml'] }), 'Choisir une contenance'],
    ['perfume', base('Eau de parfum 50 ml', 'perfume', { sizes: ['50 ml','100 ml'] }), 'Choisir une contenance'],
    ['single-capacity', base('Crème hydratante 30 ml', 'cream'), null],
    ['phone', base('Smartphone Android', 'phone'), null],
    ['laptop', base('Laptop 14 pouces', 'laptop'), null],
    ['electronics', base('Écouteurs sans fil', 'headphones'), null],
    ['furniture', base('Canapé trois places', 'sofa'), null],
    ['no-variants', base('Objet générique', 'other'), null],
  ];
  for (const [name, product, selector] of categoryCases) {
    await page.evaluate(value => window.showPurchaseProduct(value), product);
    await page.getByRole('heading', { name: product.title }).waitFor();
    if (selector) {
      check(`${name}: correct source-backed selector`, await page.getByRole('button', { name: selector }).count(), 1);
      await page.getByRole('button', { name: selector }).click();
      const rows = await page.locator('[role="dialog"] button strong').allTextContents();
      check(`${name}: only source-backed choices appear`, rows, product.sizes);
      await page.locator('[role="dialog"] button').filter({ has: page.locator('strong').getByText(product.sizes[0], { exact: true }) }).click();
    } else check(`${name}: no apparel/beauty selectors`, await page.getByRole('button', { name: /Votre taille|Choisir une contenance/ }).count(), 0);
    if (name === 'single-capacity') check('Published capacity without invented variants', await page.getByText('30 ml', { exact: true }).count(), 1);
    check(`${name}: no fake stock`, await page.getByText('Il en reste 2').count(), 0);
    check(`${name}: no fabricated brand`, await page.getByText('AYROVI SELECTION').count(), 0);
    await page.locator('[data-product-price-tnd]').waitFor();
    const detailLine = Number(await page.locator('[data-product-price-tnd]').getAttribute('data-product-price-tnd'));
    await page.getByRole('button', { name: 'Ajouter au panier' }).click();
    await page.getByText('Produit ajouté', { exact: true }).waitFor();
    check(`${name}: addition never opens the cart`, await page.getByRole('heading', { name: /Mon panier/ }).count(), 0);
    await page.getByRole('button', { name: 'Ouvrir le panier' }).click();
    await page.getByRole('heading', { name: /Mon panier/ }).waitFor();
    const matchingLines = await page.locator('[data-cart-line-tnd]').evaluateAll((lines, title) =>
      lines.filter(line => line.closest('.border-b.border-line')?.querySelector('h4')?.textContent?.trim() === title)
        .map(line => Number(line.getAttribute('data-cart-line-tnd'))), product.title);
    check(`${name}: exact product quote equals its cart line`, matchingLines, [detailLine]);
    await page.getByRole('button', { name: 'Retour au produit' }).click();
  }
  // Two dimensions: no option is selected by position; choose a specific pair.
  const multi = base('Chaussures édition couleur', 'multi', { colors: ['Bleu', 'Rouge'], sizes: ['41', '42'],
    variantOptions: [
      { id: 'blue41', label: '41 bleu', size: '41', color: 'Bleu', available: true, price: 20, currency: 'EUR', priceTnd: null },
      { id: 'red41', label: '41 rouge', size: '41', color: 'Rouge', available: true, price: 24, currency: 'EUR', priceTnd: null },
      { id: 'red42', label: '42 rouge', size: '42', color: 'Rouge', available: false, price: 28, currency: 'EUR', priceTnd: null },
    ] });
  await page.evaluate(value => window.showPurchaseProduct(value), multi);
  await page.getByRole('button', { name: 'Votre taille' }).click();
  await page.locator('[role="dialog"] button').filter({hasText:'41'}).click();
  check('Multiple colors require explicit selection', await page.getByRole('button',{name:'Ajouter au panier'}).isDisabled());
  await page.getByRole('radio',{name:'Couleur Rouge'}).click();
  await page.locator('[data-product-price-tnd]').waitFor();
  const quoteRed = Number(await page.locator('[data-product-price-tnd]').getAttribute('data-product-price-tnd'));
  const matching = await fetch(api + '/api/public/pricing/cart-line',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:multi.title,sourcePrice:24,sourceCurrency:'EUR',quantity:1})}).then(r=>r.json());
  check('Selected price comes from exact variant',quoteRed,matching.data.lineTotalTND);
  await page.getByRole('button', { name: 'Ajouter au panier' }).click();
  await page.getByText('Produit ajouté', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ouvrir le panier' }).click();
  await page.getByRole('heading', { name: /Mon panier/ }).waitFor();
  const redLine = await page.locator('[data-cart-line-tnd]').evaluateAll((lines, title) =>
    lines.filter(line => line.closest('.border-b.border-line')?.querySelector('h4')?.textContent?.trim() === title)
      .map(line => Number(line.getAttribute('data-cart-line-tnd'))), multi.title);
  check('Selected color/size price equals its actual cart line', redLine, [quoteRed]);
  check('No page errors', errors.length, 0);
  writeFileSync(`${output}/checks.json`, JSON.stringify({checks, errors}, null, 2));
  await context.close();
  console.log(`${checks.length}/${checks.length} purchase-flow browser assertions passed`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png` });
  writeFileSync(`${output}/checks.json`, JSON.stringify({checks, error: String(error)}, null, 2));
  throw error;
} finally { await browser.close(); }
