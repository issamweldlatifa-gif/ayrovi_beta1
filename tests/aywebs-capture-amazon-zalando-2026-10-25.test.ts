/**
 * AYWEBs — CAPTURE AMAZON + ZALANDO (porté le 25/10/2026).
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────────────
 * Deux boutiques ne rendaient rien dans l'application :
 *
 *   • AMAZON — la fiche s'ouvre, mais le prix n'est pas publié. La zone d'achat
 *     contient plusieurs copies du même prix (desktop/mobile), dont certaines
 *     masquées par une règle CSS, et l'étiquette d'accessibilité mobile ajoute
 *     un pourcentage de remise (« $179.98 with 10 percent savings »). L'ancien
 *     lecteur prenait la première copie venue et publiait un texte ambigu ; le
 *     serveur, à raison, refusait alors toute la capture.
 *
 *   • ZALANDO — le prix n'existe PAS sur le `ProductGroup` : il vit sur les
 *     variantes (`hasVariant[].offers`). Ne lire que `productLd.offers` revenait
 *     à déclarer « aucun prix » sur une fiche qui en affiche un.
 *
 * Ces deux lectures viennent de la branche `arena/fc3cce38-ayrovi-beta1`, où
 * elles avaient été écrites et vérifiées sur des pages réelles ; elles sont
 * reprises ici dans le vocabulaire de cette branche (sources `dom` /
 * `a11y_label`), pas recopiées aveuglément.
 *
 * ── Ce que ce test protège, précisément ────────────────────────────────────
 *   1. une copie masquée du prix ne devient jamais une lecture ;
 *   2. un `aria-hidden` non plus ;
 *   3. l'étiquette d'accessibilité ne publie JAMAIS un prix seule ;
 *   4. un pourcentage de remise collé au prix est retiré, pas publié ;
 *   5. Zalando : prix, devise, variantes et identité depuis les offres imbriquées ;
 *   6. Zalando : l'adaptateur reconnaît la fiche et refuse le catalogue.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { parseProductPageHtml } from '../src/scraper/productPageParser';
import { detectMerchantStore } from '../src/scraper/merchantDomains';
import { ZalandoAdapter } from '../src/aywebs/adapters/zalando';
import { AYWEBS_ADAPTER_DESCRIPTORS, createAyWebsAdapterById } from '../src/aywebs/adapters/registry';
import { detectAyWebsStore } from '../shared/aywebsStores';

const AMAZON_URL = 'https://www.amazon.com/dp/B0GYM3V9H5';
const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'amazon-product-page.html'), 'utf8');

function capture(html: string, url = AMAZON_URL): {
  priceCandidates: Array<{ text: string; source: string }>;
  diagnostics: string[];
} {
  const dom = new JSDOM(html, { url });
  const evaluate = new Function('document', 'location', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  return JSON.parse(evaluate(dom.window.document, dom.window.location) as string);
}

/** Fiche Amazon minimale : le marqueur `#dp` déclenche la lecture stricte. */
function amazonPage(body: string): string {
  return `<!doctype html><html lang="en"><head><title>x</title></head><body><div id="dp">${body}</div></body></html>`;
}

const PRICE_BLOCK = (whole: string): string => `
  <div id="corePrice_feature_div">
    <span class="a-price priceToPay"><span class="a-offscreen"></span><span aria-hidden="true">
      <span class="a-price-symbol">$</span>
      <span class="a-price-whole">${whole}<span class="a-price-decimal">.</span></span>
      <span class="a-price-fraction">00</span></span></span>
  </div>`;
const A11Y_LABEL = (text: string): string =>
  `<span id="apex-pricetopay-accessibility-label" class="aok-offscreen">${text}</span>`;

function sources(captureResult: { priceCandidates: Array<{ text: string; source: string }> }): string[] {
  return captureResult.priceCandidates.map((candidate) => candidate.source);
}

