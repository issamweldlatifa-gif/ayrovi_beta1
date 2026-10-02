import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProductPageHtml } from '../src/scraper/productPageParser';
import { isTrustedRenderTarget } from '../src/scraper/merchantDomains';

describe('lecteur Jina — repli quand Zalando coupe le fetch direct', () => {
  it('le scrape appelle r.jina.ai avec le HTML rendu, sauf si AYROVI_JINA_READER=false', () => {
    const scraper = readFileSync('src/scraper/scraper.ts', 'utf8');
    expect(scraper).toContain('https://r.jina.ai/${url}');
    expect(scraper).toContain("provider: 'jina'");
    expect(scraper).toContain("AYROVI_JINA_READER !== 'false'");
    expect(scraper).toContain("'X-Return-Format': 'html'");
  });

  it('Zalando / Alltricks sont des cibles de rendu de confiance par défaut', () => {
    expect(isTrustedRenderTarget('https://www.zalando.fr/p/n1241a1ev-i11.html')).toBe(true);
    expect(isTrustedRenderTarget('https://www.alltricks.fr/produit/x')).toBe(true);
  });

  it('le parseur lit le JSON-LD Zalando (prix 309.95 EUR) comme le ferait le HTML Jina', () => {
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
    expect(live).toMatch(/DEFAULT_DEADLINE_MS = 12000/);
  });
});
