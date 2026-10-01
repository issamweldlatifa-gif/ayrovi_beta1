/**
 * LENS « LIENS D'ABORD » — SerpApi ne fournit que des LIENS ; prix, photos, stock
 * et options sont lus sur la page du marchand puis chiffrés par le moteur AYROVI.
 * L'ancien système (prix SerpApi) vit seul dans `src/ayrovix/legacy/`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/server';
import { lensSourceMode, isLegacyLensSource } from '../src/ayrovix/lensSource';
import { linksFromVisualMatches, linkToStub, stubToLink, normalizeLinkUrl } from '../src/ayrovix/linkFirst/linkSource';
import { classifyOption, factsFromPage } from '../src/ayrovix/linkFirst/pageFacts';
import { resolveLinks } from '../src/ayrovix/linkFirst/linkEngine';
import { lensImageKey } from '../src/ayrovix/services/lensRecognitionCache';
import { legacyEnrichDescriptions } from '../src/ayrovix/legacy';
import { parseProductPageHtml } from '../src/scraper/productPageParser';
import { productToView } from '../client/src/shop/adapter';
import type { ParsedProductPage } from '../src/scraper/productPageParser';

afterEach(() => { delete process.env.AYROVI_LENS_SOURCE; });

function page(over: Partial<ParsedProductPage> = {}): ParsedProductPage {
  return {
    title: 'Parfum Rose Noire', brand: 'Maison', description: 'Eau de parfum', price: 80, currency: 'EUR',
    images: ['https://cdn.lf-one.test/1.jpg', 'https://cdn.lf-one.test/2.jpg'], colorImages: {}, externalId: 'p1',
    variants: { sizes: [], colors: [], details: [] } as any, availability: 'in_stock', priceSource: 'json_ld', ...over,
  };
}

describe('source des fiches', () => {
  it('« liens d’abord » par défaut ; legacy seulement sur demande explicite', () => {
    expect(lensSourceMode()).toBe('links');
    process.env.AYROVI_LENS_SOURCE = 'legacy';
    expect(isLegacyLensSource()).toBe(true);
    process.env.AYROVI_LENS_SOURCE = 'n’importe quoi';
    expect(lensSourceMode()).toBe('links');
  });

  it('le cache de reconnaissance sépare liens et ancien système, et garde la clé historique sans sel', () => {
    const image = Buffer.from('photo');
    expect(lensImageKey(image)).toBe(lensImageKey(image, undefined));
    expect(lensImageKey(image, 'links')).not.toBe(lensImageKey(image));
  });

  it('l’ancien système est inerte hors mode legacy', async () => {
    const input = [{ id: 'a', title: 'x', sourceUrl: 'https://s.test/a' }] as any;
    expect(await legacyEnrichDescriptions(input)).toBe(input);
  });
});

describe('linkSource — on ne garde que le lien', () => {
  const rows = [
    { link: 'https://shop.lf-one.test/p/1?utm_source=g#frag', title: 'Parfum Rose Noire 50ml', source: 'Shop', price: { extracted_value: 1, currency: '€' }, thumbnail: 'https://t/1.jpg', in_stock: true },
    { link: 'https://shop.lf-one.test/p/1', title: 'doublon', source: 'Shop' },
    { link: 'https://www.pinterest.com/pin/1', title: 'Pin parfum', source: 'Pinterest' },
    { link: 'javascript:alert(1)', title: 'xss', source: 'x' },
  ];

  it('retire suivi, doublons, réseaux sociaux et schémas dangereux', () => {
    const links = linksFromVisualMatches(rows, 10);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe('https://shop.lf-one.test/p/1');
    expect(normalizeLinkUrl('https://a.test/x?gclid=1&id=2')).toBe('https://a.test/x?id=2');
  });

  it('le candidat-lien ne porte ni prix, ni image, ni stock SerpApi', () => {
    const stub = linkToStub(linksFromVisualMatches(rows, 10)[0], 0);
    expect(stub).toMatchObject({ dataSource: 'link-only', price: null, priceTnd: null, image: '', availability: 'unknown' });
    expect(stub.images).toEqual([]);
    expect(stubToLink(stub)?.url).toBe('https://shop.lf-one.test/p/1');
  });
});

describe('parseur — contenance et type deviennent des options, pas des couleurs', () => {
  it('« 50 ml / 100 ml » est rangé en taille avec son libellé', () => {
    const html = `<!doctype html><html><head><title>Parfum Rose Noire</title>
      <script type="application/ld+json">{"@type":"Product","name":"Parfum Rose Noire","offers":{"price":"80","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}</script>
      <script type="application/json">{"product":{"id":9,"title":"Parfum Rose Noire","options":["Contenance"],"variants":[
        {"id":1,"option1":"50 ml","available":true,"price":8000,"public_title":"50 ml"},
        {"id":2,"option1":"100 ml","available":false,"price":12000,"public_title":"100 ml"}]}}</script>
      </head><body><h1>Parfum Rose Noire</h1></body></html>`;
    const parsed = parseProductPageHtml(html, 'https://shop.lf-one.test/p/9', 'generic');
    expect(parsed.variants.colors).toEqual([]);
    expect(parsed.variants.sizes).toContain('50 ml');
    expect(parsed.variants.optionLabel).toMatch(/contenance/i);
  });

  it('le bouton existe côté fiche pour une option « type » sur un produit de classe inconnue', () => {
    const view = productToView({
      title: 'Coque Premium', brand: null, model: null, description: '', image: '', images: [], source: 'S', sourceUrl: 'https://s.test/c',
      price: 10, currency: 'EUR', priceTnd: 40, colors: [], sizes: ['Mat', 'Brillant'], optionLabel: 'Type', availability: 'in_stock',
    } as any);
    expect(view.sizes.map((size) => size.value)).toEqual(['Mat', 'Brillant']);
    expect(view.optionLabel).toBe('Type');
  });
});

describe('pageFacts', () => {
  const link = { url: 'https://shop.lf-one.test/p/1', merchant: 'Shop', titleHint: 'Parfum Rose Noire' };
  it('pas de prix lisible = pas de fiche', () => {
    expect(factsFromPage(link, page({ price: 0 }), 1)).toBeNull();
    expect(factsFromPage(link, null, 1)).toBeNull();
    expect(factsFromPage(link, page({ currency: '' }), 1)).toBeNull();
  });
  it('classe contenance, stockage, pointure, type', () => {
    expect(classifyOption(['50 ml', '100 ml'], null)).toBe('capacity');
    expect(classifyOption(['128 GB', '256 GB'], null)).toBe('storage');
    expect(classifyOption(['Mat', 'Brillant'], 'Type')).toBe('type');
  });
});

describe('resolveLinks — de la page à la fiche chiffrée', () => {
  const link = (n: number, title = 'Parfum Rose Noire') => ({ url: `https://shop${n}.lf-two.test/p/${n}`, merchant: `Shop${n}`, titleHint: title });

  it('le prix, les photos, le stock et les options sont ceux de la PAGE', async () => {
    const fetcher = vi.fn(async () => page({
      variants: {
        sizes: ['50 ml', '100 ml'], colors: [], optionLabel: 'Contenance',
        details: [
          { id: 'a', label: '50 ml', size: '50 ml', color: null, stock: true, price: 80 },
          { id: 'b', label: '100 ml', size: '100 ml', color: null, stock: false, price: 120 },
        ],
      } as any,
    }));
    const { candidates, report } = await resolveLinks([link(1)], { db, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(report.verified).toBe(1);
    const [card] = candidates;
    expect(card).toMatchObject({ dataSource: 'merchant-page', price: 80, currency: 'EUR', availability: 'in_stock', optionLabel: 'Contenance' });
    expect(card.priceTnd).toBeGreaterThan(0);
    expect(card.images).toEqual(expect.arrayContaining(['https://cdn.lf-one.test/1.jpg']));
    expect(card.sizes).toEqual(['50 ml', '100 ml']);
    expect(card.variantOptions?.map((o) => [o.size, o.availability])).toEqual([['50 ml', 'available'], ['100 ml', 'unavailable']]);
    // L'option à prix propre est chiffrée par le même moteur.
    expect(card.variantOptions?.find((o) => o.size === '100 ml')?.priceTnd).toBeGreaterThan(card.priceTnd as number);
    expect(card.checkedAt).toBeTruthy();
  });

  it('une page illisible, sans prix ou d’un autre produit ne fait AUCUNE carte (pas de prix de secours)', async () => {
    const pages: Record<string, ParsedProductPage | null> = {
      [link(2).url]: null,
      [link(3).url]: page({ price: 0 }),
      [link(4).url]: page({ title: 'Aspirateur robot industriel' }),
    };
    const { candidates, report } = await resolveLinks([link(2), link(3), link(4)], { db, fetcher: async (url) => pages[url] });
    expect(candidates).toEqual([]);
    expect(report.rejected).toMatchObject({ unreadable: 1, noPrice: 1, wrongProduct: 1 });
  });

  it('le budget borne les visites et l’ordre de Google Lens est conservé', async () => {
    process.env.AYROVI_LINKS_BUDGET = '2';
    try {
      const fetcher = vi.fn(async () => page());
      const { candidates, report } = await resolveLinks([link(5), link(6), link(7)], { db, fetcher });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(report.visited).toBe(2);
      expect(candidates.map((card) => card.sourceUrl)).toEqual([link(5).url, link(6).url]);
    } finally { delete process.env.AYROVI_LINKS_BUDGET; }
  });

  it('une rupture de stock est rendue, avec un classement plus bas', async () => {
    const { candidates } = await resolveLinks([link(8), link(9)], {
      db,
      fetcher: async (url) => page({ availability: url.includes('shop8') ? 'out_of_stock' : 'in_stock' }),
    });
    expect(candidates).toHaveLength(2);
    const out = candidates.find((card) => card.sourceUrl.includes('shop8'))!;
    const inStock = candidates.find((card) => card.sourceUrl.includes('shop9'))!;
    expect(out.availability).toBe('out_of_stock');
    expect(out.match).toBeLessThan(inStock.match);
  });
});

describe('isolation — l’ancien système ne s’infiltre pas', () => {
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

  it('seul `legacy/` importe lensEnrichment / productEnrichment', () => {
    const offenders = walk('src').filter((file) => /\.tsx?$/.test(file) && !file.includes(`${path.sep}legacy${path.sep}`)).filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return /from\s+['"][^'"]*\/(lensEnrichment|productEnrichment)['"]/.test(source) && !/src\/ayrovix\/linkFirst\/titleMatch/.test(file);
    });
    expect(offenders).toEqual([]);
  });

  it('le moteur « liens d’abord » n’importe aucun mapping de prix SerpApi', () => {
    for (const file of walk('src/ayrovix/linkFirst')) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*\/legacy/);
      // `visualMatches.ts` est la porte : elle seule peut nommer l'ancien chemin, derrière l'interrupteur.
      if (!file.endsWith('visualMatches.ts')) expect(source).not.toMatch(/serpApiVisualSearch\(/);
    }
  });

  it('les appelants (route, assistant) passent par la porte unique, pas par serpApiVisualSearch', () => {
    for (const file of ['src/ayrovix/routes.ts', 'src/assistant/tools.ts']) {
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(/serpApiVisualSearch/);
    }
  });
});
