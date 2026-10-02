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
  filterPurchasable,
  purchaseBlocker,
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
    expect(route).toContain("import { enrichCandidatesLiveStock, filterPurchasable, refreshLiveStock } from './services/lensLiveStock'");
    expect(route).toContain("router.post('/live-stock'");
    expect(route).toContain('fetcher: (url) => scraper.scrapeParsedPage(url).then((result) => result.data)');
    expect(route).toContain('await enrichCandidatesLiveStock(candidates');
    expect(route).toContain('filterPurchasable(liveCandidates)');
    expect(route).toContain('tokenizedCandidates(purchasable.candidates)');
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

/*
 * VÉRITÉ MARCHANDE (02/10/2026) — SerpApi trouve la page, la page fait la fiche.
 * Le prix lu remplace l'extrait et repasse par le calculateur ; le prix barré
 * voyage avec lui ; le budget couvre TOUTE la grille.
 */
describe('vérité marchande — le prix de la page remplace l’extrait SerpApi', () => {
  const route = readFileSync('src/ayrovix/routes.ts', 'utf8');
  const reprice = (price: number, currency: string) => ({ priceTnd: Math.round(price * 4 * 1000) / 1000, promo: null });

  it('couvre les 8 fiches de la grille par défaut, plus seulement 4', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({ availability: 'in_stock' }));
    const list = Array.from({ length: 8 }, (_, index) => candidate({ id: `c${index}`, sourceUrl: `https://shop.tn/p${index}` }));
    const { report } = await enrichCandidatesLiveStock(list, { fetcher });
    expect(report.budget).toBe(8);
    expect(fetcher).toHaveBeenCalledTimes(8);
  });

  it('remplace le prix SerpApi par le prix structuré de la page et le recalcule', () => {
    const item = candidate({ price: 309.95, currency: 'EUR', priceTnd: 1239.8 });
    const entry = entryFromPage(page({ price: 228.95, currency: 'EUR', originalPrice: 309.95, priceSource: 'json_ld' }), Date.now());
    expect(applyLiveStock(item, entry, reprice)).toBe(true);
    expect(item.price).toBe(228.95);
    expect(item.priceOrigin).toBe('merchant');
    expect(item.priceTnd).toBe(915.8);
    expect(item.originalPrice).toBe(309.95);
    expect(item.originalPriceTnd).toBe(1239.8);
    expect(item.priceVerificationStatus).toBe('VERIFIED');
  });

  it('un prix lu par simple regex n’écrase pas un extrait existant — il ne comble qu’un vide', () => {
    const withPrice = candidate({ price: 35.95, currency: 'EUR' });
    applyLiveStock(withPrice, entryFromPage(page({ price: 12, priceSource: 'context_regex' }), Date.now()), reprice);
    expect(withPrice.price).toBe(35.95);
    expect(withPrice.priceOrigin).toBeUndefined();

    const without = candidate({ price: null, currency: null });
    applyLiveStock(without, entryFromPage(page({ price: 12, priceSource: 'context_regex' }), Date.now()), reprice);
    expect(without.price).toBe(12);
    expect(without.priceOrigin).toBe('merchant');
    expect(without.priceVerificationStatus).toBeUndefined();
  });

  it('ne retient un prix barré que s’il est STRICTEMENT supérieur au prix courant', () => {
    expect(entryFromPage(page({ price: 50, originalPrice: 50 }), 1).originalPrice).toBeNull();
    expect(entryFromPage(page({ price: 50, originalPrice: 40 }), 1).originalPrice).toBeNull();
    expect(entryFromPage(page({ price: 50, originalPrice: 69.9 }), 1).originalPrice).toBe(69.9);
  });

  it('ne touche jamais au prix du catalogue AYROVI', () => {
    const own = candidate({ kind: 'catalog', price: 80, currency: 'TND' });
    applyLiveStock(own, entryFromPage(page({ price: 20, currency: 'EUR' }), 1), reprice);
    expect(own.price).toBe(80);
  });

  it('la description et la marque de la page complètent une fiche muette', () => {
    const item = candidate({ description: null, brand: null });
    applyLiveStock(item, entryFromPage(page({ description: 'Pantalon ouvert en molleton, taille élastiquée, logo brodé.', brand: 'Champion' }), 1));
    expect(item.description).toContain('molleton');
    expect(item.brand).toBe('Champion');
  });

  it('la relecture fraîche rend aussi le prix du jour, recalculé', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({ price: 228.95, originalPrice: 309.95, availability: 'in_stock' }));
    const { results } = await refreshLiveStock(['https://shop.tn/pants'], { fetcher, reprice });
    expect(results[0]).toMatchObject({ price: 228.95, currency: 'EUR', originalPrice: 309.95, priceTnd: 915.8, originalPriceTnd: 1239.8 });
  });

  it('la route passe le calculateur AYROVI au lecteur de pages (grille ET relecture)', () => {
    expect(route.split('reprice: (price, currency) =>').length - 1).toBe(2);
    expect(route).toContain('estimateWithDb(db, price, currency)');
  });

  it('plus aucun prix ne vient de l’image : ni vision, ni OCR, ni requête IA', () => {
    expect(route).toContain("recognizeImage(effectiveBuffer, effectiveMime, { withVision: false, withSignals: false })");
    expect(route).toContain('detectedPrice: null');
    expect(route).not.toContain('generateOptimizedSearch(');
    expect(route).not.toContain('analyzeResultRelevance(');
    expect(route).not.toContain('tokenizedDetectedPrice(');
  });
});

