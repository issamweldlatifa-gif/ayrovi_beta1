import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';

const URL = 'https://www.amazon.com/dp/B0PARENT01';
const REAL_FIXTURE = readFileSync(join(__dirname, 'fixtures/aywebs/real-amazon-de-desktop-2026-10-06.html'), 'utf8');

function capture(html: string, url = URL) {
  const dom = new JSDOM(html, { url });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  return JSON.parse(String(evaluate(dom.window.document, dom.window.location, globalThis.URL)));
}

const PRODUCT = `<!doctype html><html lang="en"><head><title>Example Amazon product</title></head><body>
  <div id="dp-container">
    <input id="ASIN" name="ASIN" value="B0CHILD001" />
    <span id="apex-pricetopay-accessibility-label">$49.99</span>
    <div id="availability">In Stock</div>
    <div id="twister">
      <div id="variation_color_name">
        <span class="selection">Black</span>
        <ul>
          <li class="swatchSelect" data-asin="B0CHILD001"><img alt="Black" /></li>
          <li class="swatchUnavailable" data-asin="B0CHILD002"><img alt="Green" /></li>
        </ul>
      </div>
      <div id="variation_size_name">
        <span class="selection">S</span>
        <ul>
          <li class="swatchSelect" data-asin="B0CHILD001"><span>S</span></li>
          <li class="swatchAvailable" data-asin="B0CHILD002"><span>M</span></li>
        </ul>
      </div>
    </div>
    <script>
      var variationValues = {"color_name":["Black","Green"],"size_name":["S","M"]};
      var dimensionValuesDisplayData = {
        "B0CHILD001":["Black","S"],
        "B0CHILD002":["Green","M"]
      };
    </script>
  </div>
</body></html>`;

function withBody(body: string, head = ''): string {
  return `<!doctype html><html lang="en"><head>${head}<title>Amazon fixture</title></head><body>${body}</body></html>`;
}