describe('Amazon — une seule lecture, et jamais une copie masquée', () => {
  it('la fiche réelle publie le prix visible ET son étiquette, même montant', () => {
    const result = capture(FIXTURE);
    expect(sources(result)).toEqual(['a11y_label', 'dom']);
    expect(new Set(result.priceCandidates.map((candidate) => candidate.text))).toEqual(new Set(['$109.00']));
  });

  it('ignore une copie masquée par CSS et une copie aria-hidden', () => {
    const html = amazonPage(`
      ${A11Y_LABEL(' $109.00 ')}
      ${PRICE_BLOCK('109')}
      <style>#hidden-price-copy { display: none; }</style>
      <div id="hidden-price-copy">
        <div id="corePrice_mobile_feature_div">
          <span class="a-price priceToPay"><span class="a-offscreen">$119.00</span></span>
        </div>
      </div>
      <div aria-hidden="true">
        <span class="a-price"><span class="a-offscreen">$129.00</span></span>
      </div>`);
    const result = capture(html);
    expect(result.priceCandidates.map((candidate) => candidate.text)).not.toContain('$119.00');
    expect(result.priceCandidates.map((candidate) => candidate.text)).not.toContain('$129.00');
    expect(new Set(result.priceCandidates.map((candidate) => candidate.text))).toEqual(new Set(['$109.00']));
  });

  it('Amazon mobile : le pourcentage de remise est retiré, le prix visible reste', () => {
    const html = amazonPage(`
      ${A11Y_LABEL('$179.98 with 10 percent savings')}
      <div id="corePriceDisplay_mobile_feature_div">
        <span class="a-price priceToPay apex-pricetopay-value"><span class="a-offscreen"></span><span aria-hidden="true">
          <span class="a-price-symbol">$</span>
          <span class="a-price-whole">179<span class="a-price-decimal">.</span></span>
          <span class="a-price-fraction">98</span></span></span>
      </div>`);
    const result = capture(html);
    expect(result.priceCandidates).toEqual([
      { text: '$179.98', source: 'a11y_label' },
      { text: '$179.98', source: 'dom' },
    ]);
  });

  it('une étiquette seule ne publie AUCUN prix (jamais une preuve solitaire)', () => {
    const result = capture(amazonPage(A11Y_LABEL('$109.00')));
    expect(result.priceCandidates).toEqual([]);
    expect(result.diagnostics).toContain('price:a11y_label_alone');
  });

  it('deux montants DIFFÉRENTS dans la zone d’achat ⇒ abstention, pas un choix', () => {
    // L'étiquette annonce 179,98 et le bloc visible 149,00 : la page se
    // contredit. On n'en choisit pas un — le serveur n'a rien à corroborer.
    const html = amazonPage(`
      ${A11Y_LABEL('$179.98 with 10 percent savings')}
      ${PRICE_BLOCK('149')}`);
    const result = capture(html);
    expect(result.priceCandidates).toEqual([]);
    expect(result.diagnostics.join(' ')).toContain('price:ambiguous_buybox');
  });
});

