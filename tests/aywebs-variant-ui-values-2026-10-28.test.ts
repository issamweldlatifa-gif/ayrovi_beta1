/**
 * AYWEBs — FEUILLE ZALANDO : LES VALEURS DE LA PAGE, PAS LES BOUTONS D'INTERFACE
 * (28/10/2026).
 *
 * ── Ce que le client a vu ──────────────────────────────────────────────────
 * Deux captures d'écran de la feuille « Sélectionnez votre article » sur une
 * fiche Zalando :
 *
 *   • un seul champ « Taille », avec DEUX pastilles : « Taille » et
 *     « Votre taille » ;
 *   • aucune pointure, aucune couleur, aucune mesure — « comme avant » ;
 *   • en choisissant « Votre taille », un refus rouge : « Le marchand ne
 *     publie pas le stock de ce choix. »
 *
 * ── La cause, reproduite ici ───────────────────────────────────────────────
 * Le sélecteur de taille de Zalando contient deux boutons d'INTERFACE : le nom
 * du groupe répété (« Taille ») et la recommandation du marchand (« Votre
 * taille »). La capture les publiait comme les deux VALEURS du groupe
 * « Taille ». Or ce groupe occupait déjà la dimension TAILLE, donc il
 * MASQUAIT les vraies pointures lues dans le `ProductGroup` (JSON-LD) : le
 * client perdait tailles ET couleurs d'un seul coup.
 *
 * ── Ce que ce fichier verrouille ───────────────────────────────────────────
 *   1. les libellés d'interface ne sont jamais des valeurs ;
 *   2. une valeur identique au nom de son groupe non plus ;
 *   3. un groupe qui ne garde pas deux valeurs réelles n'est pas publié ;
 *   4. les tailles et les couleurs du `ProductGroup` redeviennent visibles,
 *      avec leur prix et leur état par valeur.
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { buildAyWebsCaptureScript } from '../src/aywebs/captureScript';

const PAGE_URL = 'https://www.zalando.fr/pantalon-carpenter-a11.html';

function run(html: string): Record<string, unknown> {
  const dom = new JSDOM(html, { url: PAGE_URL });
  const evaluate = new Function('document', 'location', 'URL', `return ${buildAyWebsCaptureScript('zalando')}`);
  return JSON.parse(String(evaluate(dom.window.document, dom.window.location, PAGE_URL)));
}

interface Group {
  name: string;
  values: string[];
  selected: string[];
  options?: Array<{ value: string; available: boolean | null; price: string | null }>;
}
const groups = (capture: Record<string, unknown>): Group[] =>
  (capture.variantGroups as Group[] | undefined) ?? [];

/** ProductGroup réel : un pantalon en deux couleurs et trois tailles. */
const VARIANTS = ['noir', 'kaki'].flatMap((color) => ['S', 'M', 'L'].map((size) => ({
  '@type': 'Product',
  sku: `CARP-${color}-${size}`,
  color,
  size,
  offers: {
    '@type': 'Offer',
    price: '129.95',
    priceCurrency: 'EUR',
    availability: size === 'L' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
  },
})));

const PRODUCT_GROUP = {
  '@context': 'https://schema.org',
  '@type': 'ProductGroup',
  name: 'EXCLUSIVE CORDUROY RELAXED CARPENTER TROUSERS',
  productGroupID: 'CARP-1',
  brand: { '@type': 'Brand', name: 'Zalando' },
  image: ['https://cdn.example.test/pantalon.webp'],
  hasVariant: VARIANTS,
};

/**
 * Le widget fautif : un conteneur nommé « Taille » dont les SEULS boutons sont
 * les deux libellés d'interface. C'est la forme mesurée sur la page réelle.
 */
const SIZE_WIDGET = `
  <div class="size-selector-container" data-testid="size-selector">
    <h3>Taille</h3>
    <button type="button">Taille</button>
    <button type="button">Votre taille</button>
  </div>`;

function page(body: string, withJsonLd = true, group: unknown = PRODUCT_GROUP): string {
  return `<!doctype html><html lang="fr"><head>
    <title>PANTALON | Zalando</title>
    <link rel="canonical" href="${PAGE_URL}">
    ${withJsonLd ? `<script type="application/ld+json">${JSON.stringify(group)}</script>` : ''}
  </head><body>
    <h1>EXCLUSIVE CORDUROY RELAXED CARPENTER TROUSERS</h1>
    <div class="pdp-price"><span>129,95 €</span></div>
    ${body}
    <div class="availability-message">En stock</div>
  </body></html>`;
}

