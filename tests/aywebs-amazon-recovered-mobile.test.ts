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

describe('isolated Amazon mobile reader', () => {
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

  it('prioritizes the largest published product image over a blurry OG thumbnail and ad', () => {
    const html = `<!doctype html><html><head><meta property="og:image" content="https://img.example/thumb.jpg"></head>
      <body><div id="dp-container"><div id="mobile-image-block"><img src="https://img.example/small.jpg"
      data-a-dynamic-image='{ "https://img.example/large.jpg": [1200, 1200], "https://img.example/medium.jpg": [400, 400] }'></div>
      <img data-a-dynamic-image='{ "https://img.example/ad.jpg": [5000, 5000] }'></div></body></html>`;
    const result = capture(html, `https://m.amazon.fr/dp/${asin}`);
    expect(result.images[0]).toBe('https://img.example/large.jpg');
    expect(result.images).not.toContain('https://img.example/ad.jpg');
  });

  it('does not mistake the purchase quantity for a selected variant', () => {
    const html = `<!doctype html><html><body><div id="dp-container">
      <select id="quantity" name="quantity"><option selected>1</option><option>2</option></select>
      <select name="size_name"><option selected>40</option><option>41</option></select>
      </div></body></html>`;
    const result = capture(html, `https://m.amazon.fr/dp/${asin}`);
    expect(result.selectedVariantTexts).not.toContain('1');
    expect(result.variantTexts).not.toContain('2');
    expect(result.selectedVariantTexts).toContain('40');
  });

  it('keeps merchant swatch images and uses the selected DOM state over stale twister data', () => {
    const html = `<!doctype html><html><body><div id="dp-container"><div id="twister">
      <div id="variation_color_name"><ul>
      <li class="swatchAvailable" data-asin="${asin}" title="Blue"><img alt="Blue" data-old-hires="https://img.example/blue.jpg"></li>
      <li class="swatchSelect" data-asin="B0GYM3TFH2" title="Black"><img alt="Black" src="https://img.example/black.jpg"></li>
      </ul></div><script>{"sortedDimValuesForAllDims":{"color_name":[
      {"dimensionValueState":"SELECTED","dimensionValueDisplayText":"Blue","defaultAsin":"${asin}"},
      {"dimensionValueState":"AVAILABLE","dimensionValueDisplayText":"Black","defaultAsin":"B0GYM3TFH2"}]}}</script>
      </div></div></body></html>`;
    const options = capture(html, `https://m.amazon.fr/dp/${asin}`).amazon.options;
    const blue = options.find((item: any) => item.value === 'Blue');
    const black = options.find((item: any) => item.value === 'Black');
    expect(blue.image).toBe('https://img.example/blue.jpg');
    expect(black.image).toBe('https://img.example/black.jpg');
    expect(blue.selected).toBe(false);
    expect(black.selected).toBe(true);
  });

  it('does not attach a price or stock to two ASINs with the same dimensions', () => {
    const html = `<!doctype html><html><body><div id="dp-container">
      <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$109.00</span></span></div>
      <script>var twister = {"variationDisplayLabels":{"size_name":"Size"},
      "dimensionValuesDisplayData":{"${asin}":["XL"],"B0GYM3TFH2":["XL"]}};</script>
      </div></body></html>`;
    const result = capture(html, `https://www.amazon.com/dp/${asin}`);
    expect(result.amazon.variants).toHaveLength(2);
    const row = result.variantMatrix.find((value: any) => Object.values(value.attributes).includes('XL'));
    expect(row.price).toBeNull();
    expect(row.available).toBeNull();
    expect(row.variantId).toBeNull();
    expect(row.variantUrl).toBeNull();
  });

  it('does not read another merchant or a deceptive hostname', () => {
    for (const url of ['https://www.zalando.fr/product', 'https://amazon.com.example.org/dp/B0GYM3V9H5']) {
      expect(capture(product, url)).toEqual({});
    }
  });
});
