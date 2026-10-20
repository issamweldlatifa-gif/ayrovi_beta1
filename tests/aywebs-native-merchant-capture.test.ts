import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { buildAyWebsVariantSelectionInjection } from '../apps/mobile/src/api/aywebs';

const MERCHANTS = [
  {
    id: 'shein',
    url: 'https://www.shein.com/Women-Solid-Shirt-p-382460229-cat-2030.html',
    price: '<span data-testid="product-intro__head-price">89,99 €</span>',
    stock: '<div data-testid="availability-status">In stock</div>',
    variants: '<div data-attribute-name="Size"><button class="selected" data-value="S">S</button><button data-value="M" disabled>M</button></div><div data-attribute-name="Color"><button class="selected" data-value="Navy">Navy</button><button data-value="Blue">Blue</button></div>',
  },
  {
    id: 'temu',
    url: 'https://www.temu.com/goods.html?goods_id=601099512340123',
    price: '<span data-testid="goods-price-current">89,99 €</span>',
    stock: '<div class="goods-status">In stock</div>',
    variants: '<fieldset><legend>Size</legend><button role="radio" aria-checked="true" data-attribute-value="S">S</button><button role="radio" aria-disabled="true" data-attribute-value="M">M</button></fieldset><fieldset><legend>Color</legend><button role="radio" aria-checked="true" data-attribute-value="Navy">Navy</button><button role="radio" data-attribute-value="Blue">Blue</button></fieldset>',
  },
  {
    id: 'aliexpress',
    url: 'https://www.aliexpress.com/item/1005006123456.html',
    price: '<span data-pl="product-price">89,99 €</span>',
    stock: '<div data-pl="quantity-available">In stock</div>',
    variants: '<div class="sku-property" data-attribute-name="Size"><div class="sku-property-name">Size</div><div class="sku-item selected" data-value="S">S</div><div class="sku-item disabled" aria-disabled="true" data-value="M">M</div></div><div class="sku-property" data-attribute-name="Color"><div class="sku-property-name">Color</div><div class="sku-item selected" data-value="Navy">Navy</div><div class="sku-item" data-value="Blue">Blue</div></div>',
  },
  {
    id: 'zalando',
    url: 'https://www.zalando.fr/nike-sportswear-club-tee-t-shirt-basic-black-ni121d0a2-q11.html',
    price: '<span data-testid="pdp-price">89,99 €</span>',
    stock: '<div class="availability-message">In stock</div>',
    variants: '<fieldset><legend>Size</legend><select name="size"><option value="S" selected>S</option><option value="M" disabled>M</option></select></fieldset><fieldset><legend>Color</legend><button type="button" aria-pressed="true" data-value="Navy">Navy</button><button type="button" aria-pressed="false" data-value="Blue">Blue</button></fieldset>',
  },
] as const;

type MerchantId = typeof MERCHANTS[number]['id'];

function merchantPage(
  id: MerchantId,
  url: string,
  priceMarkup: string,
  stockMarkup: string,
  variantMarkup: string,
  options: { stockStates?: string[]; currencies?: string[]; includeStockMarkup?: boolean; includeCartButton?: boolean; visiblePrice?: string } = {},
): string {
  const stockStates = options.stockStates || ['InStock', 'InStock'];
  const variants = [
    { sku: `${id.toUpperCase()}-S-NAVY`, size: 'S', color: 'Navy' },
    { sku: `${id.toUpperCase()}-M-BLUE`, size: 'M', color: 'Blue' },
  ].map((variant, index) => ({
    '@type': 'Product',
    ...variant,
    offers: {
      '@type': 'Offer',
      price: '89.99',
      priceCurrency: options.currencies?.[index] || 'EUR',
      availability: `https://schema.org/${stockStates[index] || stockStates[0]}`,
    },
  }));
  const product = {
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    name: 'Verified Trail Jacket',
    description: 'A lightweight trail jacket with a water-resistant shell.',
    productGroupID: `${id.toUpperCase()}-P001`,
    brand: { '@type': 'Brand', name: 'North Field' },
    image: ['https://cdn.example.test/trail-jacket-front.webp', 'https://cdn.example.test/trail-jacket-back.webp'],
    hasVariant: variants,
  };
  const currentPrice = options.visiblePrice || '89,99 €';
  return `<!doctype html><html lang="en"><head>
    <title>Verified Trail Jacket</title>
    <meta property="og:title" content="Verified Trail Jacket">
    <meta property="og:description" content="A lightweight trail jacket with a water-resistant shell.">
    <meta property="og:image" content="https://cdn.example.test/trail-jacket-front.webp">
    <meta property="product:price:amount" content="89.99">
    <meta property="product:price:currency" content="EUR">
    <link rel="canonical" href="${url}">
    <script type="application/ld+json">${JSON.stringify(product)}</script>
  </head><body><main><h1>Verified Trail Jacket</h1>
    ${priceMarkup.replace('89,99 €', currentPrice)}
    ${options.includeStockMarkup === false ? '' : stockMarkup}
    ${variantMarkup}
    ${options.includeCartButton === false ? '' : '<button type="button">Add to bag</button>'}
  </main></body></html>`;
}

