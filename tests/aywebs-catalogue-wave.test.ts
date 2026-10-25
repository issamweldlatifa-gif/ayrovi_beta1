/**
 * AYWEBs — VAGUE 1 DU CATALOGUE (23/10/2026).
 *
 * Onze à treize boutiques du catalogue (Walmart, Target, Etsy, Zalando…) passent
 * de « navigation seule » à « lecture de la fiche », SANS adaptateur dédié et
 * SANS qu'aucune d'elles puisse prétendre à l'achat.
 *
 * Ce fichier verrouille les quatre règles qui rendent cette ouverture honnête :
 *
 *   1. IDENTITÉ — une boutique est au registre UNE seule fois (le catalogue ne la
 *      répète pas), et son `adapter` est celui du catalogue.
 *   2. RECONNAISSANCE — pas de motif d'URL pour ces boutiques : `isProductPage`
 *      répond toujours faux, et la garde serveur REFUSE une URL nue. La fiche
 *      n'est prouvée que par la capture cliente (prix corroboré + titre).
 *   3. LECTURE — le crible exige la corroboration pour ces boutiques (comme un
 *      domaine hors registre) : un prix d'une seule source ne suffit pas.
 *   4. ACHAT — jamais `purchase`, jamais `tracking` : `MANUAL_REVIEW`.
 *
 * Plus la lecture des GROUPES de variantes par le script client, qui remplit la
 * feuille de choix sans jamais promettre un stock par combinaison.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import {
  AYWEBS_CAPTURE_STORES,
  AYWEBS_STORES,
  ayWebsProductUrlPattern,
  ayWebsStoreRecognition,
  findAyWebsStore,
} from '../shared/aywebsStores';
import { AYWEBS_CATALOG_STORES } from '../shared/aywebsStoreCatalog';
import { AYWEBS_CAPTURE_VERSION } from '../shared/aywebsCapture';
import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { createAyWebsAdapter } from '../src/aywebs/adapters/registry';
import { assertAyWebsProductPage } from '../src/aywebs/browser';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { SmartLinkScraper } from '../src/scraper/scraper';

const WAVE_IDS = [
  'walmart', 'target', 'etsy', 'best-buy', 'newegg', 'mediamarkt', 'otto',
  'kaufland', 'zalando', 'asos', 'h-m', 'cdiscount', 'allegro',
] as const;

const scraper = new SmartLinkScraper();

describe('vague 1 — identité au registre', () => {
  it('chaque boutique de la vague est définie une seule fois', () => {
    const ids = AYWEBS_STORES.map((store) => store.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('la vague est au registre, plus dans le catalogue', () => {
    const registryIds = new Set(AYWEBS_STORES.map((store) => store.id));
    const catalogIds = new Set(AYWEBS_CATALOG_STORES.map((store) => store.id));
    for (const id of WAVE_IDS) {
      expect(registryIds.has(id), `${id} doit être au registre`).toBe(true);
      expect(catalogIds.has(id), `${id} ne doit plus être au catalogue`).toBe(false);
    }
  });

  it('le catalogue garde sa taille utile et son contrat : navigation seule', () => {
    expect(AYWEBS_CATALOG_STORES.length).toBeGreaterThan(280);
    for (const store of AYWEBS_CATALOG_STORES) {
      expect(store.enabled).toBe(false);
      expect(store.captureSupported).toBe(false);
      expect(store.adapter).toBe('generic');
    }
  });

  it('chaque boutique déclare QUI prouve sa fiche : motif ou capture', () => {
    for (const store of AYWEBS_CAPTURE_STORES) {
      const recognition = ayWebsStoreRecognition(store);
      /* Zalando (25/10/2026) : adaptateur dédié ⇒ sa fiche est prouvée par
         l'adaptateur lui-même (`url`), plus fin que le motif déclaré. */
      if (store.id === 'zalando') {
        expect(recognition).toBe('url');
        expect(ayWebsProductUrlPattern(store), 'le motif reste un second filet').not.toBeNull();
        continue;
      }
      expect(['pattern', 'capture']).toContain(recognition);
      /* Une déclaration sans motif serait un mensonge : le motif doit exister ET
         être compilable, sinon la boutique retombe honnêtement sur `capture`. */
      if (recognition === 'pattern') {
        expect(ayWebsProductUrlPattern(store), `${store.id} : motif invalide`).not.toBeNull();
      } else {
        expect(store.productUrlPattern).toBeUndefined();
      }
    }
  });

  it('au moins une boutique reste en capture seule : le repli existe vraiment', () => {
    const pure = AYWEBS_CAPTURE_STORES.filter((store) => ayWebsStoreRecognition(store) === 'capture');
    expect(pure.length).toBeGreaterThan(0);
    expect(pure.map((store) => store.id)).toContain('mediamarkt');
  });

  it('toutes les boutiques de la vague sont au même contrat, sans achat', () => {
    /* Zalando fait exception ASSUMÉE (25/10/2026) : elle a désormais un
       adaptateur dédié, parce que son prix vit sur les variantes (`hasVariant`)
       et que sa fiche se reconnaît à son SKU. Tout le reste du contrat (bêta,
       lecture seule, aucun achat) lui reste identique — vérifié ci-dessous. */
    for (const store of AYWEBS_CAPTURE_STORES) {
      if (store.id === 'zalando') {
        expect(store.adapter).toBe('zalando');
        expect(ayWebsStoreRecognition(store)).toBe('url');
      } else {
        expect(store.adapter).toBe('catalogue');
      }
      expect(store.integrationType).toBe('PARTIALLY_SUPPORTED');
      expect(store.status).toBe('beta');
      expect(store.enabled).toBe(true);
      expect(store.captureSupported).toBe(true);
      expect(store.capabilities).not.toContain('purchase');
      expect(store.capabilities).not.toContain('tracking');
      expect(store.capabilities).toContain('availability');
      /* Un domaine d'accueil au minimum, puis les miroirs pays déclarés en
         données (23/10/2026 : `zalando.de` n'était reconnu par personne). Le
         PREMIER domaine reste celui de `homeUrl` — c'est lui qui sert de
         référence à l'écran et au back-office. */
      expect(store.domains.length).toBeGreaterThanOrEqual(1);
      expect(store.domains[0]).toBe(new URL(store.homeUrl).hostname.replace(/^www\./, ''));
      expect(new Set(store.domains).size).toBe(store.domains.length);
      expect(store.logo).toBe(`/stores/${store.id}.png`);
    }
  });

  it('le cœur du registre garde sa reconnaissance par URL', () => {
    for (const id of ['amazon', 'shein', 'temu', 'aliexpress']) {
      expect(ayWebsStoreRecognition(findAyWebsStore(id))).toBe('url');
    }
  });

  it('un identifiant inconnu reste sans reconnaissance', () => {
    expect(ayWebsStoreRecognition(null)).toBe('url');
    expect(findAyWebsStore('pas-une-boutique')).toBeNull();
  });

  it('chaque boutique de la vague a son logo dans le client', () => {
    for (const store of AYWEBS_CAPTURE_STORES) {
      expect(() => readFileSync(join(__dirname, '..', 'client', 'public', store.logo))).not.toThrow();
    }
  });
});

