import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProductPageHtml } from '../src/scraper/productPageParser';
import { readAmazonAvailability, readAmazonPrice, readAmazonVariants } from '../src/scraper/amazonPage';

/**
 * AMAZON — السعر والصور والمقاسات (04/10/2026).
 *
 * القاعدة المحفوظة هنا هي علة حقيقية ظهرت في التطبيق:
 *   « Le devis AYROVI est indisponible pour cet article. L'ajout reste bloqué. »
 * سببها أن صفحة أمازون لا تنشر JSON-LD ولا meta للسعر، وتُفتّت السعر على ثلاثة
 * spans (`a-price-symbol` + `a-price-whole` + `a-price-fraction`) بينما
 * `.a-offscreen` **داخل** كتلة السعر يبقى فارغاً. لذلك كان السعر يُقرأ 0 ثم
 * يُقفل زر الإضافة. التجهيز للملف `tests/fixtures/amazon-product-page.html`
 * يحفظ البنية الحقيقية المقيسة على /dp/B0GYM3V9H5.
 */
const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'amazon-product-page.html'), 'utf8');
const URL = 'https://www.amazon.com/dp/B0GYM3V9H5';

describe('Amazon — lecture du prix éclaté en spans', () => {
  it('lit le prix courant et la devise depuis la zone d’achat', () => {
    const parsed = parseProductPageHtml(FIXTURE, URL, 'amazon');
    expect(parsed.price).toBe(109);
    expect(parsed.currency).toBe('USD');
    expect(parsed.currencyVerified).toBe(true);
    expect(parsed.title).toContain('Vince Camuto');
    expect(parsed.availability).toBe('in_stock');
  });

  it('lit le prix barré (prix liste) sans le confondre avec le prix courant', () => {
    const parsed = parseProductPageHtml(FIXTURE, URL, 'amazon');
    expect(parsed.originalPrice).toBe(149);
  });

  it('ne prend jamais `{priceToPay}` (gabarit) pour un prix', () => {
    // Cas réel : l'étiquette d'accessibilité garde son gabarit non remplacé et
    // le bloc de prix n'a pas encore été rendu par le marchand.
    const templateOnly = `<!doctype html><html><head><title>Amazon.com</title></head><body>
      <h1 id="productTitle">Produit Amazon</h1>
      <div id="corePriceDisplay_desktop_feature_div">
        <span id="apex-pricetopay-accessibility-label" class="aok-offscreen"> {priceToPay} </span>
        <span class="a-price"><span class="a-offscreen"> </span><span class="a-price-symbol">$</span></span>
      </div>
    </body></html>`;
    const parsed = parseProductPageHtml(templateOnly, URL, 'amazon');
    expect(parsed.price).toBe(0);
    expect(readAmazonPrice(new (require('jsdom').JSDOM)(templateOnly).window.document, templateOnly).source).toBe('none');
  });

  it('expose les tailles et couleurs publiées, avec l’état de chaque valeur', () => {
    const parsed = parseProductPageHtml(FIXTURE, URL, 'amazon');
    expect(parsed.variants.sizes).toEqual(['X-Small', 'Small', 'Medium', 'Large', 'X-Large']);
    expect(parsed.variants.colors).toEqual(expect.arrayContaining(['Camel', 'Classic Navy', 'Emerald Leaf']));

    const large = parsed.variants.details?.find((detail) => detail.label === 'Large');
    expect(large?.available).toBe(false); // dimensionValueState = UNAVAILABLE
    expect(large?.stock).toBe(false);
    const small = parsed.variants.details?.find((detail) => detail.label === 'Small');
    expect(small?.available).toBe(true);
    expect(small?.stock).toBe(true);
  });

  it('ignore un objet de gabarit vide et lit le bloc réellement rempli', () => {
    const [first] = FIXTURE.split('\n');
    expect(first).toContain('<!doctype html>');
    const variants = readAmazonVariants(
      new (require('jsdom').JSDOM)(FIXTURE).window.document,
      FIXTURE,
    );
    expect(variants.groups.map((group) => group.attribute).sort()).toEqual(['color', 'size']);
    expect(variants.details.length).toBeGreaterThan(5);
  });

  it('ne prétend rien quand la page ne publie ni prix ni disponibilité', () => {
    const empty = '<html><head><title>Amazon.com</title></head><body><h1 id="productTitle">Produit Amazon</h1></body></html>';
    const parsed = parseProductPageHtml(empty, URL, 'amazon');
    expect(parsed.price).toBe(0);
    expect(parsed.availability).toBe('unknown');
    const document = new (require('jsdom').JSDOM)(empty).window.document;
    expect(readAmazonPrice(document, empty).source).toBe('none');
    expect(readAmazonAvailability(document)).toBeNull();
  });
});
