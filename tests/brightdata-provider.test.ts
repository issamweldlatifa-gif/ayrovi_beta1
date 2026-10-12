import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const KEYS = ['BRIGHTDATA_API_KEY', 'BRIGHTDATA_ZONE'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Bright Data Web Unlocker', () => {
  it('inactif sans clé ni zone : aucun appel réseau', async () => {
    delete process.env.BRIGHTDATA_API_KEY;
    delete process.env.BRIGHTDATA_ZONE;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { brightDataReady, fetchBrightDataHtml } = await import('../src/scraper/brightData');
    expect(brightDataReady()).toBe(false);
    const html = await fetchBrightDataHtml('https://www.example.com/p', 'generic', new AbortController().signal);
    expect(html).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('actif avec clé et zone : appel vers api.brightdata.com avec Bearer et zone', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    process.env.BRIGHTDATA_ZONE = 'web_unlocker_test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><body><h1>Produit</h1></body></html>', { status: 200 }),
    );
    const { fetchBrightDataHtml } = await import('../src/scraper/brightData');
    const html = await fetchBrightDataHtml('https://www.example.com/p', 'shein', new AbortController().signal);
    expect(html).toContain('Produit');
    const [endpoint, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('https://api.brightdata.com/request');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ zone: 'web_unlocker_test', url: 'https://www.example.com/p', format: 'raw', render: 'true' });
  });

  it('pas de rendu JavaScript pour les autres boutiques (coût)', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    process.env.BRIGHTDATA_ZONE = 'web_unlocker_test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html></html>', { status: 200 }));
    const { fetchBrightDataHtml } = await import('../src/scraper/brightData');
    await fetchBrightDataHtml('https://www.example.com/p', 'amazon', new AbortController().signal);
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body).not.toHaveProperty('render');
  });

  it('refuse une adresse privée avant tout envoi', async () => {
    process.env.BRIGHTDATA_API_KEY = 'test-key';
    process.env.BRIGHTDATA_ZONE = 'web_unlocker_test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { fetchBrightDataHtml } = await import('../src/scraper/brightData');
    await expect(fetchBrightDataHtml('http://127.0.0.1/admin', 'generic', new AbortController().signal)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('le scraper utilise le module et ne garde aucune trace de Jina', () => {
    const scraper = readFileSync('src/scraper/scraper.ts', 'utf8');
    expect(scraper).toContain("from './brightData'");
    expect(scraper).not.toContain('r.jina.ai');
  });
});

describe('journal de lecture Bright Data', () => {
  it('journalise un résumé par lien sans le chemin ni la requête', () => {
    const scraper = readFileSync('src/scraper/scraper.ts', 'utf8');
    expect(scraper).toContain("console.info('[scraper] read'");
    expect(scraper).toContain('hostname');
    expect(scraper).toContain('failureCode: result.failureCode');
    expect(scraper).not.toMatch(/console\.info\([^)]*\burl\b/);
  });
});
