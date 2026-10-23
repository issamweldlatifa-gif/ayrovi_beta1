/**
 * AYWEBs — le lecteur ne prend JAMAIS un prix barré (20/10/2026).
 * Barré = <s>, <del>, <strike>, attribut data-a-strike, ou line-through.
 * La règle « a-text-price » seule ne suffit pas : ces marqueurs la complètent.
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';

const PAGE_URL = 'https://www.amazon.com/dp/B0GYM3V9H5';

function run(html: string): Record<string, unknown> {
  const dom = new JSDOM(html, { url: PAGE_URL });
  const evaluate = new Function('document', 'location', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  return JSON.parse(evaluate(dom.window.document, dom.window.location) as string) as Record<string, unknown>;
}

function page(buybox: string): string {
  return `<!doctype html><html lang="en"><head><title>Wireless Headphones</title></head>`
    + `<body><div id="dp"><div id="corePrice_feature_div">${buybox}</div></div></body></html>`;
}

function priceTexts(capture: Record<string, unknown>): string[] {
  return (capture.priceCandidates as Array<{ text: string }>).map((c) => c.text);
}

describe('prix barré jamais pris', () => {
  /* Chaque cas : UN SEUL prix barré dans la zone d'achat ⇒ aucun prix publié. */
  it('span a-price avec data-a-strike (sans a-text-price) : ignoré', () => {
    const capture = run(page('<span class="a-price" data-a-strike="true"><span class="a-offscreen">$99.99</span></span>'));
    expect(priceTexts(capture).join(' ')).not.toContain('99.99');
  });

  it('balise <s> seule : ignoré', () => {
    const capture = run(page('<s><span class="a-offscreen">$99.99</span></s>'));
    expect(priceTexts(capture).join(' ')).not.toContain('99.99');
  });

  it('balise <del> seule : ignoré', () => {
    const capture = run(page('<del><span class="a-offscreen">$99.99</span></del>'));
    expect(priceTexts(capture).join(' ')).not.toContain('99.99');
  });

  it('style inline line-through seul : ignoré', () => {
    const capture = run(page('<span style="text-decoration: line-through"><span class="a-offscreen">$99.99</span></span>'));
    expect(priceTexts(capture).join(' ')).not.toContain('99.99');
  });

  /* Prix barré + vrai prix : le vrai prix passe, le barré n'est pas compté comme 2e montant. */
  it('prix barré + vrai prix : seul le vrai prix est retenu', () => {
    const capture = run(page(`
      <span class="a-price" data-a-strike="true"><span class="a-offscreen">$99.99</span></span>
      <span class="a-price"><span class="a-offscreen">$49.99</span></span>`));
    expect(priceTexts(capture)).toEqual(['$49.99']);
    expect(diagnosticsOf(capture).join(' ')).not.toContain('ambiguous');
  });
});

function diagnosticsOf(capture: Record<string, unknown>): string[] {
  return capture.diagnostics as string[];
}