describe('vague 1 — reconnaissance de la fiche', () => {
  it('l’adaptateur catalogue reconnaît le MOTIF DÉCLARÉ, et rien d’autre', () => {
    const store = findAyWebsStore('walmart')!;
    const adapter = createAyWebsAdapter(store, scraper);
    expect(adapter.id).toBe('catalogue');
    expect(adapter.store?.id).toBe('walmart');
    /* Fiche réelle : oui. Rayon, recherche, panier : non. */
    expect(adapter.isProductPage(new URL('https://www.walmart.com/ip/hanes-tee/123456'))).toBe(true);
    expect(adapter.isProductPage(new URL('https://www.walmart.com/browse/clothing/5438'))).toBe(false);
    expect(adapter.isProductPage(new URL('https://www.walmart.com/search?q=tshirt'))).toBe(false);
    expect(adapter.isProductPage(new URL('https://www.walmart.com/cart'))).toBe(false);
  });

  it('un motif déclaré ne recharge pas la lecture serveur (prix = capture)', async () => {
    const adapter = createAyWebsAdapter(findAyWebsStore('walmart')!, scraper);
    await expect(adapter.resolveProduct('https://www.walmart.com/ip/hanes-tee/123456'))
      .rejects.toMatchObject({ code: 'PRODUCT_PAGE_REQUIRED' });
  });

  it('sans motif déclaré, aucune fiche n’est reconnue (MediaMarkt)', () => {
    const adapter = createAyWebsAdapter(findAyWebsStore('mediamarkt')!, scraper);
    expect(adapter.isProductPage(new URL('https://www.mediamarkt.com/de/product/_tv-123456.html'))).toBe(false);
  });

  it('chaque motif reconnaît sa fiche ET refuse une page de rayon', () => {
    const samples: Record<string, [string, string]> = {
      walmart: ['https://www.walmart.com/ip/123456', 'https://www.walmart.com/browse/tv'],
      target: ['https://www.target.com/p/-/A-12345', 'https://www.target.com/c/tv/-/N-1234'],
      etsy: ['https://www.etsy.com/listing/123456/coussin', 'https://www.etsy.com/c/home'],
      'best-buy': ['https://www.bestbuy.com/site/tv/123456.p', 'https://www.bestbuy.com/site/electronics/abcat0100.c'],
      newegg: ['https://www.newegg.com/p/N82E16819113877', 'https://www.newegg.com/Desktop-PC/SubCategory/ID-2'],
      otto: ['https://www.otto.de/p/kopfhoerer-1234567', 'https://www.otto.de/shoes/'],
      kaufland: ['https://www.kaufland.de/product/123456/', 'https://www.kaufland.de/sortiment/tv/'],
      zalando: ['https://www.zalando.com/sneaker-ZA21A0B.html'.replace('sneaker', 'sneaker').replace('.html', '.html'), 'https://www.zalando.com/sneakers/'],
      asos: ['https://www.asos.com/abc/prd/201234567/p/', 'https://www.asos.com/men/'],
      'h-m': ['https://www.hm.com/en_us/productpage.123456.html', 'https://www.hm.com/en_us/men/'],
      allegro: ['https://allegro.pl/oferta/telefon-123456789', 'https://allegro.pl/kategoria/telefony'],
    };
    for (const [id, [product, category]] of Object.entries(samples)) {
      const store = findAyWebsStore(id);
      expect(store, id).not.toBeNull();
      const pattern = ayWebsProductUrlPattern(store);
      expect(pattern, `${id} : aucun motif`).not.toBeNull();
      expect(pattern!.test(new URL(product).pathname), `${id} : fiche non reconnue (${product})`).toBe(true);
      expect(pattern!.test(new URL(category).pathname), `${id} : rayon reconnu à tort (${category})`).toBe(false);
    }
  });

  it('un motif dégradé est refusé, jamais appliqué à moitié', () => {
    expect(ayWebsProductUrlPattern({ ...findAyWebsStore('walmart')!, productUrlPattern: '(' })).toBeNull();
    expect(ayWebsProductUrlPattern({ ...findAyWebsStore('walmart')!, productUrlPattern: 'x'.repeat(200) })).toBeNull();
  });

  it('deux boutiques de la vague = deux identités distinctes', () => {
    const a = createAyWebsAdapter(findAyWebsStore('walmart')!, scraper);
    const b = createAyWebsAdapter(findAyWebsStore('zalando')!, scraper);
    expect(a.store?.id).toBe('walmart');
    expect(b.store?.id).toBe('zalando');
  });

  it('une URL nue est REFUSÉE quand aucun motif n’existe (MediaMarkt)', () => {
    expect(() => assertAyWebsProductPage(
      'https://www.mediamarkt.com/de/product/_tv-123456.html', scraper,
    )).toThrowError(/produit|product/i);
  });

  it('une capture corroborée AVEC titre prouve la fiche', () => {
    const proof = { accepted: true, corroborated: true, title: 'Samsung TV 55"' };
    const { analysis } = assertAyWebsProductPage(
      'https://www.mediamarkt.com/de/product/_tv-123456.html', scraper, { captureProof: proof },
    );
    expect(analysis.storeId).toBe('mediamarkt');
    expect(analysis.isProductPage).toBe(true);
    expect(analysis.pageType).toBe('PRODUCT');
    expect(analysis.productRecognition).toBe('capture');
    expect(analysis.reason).toBe('capture_client_corroboree');
  });

  it('les preuves partielles ne suffisent pas (prix, titre, acceptation)', () => {
    const url = 'https://www.mediamarkt.com/de/product/_tv-123456.html';
    for (const proof of [
      { accepted: true, corroborated: false, title: 'Titre' },
      { accepted: true, corroborated: true, title: '   ' },
      { accepted: false, corroborated: true, title: 'Titre' },
    ]) {
      expect(() => assertAyWebsProductPage(url, scraper, { captureProof: proof })).toThrow();
    }
  });

  it('Amazon n’emprunte pas le chemin « capture »', () => {
    const { analysis } = assertAyWebsProductPage('https://www.amazon.com/dp/B0GYM3V9H5', scraper);
    expect(analysis.productRecognition).toBe('url');
  });

  it('le motif déclaré reconnaît la fiche sans capture (mais ne la prix pas)', () => {
    const { analysis } = assertAyWebsProductPage('https://www.walmart.com/ip/hanes-tee/123456', scraper);
    expect(analysis.storeId).toBe('walmart');
    expect(analysis.isProductPage).toBe(true);
    expect(analysis.productRecognition).toBe('pattern');
  });

  it('un motif qui ne matche pas retombe sur la preuve par capture', () => {
    const url = 'https://www.walmart.com/nouvelle-forme/xyz';
    expect(() => assertAyWebsProductPage(url, scraper)).toThrow();
    const { analysis } = assertAyWebsProductPage(url, scraper, {
      captureProof: { accepted: true, corroborated: true, title: 'Hanes Men’s T-Shirt' },
    });
    expect(analysis.isProductPage).toBe(true);
    expect(analysis.reason).toBe('capture_client_corroboree');
  });
});