describe('Amazon Reader V2 capture evidence', () => {
  it('extracts parent ASIN, selected child ASIN, dimensions, stock evidence and selected price evidence', () => {
    const payload = capture(PRODUCT);

    expect(payload.amazon).toMatchObject({
      readerVersion: 2,
      pageAsin: 'B0PARENT01',
      selectedAsin: 'B0CHILD001',
      selectedPriceEvidence: [{ text: '$49.99', source: 'dom' }],
    });
    expect(payload.amazon.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'color', value: 'Black', asin: 'B0CHILD001', selected: true }),
      expect.objectContaining({ dimension: 'color', value: 'Green', asin: 'B0CHILD002', availabilityEvidence: 'unavailable' }),
      expect.objectContaining({ dimension: 'size', value: 'S', asin: 'B0CHILD001' }),
      expect.objectContaining({ dimension: 'size', value: 'M', asin: 'B0CHILD002' }),
    ]));
    expect(payload.amazon.variants).toHaveLength(2);
    expect(payload.amazon.variants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        asin: 'B0CHILD001', selected: true,
        dimensions: expect.arrayContaining([{ name: 'color', value: 'Black' }, { name: 'size', value: 'S' }]),
      }),
      expect.objectContaining({
        asin: 'B0CHILD002', selected: false,
        dimensions: expect.arrayContaining([{ name: 'color', value: 'Green' }, { name: 'size', value: 'M' }]),
      }),
    ]));
    expect(JSON.stringify(payload.amazon.variants)).not.toContain('Black","value":"M');
  });

  it('does not invent an ASIN or a variant combination when only labels are visible', () => {
    const html = withBody(`<div id="dp-container"><div id="twister">
      <div id="variation_color_name"><ul><li class="swatchAvailable"><img alt="Black" /></li></ul></div>
      <div id="variation_size_name"><select><option selected>S</option><option>M</option></select></div>
    </div></div>`);
    const payload = capture(html);

    expect(payload.amazon.pageAsin).toBe('B0PARENT01');
    expect(payload.amazon.selectedAsin).toBeNull();
    expect(payload.amazon.options.length).toBeGreaterThan(0);
    expect(payload.amazon.variants).toEqual([]);
    expect(payload.amazon.selectedPriceEvidence).toEqual([]);
  });

  it('extracts the ASIN from supported product URL forms', () => {
    const cases = [
      ['https://www.amazon.com/dp/B012345678', 'B012345678'],
      ['https://www.amazon.co.jp/gp/product/B012345678', 'B012345678'],
      ['https://www.amazon.de/product/B012345678', 'B012345678'],
    ];
    for (const [url, expected] of cases) {
      const payload = capture(withBody('<div id="dp-container"></div>'), url);
      expect(payload.amazon.pageAsin).toBe(expected);
    }
  });

  it('uses same-host canonical ASIN when URL has no recognized product path', () => {
    const html = withBody('<div id="dp-container"></div>', '<link rel="canonical" href="https://www.amazon.com/dp/B012345678">');
    expect(capture(html, 'https://www.amazon.com/gp/aw/d/').amazon.pageAsin).toBe('B012345678');
  });

  it('rejects malformed child ASINs and does not expose them as variants', () => {
    const html = withBody(`<div id="dp-container"><div id="twister"><div id="variation_color_name">
      <ul><li class="swatchAvailable" data-asin="not-an-asin"><img alt="Black" /></li></ul>
    </div></div></div>`);
    const payload = capture(html);
    expect(payload.amazon.options[0].asin).toBeNull();
    expect(payload.amazon.variants).toEqual([]);
  });

  it('maps numeric variation indexes through variationValues instead of treating indexes as labels', () => {
    const html = withBody(`<div id="dp-container"></div><script>
      var variationValues = {"color_name":["Black","Green"],"size_name":["S","M"]};
      var asinVariationValues = {"B0CHILD001":[0,1],"B0CHILD002":[1,0]};
    </script>`);
    const payload = capture(html);
    expect(payload.amazon.variants).toEqual(expect.arrayContaining([
      expect.objectContaining({ asin: 'B0CHILD001', dimensions: [{ name: 'color', value: 'Black' }, { name: 'size', value: 'M' }] }),
      expect.objectContaining({ asin: 'B0CHILD002', dimensions: [{ name: 'color', value: 'Green' }, { name: 'size', value: 'S' }] }),
    ]));
  });

  it('reads child ASIN from a product link nested in the option', () => {
    const html = withBody(`<div id="dp-container"><div id="twister"><div id="variation_color_name">
      <li class="swatchAvailable"><a href="/dp/B0CHILD001"><img alt="Black" /></a></li>
    </div></div></div>`);
    const payload = capture(html);
    expect(payload.amazon.options).toContainEqual(expect.objectContaining({ value: 'Black', asin: 'B0CHILD001' }));
  });

  it('preserves unavailable and unknown as separate evidence states', () => {
    const html = withBody(`<div id="dp-container"><div id="twister"><div id="variation_size_name">
      <ul><li class="swatchCurrentlyUnavailable" data-asin="B0CHILD001"><span>L</span></li>
      <li data-asin="B0CHILD002"><span>XL</span></li></ul>
    </div></div></div>`);
    const payload = capture(html);
    expect(payload.amazon.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'L', availabilityEvidence: 'unavailable' }),
      expect.objectContaining({ value: 'XL', availabilityEvidence: 'unknown' }),
    ]));
  });

  it('deduplicates repeated ASIN/dimension/value evidence', () => {
    const html = withBody(`<div id="dp-container"><div id="twister"><div id="variation_color_name">
      <ul><li class="swatchAvailable" data-asin="B0CHILD001"><img alt="Black" /></li>
      <li class="swatchAvailable" data-asin="B0CHILD001"><img alt="Black" /></li></ul>
    </div></div></div>`);
    const payload = capture(html);
    expect(payload.amazon.options.filter((o: any) => o.value === 'Black')).toHaveLength(1);
    expect(payload.amazon.variants).toHaveLength(1);
  });

  it('reads a real saved Amazon page and returns bounded evidence without crashing', () => {
    const payload = capture(REAL_FIXTURE, 'https://www.amazon.com/dp/B0D1XD1ZV3');
    expect(payload.amazon.pageAsin).toBe('B0D1XD1ZV3');
    expect(payload.amazon.variants.length).toBeLessThanOrEqual(40);
    expect(payload.amazon.options.length).toBeLessThanOrEqual(60);
    expect(JSON.stringify(payload).length).toBeLessThan(64_000);
  });

  it('does not activate the strict Amazon reader on a search page without product markers', () => {
    const payload = capture(withBody('<div id="s-results-list-atf">search results</div>'));
    expect(payload.amazon).toBeNull();
  });

  it('server validator accepts only exact ASIN-mapped combinations and keeps unselected stock unknown', () => {
    const payload = capture(PRODUCT);
    const validation = validateAyWebsCapturedPage(payload, URL);
    expect(validation.ok).toBe(true);
    expect(validation.amazonEvidence?.pageAsin).toBe('B0PARENT01');
    expect(validation.amazonEvidence?.selectedAsin).toBe('B0CHILD001');
    expect(validation.scraped?.variants.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'B0CHILD001', stock: true, price: 49.99, size: 'S', color: 'Black' }),
      expect.objectContaining({ id: 'B0CHILD002', stock: null, price: null, size: 'M', color: 'Green' }),
    ]));
  });

  it('rejects a page-ASIN mismatch and cannot attach current price to the mismatched child', () => {
    const payload = capture(PRODUCT);
    payload.amazon.pageAsin = 'B099999999';
    const validation = validateAyWebsCapturedPage(payload, URL);
    expect(validation.ok).toBe(true);
    expect(validation.amazonEvidence).toBeNull();
    expect(validation.scraped?.variants.details).toEqual([]);
  });

  it('clears selected child evidence when the selected dimension labels do not match', () => {
    const payload = capture(PRODUCT);
    payload.selectedVariantTexts = ['Red', 'XL'];
    payload.amazon.options = payload.amazon.options.map((option) => ({ ...option, selected: false }));
    const validation = validateAyWebsCapturedPage(payload, URL);
    expect(validation.ok).toBe(true);
    expect(validation.amazonEvidence?.selectedAsin).toBeNull();
    expect(validation.scraped?.variants.details.find((detail: any) => detail.id === 'B0CHILD001')).toMatchObject({ stock: null, price: null });
  });
});
