/**
 * AYWEBs — SHEIN / TEMU : RECONNAISSANCE DE LA FICHE ET LECTURE DU PRIX
 * (26/10/2026).
 *
 * ── Les deux symptômes rapportés ───────────────────────────────────────────
 *  1. « الدخول لأي منتج SHEIN يخلّي السكريبت في chargement » — l'écran reste en
 *     lecture ;
 *  2. « السكريبت ما يقرىش السعر » — la capture revient, mais sans prix, donc la
 *     feuille ne peut pas produire de devis en dinars.
 * Et le même constat sur TEMU.
 *
 * ── Ce qui est VÉRIFIÉ ici (fixtures jsdom, rien d'autre n'est affirmé) ────
 *  A. Reconnaissance : une vraie fiche `…-p-<id>.html` / `…-g-<id>.html` est un
 *     PRODUIT même quand son SLUG contient `cart`/`auth` — le classement de base
 *     y voyait un panier ou une page de connexion, ce qui désactivait l'ajout.
 *  B. Identité et cache : deux liens de la même fiche partagent une clé
 *     (`-p-<id>.html` / `-g-<id>.html`) et une identité (`SHEIN-…` / `TEMU-…`).
 *  C. Prix : le lecteur lit le conteneur NOMMÉ (`product-intro__head-price`,
 *     `[data-testid*=price]`…) en RETIRANT le prix barré, et ne publie que si
 *     toutes les lectures donnent le même montant.
 *  D. Abstention : deux montants différents dans les conteneurs nommés ⇒ AUCUN
 *     prix publié, avec un diagnostic court — jamais un choix au hasard.
 *  E. Le serveur accepte ce prix (devise lue) et en fait un prix vérifié.
 *
 * Non vérifié ici : le balisage réel de shein.com / temu.com (aucune page live
 * n'a été chargée dans cette session). Les sélecteurs sont des conteneurs
 * NOMMÉS et la règle d'unanimité est ce qui empêche un prix de publicité de
 * passer pour le prix vendu.
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { AYWEBS_URL_PAGE_HINTS } from '../src/aywebs/adapters/contract';
import { SheinAdapter, sheinGoodsId } from '../src/aywebs/adapters/shein';
import { TemuAdapter, temuGoodsId } from '../src/aywebs/adapters/temu';

const scraper = {} as never;
const shein = new SheinAdapter(scraper);
const temu = new TemuAdapter(scraper);

function run(html: string, url: string): Record<string, unknown> {
  const dom = new JSDOM(html, { url });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  return JSON.parse(String(evaluate(dom.window.document, dom.window.location, url)));
}

type Candidate = { text: string; source: string };
const candidates = (capture: Record<string, unknown>): Candidate[] =>
  ((capture.priceCandidates as Candidate[] | undefined) ?? []);

/* ── A. Reconnaissance de la fiche produit ────────────────────────────────── */

