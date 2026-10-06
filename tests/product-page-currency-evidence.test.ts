import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { readAmazonExtras } from '../src/scraper/amazonPage';
import { parseProductPageHtml } from '../src/scraper/productPageParser';

describe('product page currency evidence', () => {
  it('accepts an explicit ISO currency code from structured product data', () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">{"@type":"Product","name":"Widget","offers":{"price":"49.99","priceCurrency":"CAD"}}</script>
    </head><body><h1>Widget</h1></body></html>`;

    expect(parseProductPageHtml(html, 'https://shop.example.test/widget', 'generic')).toMatchObject({
      price: 49.99,
      currency: 'CAD',
      currencyVerified: true,
      priceSource: 'json_ld',
    });
  });

  it('does not treat a bare dollar sign as proof of USD', () => {
    const html = '<!doctype html><html><head><title>Widget</title></head><body><h1>Widget</h1><p>Price: $49.99</p></body></html>';
    const parsed = parseProductPageHtml(html, 'https://shop.example.test/widget', 'generic');

    expect(parsed).toMatchObject({
      price: 49.99,
      currency: '',
      currencyVerified: false,
      priceSource: 'context_regex',
    });
  });

  it('accepts an unambiguous euro symbol in contextual price text', () => {
    const html = '<!doctype html><html><head><title>Widget</title></head><body><h1>Widget</h1><p>Price: 49.99 €</p></body></html>';

    expect(parseProductPageHtml(html, 'https://shop.example.test/widget', 'generic')).toMatchObject({
      price: 49.99,
      currency: 'EUR',
      currencyVerified: true,
      priceSource: 'context_regex',
    });
  });

  it('Amazon trusts an explicit currencyCode field but not a bare price symbol', () => {
    const explicitHtml = '<html><body><input type="hidden" name="items[0.base][customerVisiblePrice][currencyCode]" value="USD"></body></html>';
    const explicitDocument = new JSDOM(explicitHtml).window.document;
    expect(readAmazonExtras(explicitDocument, explicitHtml, '$109.00')).toMatchObject({
      currency: 'USD',
      currencyVerified: true,
    });

    const symbolOnlyHtml = '<html><body></body></html>';
    const symbolOnlyDocument = new JSDOM(symbolOnlyHtml).window.document;
    expect(readAmazonExtras(symbolOnlyDocument, symbolOnlyHtml, '$109.00')).toMatchObject({
      currency: '$',
      currencyVerified: false,
    });

    const amazonPage = '<!doctype html><html><body><h1 id="productTitle">Widget</h1><span id="apex-pricetopay-accessibility-label">$109.00</span></body></html>';
    expect(parseProductPageHtml(amazonPage, 'https://www.amazon.com/dp/B000000000', 'amazon')).toMatchObject({
      price: 109,
      currency: '',
      currencyVerified: false,
    });

    // When both appear, the written ISO code must win over the dollar symbol.
    const canadianPage = '<!doctype html><html><body><h1 id="productTitle">Widget</h1><span id="apex-pricetopay-accessibility-label">CAD $109.00</span></body></html>';
    expect(parseProductPageHtml(canadianPage, 'https://www.amazon.com/dp/B000000000', 'amazon')).toMatchObject({
      price: 109,
      currency: 'CAD',
      currencyVerified: true,
    });
  });
});