/** Capture minimale valide pour une fiche boutique (JSON-LD + DOM). */
function capture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: AYWEBS_CAPTURE_VERSION,
    url: 'https://www.walmart.com/ip/hanes-tee/123456',
    title: 'Hanes Men’s T-Shirt',
    priceCandidates: [
      { text: '9.98 USD', source: 'json_ld' },
      { text: '$9.98', source: 'dom' },
    ],
    availabilityText: 'In stock',
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

const PAGE_URL = 'https://www.walmart.com/ip/hanes-tee/123456';

describe('vague 1 — lecture : corroboration obligatoire', () => {
  it('deux sources d’accord ⇒ lecture acceptée', () => {
    const result = validateAyWebsCapturedPage(capture(), PAGE_URL, { requireCorroboration: true });
    expect(result.ok).toBe(true);
    expect(result.corroborated).toBe(true);
    expect(result.price).toBeCloseTo(9.98);
    expect(result.currency).toBe('USD');
  });

  it('une lecture DOM solitaire ⇒ refusée (règle des boutiques sans adaptateur)', () => {
    /* Le JSON-LD se corrobore lui-même : c'est une donnée MACHINE publiée par le
       marchand. Une valeur arrachée au DOM, elle, doit être confirmée par une
       seconde source pour une boutique sans adaptateur. */
    const single = capture({
      priceCandidates: [{ text: '$9.98', source: 'dom' }],
    });
    const strict = validateAyWebsCapturedPage(single, PAGE_URL, { requireCorroboration: true });
    expect(strict.ok).toBe(false);
    expect(strict.rejection).toBe('PRICE_NOT_CORROBORATED');
    const loose = validateAyWebsCapturedPage(single, PAGE_URL);
    expect(loose.ok).toBe(true);
  });

  it('un JSON-LD publié par le marchand suffit à corroborer', () => {
    const jsonLd = capture({ priceCandidates: [{ text: '9.98 USD', source: 'json_ld' }] });
    const strict = validateAyWebsCapturedPage(jsonLd, PAGE_URL, { requireCorroboration: true });
    expect(strict.ok).toBe(true);
    expect(strict.corroborated).toBe(true);
  });

  it('les groupes nommés de la page sont lus, bornés et dédoublonnés', () => {
    const result = validateAyWebsCapturedPage(capture({
      variantGroups: [
        { name: 'Taille', values: ['S', 'M', 'L', 'M'], selected: ['M', 'L'] },
        { name: 'taille', values: ['X'], selected: [] },
        { name: 'Quantité', values: ['1', '2'], selected: ['1'] },
        { name: '', values: ['Z'] },
        { name: 'Couleur', values: Array.from({ length: 40 }, (_, i) => `C${i}`), selected: ['C1'] },
      ],
    }), PAGE_URL, { requireCorroboration: true });

    expect(result.ok).toBe(true);
    expect(result.variantGroups.map((group) => group.name)).toEqual(['Taille', 'Couleur']);
    /* Une seule valeur affichée est retenue : la capture prouve CETTE combinaison. */
    expect(result.variantGroups[0].selected).toEqual(['M']);
    /* Les valeurs d'index numériques ne sont jamais des noms d'option. */
    expect(result.variantGroups.find((group) => group.name === 'Quantité')).toBeUndefined();
    expect(result.variantGroups[1].values.length).toBeLessThanOrEqual(20);
    expect(result.notes.some((note) => note.startsWith('variant_group:Taille='))).toBe(true);
  });

  it('un groupe de choix reste publié sans valeur cochée, mais ne prouve aucune combinaison', () => {
    const result = validateAyWebsCapturedPage(capture({
      variantGroups: [
        { name: 'Taille', values: ['S', 'M', 'L'], selected: [] },
        { name: 'Matière', values: ['Coton'], selected: [] },
        { name: 'Tri', values: ['Prix', 'Nouveautés'], selected: ['Prix'] },
        { name: 'Quantité', values: ['1', '2'], selected: ['1'] },
      ],
    }), PAGE_URL, { requireCorroboration: true });

    expect(result.ok).toBe(true);
    /* 25/10/2026 : « Taille » DOIT rester publiée pour que la feuille mobile
       propose les tailles, même quand la page ne coche rien (picker Zalando en
       input checkbox dans un label). En revanche selected reste vide : aucune
       combinaison courante n'est affirmée. « Matière » (valeur unique) est
       conservée ; « Tri » et « Quantité » ne sont pas des variantes ⇒ jamais
       publiés, même choisis. */
    expect(result.variantGroups.map((group) => group.name)).toEqual(['Taille', 'Matière']);
    const taille = result.variantGroups.find((group) => group.name === 'Taille');
    expect(taille?.values).toEqual(['S', 'M', 'L']);
    expect(taille?.selected).toEqual([]);
    expect(result.selectedVariantTexts).toEqual([]);
  });

  it('un groupe malformé n’invalide jamais un prix corroboré', () => {
    const result = validateAyWebsCapturedPage(capture({
      variantGroups: [null, 'nope', { name: 42 }, { values: ['S'] }],
    }), PAGE_URL, { requireCorroboration: true });
    expect(result.ok).toBe(true);
    expect(result.variantGroups).toEqual([]);
  });
});

