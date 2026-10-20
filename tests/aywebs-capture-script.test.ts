/**
 * AYWEBs — NOUVEAU lecteur de page (réécriture du 20/10/2026).
 *
 * Verrouille la règle unique du script : ne lire que la zone d'achat, et ne jamais
 * deviner. Pages : la fiche Amazon mesurée (tests/fixtures/amazon-product-page.html)
 * et des pages construites pour chaque cas limite.
 *
 *   1. Fiche réelle : titre, prix de la zone d'achat (« $109.00 »), symbole « $ »,
 *      disponibilité « In Stock », image principale ;
 *   2. Prix barré exclu (ancien prix, pas le prix de vente) ;
 *   3. Publicités hors zone d'achat jamais lues ;
 *   4. Deux montants distincts dans la zone d'achat ⇒ AUCUN candidat ;
 *   5. Bouton désactivé ⇒ aucun libellé publié ; bouton actif ⇒ libellé publié ;
 *   6. Options : l'option choisie est séparée des autres ;
 *   7. Le script reste ES5 et ne contient aucun secret ni stockage.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'amazon-product-page.html'), 'utf8');
const PAGE_URL = 'https://www.amazon.com/dp/B0GYM3V9H5';

function run(html: string, url = PAGE_URL): Record<string, unknown> {
  const dom = new JSDOM(html, { url });
  const evaluate = new Function('document', 'location', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  return JSON.parse(evaluate(dom.window.document, dom.window.location) as string) as Record<string, unknown>;
}

/** Page minimale : zone d'achat + contenu hors zone d'achat (publicités). */
function page(body: string): string {
  return `<!doctype html><html lang="en"><head><title>x</title></head><body>${body}</body></html>`;
}

const PRICE_SPAN = (text: string): string => `
    <span class="a-price">
      <span class="a-price-symbol">$</span>
      <span class="a-price-whole">${text}</span>
      <span class="a-price-fraction">00</span>
    </span>`;
const BUYBOX = (...spans: string[]): string => `<div id="corePrice_feature_div">${spans.join('')}</div>`;

describe('script de lecture AYWEBs — fiche réelle', () => {
  it('lit le titre, le prix de la zone d\'achat, le symbole et la disponibilité', () => {
    const capture = run(FIXTURE);
    expect(capture.v).toBe(1);
    expect(String(capture.title)).toContain('Vince Camuto');
    const candidates = capture.priceCandidates as Array<{ text: string; source: string }>;
    expect(candidates).toEqual([{ text: '$109.00', source: 'dom' }]);
    expect(capture.currencyText).toBe('$');
    expect(String(capture.availabilityText)).toBe('In Stock');
    expect(capture.diagnostics).toContain('price:buybox');
  });

  it('n\'inclut pas le prix barré de la fiche réelle', () => {
    const capture = run(FIXTURE);
    const texts = (capture.priceCandidates as Array<{ text: string }>).map((c) => c.text);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toBe('$109.00');
  });
});

describe('script de lecture AYWEBs — cas limites', () => {
  it('ignore les publicités hors zone d\'achat', () => {
    const capture = run(page(`
      <div id="sp_detail"><span class="a-price"><span class="a-offscreen">$6.99</span></span></div>
      <div id="similarities"><span class="a-price"><span class="a-price-whole">14</span></span></div>`));
    expect(capture.priceCandidates).toEqual([]);
    expect(capture.diagnostics).toContain('price:none_in_buybox');
  });

  it('deux montants distincts dans la zone d\'achat ⇒ aucun candidat', () => {
    const capture = run(page(BUYBOX(PRICE_SPAN('109'), PRICE_SPAN('119'))));
    expect(capture.priceCandidates).toEqual([]);
    expect(capture.diagnostics).toContain('price:ambiguous');
  });

  it('le même montant répété n\'est pas un conflit', () => {
    const capture = run(page(BUYBOX(PRICE_SPAN('109'), PRICE_SPAN('109'))));
    expect(capture.priceCandidates).toEqual([{ text: '$109.00', source: 'dom' }]);
  });

  it('prix barré seul ⇒ aucun candidat', () => {
    const capture = run(page(`
      <div id="corePrice_feature_div">
        <span class="a-price a-text-price"><span class="a-offscreen">$150.00</span></span>
      </div>`));
    expect(capture.priceCandidates).toEqual([]);
  });

  it('bouton désactivé ⇒ aucun libellé publié', () => {
    const capture = run(page(`${BUYBOX(PRICE_SPAN('109'))}<input id="add-to-cart-button" type="submit" value="Add to Cart" disabled>`));
    expect(capture.addToCartText).toBeNull();
    expect(capture.diagnostics).toContain('buy:disabled');
  });

  it('bouton actif ⇒ libellé publié', () => {
    const capture = run(page(`${BUYBOX(PRICE_SPAN('109'))}<input id="add-to-cart-button" type="submit" value="Add to Cart">`));
    expect(capture.addToCartText).toBe('Add to Cart');
    expect(capture.diagnostics).toContain('buy:enabled');
  });

  it('sépare l\'option choisie des autres options', () => {
    const capture = run(page(`
      <div id="twister">
        <span class="a-button-selected"><span class="a-button-text">M</span></span>
        <span class="a-button-text">S</span>
        <span class="a-button-text">L</span>
      </div>`));
    expect(capture.selectedVariantTexts).toEqual(['M']);
    expect(capture.variantTexts).toEqual(['M', 'S', 'L']);
  });

  it('n\'utilise que l\'image principale et des adresses http(s)', () => {
    const capture = run(page(`
      <img id="landingImage" src="https://m.media-amazon.com/images/I/abc.jpg">
      <img id="other" src="data:image/png;base64,AAAA">`));
    expect(capture.images).toEqual(['https://m.media-amazon.com/images/I/abc.jpg']);
  });

  it('une page vide ne plante pas et renvoie un JSON valide', () => {
    const capture = run(page(''));
    expect(capture.v).toBe(1);
    expect(capture.title).toBeNull();
    expect(capture.priceCandidates).toEqual([]);
    expect(capture.diagnostics).toContain('title:none');
  });
});

describe('script de lecture AYWEBs — règles d\'écriture', () => {
  it('reste ES5 : ni const, ni let, ni flèche, ni gabarit', () => {
    expect(AYWEBS_CAPTURE_SCRIPT).not.toMatch(/\bconst\b|\blet\b|=>/);
    expect(AYWEBS_CAPTURE_SCRIPT).not.toContain('`');
  });

  it('ne contient ni secret, ni stockage local, ni cookie', () => {
    expect(AYWEBS_CAPTURE_SCRIPT).not.toMatch(/token|secret|password|cookie|localStorage|sessionStorage/i);
  });
});