/*
 * FILTRE D'ACHETABILITÉ (02/10/2026) — on ne montre pas ce qu'on ne peut pas
 * acheter. Une fiche atteint le client seulement si SA page a été lue et publie
 * prix structuré + stock positif + image. Le reste est écarté et compté.
 */
describe('achetabilité — seules les fiches prouvées atteignent le client', () => {
  const reprice = (price: number, currency: string) => ({ priceTnd: price * 4, promo: null });
  const proven = (over: Partial<AyrovixCandidate> = {}, pageOver: Partial<ParsedProductPage> = {}) => {
    const item = candidate({ image: 'https://img/1.jpg', ...over });
    applyLiveStock(item, entryFromPage(page({ availability: 'in_stock', ...pageOver }), Date.now()), reprice);
    return item;
  };

  it('garde une fiche dont la page publie prix, stock positif et image', () => {
    expect(purchaseBlocker(proven())).toBeNull();
  });

  it('écarte une fiche dont la page n’a pas été lue (délai, blocage, autre produit)', () => {
    expect(purchaseBlocker(candidate({ image: 'https://img/1.jpg' }))).toBe('page_non_lue');
  });

  it('écarte une page lue sans prix structuré', () => {
    const item = proven({ price: null, currency: null }, { price: 0 });
    expect(purchaseBlocker(item)).toBe('prix_non_lu');
  });

  it('écarte une rupture annoncée, ou toutes les tailles indisponibles', () => {
    expect(purchaseBlocker(proven({}, { availability: 'out_of_stock' }))).toBe('rupture');
    // Les tailles explicitement indisponibles sont déjà retirées par le parseur :
    // il ne reste aucune preuve positive → écartée (stock inconnu), jamais montrée.
    const allOut = proven({}, { availability: 'unknown', variants: { sizes: [], colors: [], details: [sizeDetail('M', false), sizeDetail('L', false)] } });
    expect(purchaseBlocker(allOut)).not.toBeNull();
    // Stock publié négatif par variante (drapeau `stock: false`) → rupture.
    const flagged = proven({}, { availability: 'unknown', variants: { sizes: [], colors: [], details: [{ ...sizeDetail('M'), stock: false }] } });
    expect(purchaseBlocker(flagged)).toBe('rupture');
  });

  it('écarte un stock que la page ne confirme pas — un silence n’est pas un oui', () => {
    expect(purchaseBlocker(proven({}, { availability: 'unknown' }))).toBe('stock_inconnu');
  });

  it('accepte une variante au stock PUBLIÉ positif même si le produit ne dit rien', () => {
    const oneSize = proven({}, { availability: 'unknown', variants: { sizes: [], colors: [], details: [{ ...sizeDetail('M'), stock: true }, { ...sizeDetail('L'), stock: false }] } });
    expect(purchaseBlocker(oneSize)).toBeNull();
    expect(oneSize.sourceRead).toMatchObject({ variantsAvailable: 1, variantsUnavailable: 1 });
    // Une taille listée SANS drapeau de stock n'est pas une preuve.
    const silent = proven({}, { availability: 'unknown', variants: { sizes: [], colors: [], details: [sizeDetail('M')] } });
    expect(purchaseBlocker(silent)).toBe('stock_inconnu');
  });

  it('écarte une fiche sans aucune image', () => {
    expect(purchaseBlocker(proven({ image: '' }, { images: [] }))).toBe('sans_image');
  });

  it('le catalogue AYROVI passe tel quel : il porte sa propre preuve de stock', () => {
    expect(purchaseBlocker(candidate({ kind: 'catalog' }))).toBeNull();
  });

  it('par défaut montre les fiches non lues — n\'écarte que la rupture confirmée', () => {
    const { candidates: kept, report } = filterPurchasable([
      proven({ id: 'ok' }),
      candidate({ id: 'unread', image: 'x' }),
      proven({ id: 'out' }, { availability: 'out_of_stock' }),
    ]);
    expect(kept.map((item) => item.id)).toEqual(['ok', 'unread']);
    expect(report).toEqual({ kept: 2, excluded: 1, reasons: { rupture: 1 } });
  });

  it('AYROVI_LENS_REQUIRE_PROOF=true réactive le filtre strict', () => {
    process.env.AYROVI_LENS_REQUIRE_PROOF = 'true';
    try {
      const { candidates: kept, report } = filterPurchasable([
        proven({ id: 'ok' }),
        candidate({ id: 'unread', image: 'x' }),
        proven({ id: 'out' }, { availability: 'out_of_stock' }),
      ]);
      expect(kept.map((item) => item.id)).toEqual(['ok']);
      expect(report).toEqual({ kept: 1, excluded: 2, reasons: { page_non_lue: 1, rupture: 1 } });
    } finally { delete process.env.AYROVI_LENS_REQUIRE_PROOF; }
  });

  it('se relâche sans redéploiement', () => {
    process.env.AYROVI_LENS_REQUIRE_PROOF = 'false';
    try {
      expect(filterPurchasable([candidate()]).candidates).toHaveLength(1);
    } finally { delete process.env.AYROVI_LENS_REQUIRE_PROOF; }
  });

  it('la route filtre APRÈS la lecture des pages et AVANT la réponse, et dit combien', () => {
    const route = readFileSync('src/ayrovix/routes.ts', 'utf8');
    const block = route.split("router.post('/analyze-image'")[1].split("router.post('/analyze-url'")[0];
    expect(block.indexOf('await enrichCandidatesLiveStock(')).toBeLessThan(block.indexOf('filterPurchasable(liveCandidates)'));
    expect(block).toContain('tokenizedCandidates(purchasable.candidates)');
    expect(block).toContain('excluded: { count: purchasable.report.excluded');
  });
});