describe('vague 1 — groupes lus par le script client', () => {
  function run(html: string, url: string): Record<string, unknown> {
    const dom = new JSDOM(html, { url });
    const evaluate = new Function('document', 'location', `return ${AYWEBS_CAPTURE_SCRIPT}`);
    return JSON.parse(evaluate(dom.window.document, dom.window.location) as string) as Record<string, unknown>;
  }

  it('lit « Taille » (select) et « Couleur » (radios) avec la valeur affichée', () => {
    const out = run(`<!doctype html><html><body>
      <label for="size">Taille</label>
      <select id="size" name="size">
        <option>Choisir</option><option>S</option><option selected>M</option><option>L</option>
      </select>
      <fieldset><legend>Couleur</legend>
        <input type="radio" id="c1" name="couleur" value="1"><label for="c1">Blanc</label>
        <input type="radio" id="c2" name="couleur" value="2" checked><label for="c2">Marine</label>
      </fieldset>
      <select id="qty" name="quantite"><option>1</option><option>2</option></select>
    </body></html>`, PAGE_URL);

    const groups = out.variantGroups as Array<{ name: string; values: string[]; selected: string[] }>;
    expect(groups.map((group) => group.name)).toEqual(['Taille', 'Couleur']);
    expect(groups[0]).toEqual({ name: 'Taille', values: ['S', 'M', 'L'], selected: ['M'] });
    expect(groups[1].values).toEqual(['Blanc', 'Marine']);
    expect(groups[1].selected).toEqual(['Marine']);
    /* La quantité n'est pas un choix de variante. */
    expect(groups.some((group) => /quant/i.test(group.name))).toBe(false);
  });

  it('la valeur affichée entre dans l’évidence des options choisies', () => {
    /* Sans cela, un bouton radio natif (pas d'aria-checked) ne serait jamais
       « vu » par le serveur : l'ajout serait refusé pour une sélection pourtant
       bien affichée sur la page. */
    const out = run(`<!doctype html><html><body>
      <fieldset><legend>Couleur</legend>
        <input type="radio" id="c1" name="couleur" value="1"><label for="c1">Blanc</label>
        <input type="radio" id="c2" name="couleur" value="2" checked><label for="c2">Marine</label>
      </fieldset>
    </body></html>`, PAGE_URL);
    expect(out.selectedVariantTexts).toContain('Marine');
  });

  it('chaîne complète : page lue → capture acceptée → fiche prouvée', () => {
    /* Ce que fait réellement l'application : le script lit la page DANS le
       navigateur, la capture part au serveur, le crible la juge, et la garde
       n'accepte la fiche que si cette preuve tient debout. */
    const out = run(`<!doctype html><html><head>
      <title>Hanes Men’s T-Shirt - Walmart.com</title>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Hanes Men’s T-Shirt",
       "offers":{"@type":"Offer","price":"9.98","priceCurrency":"USD",
       "availability":"https://schema.org/InStock"}}
      </script></head><body>
      <span class="price">$9.98</span>
      <label for="size">Taille</label>
      <select id="size"><option>Choisir</option><option>S</option><option selected>M</option></select>
      <button aria-label="Add to cart">Add to cart</button>
    </body></html>`, PAGE_URL);

    const validated = validateAyWebsCapturedPage(out, PAGE_URL, { requireCorroboration: true });
    expect(validated.ok).toBe(true);
    expect(validated.corroborated).toBe(true);

    const { analysis, store } = assertAyWebsProductPage(PAGE_URL, scraper, {
      captureProof: {
        accepted: validated.ok,
        corroborated: validated.corroborated,
        title: validated.scraped?.title || '',
      },
    });
    expect(store.id).toBe('walmart');
    expect(analysis.isProductPage).toBe(true);
    expect(validated.variantGroups[0]).toEqual({ name: 'Taille', values: ['S', 'M'], selected: ['M'] });
  });

  it('Amazon (lecture stricte) ne publie aucun groupe : son twister est déjà lu', () => {
    const out = run(`<!doctype html><html><body><div id="dp">
      <select id="size"><option>S</option><option>M</option></select>
    </div></body></html>`, 'https://www.amazon.com/dp/B0GYM3V9H5');
    expect(out.variantGroups).toEqual([]);
  });
});
