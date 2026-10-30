import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { AMAZON_MOBILE_CAPTURE_SCRIPT } from '../src/aywebs/storeScripts/amazon';
import { AmazonAdapter } from '../src/aywebs/adapters/amazon';

function capture(html: string, url: string): any {
  const dom = new JSDOM(html, { url });
  try {
    const run = new Function('document', 'location', 'URL', `return ${AMAZON_MOBILE_CAPTURE_SCRIPT}`);
    return JSON.parse(run(dom.window.document, dom.window.location, URL));
  } finally { dom.window.close(); }
}

const asin = 'B0GYM3V9H5';
const product = readFileSync(join(__dirname, 'fixtures', 'amazon-product-page.html'), 'utf8');

describe('historical Amazon-only mobile reader prototype', () => {
  it('reads the product price on mobile hostname through its Amazon adapter', () => {
    const url = `https://m.amazon.com/dp/${asin}`;
    const adapter = new AmazonAdapter({} as never);
    expect(adapter.classifyPage(url).isProductPage).toBe(true);
    const result = capture(product, url);
    expect(result.amazon?.pageAsin).toBe(asin);
    expect(result.priceCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '$109.00', source: 'dom' }),
    ]));
  });

  it('reads mobile twister sizes, the selected value and unavailable option without guessing', () => {
    const html = `<!doctype html><html><head><title>Test</title></head><body><div id="dp-container">
      <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$109.00</span></span></div>
      <div id="twister_feature_div" data-feature-name="twister"><script>{"sortedDimValuesForAllDims":{"size_name":[
        {"dimensionValueState":"SELECTED","dimensionValueDisplayText":"XL","defaultAsin":"${asin}"},
        {"dimensionValueState":"UNAVAILABLE","dimensionValueDisplayText":"XXL"}]}}</script></div>
      </div></body></html>`;
    const result = capture(html, `https://m.amazon.com/dp/${asin}`);
    expect(result.amazon.options.map((o: any) => o.value)).toEqual(expect.arrayContaining(['XL', 'XXL']));
    expect(result.amazon.selectedValues).toContain('XL');
    expect(result.amazon.options.find((o: any) => o.value === 'XXL').availabilityEvidence).toBe('unavailable');
  });

  it('does not read another merchant or a deceptive hostname', () => {
    for (const url of ['https://www.zalando.fr/product', 'https://amazon.com.example.org/dp/B0GYM3V9H5']) {
      expect(capture(product, url)).toEqual({});
    }
  });
});
