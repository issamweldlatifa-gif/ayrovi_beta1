/**
 * AYWEBs / AYROVIX — ZÉRO MONTANT FABRIQUÉ (Phase 0, suite · 07/10/2026).
 *
 * Ce que cette suite verrouille, avec des valeurs mesurées et non des phrases :
 *
 *   1. **Le taux de secours `|| 4.00` n'existe plus.** Une fiche publiée en SEK
 *      (devise ISO parfaitement lisible, mais absente de l'ancienne table en dur)
 *      était convertie à 4 dinars pour 1 sans que rien ne le signale. Ici : la
 *      devise est VÉRIFIÉE (la page l'a publiée), le prix est LU, et **aucun
 *      prix TND n'est inventé** — le moteur tarifaire répond `null`.
 *   2. **La formule locale de frais n'existe plus.** `serviceFee = max(10, 8 %)`
 *      et `shipping = 25.00` étaient des constantes ; on démontre ci-dessous
 *      qu'elles donnaient un autre total que `calculatePrice` sur les règles
 *      versionnées — donc deux vérités pour un même panier.
 *   3. **L'identité ne s'invente plus.** `'SH-' + Math.random()` (qui produisait
 *      `SH-SH-…`), `'B0' + Math.random()` (un faux ASIN crédible) et
 *      `'IMG-' + Math.random()` disparaissent au profit d'une empreinte
 *      déterministe `UNRESOLVED-<sha1[0..12]>`.
 *   4. **Les noms de remplacement disparaissent.** « Produit Amazon »,
 *      « Article Boutique Internationale », `brand: 'Amazon'` / `'SHEIN'`, et
 *      `TEMU — <titre>` n'étaient pas des données du marchand.
 *   5. **L'OCR ne devine plus la devise.** Un montant « 129,99 » sans symbole
 *      était déclaré EUR par défaut — puis converti. Et `availability: 'in_stock'`
 *      en dur sur une capture d'écran est remplacé par `unknown`.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

/** Aucun réseau dans cette suite : la résolution DNS est remplacée, rien d'autre. */
vi.mock('../src/services/safeUrl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/safeUrl')>();
  return {
    ...actual,
    resolveSafeHttpUrl: async (raw: unknown) => ({ url: new URL(String(raw)), addresses: ['93.184.216.34'] }),
  };
});

/** OCR simulé : `extractFromImage` doit être exécutable sans worker Tesseract. */
const OCR_TEXT = { value: '' };
vi.mock('tesseract.js', () => ({
  default: {
    PSM: { SPARSE_TEXT: '11' },
    recognize: async () => ({ data: { text: OCR_TEXT.value, words: [] } }),
    createWorker: async () => ({ setParameters: async () => undefined, recognize: async () => ({ data: {} }), terminate: async () => undefined }),
  },
}));

