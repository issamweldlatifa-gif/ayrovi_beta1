/**
 * Ulta Beauty & tiroirs post-ajout marchand (`Screenshot_20261029_034421.jpg`) :
 * lorsqu'un client appuie sur « Add to Bag » dans la page marchande mobile,
 * la boutique ouvre une modale de confirmation (« Added for ship! / Add to routine
 * $19.95 / View bag ») par-dessus la fiche produit ($21.00).
 *
 * Ce test prouve que `AYWEBS_CAPTURE_SCRIPT` ignore les prix et boutons de vente
 * croisée à l'intérieur de la modale post-ajout et continue de capturer
 * proprement la fiche produit sous-jacente sans faux positif `PRICE_AMBIGUOUS`
 * ni `NOT_A_PRODUCT_PAGE`.
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';

describe('AYWEBs — isolation des modales post-ajout marchand (Ulta Beauty)', () => {
  it('ignore le tiroir « Added for ship! / View bag » et conserve le prix $21.00 de la fiche produit', () => {
    const url = 'https://www.ulta.com/p/essential-drip-lip-oil-pimprod2043210';
    const html = `<!doctype html>
      <html lang="en">
        <head>
          <title>Essential Drip Lip Oil - r.e.m. beauty | Ulta Beauty</title>
          <meta property="og:type" content="product" />
          <meta property="og:title" content="Essential Drip Lip Oil - r.e.m. beauty" />
          <meta property="og:image" content="https://media.ulta.com/i/ulta/2619876?w=800&h=800" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Essential Drip Lip Oil",
              "brand": { "@type": "Brand", "name": "r.e.m. beauty" },
              "image": ["https://media.ulta.com/i/ulta/2619876?w=800&h=800"],
              "offers": {
                "@type": "Offer",
                "priceCurrency": "USD",
                "price": "21.00",
                "availability": "https://schema.org/InStock"
              }
            }
          </script>
        </head>
        <body>
          <main>
            <h1>Essential Drip Lip Oil</h1>
            <div data-testid="product-price">$21.00</div>
            <div role="radiogroup" aria-label="Shade">
              <button role="radio" aria-checked="true">Mint Condition</button>
              <button role="radio" aria-checked="false">Raspberry Drip</button>
            </div>
            <button type="button" data-testid="add-to-bag">Add to Bag</button>
          </main>

          <div role="dialog" aria-modal="true" class="AddedToBagModal">
            <h2>Added for ship!</h2>
            <p>Essential Drip Lip Oil</p>
            <section class="routine-upsell">
              <h3>Add to routine</h3>
              <span data-testid="upsell-price">$19.95</span>
              <button type="button">Add to routine</button>
              <button type="button">Add to Bag</button>
            </section>
            <a href="/bag" role="button">View bag (1)</a>
            <button type="button">Keep shopping</button>
          </div>
        </body>
      </html>`;

    const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
    const raw = JSON.parse(String(dom.window.eval(AYWEBS_CAPTURE_SCRIPT))) as Record<string, unknown>;
    dom.window.close();

    expect(raw).toBeTruthy();
    expect(raw.addToCartText).toBe('Add to Bag');

    const candidates = raw.priceCandidates as Array<{ text: string; source: string }>;
    const domPrices = candidates.filter((c) => c.source === 'dom').map((c) => c.text);
    expect(domPrices).toEqual(['$21.00']);
    expect(domPrices).not.toContain('$19.95');

    const verdict = validateAyWebsCapturedPage(raw, url);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.scraped.sourcePrice).toBe(21);
      expect(verdict.scraped.sourceCurrency).toBe('USD');
      expect(verdict.scraped.priceVerified).toBe(true);
    }
  });
});