describe('SHEIN / TEMU — la fiche produit est reconnue par son IDENTIFIANT', () => {
  const products = [
    ['https://www.shein.com/example-p-382460229.html'],
    ['https://fr.shein.com/Robe-fleurie-p-382460229-cat-2030.html'],
    ['https://us.shein.com/--p-475378861.html'],
    ['https://m.shein.com/us/SHEIN-Essnce-Vest-p-16477982-cat-2977.html?lang=en'],
    ['https://www.shein.co.uk/Sweetra-Dress-p-209758798.html'],
  ] as const;

  it('reconnaît toutes les formes d’URL SHEIN publiées', () => {
    for (const [url] of products) {
      expect(shein.classifyPage(url), url).toMatchObject({ pageType: 'PRODUCT', isProductPage: true });
      expect(sheinGoodsId(new URL(url)), url).toBeTruthy();
    }
  });

  it('ne confond pas un rayon, une recherche ou l’accueil avec une fiche', () => {
    const others = [
      'https://www.shein.com/',
      'https://fr.shein.com/pdsearch/robe/',
      'https://www.shein.com/Women-Dresses-c-2030.html',
    ];
    for (const url of others) {
      expect(shein.classifyPage(url).isProductPage, url).toBe(false);
    }
  });

  /**
   * LE DÉFAUT MESURÉ : les indices d'URL du contrat regardent des mots
   * (`cart`, `auth`, `login`) que SHEIN et TEMU utilisent dans des NOMS DE
   * PRODUIT. Sans le motif `-p-<id>` / `-g-<id>` prioritaire, ces fiches
   * étaient classées CHECKOUT / LOGIN et l'ajout restait désactivé.
   */
  it('un slug « cartoon » / « authentic » ne fait plus d’une fiche un panier', () => {
    const slug = '/Cartoon-Print-Oversized-Authentic-Tee-p-12345678.html';
    expect(AYWEBS_URL_PAGE_HINTS.some((hint) => hint.pattern.test(slug))).toBe(true);
    expect(shein.classifyPage(`https://www.shein.com${slug}`)).toMatchObject({
      pageType: 'PRODUCT', isProductPage: true,
    });
    expect(temu.classifyPage('https://www.temu.com/cartoon-authentication-tee-g-601099512345678.html'))
      .toMatchObject({ pageType: 'PRODUCT', isProductPage: true });
  });

  it('reconnaît les formes d’URL TEMU publiées', () => {
    const cases = [
      'https://www.temu.com/wireless-earbuds-g-601099512345678.html',
      'https://www.temu.com/uk/womens-fashion-sandals-g-601100384222130.html',
      'https://www.temu.com/-g-601099513224343.html',
      'https://www.temu.com/goods.html?goods_id=601099512345678',
      'https://www.temu.com/uk/goods.html?goods_id=601100384222130',
    ];
    for (const url of cases) {
      expect(temu.classifyPage(url), url).toMatchObject({ pageType: 'PRODUCT', isProductPage: true });
      expect(temuGoodsId(new URL(url)), url).toBeTruthy();
    }
    for (const url of [
      'https://www.temu.com/',
      'https://www.temu.com/search_result.html?search_key=earbuds',
      'https://www.temu.com/womens-shoes-o3-95.html',
    ]) {
      expect(temu.classifyPage(url).isProductPage, url).toBe(false);
    }
  });

  /* ── B. Identité + clé de cache ─────────────────────────────────────────── */

  it('deux liens de la même fiche donnent UNE clé et UNE identité', () => {
    const first = 'https://www.shein.com/Robe-p-382460229.html?src_identifier=fc%3DShoes&mallCode=1';
    const second = 'https://fr.shein.com/Robe-fleurie-p-382460229-cat-2030.html';
    expect(shein.canonicalUrl(first)).toBe('https://www.shein.com/-p-382460229.html');
    expect(shein.canonicalUrl(second)).toBe(shein.canonicalUrl(first));
    expect(shein.sourceProductId(second)).toBe('SHEIN-382460229');

    expect(temu.canonicalUrl('https://www.temu.com/uk/earbuds-g-601099512345678.html?refer_page_name=search'))
      .toBe('https://www.temu.com/-g-601099512345678.html');
    expect(temu.sourceProductId('https://www.temu.com/goods.html?goods_id=601099512345678'))
      .toBe('TEMU-601099512345678');
  });
});

/* ── C/D. Lecture du prix ─────────────────────────────────────────────────── */

/** Fiche SHEIN réduite à ce qui compte : conteneur nommé + prix barré. */
function sheinPage(input: { sale: string; retail?: string; extra?: string }): string {
  return `<!doctype html><html lang="fr"><head>
    <title>Robe fleurie</title>
    <meta property="product:price:currency" content="EUR">
  </head><body>
    <div class="product-intro">
      <h1 class="product-intro__head-name">Robe fleurie plissée</h1>
      <div class="product-intro__head-price">
        <span class="price-now">${input.sale}</span>
        ${input.retail ? `<del class="price-retail">${input.retail}</del>` : ''}
      </div>
    </div>
    ${input.extra ?? ''}
    <button class="product-intro__add-btn">Ajouter au panier</button>
  </body></html>`;
}

const SHEIN_URL = 'https://fr.shein.com/Robe-fleurie-p-382460229-cat-2030.html';

