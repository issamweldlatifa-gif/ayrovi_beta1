import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProductPageHtml } from '../src/scraper/productPageParser';

describe('Lecture de page marchande — direct et repli Jina', () => {
  it('garde la page capturée en priorité et démarre Jina après les sondes directes', () => {
    const scraper = readFileSync('src/scraper/scraper.ts', 'utf8');
    expect(scraper).toContain("typeof options.pageHtml === 'string'");
    expect(scraper).toContain('readerProbePlan(storeType)');
    expect(scraper).toContain('readerJinaEnabled()');
    expect(scraper).toContain('readerJinaHeadstartMs()');
    expect(scraper).toContain('https://r.jina.ai/');
    expect(scraper).toContain("provider: 'jina'");
  });

  it('le parseur lit le JSON-LD Zalando (prix 309.95 EUR) comme le ferait le HTML rendu', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org/',
      '@type': 'Product',
      name: 'AIR ZOOM ALPHAFLY NEXT% 3 - Chaussures de running sur route - fuchsia glow',
      sku: 'N1241A1EV-I11',
      image: ['https://img01.ztat.net/article/x.jpg'],
      offers: {
        '@type': 'Offer',
        price: '309.95',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
      },
    })}</script></head><body><h1>Alphafly</h1></body></html>`;
    const parsed = parseProductPageHtml(html, 'https://www.zalando.fr/nike-alphafly-n1241a1ev-i11.html', 'generic');
    expect(parsed.price).toBe(309.95);
    expect(parsed.currency).toBe('EUR');
    expect(parsed.priceSource).toBe('json_ld');
    expect(parsed.availability).toBe('in_stock');
  });

  it('Lens laisse assez de temps au lecteur (défaut ≥ 12 s)', () => {
    const live = readFileSync('src/ayrovix/services/lensLiveStock.ts', 'utf8');
    expect(live).toMatch(/DEFAULT_DEADLINE_MS = 15000/);
  });
});
