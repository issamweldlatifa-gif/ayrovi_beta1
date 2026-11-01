/**
 * AYWEBs — UNE FICHE, DEUX COULEURS : LE PRIX D'UNE COULEUR N'EST PAS CELUI DE
 * L'AUTRE (26/10/2026).
 *
 * ── Le symptôme mesuré sur l'application ──────────────────────────────────
 * Le MÊME article (Zalando, « HYBRID WOMEN ») se comportait différemment selon
 * la couleur ouverte :
 *   • couleur « black/white/anthracite » : 139.95 EUR partout, devis en dinars
 *     (838.42 TND) sur CHAQUE pointure, ajout possible ;
 *   • couleur « dk raisin/mtlc dk grey » : prix boutique 139.99, aucun devis en
 *     dinars, et une liste de pointures aux prix INCOHÉRENTS —
 *     35.5 → 149.95 EUR, 36.5 → 139.99 EUR, 38 → 149.95 EUR…
 *
 * ── La cause, dans le script de capture ───────────────────────────────────
 * Un `ProductGroup` Zalando publie TOUTES les couleurs dans `hasVariant[]`.
 * La lecture prenait la PREMIÈRE variante rencontrée pour chaque taille, sans
 * regarder la couleur : la pointure 35.5 héritait du prix de la variante d'une
 * AUTRE couleur (149.95), et l'état « épuisé » d'un autre article.
 *
 * ── Ce que ce fichier verrouille ─────────────────────────────────────────
 *   1. les variantes sont restreintes à la couleur de la page — prouvée par la
 *      pastille cochée, l'URL de la page, ou le nom publié du produit ;
 *   2. quand la couleur n'est PAS prouvable, un désaccord de prix pour une même
 *      pointure ne publie AUCUN prix (on n'affiche jamais le prix d'une autre
 *      couleur) ;
 *   3. une fiche mono-couleur garde ses prix et ses états (non-régression).
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { buildAyWebsCaptureScript } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { ayWebsSelectionEvidence } from '../src/aywebs/variantEvidence';

const PAGE_URL = 'https://www.zalando.fr/nike-hybrid-women-dk-raisin-ni111a0b3-c11.html';

function run(html: string): Record<string, unknown> {
  const dom = new JSDOM(html, { url: PAGE_URL });
  const evaluate = new Function('document', 'location', 'URL', `return ${buildAyWebsCaptureScript('zalando')}`);
  return JSON.parse(String(evaluate(dom.window.document, dom.window.location, PAGE_URL)));
}

interface Option { value: string; available: boolean | null; price: string | null }
interface Group { name: string; values: string[]; selected: string[]; options?: Option[] }

function sizeGroup(capture: Record<string, unknown>): Group | undefined {
  return ((capture.variantGroups as Group[] | undefined) ?? []).find((group) => /taille|size/i.test(group.name));
}

function sizeOptions(capture: Record<string, unknown>): Map<string, Option> {
  const group = sizeGroup(capture);
  return new Map((group?.options ?? []).map((option) => [option.value, option]));
}

/** Deux couleurs du même `ProductGroup` ; la page ouverte est la « dk raisin ». */
function variants(options: { colorUrls?: boolean } = {}) {
  const { colorUrls = true } = options;
  const raisin = ['35.5', '36.5', '37.5', '38.5', '40', '41'];
  const black = ['35.5', '36', '38', '39', '40.5', '42'];
  const build = (color: string, sizes: string[], price: string, url: string, availability = 'InStock') =>
    sizes.map((size) => ({
      '@type': 'Product',
      sku: `NI111A0B3-${color}-${size}`,
      ...(colorUrls ? { url } : {}),
      size,
      color,
      offers: {
        '@type': 'Offer',
        price,
        priceCurrency: 'EUR',
        availability: `https://schema.org/${availability}`,
      },
    }));
  return [
    ...build('dk raisin', raisin, '139.99', PAGE_URL),
    ...build('black/white', black, '149.95', 'https://www.zalando.fr/nike-hybrid-women-black-white-ni111a0b3-c01.html'),
  ];
}

function page(input: { name?: string; items: unknown[]; withColorSwatch?: boolean }): string {
  const productGroup = {
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    name: input.name ?? 'HYBRID WOMEN - Chaussures fitness - dk raisin/mtlc dk grey/black/laser crimson',
    productGroupID: 'NI111A0B3',
    brand: { '@type': 'Brand', name: 'Nike' },
    hasVariant: input.items,
  };
  /* Pastille couleur réellement cochée : la preuve la plus directe pour le DOM. */
  const swatch = input.withColorSwatch
    ? `<div role="radiogroup" aria-label="Couleur">
         <button role="radio" aria-checked="false">black/white</button>
         <button role="radio" aria-checked="true">dk raisin</button>
       </div>`
    : '';
  return `<!doctype html><html lang="fr"><head>
    <title>HYBRID WOMEN | Zalando</title>
    <script type="application/ld+json">${JSON.stringify(productGroup)}</script>
  </head><body>
    <h1>HYBRID WOMEN - Chaussures fitness</h1>
    ${swatch}
    <form class="size-selector">
      <h3>Taille</h3>
      <a href="/guide-des-tailles" class="size-guide">Taille &amp; coupe</a>
      <div class="size-options">
        <label><input type="checkbox" value="35.5"><span>35.5</span></label>
        <label><input type="checkbox" value="36.5"><span>36.5</span></label>
        <label><input type="checkbox" value="38"><span>38</span></label>
      </div>
      <button type="submit">Ajouter au panier</button>
    </form>
    <div class="pdp-price"><span>139,99 €</span></div>
  </body></html>`;
}

