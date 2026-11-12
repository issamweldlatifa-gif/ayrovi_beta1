/**
 * AYWEBs — lecteur de PLATEFORME Shopify (12/11/2026).
 *
 * Un lecteur couvre toutes les boutiques Shopify du catalogue : prix de la
 * VARIANTE choisie (JSON produit en centimes + offre JSON-LD de cette variante),
 * abstention quand la variante n'est pas identifiable, jamais sur une place de
 * marché. Testé sur le cœur complet ET sur le lot `kernel` (servi aux boutiques
 * génériques) ; absent des lots SHEIN / TEMU / AliExpress.
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { AYWEBS_CAPTURE_BUNDLES } from '../src/aywebs/captureBundles.generated';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';

type Capture = { priceCandidates: Array<{ text: string; source: string }>; diagnostics: string[]; availabilityText: string | null; title: string | null; currencyText: string | null };

const SCRIPTS = { core: AYWEBS_CAPTURE_SCRIPT, kernel: AYWEBS_CAPTURE_BUNDLES.kernel.text } as const;

const VARIANTS = [
  { id: 41000000001, title: 'S', public_title: 'S', option1: 'S', sku: 'TEE-S', price: 2900, available: true },
  { id: 41000000002, title: 'M', public_title: 'M', option1: 'M', sku: 'TEE-M', price: 3400, available: true },
  { id: 41000000003, title: 'L', public_title: 'L', option1: 'L', sku: 'TEE-L', price: 3400, available: false },
];

function jsonLdPerVariant(base: string): string {
  return JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Product', name: 'Tee coton bio', sku: 'TEE',
    offers: VARIANTS.map((v) => ({
      '@type': 'Offer', sku: v.sku, price: (v.price / 100).toFixed(2), priceCurrency: 'EUR',
      availability: v.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${base}?variant=${v.id}`,
    })),
  });
}

interface PageOptions {
  url: string;
  productJson?: boolean;
  jsonLd?: boolean;
  formVariant?: number;
  shopifyGlobal?: boolean;
  analytics?: boolean;
  currency?: string;
  variants?: typeof VARIANTS;
}

function page(options: PageOptions) {
  const base = options.url.split('?')[0];
  const variants = options.variants ?? VARIANTS;
  const html = `<!doctype html><html lang="fr"><head><title>Tee coton bio</title>
    <link rel="stylesheet" href="https://cdn.shopify.com/s/files/1/theme.css">
    ${options.jsonLd === false ? '' : `<script type="application/ld+json">${jsonLdPerVariant(base)}</script>`}
    </head><body><main>
      <h1>Tee coton bio</h1>
      ${options.productJson === false ? '' : `<script type="application/json" data-product-json>${JSON.stringify({ id: 9, title: 'Tee coton bio', options: ['Taille'], variants })}</script>`}
      <form action="/cart/add" method="post">
        ${options.formVariant ? `<input type="hidden" name="id" value="${options.formVariant}">` : ''}
        <button type="submit">Ajouter au panier</button>
      </form>
    </main></body></html>`;
  const dom = new JSDOM(html, { url: options.url });
  const win = dom.window as unknown as Record<string, unknown>;
  if (options.shopifyGlobal !== false) win.Shopify = { shop: 'tee-bio.myshopify.com', currency: { active: options.currency ?? 'EUR', rate: '1.0' } };
  if (options.analytics) win.ShopifyAnalytics = { meta: { currency: options.currency ?? 'EUR', product: { id: 9, variants } } };
  return dom;
}

function run(script: string, dom: JSDOM): Capture {
  // eslint-disable-next-line no-new-func
  const evaluate = new Function('document', 'location', 'URL', `return ${script}`);
  return JSON.parse(evaluate(dom.window.document, dom.window.location, dom.window.URL) as string) as Capture;
}

const sources = (capture: Capture) => capture.priceCandidates.map((c) => `${c.source}:${c.text}`);

describe.each(Object.entries(SCRIPTS))('Shopify — %s', (_name, script) => {
  it('« ?variant= » : prix de la variante M (34 €), pas celui de la première taille', () => {
    const url = 'https://tee-bio.example/products/tee?variant=41000000002';
    const capture = run(script, page({ url }));
    expect(sources(capture)).toEqual(expect.arrayContaining(['json_ld:34.00 EUR', 'embedded_json:34.00 EUR']));
    expect(sources(capture).some((s) => s.includes('29.00'))).toBe(false);
    expect(capture.diagnostics).toEqual(expect.arrayContaining(['platform:shopify', 'platform:shopify_variant_offer']));
    expect(capture.availabilityText).toBe('https://schema.org/InStock');
    const validation = validateAyWebsCapturedPage(capture, url, { requireCorroboration: true });
    expect(validation.ok).toBe(true);
    expect(validation.price).toBeCloseTo(34);
    expect(validation.currency).toBe('EUR');
    expect(validation.corroborated).toBe(true);
  });

  it('variante du formulaire d’ajout au panier quand l’adresse n’en nomme pas', () => {
    const capture = run(script, page({ url: 'https://tee-bio.example/products/tee', formVariant: 41000000001 }));
    expect(sources(capture)).toEqual(expect.arrayContaining(['json_ld:29.00 EUR', 'embedded_json:29.00 EUR']));
  });

  it('variante épuisée : disponibilité de CETTE variante', () => {
    const capture = run(script, page({ url: 'https://tee-bio.example/products/tee?variant=41000000003' }));
    expect(capture.availabilityText).toBe('https://schema.org/OutOfStock');
  });

  it('plusieurs variantes, aucune identifiable : abstention (jamais le prix d’une autre taille)', () => {
    const url = 'https://tee-bio.example/products/tee';
    const capture = run(script, page({ url }));
    expect(capture.diagnostics).toContain('platform:shopify_variant_unknown');
    expect(capture.priceCandidates.some((c) => c.source === 'embedded_json' || c.source === 'json_ld')).toBe(false);
    expect(validateAyWebsCapturedPage(capture, url, { requireCorroboration: true }).ok).toBe(false);
  });

  it('identifiant de variante inconnu : abstention', () => {
    const capture = run(script, page({ url: 'https://tee-bio.example/products/tee?variant=41999999999' }));
    expect(capture.diagnostics).toContain('platform:shopify_variant_unknown');
    expect(capture.priceCandidates.some((c) => c.source === 'embedded_json')).toBe(false);
  });

  it('ShopifyAnalytics (centimes) quand le thème ne publie pas de JSON produit, devise de présentation', () => {
    const url = 'https://tee-bio.example/products/tee?variant=41000000002';
    const capture = run(script, page({ url, productJson: false, analytics: true, currency: 'USD', jsonLd: false }));
    expect(sources(capture)).toContain('embedded_json:34.00 USD');
    // Une seule source machine, sans JSON-LD : le serveur exige une seconde source.
    expect(validateAyWebsCapturedPage(capture, url, { requireCorroboration: true }).ok).toBe(false);
  });

  it('produit à une seule variante : pas d’ambiguïté', () => {
    const single = [VARIANTS[0]];
    const capture = run(script, page({ url: 'https://tee-bio.example/products/tee', variants: single, jsonLd: false }));
    expect(sources(capture)).toContain('embedded_json:29.00 EUR');
  });

  it('montant au format inconnu ou devise absente : rien de publié par Shopify', () => {
    const odd = [{ ...VARIANTS[0], price: 29.5 as unknown as number }];
    const capture = run(script, page({ url: 'https://tee-bio.example/products/tee', variants: odd, jsonLd: false }));
    expect(capture.priceCandidates.some((c) => c.source === 'embedded_json')).toBe(false);
    expect(capture.diagnostics).toContain('platform:shopify_no_amount');
  });

  it('page sans Shopify : aucun diagnostic de plateforme, comportement inchangé', () => {
    const dom = new JSDOM('<!doctype html><html><head><meta property="product:price:amount" content="12.95"><meta property="product:price:currency" content="EUR"></head><body><h1>Article</h1></body></html>', { url: 'https://shop.example/p/1' });
    const capture = run(script, dom);
    expect(capture.diagnostics.some((d) => d.startsWith('platform:shopify'))).toBe(false);
  });
});

describe.each(Object.entries(SCRIPTS))('Shopify — groupes de variantes — %s', (_name, script) => {
  type Groups = Array<{ name: string; values: string[]; selected: string[]; options?: Array<{ value: string; available: boolean | null; price: string | null }> }>;
  const groupsOf = (capture: Capture) => (capture as unknown as { variantGroups: Groups }).variantGroups;

  it('un axe : valeurs, sélection, état et prix PAR taille', () => {
    const capture = run(script, page({ url: 'https://tee-bio.example/products/tee?variant=41000000002' }));
    const groups = groupsOf(capture);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: 'Taille', values: ['S', 'M', 'L'], selected: ['M'] });
    expect(groups[0].options).toEqual([
      expect.objectContaining({ value: 'S', available: true, price: '29.00 EUR' }),
      expect.objectContaining({ value: 'M', available: true, price: '34.00 EUR' }),
      expect.objectContaining({ value: 'L', available: false, price: '34.00 EUR' }),
    ]);
    expect(capture.diagnostics).toContain('platform:shopify_variant_groups');
  });

  it('deux axes : l’état d’une couleur est celui de la variante qui GARDE la taille affichée', () => {
    const variants = [
      { id: 51, option1: 'Noir', option2: 'S', sku: 'N-S', price: 2900, available: true },
      { id: 52, option1: 'Noir', option2: 'M', sku: 'N-M', price: 2900, available: true },
      { id: 53, option1: 'Blanc', option2: 'S', sku: 'B-S', price: 3100, available: true },
      { id: 54, option1: 'Blanc', option2: 'M', sku: 'B-M', price: 3100, available: false },
    ];
    const dom = new JSDOM(`<!doctype html><html><head><link rel="stylesheet" href="https://cdn.shopify.com/t.css"></head><body><h1>Tee</h1>
      <script type="application/json" data-product-json>${JSON.stringify({ id: 9, title: 'Tee', options: [{ name: 'Couleur', position: 1 }, { name: 'Taille', position: 2 }], variants })}</script></body></html>`,
    { url: 'https://tee-bio.example/products/tee?variant=52' });
    (dom.window as unknown as Record<string, unknown>).Shopify = { shop: 'x.myshopify.com', currency: { active: 'EUR' } };
    const groups = groupsOf(run(script, dom));
    expect(groups.map((group) => group.name)).toEqual(['Couleur', 'Taille']);
    const colour = groups[0];
    expect(colour.selected).toEqual(['Noir']);
    // Taille affichée = M : Blanc/M est épuisé (et non Blanc/S, disponible).
    expect(colour.options).toEqual([
      expect.objectContaining({ value: 'Noir', available: true, price: '29.00 EUR' }),
      expect.objectContaining({ value: 'Blanc', available: false, price: '31.00 EUR' }),
    ]);
    expect(groups[1]).toMatchObject({ values: ['S', 'M'], selected: ['M'] });
  });

  it('variante inconnue : aucun groupe affirmé par Shopify', () => {
    const capture = run(script, page({ url: 'https://tee-bio.example/products/tee' }));
    expect(capture.diagnostics).not.toContain('platform:shopify_variant_groups');
  });
});

describe('Shopify — jamais sur une place de marché, absent des lots dédiés', () => {
  it('une page SHEIN avec des ressources cdn.shopify.com n’active pas le lecteur Shopify', () => {
    const dom = page({ url: 'https://fr.shein.com/Robe-p-12345.html?variant=41000000002' });
    const capture = run(AYWEBS_CAPTURE_SCRIPT, dom);
    expect(capture.diagnostics.some((d) => d.startsWith('platform:shopify'))).toBe(false);
  });

  it('les lots SHEIN / TEMU / AliExpress ne contiennent pas le lecteur Shopify ; le noyau, si', () => {
    expect(AYWEBS_CAPTURE_BUNDLES.kernel.text).toContain('function shopifyProductState(');
    for (const id of ['shein', 'temu', 'aliexpress'] as const) {
      expect(AYWEBS_CAPTURE_BUNDLES[id].text, id).not.toContain('shopify');
      expect(AYWEBS_CAPTURE_BUNDLES[id].falseFlags, id).toContain('IS_SHOPIFY');
    }
  });
});