describe('Amazon — les variantes d’un AUTRE article ne se mêlent pas à la fiche', () => {
  /* Sur Amazon, les options sont publiées dans `out.amazon.options` (preuve
     brute : libellé + ASIN + état) ; le serveur les convertit en groupes. On
     vérifie donc la PREUVE, pas son rendu. */
  const TWISTER_SCRIPT = `<script>{"sortedDimValuesForAllDims":{"size_name":[
    {"dimensionValueState":"SELECTED","dimensionValueDisplayText":"XL","defaultAsin":"B0GYM3V9H5"},
    {"dimensionValueState":"AVAILABLE","dimensionValueDisplayText":"XXL"}]}}</script>`;

  type AmazonOut = {
    amazon: { options: Array<{ value: string }>; selectedValues: string[] } | null;
    selectedVariantTexts: string[];
    variantGroups: Array<{ attribute: string; values: string[] }>;
  };

  it('un twister de carrousel sponsorisé, hors de la fiche, est ignoré', () => {
    // La fiche elle-même ne publie aucune variante ; le carrousel voisin, si.
    const html = `<!doctype html><html lang="en"><head><title>x</title></head><body>
      <div id="dp-container"><div id="corePrice_feature_div">
        <span class="a-price"><span class="a-offscreen">$109.00</span></span>
      </div></div>
      <aside data-component-type="sp-sponsored-result">
        <div id="twister_feature_div" data-feature-name="twister">${TWISTER_SCRIPT}
          <div id="inline-twister-row-size_name">
            <li data-defaultasin="B0FAKEASIN"><span>XXL</span></li>
          </div>
        </div>
      </aside>
    </body></html>`;
    const result = capture(html) as unknown as AmazonOut;
    expect(result.amazon?.options ?? []).toEqual([]);
    expect(result.selectedVariantTexts).toEqual([]);
    expect(result.variantGroups).toEqual([]);
  });

  it('un twister DANS la fiche reste lu (on ne casse pas la lecture légitime)', () => {
    const html = `<!doctype html><html lang="en"><head><title>x</title></head><body>
      <div id="dp-container">
        <div id="corePrice_feature_div">
          <span class="a-price"><span class="a-offscreen">$109.00</span></span>
        </div>
        <div id="twister_feature_div" data-feature-name="twister">${TWISTER_SCRIPT}</div>
      </div>
    </body></html>`;
    const result = capture(html) as unknown as AmazonOut;
    const values = (result.amazon?.options ?? []).map((option) => option.value);
    expect(values).toEqual(expect.arrayContaining(['XL', 'XXL']));
    expect(result.selectedVariantTexts).toContain('XL');
  });
});

/* ── Zalando ──────────────────────────────────────────────────────────────── */

const ZALANDO_URL = 'https://www.zalando.fr/nike-sportswear-club-tee-t-shirt-basic-black-ni121d0a2-q11.html';
const ZALANDO_CATALOG = 'https://www.zalando.fr/catalog/?q=shirt';

