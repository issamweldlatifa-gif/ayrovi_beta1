import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProductPageHtml } from '../src/scraper/productPageParser';
import {
  LENS_ANALYZE_DEADLINE_DEFAULT_MS,
  LENS_ANALYZE_DEADLINE_MIN_MS,
  lensAnalyzeDeadlineMs,
} from '../src/ayrovix/services/lensDeadline';

describe('Jina désactivé — Bright Data est le fournisseur unique de rendu', () => {
  it('le scraper ne contacte plus r.jina.ai', () => {
    const scraper = readFileSync('src/scraper/scraper.ts', 'utf8');
    expect(scraper).not.toContain('r.jina.ai');
    expect(scraper).not.toContain("provider: 'jina'");
    expect(scraper).not.toContain('AYROVI_JINA_READER');
    expect(scraper).toContain("provider: 'brightdata'");
  });

  it('le rendu passe par Bright Data, activé seulement avec clé et zone', () => {
    const scraper = readFileSync('src/scraper/scraper.ts', 'utf8');
    expect(scraper).toContain('if (!brightDataReady())');
    expect(scraper).toContain('fetchBrightDataHtml(');
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
    // Contrat réel après centralisation des délais dans lensDeadline.ts :
    // 45 s par défaut, plancher dur 15 s (bornage 15–90 s) — jamais moins que
    // les 12 s historiquement exigés. Test COMPORTEMENTAL, plus un grep source.
    expect(LENS_ANALYZE_DEADLINE_DEFAULT_MS).toBeGreaterThanOrEqual(12_000);
    expect(LENS_ANALYZE_DEADLINE_MIN_MS).toBeGreaterThanOrEqual(12_000);
    expect(lensAnalyzeDeadlineMs({})).toBe(LENS_ANALYZE_DEADLINE_DEFAULT_MS);
    // Une valeur env trop courte remonte au plancher au lieu d'être appliquée.
    expect(lensAnalyzeDeadlineMs({ AYROVI_LENS_ANALYZE_DEADLINE_MS: '1000' })).toBe(LENS_ANALYZE_DEADLINE_MIN_MS);
    // Une valeur env absurde ou invalide retombe sur le défaut.
    expect(lensAnalyzeDeadlineMs({ AYROVI_LENS_ANALYZE_DEADLINE_MS: 'abc' })).toBe(LENS_ANALYZE_DEADLINE_DEFAULT_MS);
  });
});
