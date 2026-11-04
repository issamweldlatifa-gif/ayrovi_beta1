/**
 * AYWEBs — lecteurs WebView isolés par boutique (26/10/2026).
 *
 * Les scripts partagent le contrat et les garde-fous, mais sont servis et mis
 * en cache par store_id. Sephora/Primark démarrent en structured-only : aucun
 * sélecteur DOM non mesuré ne peut publier un prix de recommandation.
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { createAyWebsAdapterById } from '../src/aywebs/adapters/registry';
import { buildAyWebsCaptureScript, AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { ayWebsCaptureReader } from '../src/aywebs/captureReaders/registry';
import { ayWebsStoreRecognition, ayWebsStoreCan, detectAyWebsStore, findAyWebsStore } from '../shared/aywebsStores';
import { analyzeAyWebsUrl } from '../src/aywebs/browser';

function run(script: string, url: string, html: string): Record<string, unknown> {
  const dom = new JSDOM(html, { url });
  const evaluate = new Function('document', 'location', 'window', `return ${script}`);
  return JSON.parse(evaluate(dom.window.document, dom.window.location, dom.window) as string) as Record<string, unknown>;
}

describe('capture readers : versions et bundles distincts', () => {
  it('chaque marchand demandé a son profil et sa version propres', () => {
    for (const id of ['amazon', 'zalando', 'sephora', 'primark']) {
      const reader = ayWebsCaptureReader(id);
      expect(reader?.storeId).toBe(id);
      expect(reader?.version).toBeGreaterThan(0);
      expect(buildAyWebsCaptureScript(id)).not.toBe(AYWEBS_CAPTURE_SCRIPT);
      if (id === 'amazon') expect(buildAyWebsCaptureScript(id)).toContain("reader: { id: 'amazon'");
      else if (id === 'zalando') expect(buildAyWebsCaptureScript(id)).toMatch(/storeId:\s*["']zalando["']/);
      else expect(buildAyWebsCaptureScript(id)).toContain(`"storeId":"${id}"`);
    }
  });

  it('Sephora et Primark n’utilisent pas le DOM générique non vérifié', () => {
    const html = '<!doctype html><html><head><title>Product</title></head><body><h1>Serum</h1><div class="product-price">$99.99</div></body></html>';
    for (const [id, url] of [
      ['sephora', 'https://www.sephora.com/product/item'],
      ['primark', 'https://www.primark.com/en-gb/product/item'],
    ]) {
      const result = run(buildAyWebsCaptureScript(id), url, html);
      expect(result.reader).toEqual({ id, version: 1 });
      expect(result.priceCandidates).toEqual([]);
      expect(result.diagnostics).toContain('price:structured_only_no_candidate');
    }
  });

  it('Zalando lit ProductGroup/hasVariant et ignore le prix DOM hors contrat', () => {
    const group = {
      '@context': 'https://schema.org',
      '@type': 'ProductGroup',
      name: 'Running shoe',
      productGroupID: 'NI121D0A2',
      hasVariant: [{
        '@type': 'Product',
        sku: 'NI121D0A2-Q11-36',
        size: '36',
        color: 'black/white/noir',
        offers: { '@type': 'Offer', price: '64.95', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
      }],
    };
    const html = `<!doctype html><html><head><title>Running shoe</title><script type="application/ld+json">${JSON.stringify(group)}</script></head><body><h1>Running shoe</h1><div class="product-price">$1.00</div></body></html>`;
    const result = run(buildAyWebsCaptureScript('zalando'), 'https://www.zalando.fr/shoe-ni121d0a2-q11.html', html);
    expect(result.reader).toEqual({ id: 'zalando', version: 2 });
    expect(result.priceCandidates).toContainEqual(expect.objectContaining({ source: 'json_ld', text: expect.stringContaining('64.95 EUR') }));
    expect(result.priceCandidates).not.toContainEqual(expect.objectContaining({ text: '$1.00', source: 'dom' }));
  });

  it('profile mismatch sur un autre domaine ne s’applique pas', () => {
    const html = '<!doctype html><html><head><title>Product</title></head><body><h1>Item</h1><div class="product-price">$19.99</div></body></html>';
    const result = run(buildAyWebsCaptureScript('sephora'), 'https://example.test/product', html);
    expect(result.reader).toBeNull();
    expect(result.priceCandidates).toContainEqual(expect.objectContaining({ text: '$19.99', source: 'dom' }));
  });

  it('script sans store_id reste compatible avec les anciennes versions', () => {
    expect(buildAyWebsCaptureScript()).toBe(AYWEBS_CAPTURE_SCRIPT);
  });
});

describe('adapters dedicacés Sephora / Primark', () => {
  it('domaines explicitement enregistrés ; reconnaissance fiche par capture seulement', async () => {
    for (const [id, url] of [
      ['sephora', 'https://www.sephora.com/product/item'],
      ['primark', 'https://www.primark.com/en-gb/product/item'],
    ]) {
      const store = findAyWebsStore(id);
      expect(store?.enabled).toBe(true);
      expect(store?.adapter).toBe(id);
      expect(ayWebsStoreRecognition(store)).toBe('capture');
      expect(detectAyWebsStore(url)?.id).toBe(id);
      const adapter = createAyWebsAdapterById(id, {} as never);
      expect(adapter.id).toBe(id);
      expect(adapter.classifyPage(url).isProductPage).toBe(false);
      await expect(adapter.resolveProduct(url)).rejects.toMatchObject({ code: 'PRODUCT_PAGE_REQUIRED' });
    }
  });

  it('Sephora et Primark sont bien des lecteurs capturables, pas des stores inconnus', () => {
    const scraper = { cleanPastedUrl: (value: string) => value } as never;
    for (const [id, url] of [
      ['sephora', 'https://www.sephora.com/'],
      ['primark', 'https://www.primark.com/'],
    ]) {
      const store = findAyWebsStore(id);
      expect(store?.enabled).toBe(true);
      expect(store?.captureSupported).toBe(true);
      expect(ayWebsStoreCan(store, 'product')).toBe(true);
      const analysis = analyzeAyWebsUrl(url, scraper);
      expect(analysis).toMatchObject({
        registered: true, storeId: id, captureAllowed: true, captureInjection: 'on_demand',
      });
    }
  });

  it('Primark ne reçoit pas une devise supposée dans le registre', () => {
    expect(findAyWebsStore('primark')).toMatchObject({ country: '', currency: '' });
  });
});