const ZALANDO_GROUP = {
  '@context': 'https://schema.org',
  '@type': 'ProductGroup',
  name: 'T-shirt Nike Sportswear Club',
  productGroupID: 'NI121D0A2',
  brand: { '@type': 'Brand', name: 'Nike' },
  image: ['https://cdn.example.test/front.webp', 'https://cdn.example.test/back.webp'],
  hasVariant: [
    {
      '@type': 'Product', sku: 'NI121D0A2-Q11-S', size: 'S', color: 'Noir',
      offers: { '@type': 'Offer', price: '29.90', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
    },
    {
      '@type': 'Product', sku: 'NI121D0A2-Q11-M', size: 'M', color: 'Noir',
      offers: { '@type': 'Offer', price: '29.90', priceCurrency: 'EUR', availability: 'https://schema.org/LimitedAvailability' },
    },
  ],
};

function zalandoPage(availabilityMarkup: string, stock: [string, string] = ['InStock', 'InStock']): string {
  const group = {
    ...ZALANDO_GROUP,
    hasVariant: ZALANDO_GROUP.hasVariant.map((variant, index) => ({
      ...variant,
      offers: { ...variant.offers, availability: `https://schema.org/${stock[index] ?? stock[0]}` },
    })),
  };
  return `<!doctype html><html lang="fr"><head>
    <title>T-shirt Nike | Zalando</title>
    <meta property="og:title" content="T-shirt Nike Sportswear Club">
    <link rel="canonical" href="${ZALANDO_URL}">
    <script type="application/ld+json">${JSON.stringify(group)}</script>
  </head><body><h1>T-shirt Nike Sportswear Club</h1>
    <span class="pdp-price">29,90 €</span>
    ${availabilityMarkup}
  </body></html>`;
}

describe('Zalando — le prix vit sur les variantes, pas sur le groupe', () => {
  it('lit le prix, la devise vérifiée, les variantes et l’identité publiée', () => {
    const parsed = parseProductPageHtml(zalandoPage(''), ZALANDO_URL, 'zalando');
    expect(parsed.price).toBe(29.9);
    expect(parsed.currency).toBe('EUR');
    expect(parsed.currencyVerified).toBe(true);
    expect(parsed.priceSource).toBe('json_ld');
    expect(parsed.externalId).toBe('NI121D0A2');
    expect(parsed.variants.sizes).toEqual(expect.arrayContaining(['S', 'M']));
    expect(parsed.variants.details?.length).toBe(2);
    // Prix et stock PAR variante — jamais un prix unique recopié sur toutes.
    expect(parsed.variants.details?.[0]).toMatchObject({ size: 'S', price: 29.9 });
  });

  it('lit le message de stock publié par la page (allemand) sans le deviner', () => {
    const parsed = parseProductPageHtml(
      zalandoPage('<div class="availability-message">Nur wenige verfügbar</div>'),
      ZALANDO_URL,
      'zalando',
    );
    // La page annonce une disponibilité limitée : c'est la version la plus
    // prudente, jamais « en stock ».
    expect(parsed.availability).toBe('limited');
  });

  it('deux états de stock CONTRADICTOIRES restent « unknown »', () => {
    // « S en stock, M en stock limité » + « Ausverkauft » sur la page : la fiche
    // se contredit, elle ne permet aucune promesse.
    const parsed = parseProductPageHtml(
      zalandoPage('<div class="availability-message">Ausverkauft</div>', ['InStock', 'LimitedAvailability']),
      ZALANDO_URL,
      'zalando',
    );
    expect(parsed.availability).toBe('unknown');
  });

  it('la capture DANS LE NAVIGATEUR lit aussi le ProductGroup (prix + titre)', () => {
    /* Le script injecté chez le client ne trouvait aucun produit : Zalando
       publie `ProductGroup`, et le lecteur ne cherchait que `Product`. Résultat :
       la fiche s'ouvrait avec « aucun prix » dans l'application, alors que la
       page publie 29,90 €. */
    const result = capture(zalandoPage(''), ZALANDO_URL) as unknown as {
      title: string;
      priceCandidates: Array<{ text: string; source: string }>;
    };
    expect(result.title).toBe('T-shirt Nike Sportswear Club');
    expect(result.priceCandidates[0]).toMatchObject({ source: 'json_ld' });
    expect(result.priceCandidates[0].text).toContain('29.90');
  });

  it('le domaine est reconnu comme Zalando, pas comme une boutique générique', () => {
    expect(detectMerchantStore(ZALANDO_URL)).toBe('zalando');
    expect(detectAyWebsStore(ZALANDO_URL)?.id).toBe('zalando');
  });

  it('l’adaptateur reconnaît une fiche et refuse une page de catalogue', () => {
    const adapter = new ZalandoAdapter({} as never);
    expect(adapter.canHandle(ZALANDO_URL)).toBe(true);
    expect(adapter.classifyPage(ZALANDO_URL)).toMatchObject({
      pageType: 'PRODUCT', storeId: 'zalando', isProductPage: true,
    });
    expect(adapter.classifyPage(ZALANDO_CATALOG)).toMatchObject({ isProductPage: false });
    expect(adapter.id).toBe('zalando');
  });

  it('l’identité source est stable : ZALANDO-<sku>, quel que soit le lien', () => {
    const adapter = new ZalandoAdapter({} as never);
    expect(adapter.sourceProductId(ZALANDO_URL)).toBe('ZALANDO-NI121D0A2-Q11');
    expect(adapter.sourceProductId(`${ZALANDO_URL}?utm_source=mail`)).toBe('ZALANDO-NI121D0A2-Q11');
  });

  it('est enregistré comme adaptateur réel dans le registre', () => {
    expect(createAyWebsAdapterById('zalando', {} as never).id).toBe('zalando');
    expect(AYWEBS_ADAPTER_DESCRIPTORS.find((descriptor) => descriptor.id === 'zalando')).toMatchObject({
      implemented: true,
      purchaseMode: 'MANUAL_REVIEW',
    });
  });
});