describe('Zalando — le prix d’une couleur ne fuit jamais sur une autre', () => {
  it('restreint les variantes à la couleur de la PAGE (URL identique)', () => {
    const capture = run(page({ items: variants() }));
    const options = sizeOptions(capture);
    /* 36.5 n'existe que dans la couleur « dk raisin » : 139.99, jamais 149.95. */
    expect(options.get('36.5')?.price).toBe('139.99 EUR');
    /* 38 n'existe QUE dans « black/white » : la page peut le LISTER (le DOM
       nomme les pointures), mais elle ne doit lui prêter ni prix ni état. */
    expect(options.has('38')).toBe(false);
    /* Aucune valeur ne porte le prix de l'autre couleur. */
    for (const option of options.values()) expect(String(option.price)).not.toContain('149.95');
  });

  it('reconnaît la couleur cochée dans le DOM quand les variantes n’ont pas d’URL', () => {
    const capture = run(page({ items: variants({ colorUrls: false }), withColorSwatch: true }));
    const options = sizeOptions(capture);
    expect(options.get('36.5')?.price).toBe('139.99 EUR');
    expect(options.has('38')).toBe(false);
  });

  it('reconnaît la couleur écrite dans le nom publié du produit', () => {
    const capture = run(page({ items: variants({ colorUrls: false }) }));
    const options = sizeOptions(capture);
    expect(options.get('36.5')?.price).toBe('139.99 EUR');
    expect(options.has('38')).toBe(false);
  });

  it('sans aucune preuve de couleur, un désaccord de prix ne publie AUCUN prix', () => {
    const items = variants({ colorUrls: false }).map((variant) => ({ ...variant }));
    const capture = run(page({ name: 'HYBRID WOMEN - Chaussures fitness', items }));
    const options = sizeOptions(capture);
    /* Dès que plusieurs couleurs coexistent sans preuve de la couleur affichée,
       AUCUNE valeur ne reçoit de prix ni d'état : on ne choisit pas la couleur à
       la place du marchand. Les pointures restent listées (le DOM les nomme). */
    expect(options.size).toBe(0);
    expect(sizeGroup(capture)?.values).toEqual(expect.arrayContaining(['35.5', '36.5']));
    /* Et surtout : le prix de l'autre couleur n'apparaît nulle part. */
    for (const option of options.values()) expect(String(option.price ?? '')).not.toContain('149.95');
    expect(JSON.stringify(capture)).not.toContain('149.95');
  });

  it('une fiche mono-couleur garde ses prix et ses états par pointure', () => {
    const single = variants().filter((variant) => variant.color === 'dk raisin');
    const capture = run(page({ items: single }));
    const options = sizeOptions(capture);
    expect(options.get('36.5')?.price).toBe('139.99 EUR');
    expect(options.get('36.5')?.available).toBe(true);
  });

  it('le prix de la page vient de la couleur affichée, MÊME sans devise dans le DOM', () => {
    /* La fiche réelle affichait «Prix boutique : 139.99» — sans « EUR ». L'offre
       du marchand, elle, publie la devise : le devis en dinars redevient possible. */
    const html = page({ items: variants() }).replace('<span>139,99 €</span>', '<span>139,99</span>');
    const payload = run(html);
    const verdict = validateAyWebsCapturedPage(payload, PAGE_URL, {
      requireCorroboration: false,
      requireProductPage: true,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.price).toBeCloseTo(139.99, 2);
    expect(verdict.currency).toBe('EUR');
    expect(verdict.priceVerified).toBe(true);
    expect(verdict.currencyVerified).toBe(true);
  });

  it('la devise vient des offres de la couleur affichée quand le DOM n’en écrit aucune', () => {
    /* «139,99» sans « € » : la seule devise publiée est celle de l'offre du
       marchand. Elle est STRUCTURELLE (`priceCurrency`), pas déduite. */
    const html = page({ items: variants() }).replace('<span>139,99 €</span>', '<span>139,99</span>');
    const capture = run(html);
    expect(String(capture.currencyText)).toBe('EUR');
    const verdict = validateAyWebsCapturedPage(capture, PAGE_URL, {
      requireCorroboration: false,
      requireProductPage: true,
    });
    expect(verdict.currency).toBe('EUR');
    expect(verdict.currencyVerified).toBe(true);
  });

  it('le serveur ne peut plus prouver un prix pris sur l’autre couleur', () => {
    const capture = run(page({ items: variants() }));
    const groups = (capture.variantGroups as never[]) ?? [];
    const evidence = ayWebsSelectionEvidence(groups, { Taille: '36.5' }, { currency: 'EUR' }).attributes[0];
    expect(evidence.price).toBeCloseTo(139.99, 2);
    const other = ayWebsSelectionEvidence(groups, { Taille: '38' }, { currency: 'EUR' }).attributes[0];
    /* La page nomme la pointure, mais elle ne publie RIEN d'elle : aucun prix
       (celui de l'autre couleur est exclu) et aucun état. */
    expect(other.price).toBeNull();
    expect(other.state).toBe('UNKNOWN');
  });
});
