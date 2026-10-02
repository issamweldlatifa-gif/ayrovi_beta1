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

it('extrait les pointures Zalando depuis le sélecteur et le JSON embarqué', async () => {
  const { parseProductPageHtml } = await import('../src/scraper/productPageParser');
  const html = `<html><body>
    <h1>Alphafly</h1>
    <div class="pdp-size-picker">
      <button type="button">40</button>
      <button type="button">41</button>
      <button type="button">42.5</button>
    </div>
    <script type="application/json">{"size":"43","color":"fuchsia glow"}</script>
  </body></html>`;
  const parsed = parseProductPageHtml(html, 'https://www.zalando.fr/nike-alphafly.html', 'generic');
  expect(parsed.variants.sizes).toEqual(expect.arrayContaining(['40', '41', '42.5', '43']));
  expect(parsed.variants.colors.map((c) => c.toLowerCase())).toEqual(expect.arrayContaining(['fuchsia glow']));
});

it('lit les pointures Running Point (titre Shopify « couleur / 41 »)', () => {
  const html = `<html><body><script type="application/json">${JSON.stringify({
    title: 'Alphafly 3',
    variants: [
      { id: 1, title: 'blau, koralle / 41', sku: 'A', price: { amount: 228.95 }, available: true },
      { id: 2, title: 'blau, koralle / 42,5', sku: 'B', price: { amount: 228.95 }, available: true },
    ],
  })}</script></body></html>`;
  const parsed = parseProductPageHtml(html, 'https://www.running-point.fr/products/x', 'generic');
  expect(parsed.variants.sizes).toEqual(expect.arrayContaining(['41', '42,5']));
  expect(parsed.variants.colors.some((c) => /koralle|blau/i.test(c))).toBe(true);
});

it('lit le tableau Running Emotion data-size-equivalence="41 EU"', () => {
  const html = `<html><body>
    <table><tr data-size-id="1282" data-size-text="8 USA" data-size-equivalence="41 EU"><td>8 USA</td><td>41 EU</td></tr>
    <tr data-size-id="1283" data-size-equivalence="42 EU"><td>42 EU</td></tr></table>
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'Product', name: 'Alphafly', offers: { price: '216.99', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
    })}</script>
  </body></html>`;
  const parsed = parseProductPageHtml(html, 'https://www.runningemotion.com/fr/x', 'generic');
  expect(parsed.variants.sizes).toEqual(expect.arrayContaining(['41', '42']));
  expect(parsed.price).toBe(216.99);
});