describe('SHEIN — le prix vient du conteneur nommé, jamais du prix barré', () => {
  it('lit la promo et IGNORE le barré', () => {
    const capture = run(sheinPage({ sale: '21,40 €', retail: '35,70 €' }), SHEIN_URL);
    const price = candidates(capture);
    expect(price).toHaveLength(1);
    expect(price[0]).toMatchObject({ source: 'dom' });
    expect(price[0].text).toContain('21,40');
    expect(price[0].text).not.toContain('35,70');

    const verdict = validateAyWebsCapturedPage(capture, SHEIN_URL, {
      requireCorroboration: false, requireProductPage: true,
    });
    expect(verdict.ok, JSON.stringify(verdict.notes)).toBe(true);
    expect(verdict.price).toBeCloseTo(21.4, 2);
    expect(verdict.currency).toBe('EUR');
  });

  it('un prix barré SEUL ne devient pas le prix vendu', () => {
    /* Le conteneur nommé ne porte que le prix d'origine (pas de prix courant
       lisible) : on ne publie rien plutôt que de vendre au prix barré. */
    const html = `<!doctype html><html><head><title>Robe</title>
      <meta property="product:price:currency" content="EUR"></head><body>
      <div class="product-intro__head-price"><del class="price-retail">35,70 €</del></div>
      </body></html>`;
    const capture = run(html, SHEIN_URL);
    expect(candidates(capture)).toHaveLength(0);
    expect(capture.diagnostics).toContain('price:no_named_container');
  });

  it('deux montants différents dans les conteneurs nommés ⇒ AUCUN prix', () => {
    const html = `<!doctype html><html><head><title>Robe</title>
      <meta property="product:price:currency" content="EUR"></head><body>
      <div class="product-intro">
        <h1>Robe fleurie plissée</h1>
        <div class="product-intro__head-price">
          <span class="price-now">21,40 €</span>
          <span class="price-now">24,90 €</span>
        </div>
      </div>
      <button>Ajouter au panier</button>
      </body></html>`;
    const capture = run(html, SHEIN_URL);
    expect(candidates(capture)).toHaveLength(0);
    expect(capture.diagnostics).toContain('price:ambiguous_scope');

    const verdict = validateAyWebsCapturedPage(capture, SHEIN_URL, {
      requireCorroboration: false, requireProductPage: true,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.rejection).toBe('NO_PRICE_TEXT');
  });

  it('les prix des articles recommandés ne sont pas lus', () => {
    const recommendations = `
      <section class="recommend-list">
        <div class="product-price">3,99 €</div>
        <div class="product-price">7,50 €</div>
        <div class="product-price">12,00 €</div>
      </section>`;
    const capture = run(sheinPage({ sale: '21,40 €', extra: recommendations }), SHEIN_URL);
    const price = candidates(capture);
    expect(price).toHaveLength(1);
    expect(price[0].text).toContain('21,40');
  });
});

const TEMU_URL = 'https://www.temu.com/uk/womens-sandals-g-601100384222130.html';

function temuPage(input: { price: string; market?: string }): string {
  return `<!doctype html><html lang="en"><head>
    <title>Women sandals</title>
    <meta property="product:price:currency" content="GBP">
  </head><body>
    <h1>Women's Fashion Open-Heel Sandals</h1>
    <div data-testid="product-price">
      <span>${input.price}</span>
      ${input.market ? `<span class="market-price">${input.market}</span>` : ''}
    </div>
    <div class="recommend">4,99 £</div>
    <div class="recommend">9,99 £</div>
    <button>Add to cart</button>
  </body></html>`;
}

describe('TEMU — même règle : conteneur nommé + unanimité', () => {
  it('lit le prix courant et ignore le prix marché', () => {
    const capture = run(temuPage({ price: '£13.55', market: '£19.99' }), TEMU_URL);
    const price = candidates(capture);
    expect(price).toHaveLength(1);
    expect(price[0].text).toContain('13.55');

    const verdict = validateAyWebsCapturedPage(capture, TEMU_URL, {
      requireCorroboration: false, requireProductPage: true,
    });
    expect(verdict.ok, JSON.stringify(verdict.notes)).toBe(true);
    expect(verdict.price).toBeCloseTo(13.55, 2);
    expect(verdict.currency).toBe('GBP');
  });

  it('sans conteneur nommé, la lecture générique ne prend pas le relais', () => {
    const html = `<!doctype html><html><head><title>Sandals</title>
      <meta property="product:price:currency" content="GBP"></head><body>
      <h1>Sandals</h1><div class="product-price">£13.55</div>
      <div class="product-price">£9.99</div></body></html>`;
    const capture = run(html, TEMU_URL);
    expect(candidates(capture)).toHaveLength(0);
    expect(capture.diagnostics).toContain('price:no_named_container');
  });
});
