/**
 * AYWEBs — enveloppe UNIQUE des lecteurs de capture (12/11/2026).
 *
 * Chaque boutique enregistrée et capturable reçoit le même emballage
 * (profil, garde de domaine, tampon `contract`), avec son intégration propre :
 * moteur d’offres dédié, ou lot indépendant pour Temu/AliExpress.
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT, buildAyWebsCaptureScript } from '../src/aywebs/captureScript';
import {
  AYWEBS_CAPTURE_CONTRACT_VERSION,
  AYWEBS_CAPTURE_READERS,
  resolveAyWebsCaptureReader,
} from '../src/aywebs/captureReaders/registry';
import { AYWEBS_DEDICATED_CAPTURE_SCRIPTS, usesMigratedOfferReader } from '../src/aywebs/storeScripts';
import { captureReaderNote } from '../src/aywebs/webviewCapture';
import { AYWEBS_STORES } from '../shared/aywebsStores';

function run(script: string, url: string, html: string): Record<string, any> | null {
  const dom = new JSDOM(html, { url });
  try {
    const evaluate = new Function('document', 'location', 'window', `return ${script}`);
    const raw = evaluate(dom.window.document, dom.window.location, dom.window) as string | null;
    return raw == null ? null : JSON.parse(raw);
  } finally { dom.window.close(); }
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
      const expected = AYWEBS_CAPTURE_READERS[store.id]?.integration ?? 'dedicated';
      expect(reader!.integration).toBe(expected);
      const script = buildAyWebsCaptureScript(store.id);
      expect(script).not.toBe(AYWEBS_CAPTURE_SCRIPT);
      expect(script).toContain('__AYWEBS_CAPTURE_READER__');
      expect(script).not.toContain('`');
    }
  });

  it('un moteur dédié est effectivement servi pour chaque boutique migrée', () => {
    const unchanged = ['amazon', 'zalando', 'temu', 'aliexpress', 'shein'];
    for (const store of capturable) {
      expect(usesMigratedOfferReader(store.id), store.id).toBe(!unchanged.includes(store.id));
      if (!usesMigratedOfferReader(store.id)) continue;
      const script = buildAyWebsCaptureScript(store.id);
      expect(script).toContain('ambiguousMatrix'); // strict offer publication in Zalando's engine
      expect(run(script, 'https://unrelated.example/product', productHtml('99.00'))).toBeNull();
      const parsed = run(script, store.homeUrl, productHtml('19.99'))!;
      expect(parsed.contract).toMatchObject({ store: store.id, matched: true, integration: 'dedicated' });
      expect(run(AYWEBS_CAPTURE_SCRIPT, store.homeUrl, productHtml('19.99'))?.reader).toEqual(parsed.reader);
    }
    expect(Object.keys(AYWEBS_DEDICATED_CAPTURE_SCRIPTS).sort()).toEqual(['amazon', 'zalando']);
  });

  it('inconnu / sans store_id : répartiteur de compatibilité', () => {
    expect(resolveAyWebsCaptureReader('nope')).toBeNull();
    expect(buildAyWebsCaptureScript('nope')).toBe(AYWEBS_CAPTURE_SCRIPT);
    expect(buildAyWebsCaptureScript(null)).toBe(AYWEBS_CAPTURE_SCRIPT);
  });

  it('moteur d’offres (Walmart) : profil standard, tampon contract, prix structuré lu', () => {
    const out = run(buildAyWebsCaptureScript('walmart'), 'https://www.walmart.com/ip/item/123', productHtml('19.99'))!;
    expect(out.reader).toEqual({ id: 'walmart', version: 2 });
    expect(out.contract).toEqual({
      v: AYWEBS_CAPTURE_CONTRACT_VERSION, store: 'walmart', readerVersion: 2, integration: 'dedicated', matched: true,
    });
    expect(out.priceCandidates).toContainEqual(expect.objectContaining({ source: 'json_ld' }));
  });

  it('moteur d’offres (Sephora) : structured_only conservé + tampon', () => {
    const out = run(buildAyWebsCaptureScript('sephora'), 'https://www.sephora.com/product/item', productHtml('42.00'))!;
    expect(out.reader).toEqual({ id: 'sephora', version: 2 });
    expect(out.contract).toMatchObject({ store: 'sephora', integration: 'dedicated', matched: true });
  });

  it('ASOS garde le prix et le stock de chaque taille sans extrapoler le prix courant', () => {
    const url = 'https://www.asos.com/fr/test/robe/prd/204512345';
    const group = {
      '@context': 'https://schema.org', '@type': 'ProductGroup', name: 'Robe satin', productGroupID: '204512345',
      hasVariant: [
        { '@type': 'Product', sku: '204512346', size: '34', offers: { '@type': 'Offer', price: 35.99, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } },
        { '@type': 'Product', sku: '204512347', size: '36', offers: { '@type': 'Offer', price: 39.99, priceCurrency: 'EUR', availability: 'https://schema.org/OutOfStock' } },
      ],
    };
    const html = `<!doctype html><html lang="fr"><head><title>Robe satin</title>
      <script type="application/ld+json">${JSON.stringify(group)}</script></head>
      <body><main><h1>Robe satin</h1><div data-testid="current-price">35,99 €</div></main></body></html>`;
    const out = run(buildAyWebsCaptureScript('asos'), url, html)!;
    expect(out.variantMatrix).toEqual(expect.arrayContaining([
      expect.objectContaining({ variantId: '204512346', price: '35.99 EUR', available: true }),
      expect.objectContaining({ variantId: '204512347', price: '39.99 EUR', available: false }),
    ]));
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
    const out = run(buildAyWebsCaptureScript('temu'), 'https://example.test/product', productHtml('5.00'))!;
    expect(out.reader).toBeNull();
    expect(out.contract).toMatchObject({ store: 'temu', matched: false });
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
