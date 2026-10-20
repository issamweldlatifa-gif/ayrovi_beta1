/**
 * AYWEBs — script de lecture officiel (Google Drive « captureScript.ts », 20/10/2026),
 * avec les corrections de sécurité du 20/10/2026.
 *
 * Verrouille :
 *   1. fiche réelle : titre, prix de la zone d'achat, disponibilité ;
 *   2. publicités jamais lues sur un domaine Amazon, même sans zone d'achat ;
 *   3. deux montants distincts dans la zone d'achat ⇒ aucun prix publié ;
 *   4. formulaire d'achat d'un AUTRE ASIN ⇒ aucun prix, diagnostic envoyé au serveur ;
 *   5. un nombre n'est JAMAIS un nom d'option : index résolu via variationValues, sinon écarté ;
 *   6. data-value purement numérique (index de swatch) n'est jamais un nom ;
 *   7. le script reste ES5 et ne contient aucun secret ni stockage.
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

/** Page minimale d'une fiche Amazon (marqueur « #dp » ⇒ lecture Amazon stricte). */
function page(body: string): string {
  return `<!doctype html><html lang="en"><head><title>x</title></head><body><div id="dp">${body}</div></body></html>`;
}

const PRICE_SPAN = (whole: string): string => `
    <span class="a-price">
      <span class="a-price-symbol">$</span>
      <span class="a-price-whole">${whole}</span>
      <span class="a-price-fraction">00</span>
    </span>`;
const BUYBOX = (...spans: string[]): string => `<div id="corePrice_feature_div">${spans.join('')}</div>`;

function priceTexts(capture: Record<string, unknown>): string[] {
  return (capture.priceCandidates as Array<{ text: string }>).map((c) => c.text);
}

function diagnosticsOf(capture: Record<string, unknown>): string[] {
  return capture.diagnostics as string[];
}

describe('script AYWEBs — fiche réelle', () => {
  it('lit le titre, le prix de la zone d\'achat et la disponibilité', () => {
    const capture = run(FIXTURE);
    expect(capture.v).toBe(1);
    expect(String(capture.title)).toContain('Vince Camuto');
    expect(priceTexts(capture)).toHaveLength(1);
    expect(priceTexts(capture)[0]).toContain('109');
    expect(String(capture.availabilityText)).toMatch(/in stock/i);
    expect(Array.isArray(capture.diagnostics)).toBe(true);
  });
});

describe('script AYWEBs — publicités et prix ambigus', () => {
  it('une publicité sur amazon hors zone d\'achat n\'est jamais lue', () => {
    const capture = run(page(`
      <div id="sp_detail"><span class="a-price"><span class="a-offscreen">$6.99</span></span></div>
      <div id="similarities"><span class="a-price"><span class="a-price-whole">14</span></span></div>`));
    expect(priceTexts(capture)).toEqual([]);
  });

  it('une publicité seule sur une page Amazon sans zone d\'achat n\'est jamais lue', () => {
    const capture = run(`<!doctype html><html><head><title>Amazon.com</title></head><body>
      <div class="a-price"><span class="a-offscreen">$6.99</span></div></body></html>`);
    expect(priceTexts(capture)).toEqual([]);
  });

  it('deux montants distincts dans la zone d\'achat ⇒ aucun candidat, diagnostic ambigu', () => {
    const capture = run(page(BUYBOX(PRICE_SPAN('109'), PRICE_SPAN('119'))));
    expect(priceTexts(capture)).toEqual([]);
    expect(diagnosticsOf(capture).some((code) => code.indexOf('price:ambiguous_buybox') === 0)).toBe(true);
  });

  it('le même montant répété dans la zone d\'achat n\'est pas un conflit', () => {
    const capture = run(page(BUYBOX(PRICE_SPAN('109'), PRICE_SPAN('109'))));
    expect(priceTexts(capture)).toHaveLength(1);
  });
});

describe('script AYWEBS — formulaire d\'achat d\'un autre ASIN', () => {
  it('ASIN du formulaire différent de l\'URL ⇒ aucun prix, diagnostic envoyé', () => {
    const capture = run(page(`${BUYBOX(PRICE_SPAN('109'))}
      <div id="buybox"><form id="addToCart"><input type="hidden" id="ASIN" name="ASIN" value="B0OTHER001"></form></div>`));
    expect(priceTexts(capture)).toEqual([]);
    expect(diagnosticsOf(capture)).toContain('price:buybox_asin_mismatch');
  });

  it('ASIN du formulaire identique à l\'URL ⇒ le prix reste publié', () => {
    const capture = run(page(`${BUYBOX(PRICE_SPAN('109'))}
      <div id="buybox"><form id="addToCart"><input type="hidden" id="ASIN" name="ASIN" value="B0GYM3V9H5"></form></div>`));
    expect(priceTexts(capture)).toHaveLength(1);
    expect(diagnosticsOf(capture)).not.toContain('price:buybox_asin_mismatch');
  });
});

