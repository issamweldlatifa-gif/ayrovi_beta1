/**
 * Amazon — titre lu sur les pages réelles enregistrées (19/10/2026).
 *
 * Constat : le titre de secours venait de `document.title`, qui chez Amazon vaut
 * « Amazon.com: <produit> » ; et sur une page coquille il vaut « Amazon.com », ce qui
 * passait pour un titre et masquait l'absence de fiche. Le préfixe est retiré, et le
 * nom de la boutique seul n'est jamais un titre.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { parseProductPageHtml } from '../src/scraper/productPageParser';

const DIR = join(__dirname, 'fixtures/aywebs');
const fixture = (name: string) => readFileSync(join(DIR, name), 'utf8');
const URL_DE = 'https://www.amazon.de/dp/B0D1XD1ZV3';
const URL_US = 'https://www.amazon.com/dp/B0D1XD1ZV3';

/** Exécute le lecteur client dans une page, comme le WebView. */
function captureTitle(html: string, url: string): string | null {
  const dom = new JSDOM(html, { url });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  const payload = JSON.parse(String(evaluate(dom.window.document, dom.window.location, URL)));
  return payload.title ?? null;
}

describe('titre Amazon — serveur (productPageParser)', () => {
  it('page coquille : pas de faux titre « Amazon.com »', () => {
    const parsed = parseProductPageHtml(fixture('amazon-shell.html'), URL_US, 'amazon');
    expect(parsed.title).toBe('');
    expect(parsed.price).toBe(0);
  });

  it('fiche réelle : le titre reste le produit, sans préfixe « Amazon.com: »', () => {
    const parsed = parseProductPageHtml(fixture('amazon-us-mobile-concat-price.html'), URL_US, 'amazon');
    expect(parsed.title).toContain('AirPods');
    expect(parsed.title).not.toMatch(/^Amazon\.com/i);
  });

  it('une autre boutique ne subit pas cette règle', () => {
    const html = '<html><head><title>Amazon.com</title></head><body></body></html>';
    expect(parseProductPageHtml(html, 'https://www.shein.com/x-p-1.html', 'shein').title).toBe('Amazon.com');
  });
});

describe('titre Amazon — lecteur WebView (captureScript)', () => {
  it('page coquille : titre null (pas « Amazon.com »)', () => {
    expect(captureTitle(fixture('amazon-shell.html'), URL_US)).toBeNull();
  }, 30_000);

  it('fiche réelle : le produit, sans préfixe « Amazon.com: »', () => {
    const title = captureTitle(fixture('amazon-us-mobile-concat-price.html'), URL_US);
    expect(title).toContain('AirPods');
    expect(title).not.toMatch(/^Amazon\.com/i);
  }, 30_000);
});