describe('les boutons d’interface ne deviennent jamais des valeurs', () => {
  it('« Taille » et « Votre taille » ne sont pas publiés comme tailles', () => {
    const capture = run(page(SIZE_WIDGET));
    const allValues = groups(capture).flatMap((group) => group.values);
    expect(allValues).not.toContain('Votre taille');
    expect(allValues).not.toContain('Taille');
  });

  it('les vraies pointures du ProductGroup redeviennent visibles', () => {
    const capture = run(page(SIZE_WIDGET));
    const size = groups(capture).find((group) => /taille|size/i.test(group.name));
    expect(size, 'aucun groupe de tailles publié').toBeTruthy();
    expect(size!.values).toEqual(expect.arrayContaining(['S', 'M', 'L']));
  });

  it('les couleurs du ProductGroup sont publiées aussi', () => {
    const capture = run(page(SIZE_WIDGET));
    const color = groups(capture).find((group) => /couleur|color/i.test(group.name));
    expect(color, 'aucun groupe de couleurs publié').toBeTruthy();
    expect(color!.values).toEqual(expect.arrayContaining(['noir', 'kaki']));
  });

  it('chaque taille garde le prix et l’état publiés par le marchand', () => {
    /* Une seule couleur affichée : le prix/état PAR TAILLE est alors prouvé
       (avec deux couleurs sans couleur affichée, le marchand ne dit pas laquelle
       porte le prix — on ne publie donc que les valeurs, jamais un prix deviné). */
    const singleColour = {
      ...PRODUCT_GROUP,
      hasVariant: VARIANTS.filter((variant) => variant.color === 'noir'),
    };
    const capture = run(page(SIZE_WIDGET, true, singleColour));
    const size = groups(capture).find((group) => /taille|size/i.test(group.name));
    const medium = size!.options?.find((option) => option.value === 'M');
    expect(medium?.available).toBe(true);
    expect(String(medium?.price)).toContain('129.95');
    /* Une taille épuisée reste publiée comme telle. */
    const large = size!.options?.find((option) => option.value === 'L');
    expect(large?.available).toBe(false);
  });

  it('deux couleurs sans couleur affichée : les tailles restent listées, sans prix deviné', () => {
    const capture = run(page(SIZE_WIDGET));
    const size = groups(capture).find((group) => /taille|size/i.test(group.name));
    expect(size!.values).toEqual(expect.arrayContaining(['S', 'M', 'L']));
    expect(size!.options ?? []).toEqual([]);
  });

  it('sans aucune lecture réelle, aucun groupe d’interface n’est fabriqué', () => {
    const capture = run(page(SIZE_WIDGET, false));
    const names = groups(capture).map((group) => group.name.toLowerCase());
    expect(names).not.toContain('taille');
  });
});

describe('le crible ne mange pas les vrais choix', () => {
  it('un sélecteur de tailles normal reste publié, avec sa sélection', () => {
    const form = `
      <form class="size-selector"><h3>Taille</h3>
        <label class="size-checkbox"><input type="checkbox" value="35.5"><span>35.5</span></label>
        <label class="size-checkbox"><input type="checkbox" value="36" checked><span>36</span></label>
        <label class="size-checkbox"><input type="checkbox" value="36.5"><span>36.5</span></label>
      </form>`;
    const capture = run(page(form));
    const size = groups(capture).find((group) => /taille|size/i.test(group.name));
    expect(size).toBeTruthy();
    expect(size!.values).toEqual(expect.arrayContaining(['35.5', '36', '36.5']));
    expect(size!.selected).toContain('36');
  });

  it('une valeur réelle n’est jamais écartée parce qu’elle commence comme un mot d’interface', () => {
    /* « Tailleur » n'est pas « Taille » : l'ancrage de fin de mot protège le
       vrai libellé du marchand. */
    const form = `
      <form class="size-selector"><h3>Taille</h3>
        <button type="button" role="radio" aria-checked="false">Tailleur</button>
        <button type="button" role="radio" aria-checked="false">Robe</button>
      </form>`;
    const capture = run(page(form, false));
    const size = groups(capture).find((group) => /taille|size/i.test(group.name));
    expect(size?.values).toContain('Tailleur');
  });
});
