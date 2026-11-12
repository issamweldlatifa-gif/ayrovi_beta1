/**
 * AYWEBs — fourchette JSON-LD et lecteur de PLATEFORME WooCommerce (12/11/2026).
 *
 * Défaut corrigé : un produit variable publie un « AggregateOffer » 39–59 € ;
 * le lecteur générique publiait « 39.00 EUR » en JSON-LD (qui se corrobore
 * seul) et le serveur l'acceptait — quel que soit l'article choisi. Désormais
 * la fourchette n'est jamais un prix, et le lecteur WooCommerce lit la
 * variation CHOISIE (JSON du formulaire + prix affiché pour elle).
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { AYWEBS_CAPTURE_BUNDLES } from '../src/aywebs/captureBundles.generated';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';

type Group = { name: string; values: string[]; selected: string[]; options?: Array<{ value: string; available: boolean | null; price: string | null }> };
type Capture = { priceCandidates: Array<{ text: string; source: string }>; diagnostics: string[]; availabilityText: string | null; variantGroups: Group[]; images: string[] };

const SCRIPTS = { core: AYWEBS_CAPTURE_SCRIPT, kernel: AYWEBS_CAPTURE_BUNDLES.kernel.text } as const;
const URL_BASE = 'https://laine-shop.example/produit/pull-laine/';

const VARIATIONS = [
  { variation_id: 101, attributes: { attribute_pa_taille: 's', attribute_pa_couleur: 'ecru' }, display_price: 39, is_in_stock: true, image: { src: 'https://laine-shop.example/wp-content/uploads/pull-ecru.jpg' } },
  { variation_id: 102, attributes: { attribute_pa_taille: 'm', attribute_pa_couleur: 'ecru' }, display_price: 49, is_in_stock: true, image: { src: 'https://laine-shop.example/wp-content/uploads/pull-ecru.jpg' } },
  { variation_id: 103, attributes: { attribute_pa_taille: 'm', attribute_pa_couleur: 'marine' }, display_price: 59, is_in_stock: false, image: { src: 'https://laine-shop.example/wp-content/uploads/pull-marine.jpg' } },
  { variation_id: 104, attributes: { attribute_pa_taille: 's', attribute_pa_couleur: 'marine' }, display_price: 59, is_in_stock: true, image: { src: 'https://laine-shop.example/wp-content/uploads/pull-marine.jpg' } },
];

function page(options: { taille?: string; couleur?: string; shown?: string; url?: string; variations?: unknown }) {
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: 'Pull laine', offers: [{ '@type': 'AggregateOffer', lowPrice: '39.00', highPrice: '59.00', offerCount: 4, priceCurrency: 'EUR' }] };
  const select = (name: string, id: string, label: string, choices: Array<[string, string]>, selected?: string) => `
    <tr><th class="label"><label for="${id}">${label}</label></th><td class="value">
      <select id="${id}" name="${name}"><option value="">Choisir une option</option>
      ${choices.map(([value, text]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${text}</option>`).join('')}
      </select></td></tr>`;
  const html = `<!doctype html><html lang="fr-FR"><head><title>Pull laine – Laine Shop</title>
    <script type="application/ld+json">${JSON.stringify(ld)}</script></head>
    <body class="product-template-default single single-product woocommerce woocommerce-page">
      <h1 class="product_title entry-title">Pull laine</h1>
      <p class="price"><span class="woocommerce-Price-amount amount">39,00&nbsp;€</span> – <span class="woocommerce-Price-amount amount">59,00&nbsp;€</span></p>
      <form class="variations_form cart" data-product_id="77" data-product_variations='${JSON.stringify(options.variations ?? VARIATIONS).replace(/'/g, '&#39;')}'>
        <table class="variations"><tbody>
          ${select('attribute_pa_taille', 'pa_taille', 'Taille', [['s', 'S'], ['m', 'M']], options.taille)}
          ${select('attribute_pa_couleur', 'pa_couleur', 'Couleur', [['ecru', 'Écru'], ['marine', 'Marine']], options.couleur)}
        </tbody></table>
        <div class="single_variation_wrap"><div class="woocommerce-variation single_variation">
          ${options.shown ? `<div class="woocommerce-variation-price"><span class="price"><span class="woocommerce-Price-amount amount"><bdi>${options.shown}</bdi></span></span></div>` : ''}
        </div><button type="submit" class="single_add_to_cart_button button alt">Ajouter au panier</button></div>
      </form></body></html>`;
  return new JSDOM(html, { url: options.url ?? URL_BASE, runScripts: 'outside-only' });
}

const run = (script: string, dom: JSDOM): Capture => JSON.parse(String(dom.window.eval(script))) as Capture;
const verdict = (capture: Capture, url = URL_BASE) => validateAyWebsCapturedPage(capture, url, { requireCorroboration: true, requireProductPage: true });

describe.each(Object.entries(SCRIPTS))('WooCommerce — %s', (_name, script) => {
  it('fourchette seule (aucune variation choisie) : aucun prix, la capture est refusée', () => {
    const capture = run(script, page({}));
    expect(capture.priceCandidates.some((c) => c.source === 'json_ld')).toBe(false);
    expect(capture.diagnostics).toEqual(expect.arrayContaining(['price:jsonld_range', 'platform:woocommerce_selection_incomplete']));
    expect(verdict(capture).ok).toBe(false);
  });

  it('variation M / Écru choisie : 49 € (JSON + prix affiché d’accord), pas le bas de fourchette', () => {
    const capture = run(script, page({ taille: 'm', couleur: 'ecru', shown: '49,00&nbsp;€' }));
    expect(capture.priceCandidates).toEqual([
      { text: '49.00 EUR', source: 'embedded_json' },
      { text: '49,00 €', source: 'dom' },
    ]);
    const result = verdict(capture);
    expect(result.ok, String(result.rejection)).toBe(true);
    expect(result.price).toBeCloseTo(49, 2);
    expect(result.currency).toBe('EUR');
    expect(result.corroborated).toBe(true);
    expect(capture.availabilityText).toBe('https://schema.org/InStock');
  });

  it('variation épuisée : rupture de CETTE variation', () => {
    const capture = run(script, page({ taille: 'm', couleur: 'marine', shown: '59,00&nbsp;€' }));
    expect(capture.availabilityText).toBe('https://schema.org/OutOfStock');
    expect(capture.images).toContain('https://laine-shop.example/wp-content/uploads/pull-marine.jpg');
  });

  it('choix depuis l’adresse (?attribute_pa_…) quand les listes ne sont pas encore positionnées', () => {
    const capture = run(script, page({ url: `${URL_BASE}?attribute_pa_taille=s&attribute_pa_couleur=marine`, shown: '59,00&nbsp;€' }));
    expect(capture.priceCandidates[0]).toEqual({ text: '59.00 EUR', source: 'embedded_json' });
  });

  it('JSON seul, sans prix affiché pour la variation : une source ⇒ refusé hors registre', () => {
    const capture = run(script, page({ taille: 'm', couleur: 'ecru' }));
    expect(capture.priceCandidates).toEqual([{ text: '49.00 EUR', source: 'embedded_json' }]);
    expect(verdict(capture).rejection).toBe('PRICE_NOT_CORROBORATED');
  });

  it('prix affiché différent du JSON : ambigu, jamais un des deux au hasard', () => {
    const capture = run(script, page({ taille: 'm', couleur: 'ecru', shown: '39,00&nbsp;€' }));
    expect(verdict(capture).ok).toBe(false);
  });

  it('groupes : libellés, sélection, état et prix par valeur en gardant l’autre axe', () => {
    const groups = run(script, page({ taille: 'm', couleur: 'ecru', shown: '49,00&nbsp;€' })).variantGroups;
    expect(groups.map((group) => group.name)).toEqual(['Taille', 'Couleur']);
    expect(groups[0]).toMatchObject({ values: ['S', 'M'], selected: ['M'] });
    // Couleur affichée Écru : S/Écru 39 €, M/Écru 49 €.
    expect(groups[0].options).toEqual([
      expect.objectContaining({ value: 'S', available: true, price: '39.00 EUR' }),
      expect.objectContaining({ value: 'M', available: true, price: '49.00 EUR' }),
    ]);
    // Taille affichée M : Marine/M est épuisée.
    expect(groups[1]).toMatchObject({ values: ['Écru', 'Marine'], selected: ['Écru'] });
    expect(groups[1].options).toEqual([
      expect.objectContaining({ value: 'Écru', available: true, price: '49.00 EUR' }),
      expect.objectContaining({ value: 'Marine', available: false, price: '59.00 EUR' }),
    ]);
  });

  it('« data-product_variations=false » (chargement AJAX) : rien d’inventé', () => {
    const capture = run(script, page({ taille: 'm', couleur: 'ecru', variations: false }));
    expect(capture.priceCandidates.some((c) => c.source === 'embedded_json')).toBe(false);
  });
});

describe('fourchette JSON-LD — règle générale (toutes boutiques)', () => {
  const pageWith = (offers: unknown) => new JSDOM(`<!doctype html><html><head><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Article', offers })}</script></head><body><h1>Article</h1></body></html>`, { url: 'https://shop.example/p/1', runScripts: 'outside-only' });

  it('bornes égales : c’est un prix (1 seul montant)', () => {
    const capture = run(AYWEBS_CAPTURE_SCRIPT, pageWith({ '@type': 'AggregateOffer', lowPrice: '19.90', highPrice: '19.9', priceCurrency: 'EUR' }));
    expect(capture.priceCandidates).toEqual([{ text: '19.90 EUR', source: 'json_ld' }]);
  });

  it('bornes différentes, même avec un « price » : abstention', () => {
    const capture = run(AYWEBS_CAPTURE_SCRIPT, pageWith({ '@type': 'AggregateOffer', price: '19.90', lowPrice: '19.90', highPrice: '29.90', priceCurrency: 'EUR' }));
    expect(capture.priceCandidates).toEqual([]);
    expect(capture.diagnostics).toContain('price:jsonld_range');
  });

  it('une offre simple n’est pas touchée', () => {
    const capture = run(AYWEBS_CAPTURE_SCRIPT, pageWith({ '@type': 'Offer', price: '24.00', priceCurrency: 'EUR' }));
    expect(capture.priceCandidates).toEqual([{ text: '24.00 EUR', source: 'json_ld' }]);
  });

  it('les lots des places de marché ne contiennent pas le lecteur WooCommerce', () => {
    expect(AYWEBS_CAPTURE_BUNDLES.kernel.text).toContain('function wooVariationState(');
    for (const id of ['shein', 'temu', 'aliexpress'] as const) {
      expect(AYWEBS_CAPTURE_BUNDLES[id].text, id).not.toContain('wooVariation');
      expect(AYWEBS_CAPTURE_BUNDLES[id].falseFlags, id).toContain('IS_WOOCOMMERCE');
    }
  });
});
