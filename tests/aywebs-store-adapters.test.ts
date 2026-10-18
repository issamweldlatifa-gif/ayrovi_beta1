import { describe, expect, it, vi } from 'vitest';
import type { SmartLinkScraper } from '../src/scraper/scraper';
import { detectMerchantStore } from '../src/scraper/merchantDomains';
import { AYWEBS_ADAPTER_DESCRIPTORS, createAyWebsAdapterById, resolveAyWebsAdapter } from '../src/aywebs/adapters/registry';
import { detectAyWebsStore } from '../shared/aywebsStores';
import { parseProductPageHtml } from '../src/scraper/productPageParser';

const scraper = {} as SmartLinkScraper;

const MERCHANT_CASES = [
  {
    id: 'shein',
    product: 'https://www.shein.com/Women-Solid-Shirt-p-382460229-cat-2030.html',
    search: 'https://www.shein.com/pdsearch/dress/',
  },
  {
    id: 'temu',
    product: 'https://www.temu.com/goods.html?goods_id=601099512340123',
    search: 'https://www.temu.com/search_result.html?search_key=shirt',
  },
  {
    id: 'zalando',
    product: 'https://www.zalando.fr/nike-sportswear-club-tee-t-shirt-basic-black-ni121d0a2-q11.html',
    search: 'https://www.zalando.fr/catalog/?q=shirt',
  },
  {
    id: 'aliexpress',
    product: 'https://www.aliexpress.com/item/1005006123456.html',
    search: 'https://www.aliexpress.com/wholesale?SearchText=shirt',
  },
] as const;

type MerchantId = typeof MERCHANT_CASES[number]['id'];

const CURRENT_PRICE_MARKUP: Record<MerchantId, string> = {
  shein: '<span data-testid="product-intro__head-price">89,99 €</span>',
  temu: '<span data-testid="goods-price-current">89,99 €</span>',
  aliexpress: '<span data-pl="product-price">89,99 €</span>',
  zalando: '<span data-testid="pdp-price">89,99 €</span>',
};

function merchantProductHtml(
  id: MerchantId,
  url: string,
  options: { prices?: number[]; stocks?: string[]; currencies?: string[]; metaPrice?: string; domPrice?: string; availabilityMarkup?: string } = {},
): string {
  const prices = options.prices || [89.99, 89.99];
  const stocks = options.stocks || ['InStock', 'InStock'];
  const variants = [
    { sku: `${id.toUpperCase()}-S-NAVY`, size: 'S', color: 'Navy' },
    { sku: `${id.toUpperCase()}-M-ROSE`, size: 'M', color: 'Rose' },
  ].map((variant, index) => ({
    '@type': 'Product',
    ...variant,
    offers: {
      '@type': 'Offer',
      price: (prices[index] ?? prices[0]).toFixed(2),
      priceCurrency: options.currencies?.[index] || 'EUR',
      availability: `https://schema.org/${stocks[index] || stocks[0]}`,
    },
  }));
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    name: 'Verified Trail Jacket',
    description: 'A lightweight trail jacket with a water-resistant shell.',
    productGroupID: `${id.toUpperCase()}-P001`,
    brand: { '@type': 'Brand', name: 'North Field' },
    image: ['https://cdn.example.test/trail-jacket-front.webp', 'https://cdn.example.test/trail-jacket-back.webp'],
    hasVariant: variants,
  };
  const metaPrice = options.metaPrice ?? '89.99';
  const domPrice = options.domPrice ?? '89,99 €';
  const availabilityMarkup = options.availabilityMarkup === undefined
    ? '<div data-testid="availability-message">In stock</div>'
    : options.availabilityMarkup;
  return `<!doctype html><html lang="en"><head>
    <title>Verified Trail Jacket | ${id}</title>
    <meta property="og:title" content="Verified Trail Jacket">
    <meta name="description" content="A lightweight trail jacket with a water-resistant shell.">
    <meta property="og:image" content="https://cdn.example.test/trail-jacket-front.webp">
    <meta property="product:price:amount" content="${metaPrice}">
    <meta property="product:price:currency" content="EUR">
    <link rel="canonical" href="${url}">
    <script type="application/ld+json">${JSON.stringify(data)}</script>
  </head><body><main><h1>Verified Trail Jacket</h1>
    <span data-current-price>${domPrice}</span>
    ${CURRENT_PRICE_MARKUP[id].replace('89,99 €', domPrice)}
    ${availabilityMarkup}
    <img src="https://cdn.example.test/trail-jacket-back.webp">
  </main></body></html>`;
}