import { SmartLinkScraper } from '../src/scraper/scraper';
import { VisualProductExtractor } from '../src/services/vision';
import { calculatePrice, DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { estimateTnd } from '../src/ayrovix/services/currency';

const scraper = new SmartLinkScraper();

function pricingRules(): PricingRules {
  return {
    id: 'default', version: 3,
    rateEUR: 4, rateUSD: 4, rateGBP: 4.8, rateJPY: 0.0265,
    exchangeBufferPercent: 3, freightPerKgTND: 13, localDeliveryTND: 8,
    commissionPercent: 10, minimumCommissionTND: 0, rpdPercent: 3, rpdMinimumTND: 10,
    defaultTvaRate: 0.19, expressFeeTND: 15,
    categories: DEFAULT_CUSTOMS_CATEGORIES,
    updatedAt: new Date().toISOString(),
  };
}

/** Fiche marchande publiant un code ISO que l'ancienne table n'avait PAS. */
const SEK_PAGE = `<!doctype html><html lang="sv"><head>
<title>Casque TestBrand</title>
<meta property="og:image" content="https://cdn.kaffeboden.se/img.jpg">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Casque TestBrand",
 "brand":{"@type":"Brand","name":"TestBrand"},
 "image":["https://cdn.kaffeboden.se/img.jpg"],
 "offers":{"@type":"Offer","price":"149.00","priceCurrency":"SEK",
   "availability":"https://schema.org/InStock"}}
</script></head><body><h1>Casque TestBrand</h1><div class="product-price">149,00 kr</div></body></html>`;
const SEK_URL = 'https://www.kaffeboden.se/produkter/casque-testbrand';

/** Même fiche en euros : sert de comparaison avec la formule locale disparue. */
const EUR_PAGE = SEK_PAGE.replace('"priceCurrency":"SEK"', '"priceCurrency":"EUR"');
const EUR_URL = 'https://www.kaffeboden.se/produkter/casque-eur';

describe('Scraper — le prix TND n’est plus produit ici', () => {
  it('devise publiée hors ancienne table (SEK) : lue et vérifiée, mais AUCUN prix TND inventé', async () => {
    const product = await scraper.scrapeProduct(SEK_URL, { pageHtml: SEK_PAGE });

    // Ce que la page publie, et qui est vrai :
    expect(product.sourcePrice).toBe(149);
    expect(product.sourceCurrency).toBe('SEK');
    expect(product.currencyVerified).toBe(true);
    expect(product.priceVerified).toBe(true);

    // Ce qui était fabriqué, et ne l'est plus :
    expect(product.convertedPriceTND).toBe(0);
    expect(product.serviceFeeTND).toBe(0);
    expect(product.estimatedShippingTND).toBe(0);
    expect(product.totalPriceTND).toBe(0);

    // Et la raison est explicite côté moteur : aucun taux ⇒ aucun devis.
    const rules = pricingRules();
    expect(calculatePrice(rules, 149, 'SEK')).toBeNull();
    expect(estimateTnd(rules, 149, 'SEK')).toBeNull();
  });

  it('la formule locale (taux 4.00 · service 8 % · port 25.00) donnait un AUTRE total que le moteur', async () => {
    const product = await scraper.scrapeProduct(EUR_URL, { pageHtml: EUR_PAGE });
    const priced = calculatePrice(pricingRules(), product.sourcePrice, product.sourceCurrency);

    const oldLocalTotal = Math.round((
      Math.round(149 * 4.00 * 100) / 100
      + Math.max(10, Math.round(149 * 4.00 * 100) / 100 * 0.08)
      + 25.00
    ) * 100) / 100;

    expect(priced).not.toBeNull();
    expect(priced!.convertedPriceTND).not.toBe(Math.round(149 * 4.00 * 100) / 100); // buffer 3 % du moteur
    expect(priced!.shippingFeeTND).not.toBe(25);                                   // fret réel par catégorie
    expect(priced!.totalTND).not.toBe(oldLocalTotal);
    // Le scraper, lui, ne publie plus aucun total : la seule vérité est `priced`.
    expect(product.totalPriceTND).toBe(0);
  });

  it('aucun aller-retour de conversion : le module ne porte plus de table de taux', async () => {
    const source = await import('node:fs').then((fs) => fs.readFileSync('src/scraper/scraper.ts', 'utf8'));
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
      .filter((line) => !line.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/RATES_TO_TND/);
    expect(code).not.toMatch(/\|\|\s*4\.00/);
    expect(code).not.toMatch(/\*\s*0\.08/);
    expect(code).not.toMatch(/Math\.random\(\)/);
  });
});

describe('Scraper — identité : déterministe, et jamais un faux identifiant marchand', () => {
  const deep = (rawUrl: string, store: string) => (scraper as unknown as {
    extractDeepUrlInfo: (u: string, s: string) => { title: string; brand: string; externalId: string };
  }).extractDeepUrlInfo(rawUrl, store);

  it('Amazon sans ASIN dans l’URL : plus jamais un « B0… » fabriqué', () => {
    const spy = vi.spyOn(Math, 'random');
    const info = deep('https://www.amazon.com/gp/product/unknown-shape', 'amazon');
    expect(info.externalId).toMatch(/^UNRESOLVED-[0-9a-f]{12}$/);
    expect(info.externalId).not.toMatch(/^B0\d+$/);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('Amazon AVEC ASIN dans l’URL : l’identité marchande est recopiée telle quelle', () => {
    expect(deep('https://www.amazon.com/dp/B0D1XD1ZV3', 'amazon').externalId).toBe('B0D1XD1ZV3');
  });

  it('SHEIN sans identifiant : plus de « SH-SH-… » ni d’identité qui change à chaque appel', () => {
    const spy = vi.spyOn(Math, 'random');
    const url = 'https://www.shein.com/product-category/goods.html';
    const first = deep(url, 'shein');
    const second = deep(url, 'shein');
    expect(first.externalId).toBe(second.externalId);
    expect(first.externalId).toMatch(/^UNRESOLVED-[0-9a-f]{12}$/);
    expect(first.externalId).not.toMatch(/^SH-SH-/);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('SHEIN avec identifiant : conservé, sans double préfixe', () => {
    const info = deep('https://www.shein.com/Women-Solid-Shirt-p-382460229.html', 'shein');
    expect(info.externalId).toBe('SH-382460229');
  });

  it('aucun nom de remplacement, aucune marque issue de la boutique ou du slug', () => {
    const cases: Array<[string, string]> = [
      ['https://www.amazon.com/dp/B0D1XD1ZV3', 'amazon'],
      ['https://www.amazon.com/gp/product/x', 'amazon'],
      ['https://www.temu.com/goods.html', 'temu'],
      ['https://www.aliexpress.com/item/1005006123456.html', 'aliexpress'],
      ['https://boutique-inconnue.example/produit/x', 'unknown'],
    ];
    for (const [url, store] of cases) {
      const info = deep(url, store);
      expect(info.brand, url).toBe('');
      expect(info.title, url).not.toMatch(/Produit (Amazon|TEMU|AliExpress)|Article Boutique Internationale/);
      expect(info.title, url).not.toMatch(/^(TEMU|AliExpress|Amazon) — /);
      expect(info.title, url).not.toBe('Boutique');
    }
  });
});

describe('Scraper — provenance du titre : la page, le slug, ou rien', () => {
  it('titre lu sur la page ⇒ `titleSource: merchant`', async () => {
    const product = await scraper.scrapeProduct(SEK_URL, { pageHtml: SEK_PAGE });
    expect(product.titleSource).toBe('merchant');
    expect(product.title).toBe('Casque TestBrand');
  });

  it('page illisible mais slug dans l’URL ⇒ `url_slug` (piste annoncée, pas un titre du marchand)', async () => {
    const product = await scraper.scrapeProduct(
      'https://www.amazon.com/Casque-Bluetooth-TestBrand/dp/B0D1XD1ZV3',
      { pageHtml: '<!doctype html><html><head><title>Amazon.com</title></head><body></body></html>' },
    );
    expect(product.titleSource).toBe('url_slug');
    expect(product.title).toBe('Casque Bluetooth TestBrand');
  });

  it('ni page ni slug exploitable ⇒ `none`, et jamais un nom inventé', async () => {
    const product = await scraper.scrapeProduct(
      'https://www.amazon.com/dp/B0D1XD1ZV3',
      { pageHtml: '<!doctype html><html><head><title>Amazon.com</title></head><body></body></html>' },
    );
    expect(product.titleSource).toBe('none');
    expect(product.title).toBe('');
    expect(product.brand).toBe('');
  });
});

describe('Vision (OCR) — même règle qu’ailleurs', () => {
  const extractor = new VisualProductExtractor();
  const image = Buffer.from('fake-image');

  it('un montant sans devise prouvée n’est PAS déclaré EUR, et aucun TND n’est fabriqué', async () => {
    OCR_TEXT.value = 'Casque Bluetooth\nPrix 549,00\nLivraison gratuite';
    const product = await extractor.extractFromImage(image);

    expect(product.sourcePrice).toBe(549);
    expect(product.sourceCurrency).toBe('');           // aucune preuve de devise
    expect(product.totalPriceTND).toBe(0);
    expect(product.serviceFeeTND).toBe(0);
    expect(product.estimatedShippingTND).toBe(0);
    expect(product.convertedPriceTND).toBe(0);
    // Et le moteur refuse de convertir sans devise : pas de devis, pas d'invention.
    expect(calculatePrice(pricingRules(), 549, '')).toBeNull();
  });

  it('devise prouvée par le symbole : elle est lue, et reste convertie par le moteur', async () => {
    OCR_TEXT.value = 'Casque Bluetooth\nPrix 129,99 €\nLivraison gratuite';
    const product = await extractor.extractFromImage(image);
    expect(product.sourceCurrency).toBe('EUR');
    expect(product.totalPriceTND).toBe(0);             // le moteur remplit, pas la vision
    expect(calculatePrice(pricingRules(), product.sourcePrice, 'EUR')).not.toBeNull();
  });

  it('le stock n’est jamais « in_stock » sur une capture, et l’URL n’est pas inventée', async () => {
    OCR_TEXT.value = 'Robe été\nPrix 49,99 €';
    const product = await extractor.extractFromImage(image);
    expect(product.availability).toBe('unknown');
    expect(product.url).toBe('');
    expect(product.brand).toBe('');
    expect(product.priceVerified).toBe(false);
    expect(product.currencyVerified).toBe(false);
    expect(product.verificationProvider).toBe('ocr');
    expect(String(product.description)).not.toMatch(/Vérifié par AYROVI|DT\)/);
  });

  it('l’identité vient du texte OCR : même capture ⇒ même identité, aucun aléatoire', async () => {
    OCR_TEXT.value = 'Casque Bluetooth\nPrix 129,99 €';
    const spy = vi.spyOn(Math, 'random');
    const first = await extractor.extractFromImage(image);
    const second = await extractor.extractFromImage(image);
    expect(first.externalId).toBe(second.externalId);
    expect(first.externalId).toBe(`UNRESOLVED-${createHash('sha1').update(OCR_TEXT.value).digest('hex').slice(0, 12)}`);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