describe('script AYWEBS — un nombre n\'est jamais un nom d\'option', () => {
  const VARIATIONS = `<script>var data = {"variationValues":{"size_name":["S","M","L"]},"asinVariationValues":{"B0ASIN0001":{"size_name":2},"B0ASIN0002":{"size_name":9},"B0ASIN0003":{"size_name":"1"}}};</script>`;

  it('un index valide est résolu via variationValues (2 ⇒ « L »)', () => {
    const capture = run(page(VARIATIONS)) as { amazon: { variants: Array<{ asin: string; dimensions: Array<{ name: string; value: string }> }> } };
    const variant = capture.amazon.variants.find((v) => v.asin === 'B0ASIN0001');
    expect(variant).toBeDefined();
    expect(variant!.dimensions).toEqual([{ name: 'size', value: 'L' }]);
  });

  it('un index hors de la liste est écarté, jamais affiché comme nom', () => {
    const capture = run(page(VARIATIONS)) as { amazon: { variants: Array<{ asin: string; dimensions: Array<{ value: string }> }> } };
    const variant = capture.amazon.variants.find((v) => v.asin === 'B0ASIN0002');
    expect(variant ? variant.dimensions : []).toEqual([]);
    expect(JSON.stringify(capture.amazon)).not.toMatch(/"value":"9"/);
  });

  it('un index texte (« 1 ») est résolu, jamais gardé comme nom', () => {
    const capture = run(page(VARIATIONS)) as { amazon: { variants: Array<{ asin: string; dimensions: Array<{ value: string }> }> } };
    const variant = capture.amazon.variants.find((v) => v.asin === 'B0ASIN0003');
    expect(variant!.dimensions).toEqual([{ name: 'size', value: 'M' }]);
    expect(JSON.stringify(capture.amazon)).not.toMatch(/"value":"1"/);
  });

  it('un index sans table variationValues est écarté', () => {
    const capture = run(page(`<script>var d = {"asinVariationValues":{"B0ASIN0004":{"size_name":1}}};</script>`)) as {
      amazon: { variants: Array<{ asin: string; dimensions: unknown[] }> };
    };
    const variant = capture.amazon.variants.find((v) => v.asin === 'B0ASIN0004');
    expect(variant ? variant.dimensions : []).toEqual([]);
  });

  it('un data-value purement numérique (index de swatch) n\'est jamais un nom d\'option', () => {
    const capture = run(page(`<div id="twister"><div id="variation_size_name"><ul>
      <li data-value="0" data-asin="B0ASIN0005"><span>Rouge</span></li>
      <li data-value="Bleu" data-asin="B0ASIN0006"><span>Bleu</span></li></ul></div></div>`)) as {
      amazon: { options: Array<{ value: string }> };
    };
    const values = capture.amazon.options.map((o) => o.value);
    expect(values).not.toContain('0');
    expect(values).toContain('Bleu');
  });
});

describe('script AYWEBs — sortie bornée et valide', () => {
  it('une page vide renvoie un JSON valide avec diagnostics', () => {
    const capture = run('<!doctype html><html><head></head><body></body></html>');
    expect(capture.v).toBe(1);
    expect(capture.title).toBeNull();
    expect(priceTexts(capture)).toEqual([]);
    expect(Array.isArray(capture.diagnostics)).toBe(true);
  });
});

describe('script AYWEBS — règles d\'écriture', () => {
  it('reste ES5 : ni const, ni let, ni flèche, ni gabarit', () => {
    expect(AYWEBS_CAPTURE_SCRIPT).not.toMatch(/\bconst\b|\blet\b|=>/);
    expect(AYWEBS_CAPTURE_SCRIPT).not.toContain('`');
  });

  it('ne contient ni secret, ni stockage local, ni cookie', () => {
    expect(AYWEBS_CAPTURE_SCRIPT).not.toMatch(/token|secret|password|cookie|localStorage|sessionStorage/i);
  });
});