function capture(url: string, html: string) {
  const dom = new JSDOM(html, { url });
  try {
    const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
    const payload = JSON.parse(String(evaluate(dom.window.document, dom.window.location, URL)));
    return { payload, validation: validateAyWebsCapturedPage(payload, url) };
  } finally {
    dom.window.close();
  }
}

describe('AYWEBs merchant-page capture for SHEIN, TEMU, AliExpress and Zalando', () => {
  it.each(MERCHANTS)('$id extracts the published price, currency, product id, gallery, stock and named dimensions', (merchant) => {
    const html = merchantPage(merchant.id, merchant.url, merchant.price, merchant.stock, merchant.variants);
    const { payload, validation } = capture(merchant.url, html);

    expect(validation.ok).toBe(true);
    expect(validation.price).toBe(89.99);
    expect(validation.currency).toBe('EUR');
    expect(validation.priceVerified).toBe(true);
    expect(validation.currencyVerified).toBe(true);
    expect(validation.availability).toBe('AVAILABLE');
    expect(validation.scraped?.externalId).toBe(merchant.id === 'shein' ? 'SH-382460229'
      : merchant.id === 'temu' ? 'TEMU-601099512340123'
        : merchant.id === 'aliexpress' ? 'AE-1005006123456' : 'ZALANDO-NI121D0A2-Q11');
    expect(validation.scraped?.title).toBe('Verified Trail Jacket');
    expect(validation.scraped?.brand).toBe('North Field');
    expect(validation.scraped?.description).toBe('A lightweight trail jacket with a water-resistant shell.');
    expect(validation.scraped?.images).toEqual(expect.arrayContaining([
      'https://cdn.example.test/trail-jacket-front.webp',
      'https://cdn.example.test/trail-jacket-back.webp',
    ]));
    expect(payload.priceCandidates.some((candidate: { source: string }) => candidate.source === 'dom')).toBe(true);
    expect(validation.variantGroups.map((group) => group.attribute)).toEqual(['size', 'color']);
    expect(validation.variantGroups.find((group) => group.attribute === 'size')?.values).toEqual(['S', 'M']);
    expect(validation.variantGroups.find((group) => group.attribute === 'color')?.values).toEqual(['Navy', 'Blue']);
    expect(validation.variantGroups.find((group) => group.attribute === 'size')?.valueStates).toContainEqual({ value: 'M', state: 'UNAVAILABLE' });
    expect(validation.selectedVariantAttributes).toEqual({ size: 'S', color: 'Navy' });
    expect(validation.scraped?.variants.details.filter((variant) => variant.size && variant.color)).toEqual([
      expect.objectContaining({ size: 'S', color: 'Navy', stock: true, price: 89.99 }),
    ]);
  });

  it('chooses the page ProductGroup over a related product emitted earlier in JSON-LD', () => {
    const merchant = MERCHANTS[0];
    const recommendation = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Recommended Backpack',
      sku: 'BAG-001',
      offers: { '@type': 'Offer', price: '19.99', priceCurrency: 'USD', availability: 'https://schema.org/OutOfStock' },
    };
    const html = merchantPage(merchant.id, merchant.url, merchant.price, merchant.stock, merchant.variants)
      .replace('<script type="application/ld+json">',
        `<script type="application/ld+json">${JSON.stringify(recommendation)}</script><script type="application/ld+json">`,
      );
    const { payload, validation } = capture(merchant.url, html);
    expect(payload.title).toBe('Verified Trail Jacket');
    expect(validation.ok).toBe(true);
    expect(validation.price).toBe(89.99);
    expect(validation.currency).toBe('EUR');
    expect(validation.availability).toBe('AVAILABLE');
    expect(validation.scraped?.externalId).toBe('SH-382460229');
  });

  it('reads native German stock wording and keeps conflict handling isolated from Amazon', () => {
    const merchant = MERCHANTS[3];
    const html = merchantPage(merchant.id, merchant.url, merchant.price, merchant.stock, merchant.variants);
    const { payload } = capture(merchant.url, html);

    const available = validateAyWebsCapturedPage({
      ...payload, availabilityText: 'Lieferbar', addToCartText: null,
    }, merchant.url);
    expect(available.availability).toBe('AVAILABLE');

    const unavailable = validateAyWebsCapturedPage({
      ...payload, availabilityText: 'Ausverkauft', addToCartText: null,
    }, merchant.url);
    expect(unavailable.availability).toBe('OUT_OF_STOCK');

    const limited = validateAyWebsCapturedPage({
      ...payload, availabilityText: 'Nur wenige verfügbar', addToCartText: null,
    }, merchant.url);
    expect(limited.availability).toBe('LOW_STOCK');

    const nativeConflict = validateAyWebsCapturedPage({
      ...payload, availabilityText: 'Ausverkauft', addToCartText: 'Add to bag',
    }, merchant.url);
    expect(nativeConflict.availability).toBe('UNKNOWN');
    expect(nativeConflict.availabilityReason).toBe('capture_stock_evidence_conflict');

    const amazonLegacy = validateAyWebsCapturedPage({
      ...payload,
      url: 'https://www.amazon.com/dp/B0D1XD1ZV3',
      canonicalUrl: null,
      availabilityText: 'Out of stock | In stock',
      addToCartText: null,
    }, 'https://www.amazon.com/dp/B0D1XD1ZV3');
    expect(amazonLegacy.availability).toBe('OUT_OF_STOCK');
  });

  it('does not guess USD from a bare dollar sign on international storefronts', () => {
    const merchant = MERCHANTS[2];
    const page = `<!doctype html><html><head>
      <meta property="product:price:amount" content="89.99">
    </head><body><main>
      <span data-pl="product-price">$89.99</span>
      <button type="button">Add to cart</button>
    </main></body></html>`;
    const { validation } = capture(merchant.url, page);
    expect(validation.price).toBe(89.99);
    expect(validation.currency).toBe('');
    expect(validation.currencyVerified).toBe(false);
  });

  it('reads an unambiguous published rupee symbol instead of leaving currency unknown', () => {
    const merchant = MERCHANTS[2];
    const page = `<!doctype html><html><head><meta property="product:price:amount" content="89.99"></head>
      <body><main><span data-pl="product-price">₹89.99</span></main></body></html>`;
    const { validation } = capture(merchant.url, page);
    expect(validation.price).toBe(89.99);
    expect(validation.currency).toBe('INR');
    expect(validation.currencyVerified).toBe(true);
  });

  it('leaves currency unknown when ProductGroup publishes contradictory ISO currencies', () => {
    const merchant = MERCHANTS[0];
    const html = merchantPage(merchant.id, merchant.url, merchant.price, merchant.stock, merchant.variants, {
      currencies: ['EUR', 'USD'],
    });
    const { payload, validation } = capture(merchant.url, html);
    expect(payload.currencyText).toContain('EUR USD');
    expect(validation.currency).toBe('');
    expect(validation.currencyVerified).toBe(false);
    expect(validation.scraped?.sourceCurrency).toBe('');
  });

  it('does not copy stock from the first ProductGroup variant when listed variants disagree', () => {
    const merchant = MERCHANTS[0];
    const html = merchantPage(merchant.id, merchant.url, merchant.price, merchant.stock, merchant.variants, {
      stockStates: ['InStock', 'OutOfStock'],
      includeStockMarkup: false,
      includeCartButton: false,
    });
    const { payload, validation } = capture(merchant.url, html);
    expect(payload.availabilityText).toContain('InStock');
    expect(payload.availabilityText).toContain('OutOfStock');
    expect(validation.availability).toBe('UNKNOWN');
    expect(validation.scraped?.availability).toBe('unknown');
  });

  it('keeps availability unknown when published stock messages conflict', () => {
    const merchant = MERCHANTS[0];
    const conflictMarkup = '<div data-testid="availability-status">In stock</div><div data-testid="availability-status">Out of stock</div>';
    const html = merchantPage(merchant.id, merchant.url, merchant.price, conflictMarkup, merchant.variants);
    const { payload, validation } = capture(merchant.url, html);
    expect(validation.availability).toBe('UNKNOWN');
    expect(validation.notes).toContain('availability_evidence_conflict');
  });

  it('rejects contradictory published prices rather than selecting one merchant reading', () => {
    const merchant = MERCHANTS[3];
    const html = merchantPage(merchant.id, merchant.url, merchant.price, merchant.stock, merchant.variants, {
      visiblePrice: '109,99 €',
    });
    const { validation } = capture(merchant.url, html);
    expect(validation.ok).toBe(false);
    expect(validation.rejection).toBe('AMBIGUOUS_PRICE');
  });

  it('selects an exact non-Amazon size and color in the WebView, then re-captures both selected values', async () => {
    const url = 'https://www.zalando.fr/nike-sportswear-club-tee-t-shirt-basic-black-ni121d0a2-q11.html';
    const page = `<!doctype html><html lang="en"><head>
      <meta property="product:price:amount" content="89.99">
      <meta property="product:price:currency" content="EUR">
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Product', name: 'Selection fixture',
        offers: { '@type': 'Offer', price: '89.99', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
      })}</script>
    </head><body><main>
      <fieldset><legend>Size</legend><select name="size"><option value="S">S</option><option value="M">M</option></select></fieldset>
      <fieldset><legend>Color</legend><button type="button" aria-pressed="false">Navy</button><button type="button" aria-pressed="false">Blue</button></fieldset>
      <button type="button">Add to bag</button>
    </main><script>
      document.querySelectorAll('fieldset button').forEach(function(button){button.addEventListener('click',function(){
        button.parentNode.querySelectorAll('button').forEach(function(other){other.setAttribute('aria-pressed',other===button?'true':'false');});
      });});
    </script></body></html>`;
    const dom = new JSDOM(page, { url, runScripts: 'outside-only' });
    const messages: Array<Record<string, any>> = [];
    (dom.window as any).ReactNativeWebView = { postMessage: (message: string) => messages.push(JSON.parse(message)) };
    dom.window.document.querySelectorAll('fieldset button').forEach((button) => {
      button.addEventListener('click', () => {
        button.parentElement?.querySelectorAll('button').forEach((other) => {
          other.setAttribute('aria-pressed', other === button ? 'true' : 'false');
        });
      });
    });
    const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
    const initialPayload = JSON.parse(String(evaluate(dom.window.document, dom.window.location, URL)));
    expect(initialPayload.variantGroups.map((group: { attribute: string }) => group.attribute)).toEqual(['size', 'color']);
    const injection = buildAyWebsVariantSelectionInjection(
      AYWEBS_CAPTURE_SCRIPT,
      'merchant-variant-selection',
      initialPayload.variantGroups,
      { size: 'M', color: 'Blue' },
    );

    try {
      dom.window.eval(injection);
      await new Promise((resolve) => setTimeout(resolve, 750));
      const message = messages.find((entry) => entry.requestId === 'merchant-variant-selection');
      expect(message?.type).toBe('aywebs_capture');
      const selectedPayload = JSON.parse(String(message?.payload || 'null'));
      expect(selectedPayload.selectedVariantAttributes).toEqual({ size: 'M', color: 'Blue' });
      const selected = validateAyWebsCapturedPage(selectedPayload, url);
      expect(selected.ok).toBe(true);
      expect(selected.selectedVariantAttributes).toEqual({ size: 'M', color: 'Blue' });
    } finally {
      dom.window.close();
    }
  });
});
