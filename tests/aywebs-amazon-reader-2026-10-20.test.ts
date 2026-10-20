/**
 * AYWEBs — lecteur Amazon : titre, prix de la zone d'achat, ASIN (20/10/2026).
 *
 * Pages fabriquées pour chaque piège, exécutées comme dans le WebView :
 *  a) titre visible (#productTitle) sans JSON-LD, puis replis propres ;
 *  b) prix éclaté en symbole / entier / fraction ;
 *  c) prix lu depuis aria-label ou .a-offscreen ;
 *  d) publicité, protection et prix barré ignorés ;
 *  e) un prix de script (autre option) n'est jamais choisi ;
 *  f) deux prix concurrents ou un prix qui contredit JSON-LD ⇒ refus explicite ;
 *  g) titre, prix ou devise absents ⇒ les champs sont nommés ;
 *  h) formulaire d'achat d'un AUTRE ASIN ⇒ aucun prix publié.
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { missingProductFields } from '../src/aywebs/productResolver';

const URL_ASIN = 'https://www.amazon.com/dp/B0GYM3V9H5';

function captureFrom(pageHtml: string, url = URL_ASIN) {
  const dom = new JSDOM(pageHtml, { url });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  const payload = JSON.parse(String(evaluate(dom.window.document, dom.window.location, URL)));
  return { payload, validation: validateAyWebsCapturedPage(payload, url) };
}

/** Coquille produit Amazon minimale (sans elle, le lecteur Amazon ne s'applique pas). */
function amazonPage(inner: string, head = '<title>Amazon.com: Tablette Test</title>'): string {
  return `<!doctype html><html lang="en"><head>${head}</head><body>
  <div id="dp-container"><div id="ppd">${inner}</div></div></body></html>`;
}

const PRICE_109 = `<span class="a-price priceToPay"><span class="a-offscreen">$109.00</span></span>`;

describe('a) titre Amazon', () => {
  it('#productTitle est lu en premier, sans JSON-LD', () => {
    const { payload } = captureFrom(amazonPage(`
      <span id="productTitle" class="a-size-large"> Tablette 13 pouces   Android 16 </span>
      <div id="corePrice_feature_div">${PRICE_109}</div>`));
    expect(payload.title).toBe('Tablette 13 pouces Android 16');
    expect(payload.diagnostics).toContain('title:visible');
  });

  it('sans titre visible : og:title, puis document.title, « Amazon.com: » retiré', () => {
    const fromOg = captureFrom(amazonPage(
      `<div id="corePrice_feature_div">${PRICE_109}</div>`,
      '<title>Amazon.com</title><meta property="og:title" content="Amazon.com: Casque Bluetooth X">',
    ));
    expect(fromOg.payload.title).toBe('Casque Bluetooth X');
    expect(fromOg.payload.diagnostics).toContain('title:og');
  });

  it('page générique seule (« Amazon.com ») ⇒ AUCUN titre, jamais « Amazon.com »', () => {
    const { payload } = captureFrom(amazonPage(
      `<div id="corePrice_feature_div">${PRICE_109}</div>`,
      '<title>Amazon.com</title>',
    ));
    expect(payload.title).toBeNull();
    expect(payload.diagnostics).toContain('title:none');
  });
});

describe('b) à e) prix de la zone d’achat', () => {
  it('b) prix éclaté symbole / entier / fraction ⇒ $109.00', () => {
    const { payload, validation } = captureFrom(amazonPage(`
      <div id="corePrice_feature_div"><span class="a-price priceToPay">
        <span class="a-price-symbol">$</span><span class="a-price-whole">109<span class="a-price-decimal">.</span></span><span class="a-price-fraction">00</span>
      </span></div>`));
    expect(payload.priceCandidates).toEqual([{ text: '$109.00', source: 'dom' }]);
    expect(validation.price).toBe(109);
    expect(validation.currency).toBe('USD');
  });

  it('c) prix lu depuis aria-label, puis depuis .a-offscreen', () => {
    const ariaLabel = captureFrom(amazonPage(`
      <div id="corePrice_feature_div"><span class="a-price" aria-label="$109.00"><span aria-hidden="true">109</span></span></div>`));
    expect(ariaLabel.payload.priceCandidates).toEqual([{ text: '$109.00', source: 'dom' }]);

    const offscreen = captureFrom(amazonPage(`<div id="corePrice_feature_div">${PRICE_109}</div>`));
    expect(offscreen.payload.priceCandidates).toEqual([{ text: '$109.00', source: 'dom' }]);
  });

  it('d) publicité, protection et prix barré ignorés : seul le prix vendu reste', () => {
    const { payload, validation } = captureFrom(amazonPage(`
      <div id="corePrice_feature_div">
        <span class="a-price a-text-price"><span class="a-offscreen">$129.99</span></span>
        ${PRICE_109}
      </div>
      <div id="buybox">
        <div id="attachDisplayAddBaseAlert"><span class="a-price"><span class="a-offscreen">$39.99</span></span></div>
      </div>
      <div class="s-result-item sp-sponsored-result"><span class="a-price"><span class="a-offscreen">$19.99</span></span></div>`));
    expect(payload.priceCandidates).toEqual([{ text: '$109.00', source: 'dom' }]);
    expect(validation.price).toBe(109);
    expect(payload.diagnostics).toContain('price:buybox');
    expect(payload.diagnostics.some((code: string) => code.startsWith('price:excluded:'))).toBe(true);
  });

  it('e) un prix de script (autre option, displayPrice) n’est jamais choisi', () => {
    const { payload, validation } = captureFrom(amazonPage(`
      <script type="text/javascript">var data = {"displayPrice":"$119.00","asin":"B0OTHER001"};</script>
      <div id="corePrice_feature_div">${PRICE_109}</div>`));
    expect(payload.priceCandidates).toEqual([{ text: '$109.00', source: 'dom' }]);
    expect(validation.price).toBe(109);
  });

  it('e bis) hors zone d’achat, un .a-price n’est jamais lu', () => {
    const { payload } = captureFrom(amazonPage(`
      <div class="rightCol"><span class="a-price"><span class="a-offscreen">$59.00</span></span></div>`));
    expect(payload.priceCandidates).toEqual([]);
    expect(payload.diagnostics).toContain('price:none_in_buybox');
  });
});

