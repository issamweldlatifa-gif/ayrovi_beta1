/**
 * AYWEBs — enveloppe UNIQUE des lecteurs de capture (12/11/2026).
 *
 * Chaque boutique enregistrée et capturable reçoit le même emballage
 * (profil, garde de domaine, tampon `contract`), avec son intégration propre :
 * script dédié (Amazon, Zalando), cœur partagé piloté par `priceMode`
 * (SHEIN, TEMU, AliExpress, Sephora, Primark) ou profil `generic` (les autres).
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT, buildAyWebsCaptureScript } from '../src/aywebs/captureScript';
import {
  AYWEBS_CAPTURE_CONTRACT_VERSION,
  AYWEBS_CAPTURE_READERS,
  resolveAyWebsCaptureReader,
} from '../src/aywebs/captureReaders/registry';
import { AYWEBS_DEDICATED_CAPTURE_SCRIPTS } from '../src/aywebs/storeScripts';
import { captureReaderNote } from '../src/aywebs/webviewCapture';
import { AYWEBS_STORES } from '../shared/aywebsStores';

function run(script: string, url: string, html: string): Record<string, any> | null {
  const dom = new JSDOM(html, { url });
  const evaluate = new Function('document', 'location', 'window', `return ${script}`);
  const raw = evaluate(dom.window.document, dom.window.location, dom.window) as string | null;
  return raw == null ? null : JSON.parse(raw);
}

const capturable = AYWEBS_STORES.filter((store) => store.enabled && store.captureSupported && store.domains.length);

const productHtml = (price: string) => `<!doctype html><html><head><title>Item</title>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Product', name: 'Item', sku: 'SKU-1',
  offers: { '@type': 'Offer', price, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
})}</script></head><body><h1>Item</h1></body></html>`;

describe('enveloppe unique : chaque boutique a son intégration', () => {
  it('toutes les boutiques capturables résolvent un lecteur versionné', () => {
    expect(capturable.length).toBeGreaterThanOrEqual(19);
    for (const store of capturable) {
      const reader = resolveAyWebsCaptureReader(store.id);
      expect(reader, store.id).not.toBeNull();
      expect(reader!.storeId).toBe(store.id);
      expect(reader!.version).toBeGreaterThan(0);
      const expected = AYWEBS_CAPTURE_READERS[store.id]?.integration ?? 'generic';
      expect(reader!.integration).toBe(expected);
      const script = buildAyWebsCaptureScript(store.id);
      expect(script).not.toBe(AYWEBS_CAPTURE_SCRIPT);
      expect(script).toContain('__AYWEBS_CAPTURE_READER__');
      expect(script).not.toContain('`');
    }
  });

  it('scripts dédiés ⇔ définitions `dedicated` (aucun orphelin)', () => {
    const dedicated = Object.values(AYWEBS_CAPTURE_READERS)
      .filter((reader) => reader.integration === 'dedicated')
      .map((reader) => reader.storeId)
      .sort();
    expect(Object.keys(AYWEBS_DEDICATED_CAPTURE_SCRIPTS).sort()).toEqual(dedicated);
  });

  it('inconnu / sans store_id : bundle historique inchangé', () => {
    expect(resolveAyWebsCaptureReader('nope')).toBeNull();
    expect(buildAyWebsCaptureScript('nope')).toBe(AYWEBS_CAPTURE_SCRIPT);
    expect(buildAyWebsCaptureScript(null)).toBe(AYWEBS_CAPTURE_SCRIPT);
  });

  it('boutique générique (Walmart) : profil standard, tampon contract, prix structuré lu', () => {
    const out = run(buildAyWebsCaptureScript('walmart'), 'https://www.walmart.com/ip/item/123', productHtml('19.99'))!;
    expect(out.reader).toEqual({ id: 'walmart', version: 1 });
    expect(out.contract).toEqual({
      v: AYWEBS_CAPTURE_CONTRACT_VERSION, store: 'walmart', readerVersion: 1, integration: 'generic', matched: true,
    });
    expect(out.priceCandidates).toContainEqual(expect.objectContaining({ source: 'json_ld' }));
  });

  it('intégration partagée (Sephora) : structured_only conservé + tampon', () => {
    const out = run(buildAyWebsCaptureScript('sephora'), 'https://www.sephora.com/product/item', productHtml('42.00'))!;
    expect(out.reader).toEqual({ id: 'sephora', version: 1 });
    expect(out.contract).toMatchObject({ store: 'sephora', integration: 'shared_core', matched: true });
  });

  it('intégration dédiée (Zalando) : même enveloppe, tampon dedicated', () => {
    const out = run(buildAyWebsCaptureScript('zalando'), 'https://www.zalando.fr/shoe-ni121d0a2-q11.html', productHtml('64.95'))!;
    expect(out.reader).toEqual({ id: 'zalando', version: 2 });
    expect(out.contract).toMatchObject({ store: 'zalando', readerVersion: 2, integration: 'dedicated', matched: true });
  });

  it('dédié hors domaine : null (comportement du script dédié), global restauré', () => {
    const dom = new JSDOM('<!doctype html><title>x</title>', { url: 'https://example.test/p' });
    (dom.window as any).__AYWEBS_CAPTURE_READER__ = 'keep';
    const evaluate = new Function('document', 'location', 'window', `return ${buildAyWebsCaptureScript('zalando')}`);
    expect(evaluate(dom.window.document, dom.window.location, dom.window)).toBeNull();
    expect((dom.window as any).__AYWEBS_CAPTURE_READER__).toBe('keep');
  });

  it('cœur partagé hors domaine : générique, profil nul, matched=false', () => {
    const out = run(buildAyWebsCaptureScript('walmart'), 'https://example.test/product', productHtml('5.00'))!;
    expect(out.reader).toBeNull();
    expect(out.contract).toMatchObject({ store: 'walmart', matched: false });
  });

  it('sous-domaine mobile reconnu (m.asos.com)', () => {
    const out = run(buildAyWebsCaptureScript('asos'), 'https://m.asos.com/fr/prd/205112233', productHtml('30.00'))!;
    expect(out.contract).toMatchObject({ store: 'asos', matched: true });
  });
});

describe('serveur : notes reader et en-têtes', () => {
  it('captureReaderNote filtre et signale les incohérences', () => {
    expect(captureReaderNote({ store: 'walmart', readerVersion: 1, integration: 'generic', matched: true }, 'walmart'))
      .toEqual(['reader:walmart@1:generic']);
    expect(captureReaderNote({ store: 'walmart', readerVersion: 1, integration: 'generic', matched: false }, 'target'))
      .toEqual(['reader:walmart@1:generic', 'reader_domain_unmatched', 'reader_store_mismatch']);
    expect(captureReaderNote({ store: '<script>', readerVersion: 1, integration: 'generic' }, null)).toBeNull();
    expect(captureReaderNote({ store: 'x', readerVersion: 1, integration: 'hack' }, null)).toBeNull();
    expect(captureReaderNote(null, null)).toBeNull();
  });

});