describe('AYWEBs merchant adapters', () => {
  it.each(MERCHANT_CASES)('$id resolves registered product and search pages', ({ id, product, search }) => {
    const adapter = createAyWebsAdapterById(id, scraper);
    expect(adapter.id).toBe(id);
    expect(adapter.canHandle(product)).toBe(true);
    expect(adapter.classifyPage(product)).toMatchObject({
      pageType: 'PRODUCT', storeId: id, isProductPage: true,
    });
    expect(adapter.classifyPage(search)).toMatchObject({
      pageType: 'SEARCH', storeId: id, isProductPage: false,
    });
    expect(detectAyWebsStore(product)?.id).toBe(id);
    expect(detectMerchantStore(product)).toBe(id);
    expect(AYWEBS_ADAPTER_DESCRIPTORS.find((descriptor) => descriptor.id === id)).toMatchObject({
      implemented: true,
      purchaseMode: 'MANUAL_REVIEW',
    });
  });

  it('does not merge a larger related-product variant tree into the current merchant product', () => {
    const { product } = MERCHANT_CASES[0];
    const mainProduct = {
      title: 'Verified Trail Jacket',
      options: [{ name: 'Size' }, { name: 'Color' }],
      variants: [
        { id: 'main-s', sku: 'SHEIN-S-NAVY', option1: 'S', option2: 'Navy', price: '89.99' },
        { id: 'main-m', sku: 'SHEIN-M-ROSE', option1: 'M', option2: 'Rose', price: '89.99' },
      ],
    };
    const relatedProduct = {
      title: 'Recommended Backpack',
      options: [{ name: 'Size' }],
      variants: ['XL', 'XXL', 'XXXL', 'XXXXL'].map((size) => ({ id: `bag-${size}`, option1: size, price: '49.99' })),
    };
    const html = merchantProductHtml('shein', product).replace('</head>',
      `<script type="application/json">${JSON.stringify(mainProduct)}</script>
       <script type="application/json">${JSON.stringify(relatedProduct)}</script></head>`,
    );
    const parsed = parseProductPageHtml(html, product, 'shein');
    expect(parsed.variants.sizes).toEqual(expect.arrayContaining(['S', 'M']));
    expect(parsed.variants.sizes).not.toContain('XL');
  });

  it('selects the current ProductGroup instead of an earlier related-product JSON-LD node', () => {
    const { product } = MERCHANT_CASES[0];
    const recommendation = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Recommended Backpack',
      sku: 'BAG-001',
      offers: { '@type': 'Offer', price: '19.99', priceCurrency: 'USD', availability: 'https://schema.org/OutOfStock' },
    };
    const html = merchantProductHtml('shein', product).replace('<script type="application/ld+json">',
      `<script type="application/ld+json">${JSON.stringify(recommendation)}</script><script type="application/ld+json">`,
    );
    const parsed = parseProductPageHtml(html, product, 'shein');
    expect(parsed.price).toBe(89.99);
    expect(parsed.currency).toBe('EUR');
    expect(parsed.availability).toBe('in_stock');
    expect(parsed.externalId).toBe('SHEIN-P001');
  });

  it('does not infer product stock from unlinked embedded variant flags', () => {
    const { product } = MERCHANT_CASES[0];
    const embeddedRecommendation = {
      title: 'Verified Trail Jacket',
      variants: [{ available: false }, { available: false }],
    };
    const html = merchantProductHtml('shein', product).replace('</head>',
      `<script type="application/json">${JSON.stringify(embeddedRecommendation)}</script></head>`,
    );
    expect(parseProductPageHtml(html, product, 'shein').availability).toBe('in_stock');
  });

  it('does not override conflicting ProductGroup stock offers with a generic in-stock marker', () => {
    const { product } = MERCHANT_CASES[0];
    const html = merchantProductHtml('shein', product, {
      stocks: ['InStock', 'OutOfStock'],
      availabilityMarkup: '<div data-testid="availability-message">In stock</div>',
    });
    expect(parseProductPageHtml(html, product, 'shein').availability).toBe('unknown');
  });

  it('reads a published German limited-stock message from the product page', () => {
    const { product } = MERCHANT_CASES[2];
    const html = merchantProductHtml('zalando', product, {
      stocks: ['LimitedAvailability', 'LimitedAvailability'],
      availabilityMarkup: '<div class="availability-message">Nur wenige verfügbar</div>',
    });
    const parsed = parseProductPageHtml(html, product, 'zalando');
    expect(parsed.availability).toBe('limited');
  });

  it('uses published Zalando product data without inferring a price from its URL', () => {
    const html = `<!doctype html><html lang="fr"><head>
      <meta property="og:title" content="Sneakers de course | Zalando">
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Sneakers de course","sku":"NI121D0A2-Q11","offers":{"@type":"Offer","price":"99.95","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}
      </script>
    </head><body><h1>Sneakers de course</h1></body></html>`;
    const parsed = parseProductPageHtml(
      html,
      'https://www.zalando.fr/nike-sportswear-club-tee-t-shirt-basic-black-ni121d0a2-q11.html',
      'zalando',
    );
    expect(parsed.title).toBe('Sneakers de course');
    expect(parsed.price).toBe(99.95);
    expect(parsed.currency).toBe('EUR');
    expect(parsed.currencyVerified).toBe(true);
    expect(parsed.availability).toBe('in_stock');
  });

  it.each(MERCHANT_CASES)('$id parses the published price, identity, images, stock and only listed variants', ({ id, product }) => {
    const parsed = parseProductPageHtml(merchantProductHtml(id, product), product, id);
    expect(parsed.title).toBe('Verified Trail Jacket');
    expect(parsed.description).toBe('A lightweight trail jacket with a water-resistant shell.');
    expect(parsed.brand).toBe('North Field');
    expect(parsed.externalId).toBe(`${id.toUpperCase()}-P001`);
    expect(parsed.sku).toBe(`${id.toUpperCase()}-S-NAVY`);
    expect(parsed.price).toBe(89.99);
    expect(parsed.currency).toBe('EUR');
    expect(parsed.currencyVerified).toBe(true);
    expect(parsed.availability).toBe('in_stock');
    expect(parsed.images).toContain('https://cdn.example.test/trail-jacket-front.webp');
    expect(parsed.images).toContain('https://cdn.example.test/trail-jacket-back.webp');
    expect(parsed.variants.sizes).toEqual(expect.arrayContaining(['S', 'M']));
    expect(parsed.variants.colors).toEqual(expect.arrayContaining(['Navy', 'Rose']));
    const listedPairs = parsed.variants.details
      .filter((variant) => variant.size && variant.color)
      .map((variant) => `${variant.size}|${variant.color}`);
    expect(listedPairs).toEqual(['S|Navy', 'M|Rose']); // no Cartesian combinations
    expect(parsed.variants.details.filter((variant) => variant.size && variant.color).every((variant) => (
      variant.stock === true && variant.price === 89.99
    ))).toBe(true);
  });

  it.each(MERCHANT_CASES)('$id uses the displayed/metadata price, not the cheapest unselected ProductGroup offer', ({ id, product }) => {
    const html = merchantProductHtml(id, product, {
      prices: [99.99, 89.99],
      metaPrice: '99.99',
      domPrice: '99,99 €',
      availabilityMarkup: '',
    });
    const parsed = parseProductPageHtml(html, product, id);
    expect(parsed.price).toBe(99.99);
    expect(parsed.currency).toBe('EUR');
    expect(parsed.priceSource).toBe('meta');
  });

  it('does not turn a bare dollar sign into a guessed USD currency', () => {
    const url = 'https://www.aliexpress.com/item/1005006123456.html';
    const html = '<!doctype html><html><body><h1>Product</h1><span data-pl="product-price">$89.99</span></body></html>';
    const parsed = parseProductPageHtml(html, url, 'aliexpress');
    expect(parsed.price).toBe(89.99);
    expect(parsed.currency).toBe('');
    expect(parsed.currencyVerified).toBe(false);
  });

  it('parses an unambiguous rupee symbol as published INR', () => {
    const url = 'https://www.aliexpress.com/item/1005006123456.html';
    const html = '<!doctype html><html><body><span data-pl="product-price">₹89.99</span></body></html>';
    const parsed = parseProductPageHtml(html, url, 'aliexpress');
    expect(parsed.price).toBe(89.99);
    expect(parsed.currency).toBe('INR');
    expect(parsed.currencyVerified).toBe(true);
  });

  it('rejects a DOM currency that contradicts the page-published ISO code', () => {
    const { product } = MERCHANT_CASES[0];
    const html = merchantProductHtml('shein', product, { domPrice: '$89.99' });
    const parsed = parseProductPageHtml(html, product, 'shein');
    expect(parsed.price).toBe(0);
    expect(parsed.currency).toBe('');
    expect(parsed.currencyVerified).toBe(false);
  });

  it('does not fall back to JSON-LD when current-price selectors disagree', () => {
    const { product } = MERCHANT_CASES[0];
    const markup = CURRENT_PRICE_MARKUP.shein;
    const html = merchantProductHtml('shein', product).replace(
      markup,
      `${markup}<span data-testid="product-intro__head-price">99,99 €</span>`,
    );
    const parsed = parseProductPageHtml(html, product, 'shein');
    expect(parsed.price).toBe(0);
    expect(parsed.priceSource).toBe('none');
  });

  it('rejects conflicting ProductGroup currencies rather than borrowing the first variant currency', () => {
    const { product } = MERCHANT_CASES[0];
    const html = merchantProductHtml('shein', product, { currencies: ['EUR', 'USD'] });
    const parsed = parseProductPageHtml(html, product, 'shein');
    expect(parsed.price).toBe(0);
    expect(parsed.currency).toBe('');
    expect(parsed.currencyVerified).toBe(false);
  });

  it('does not flatten mixed per-variant stock into a product-wide in-stock claim', () => {
    const { product } = MERCHANT_CASES[0];
    const html = merchantProductHtml('shein', product, {
      stocks: ['InStock', 'OutOfStock'],
      availabilityMarkup: '',
    });
    const parsed = parseProductPageHtml(html, product, 'shein');
    expect(parsed.availability).toBe('unknown');
    expect(parsed.variants.details.find((variant) => variant.size === 'S')?.stock).toBe(true);
    expect(parsed.variants.details.find((variant) => variant.size === 'M')?.stock).toBe(false);
  });

  it.each(MERCHANT_CASES)('$id capture delegates to page extraction and only falls back to its URL product id', async ({ id, product }) => {
    const sourceProduct = {
      id: 'scraped-fixture',
      store: id,
      storeName: id,
      url: product,
      externalId: 'UNRESOLVED-fixture',
      title: 'Published merchant title',
      description: '',
      images: ['https://cdn.example.test/product.webp'],
      mainImage: 'https://cdn.example.test/product.webp',
      sourcePrice: 89.99,
      sourceCurrency: 'EUR',
      convertedPriceTND: 0,
      estimatedShippingTND: 0,
      serviceFeeTND: 0,
      totalPriceTND: 0,
      variants: { sizes: ['S'], colors: ['Navy'], details: [] },
      availability: 'in_stock',
      priceVerified: true,
      currencyVerified: true,
      verificationProvider: 'direct',
      verificationMethod: 'json_ld',
      verificationFailureCode: null,
      scrapedAt: new Date().toISOString(),
    };
    const mockScraper = {
      cleanPastedUrl: (value: string) => value,
      scrapeProduct: vi.fn(async () => ({ ...sourceProduct } as any)),
    } as unknown as SmartLinkScraper;
    const adapter = createAyWebsAdapterById(id, mockScraper);
    const captured = await adapter.capture(product);
    const expectedId = id === 'shein' ? 'SH-382460229'
      : id === 'temu' ? 'TEMU-601099512340123'
        : id === 'aliexpress' ? 'AE-1005006123456' : 'ZALANDO-NI121D0A2-Q11';

    expect(mockScraper.scrapeProduct).toHaveBeenCalledTimes(1);
    expect(captured.title).toBe('Published merchant title');
    expect(captured.sourcePrice).toBe(89.99);
    expect(captured.sourceCurrency).toBe('EUR');
    expect(captured.externalId).toBe(expectedId);
  });

  it('does not route Zalando lookalike hosts to the registered adapter', () => {
    const url = 'https://www.zalando.fr.evil.example/nike-sportswear-club-black-ni121d0a2-q11.html';
    const resolved = resolveAyWebsAdapter(url, scraper);
    expect(detectAyWebsStore(url)).toBeNull();
    expect(detectMerchantStore(url)).toBe('generic');
    expect(resolved.registered).toBe(false);
    expect(resolved.adapter.id).toBe('generic');
  });
});