describe('f) à h) conflits et refus explicites', () => {
  it('f) deux prix concurrents dans la zone d’achat ⇒ rien publié, motif AMBIGUOUS_PRICE', () => {
    const { payload, validation } = captureFrom(amazonPage(`
      <div id="corePrice_feature_div">${PRICE_109}</div>
      <div id="apex_desktop"><span class="a-price priceToPay"><span class="a-offscreen">$119.00</span></span></div>`));
    expect(payload.priceCandidates).toEqual([]);
    expect(payload.diagnostics).toContain('price:ambiguous_buybox:2');
    expect(validation.rejection).toBe('AMBIGUOUS_PRICE');
  });

  it('f bis) Amazon : JSON-LD et zone d’achat ne concordent pas ⇒ refus, aucun choix', () => {
    const jsonLd = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Tablette","sku":"B0GYM3V9H5","offers":{"@type":"Offer","price":"119.00","priceCurrency":"USD","availability":"https://schema.org/InStock"}}</script>`;
    const { validation } = captureFrom(amazonPage(`${jsonLd}<div id="corePrice_feature_div">${PRICE_109}</div>`));
    expect(validation.ok).toBe(false);
    expect(validation.rejection).toBe('AMBIGUOUS_PRICE');
    expect(validation.notes.join(' ')).toContain('amazon_price_sources_disagree');
  });

  it('g) titre, prix et devise absents ⇒ les champs bloquants sont nommés côté serveur', () => {
    const { payload, validation } = captureFrom(amazonPage('<p>Rien à lire ici</p>', '<title>Amazon.com</title>'));
    expect(payload.title).toBeNull();
    expect(validation.ok).toBe(false);
    expect(validation.rejection).toBe('NO_PRICE_TEXT');
    const fields = missingProductFields({
      title: '', price: 0, currency: '', images: [], scrapedProduct: { priceVerified: false, currencyVerified: false },
    } as any);
    expect(fields).toEqual(['title', 'price', 'verified_price', 'currency', 'verified_currency', 'image']);
  });

  it('h) formulaire d’achat d’un AUTRE ASIN ⇒ aucun prix publié, motif BUYBOX_ASIN_MISMATCH', () => {
    const { payload, validation } = captureFrom(amazonPage(`
      <div id="corePrice_feature_div">${PRICE_109}</div>
      <div id="buybox"><form id="addToCart"><input type="hidden" id="ASIN" name="ASIN" value="B0OTHER001"></form></div>`));
    expect(payload.priceCandidates).toEqual([]);
    expect(payload.diagnostics).toContain('price:buybox_asin_mismatch');
    expect(validation.rejection).toBe('BUYBOX_ASIN_MISMATCH');
  });

  it('h bis) formulaire du MÊME ASIN ⇒ le prix reste publié', () => {
    const { payload } = captureFrom(amazonPage(`
      <div id="corePrice_feature_div">${PRICE_109}</div>
      <div id="buybox"><form id="addToCart"><input type="hidden" id="ASIN" name="ASIN" value="B0GYM3V9H5"></form></div>`));
    expect(payload.priceCandidates).toEqual([{ text: '$109.00', source: 'dom' }]);
  });
});

describe('contrat du lecteur : diagnostics bornés, jamais de texte de page', () => {
  it('les codes du lecteur sont courts et ne contiennent aucun texte de page', () => {
    const { payload } = captureFrom(amazonPage(`
      <span id="productTitle">Secret Produit Titre</span>
      <div id="corePrice_feature_div">${PRICE_109}</div>`));
    expect(payload.diagnostics.length).toBeLessThanOrEqual(12);
    for (const code of payload.diagnostics as string[]) {
      expect(code.length).toBeLessThanOrEqual(60);
      expect(code).not.toContain('Secret');
    }
  });
});
