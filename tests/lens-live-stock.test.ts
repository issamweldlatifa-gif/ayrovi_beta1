/*
 * STOCK ET TAILLES VIVANTS — le lien SerpApi devient une source (01/10/2026).
 *
 * Google Lens rend un lien ; la page produit derrière ce lien est la seule
 * source honnête du stock et des tailles. Ces tests vérifient que la lecture
 * est bornée (budget), économe (cache), jamais bloquante (échéance), et
 * surtout qu'AUCUN fait n'est posé sur un produit qui n'est pas celui de la
 * page lue.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyLiveStock,
  enrichCandidatesLiveStock,
  entryFromPage,
  refreshLiveStock,
  toContractAvailability,
  type LiveStockFetcher,
} from '../src/ayrovix/services/lensLiveStock';
import { inspectVariantOrder } from '../src/ayrovix/services/variantAvailability';
import {
  hostAllowsProbe,
  probeCooldowns,
  recordProbeFailure,
  recordProbeSuccess,
  resetProbeState,
} from '../src/scraper/hostCircuit';
import type { ParsedProductPage } from '../src/scraper/productPageParser';
import type { AyrovixCandidate } from '../src/ayrovix/types';

const TITLE = 'Champion Sportswear Open Hem Pants';

const candidate = (over: Partial<AyrovixCandidate> = {}): AyrovixCandidate => ({
  id: 'c', kind: 'external', title: TITLE, brand: null, model: null,
  colors: [], sizes: [], source: 'Sports Direct', sourceUrl: 'https://shop.tn/pants',
  image: '', price: 35.95, currency: 'EUR', priceTnd: null, match: 90, ...over,
} as AyrovixCandidate);

const page = (over: Partial<ParsedProductPage> = {}): ParsedProductPage => ({
  title: TITLE, price: 35.95, currency: 'EUR', images: [], externalId: 'X1',
  variants: { sizes: [], colors: [], details: [] },
  availability: 'unknown', priceSource: 'json_ld', ...over,
} as ParsedProductPage);

const sizeDetail = (size: string, available = true) => ({
  id: `v-${size}`, label: size, size, color: null, available, price: null,
});

let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-live-stock-'));
  process.env.AYROVI_LENS_LIVE_CACHE_DIR = dir;
  // Les contrats de variantes vivent sur disque : sans ce bac à sable, un
  // contrat écrit par un test précédent ferait « passer » le gardien d'un autre.
  process.env.AYROVI_VARIANT_CACHE_DIR = path.join(dir, 'contracts');
  delete process.env.AYROVI_LENS_LIVE_STOCK;
  delete process.env.AYROVI_LENS_LIVE_BUDGET;
  delete process.env.AYROVI_LENS_LIVE_DEADLINE_MS;
  delete process.env.AYROVI_LENS_LIVE_TTL_MS;
  delete process.env.AYROVI_LENS_LIVE_CONCURRENCY;
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); resetProbeState(); });

describe('stock vivant — la dépense est bornée', () => {
  it('ne visite que les premières fiches, pas toute la grille', async () => {
    process.env.AYROVI_LENS_LIVE_BUDGET = '2';
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({ availability: 'in_stock' }));
    const list = Array.from({ length: 8 }, (_, index) => candidate({ id: `c${index}` }));
    const { candidates: out, report } = await enrichCandidatesLiveStock(list, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(report.fetched).toBe(2);
    expect(out.filter((item) => item.availability === 'in_stock').length).toBe(2);
    // Les autres restent tels quels : jamais inventés.
    expect(out.slice(2).every((item) => item.availability === undefined)).toBe(true);
  });

  it('ignore une fiche sans lien et le catalogue interne', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({ availability: 'in_stock' }));
    const list = [
      candidate({ id: 'no-url', sourceUrl: '' }),
      candidate({ id: 'internal', kind: 'catalog', sourceUrl: 'https://shop.tn/x' }),
    ];
    await enrichCandidatesLiveStock(list, { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('la deuxième recherche du même produit ne repaie pas', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({ availability: 'in_stock' }));
    await enrichCandidatesLiveStock([candidate({})], { fetcher });
    const second = await enrichCandidatesLiveStock([candidate({})], { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(second.candidates[0].availability).toBe('in_stock');
    expect(second.report.cacheHits).toBe(1);
  });

  it('se coupe entièrement sans redéploiement', async () => {
    process.env.AYROVI_LENS_LIVE_STOCK = 'false';
    const fetcher = vi.fn<LiveStockFetcher>();
    const { candidates: out } = await enrichCandidatesLiveStock([candidate({})], { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(out[0].availability).toBeUndefined();
  });
});

describe('stock vivant — la preuve avant les faits', () => {
  it('refuse le stock et les tailles d’un AUTRE produit', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({
      title: 'Cafetière italienne inox 6 tasses',
      availability: 'in_stock',
      variants: { sizes: ['6 tasses'], colors: [], details: [] },
    }));
    const { candidates: out, report } = await enrichCandidatesLiveStock([candidate({})], { fetcher });
    expect(out[0].availability).toBeUndefined();
    expect(out[0].sizes).toEqual([]);
    expect(report.applied).toBe(0);
    // Une page qui parle d'autre chose n'est même pas mémorisée.
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  it('ne mémorise pas une page qui ne dit RIEN', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({ title: 'Page vide', availability: 'unknown' }));
    await enrichCandidatesLiveStock([candidate({})], { fetcher });
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  it('un échec n’est pas mémorisé : la recherche suivante réessaie', async () => {
    const fetcher = vi.fn<LiveStockFetcher>()
      .mockRejectedValueOnce(new Error('DIRECT_HTTP_403'))
      .mockResolvedValueOnce(page({ availability: 'in_stock' }));
    const first = await enrichCandidatesLiveStock([candidate({})], { fetcher });
    expect(first.candidates[0].availability).toBeUndefined();
    const second = await enrichCandidatesLiveStock([candidate({})], { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(second.candidates[0].availability).toBe('in_stock');
  });
});

describe('stock vivant — ce que la page dit est posé tel quel', () => {
  it('rapporte une rupture de stock sans la transformer en disponibilité', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({ availability: 'out_of_stock' }));
    const { candidates: out } = await enrichCandidatesLiveStock([candidate({})], { fetcher });
    expect(out[0].availability).toBe('out_of_stock');
  });

  it('laisse unknown ce que la page ne dit pas', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({ availability: 'unknown' }));
    const { candidates: out } = await enrichCandidatesLiveStock([candidate({})], { fetcher });
    expect(out[0].availability).toBeUndefined();
  });

  it('rapporte tailles, couleurs et images publiées par le marchand', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({
      availability: 'limited',
      images: ['https://cdn.tn/a.jpg', 'https://cdn.tn/b.jpg'],
      variants: {
        sizes: [], colors: [],
        details: [
          sizeDetail('8 (XS)'), sizeDetail('10 (S)'),
          { ...sizeDetail('12 (M)'), color: 'Noir' },
        ],
      },
    }));
    const { candidates: out } = await enrichCandidatesLiveStock([candidate({})], { fetcher });
    expect(out[0].availability).toBe('limited');
    expect(out[0].sizes).toEqual(['8 (XS)', '10 (S)', '12 (M)']);
    expect(out[0].colors).toEqual(['Noir']);
    expect(out[0].images).toEqual(['https://cdn.tn/a.jpg', 'https://cdn.tn/b.jpg']);
  });

  it('n’écrase jamais un fait déjà présent par une source externe', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({
      availability: 'out_of_stock',
      variants: { sizes: ['14 (L)'], colors: [], details: [] },
    }));
    const known = candidate({ availability: 'in_stock', sizes: ['10 (S)'], colors: ['Rouge'] });
    const { candidates: out } = await enrichCandidatesLiveStock([known], { fetcher });
    expect(out[0].sizes).toEqual(['10 (S)']);
    expect(out[0].colors).toEqual(['Rouge']);
    // La disponibilité, elle, est une PREUVÉ datée : la lecture fraîche gagne.
    expect(out[0].availability).toBe('out_of_stock');
  });

  it('exclut une taille que le marchand marque explicitement indisponible', async () => {
    const entry = entryFromPage(page({
      variants: { sizes: [], colors: [], details: [sizeDetail('10 (S)', false)] },
    }), Date.now());
    expect(entry.sizes).toEqual([]);
  });
});

describe('stock vivant — jamais bloquant', () => {
  it('rend ce qui est prêt à l’échéance, sans attendre le site lent', async () => {
    process.env.AYROVI_LENS_LIVE_DEADLINE_MS = '60';
    const slow = vi.fn<LiveStockFetcher>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      return page({ availability: 'in_stock' });
    });
    const started = Date.now();
    const { candidates: out, report } = await enrichCandidatesLiveStock([candidate({})], { fetcher: slow });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(report.fetched).toBe(0);
    expect(out[0].availability).toBeUndefined();
  });

  it('sans fetcher injecté, la grille est rendue intacte', async () => {
    const { candidates: out, report } = await enrichCandidatesLiveStock([candidate({})]);
    expect(out).toHaveLength(1);
    expect(report.applied).toBe(0);
  });
});

describe('câblage — le lien SerpApi est bien lu dans le pipeline Lens', () => {
  const route = readFileSync('src/ayrovix/routes.ts', 'utf8');
  const scraper = readFileSync('src/scraper/scraper.ts', 'utf8');

  it('la grille Lens passe par l’enrichissement stock avant réponse', () => {
    expect(route).toContain("import { enrichCandidatesLiveStock, refreshLiveStock } from './services/lensLiveStock'");
    expect(route).toContain("router.post('/live-stock'");
    expect(route).toContain('fetcher: (url) => scraper.scrapeParsedPage(url).then((result) => result.data)');
    expect(route).toContain('await enrichCandidatesLiveStock(candidates');
    expect(route).toContain('tokenizedCandidates(liveCandidates)');
  });

  it('le scraper est réutilisé, jamais recòpié : même chaîne de confiance', () => {
    expect(scraper).toContain('public async scrapeParsedPage(rawUrl: string)');
    // La nouvelle entrée délègue à la même sonde interne (direct puis rendu).
    expect(scraper).toContain('return this.scrapeWithHttp(url, this.detectStore(url));');
    // Et l'assainissement d'URL reste obligatoire avant tout fetch.
    expect(scraper).toContain('const safeTarget = await resolveSafeHttpUrl(cleaned);');
  });

  it('la dépense est tracée, donc mesurable', () => {
    for (const key of ['liveStockMs', 'liveStockFetched', 'liveStockCacheHits', 'liveStockApplied']) {
      expect(route).toContain(`mark(trace, '${key}'`);
    }
  });
});

describe('relecture fraîche — le contrat qui autorise une commande', () => {
  it('relit SANS servir le cache et rend une preuve datée', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({ availability: 'in_stock' }));
    const url = 'https://shop.tn/pants';
    // D'abord une lecture par la grille (qui, elle, remplit le cache)…
    await enrichCandidatesLiveStock([candidate({ sourceUrl: url })], { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    // …puis le bouton « vérifier » : la page est RELUE, pas servie depuis le cache.
    const { results } = await refreshLiveStock([url], { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(results[0].availability).toBe('in_stock');
    expect(Date.parse(results[0].checkedAt)).toBeGreaterThan(0);
    expect(results[0].reason).toContain('marchande');
  });

  it('enregistre le contrat de variantes : la commande passe alors le gardien', async () => {
    const url = 'https://shop.tn/hoody';
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({
      availability: 'in_stock',
      variants: {
        sizes: [], colors: [],
        details: [
          { id: 'v8', label: '8 (XS)', size: '8 (XS)', color: null, available: true, stock: true, price: null },
          { id: 'v16', label: '16 (XL)', size: '16 (XL)', color: null, available: true, stock: false, price: null },
        ],
      },
    }));
    // AVANT la relecture : aucune commande avec taille ne passe.
    const before = inspectVariantOrder(url, '8 (XS)');
    expect(before.allowed).toBe(false);
    expect(before.code).toBe('NO_CONTRACT');

    const { results } = await refreshLiveStock([url], { fetcher });
    expect(results[0].sizes).toEqual(['8 (XS)', '16 (XL)']);

    const allowed = inspectVariantOrder(url, '8 (XS)');
    expect(allowed.allowed).toBe(true);
    expect(allowed.availability).toBe('available');
    // Une taille que le marchand déclare indisponible reste refusée.
    const refused = inspectVariantOrder(url, '16 (XL)');
    expect(refused.allowed).toBe(false);
    expect(refused.code).toBe('VARIANT_UNAVAILABLE');
  });

  it('un silence de stock reste unknown : le gardien refuse, il ne devine pas', async () => {
    const url = 'https://shop.tn/silent';
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({
      availability: 'unknown',
      variants: { sizes: ['10 (S)'], colors: [], details: [] },
    }));
    const { results } = await refreshLiveStock([url], { fetcher });
    expect(results[0].availability).toBe('unknown');
    const verdict = inspectVariantOrder(url, '10 (S)');
    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe('VARIANT_AVAILABILITY_UNKNOWN');
  });

  it('une page illisible ne fonde AUCUN contrat', async () => {
    const url = 'https://shop.tn/broken';
    const { results } = await refreshLiveStock([url], { fetcher: async () => null });
    expect(results[0].availability).toBe('unknown');
    expect(inspectVariantOrder(url, '10 (S)').allowed).toBe(false);
  });

  it('borne le nombre de liens relus et ignore les non-liens', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({ availability: 'in_stock' }));
    const urls = [...Array.from({ length: 12 }, (_, index) => `https://shop.tn/p${index}`), 'pas-un-lien'];
    const { results } = await refreshLiveStock(urls, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(results).toHaveLength(8);
  });
});

describe('vocabulaire du contrat', () => {
  it('limited reste positif, out_of_stock négatif, silence unknown', () => {
    expect(toContractAvailability('in_stock')).toBe('available');
    expect(toContractAvailability('limited')).toBe('available');
    expect(toContractAvailability('out_of_stock')).toBe('unavailable');
    expect(toContractAvailability('unknown')).toBe('unknown');
  });
});

describe('coupe-circuit par hôte — un mur ne se sonde pas à chaque recherche', () => {
  const url = 'https://blocked.tn/p';

  it('met l\'hôte au repos après plusieurs échecs, puis le laisse repasser', () => {
    expect(hostAllowsProbe(url)).toBe(true);
    recordProbeFailure(url); recordProbeFailure(url);
    expect(hostAllowsProbe(url)).toBe(true);          // pas encore au seuil
    recordProbeFailure(url);
    expect(hostAllowsProbe(url)).toBe(false);          // seuil atteint
    expect(probeCooldowns().map((entry) => entry.host)).toContain('blocked.tn');
    recordProbeSuccess(url);                           // succès = remise à zéro
    expect(hostAllowsProbe(url)).toBe(true);
  });

  it('la grille saute un hôte au repos sans payer de sonde', async () => {
    recordProbeFailure(url); recordProbeFailure(url); recordProbeFailure(url);
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({ availability: 'in_stock' }));
    const { report } = await enrichCandidatesLiveStock([candidate({ sourceUrl: url })], { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(report.applied).toBe(0);
  });
});

describe('applyLiveStock — pose des faits, jamais des suppositions', () => {
  it('ne compte pas comme appliqué une entrée muette', () => {
    const target = candidate({});
    const applied = applyLiveStock(target, { availability: 'unknown', sizes: [], colors: [], images: [], variants: [], at: Date.now() });
    expect(applied).toBe(false);
    expect(target.availability).toBeUndefined();
  });

  it('dédoublonne les images et complète l’image principale manquante', () => {
    const target = candidate({ image: '', images: [] });
    applyLiveStock(target, {
      availability: 'unknown', sizes: [], colors: [], variants: [],
      images: ['https://cdn.tn/a.jpg', 'https://cdn.tn/a.jpg', 'https://cdn.tn/b.jpg'],
      at: Date.now(),
    });
    expect(target.image).toBe('https://cdn.tn/a.jpg');
    expect(target.images).toEqual(['https://cdn.tn/a.jpg', 'https://cdn.tn/b.jpg']);
  });
});
