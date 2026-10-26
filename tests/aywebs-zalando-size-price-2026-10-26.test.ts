/**
 * AYWEBs — FEUILLE D'AJOUT ZALANDO : LA TAILLE CHOISIE DOIT ÊTRE PROUVÉE
 * (26/10/2026).
 *
 * ── Le symptôme rapporté ───────────────────────────────────────────────────
 * Dans l'application, la feuille d'ajout d'une fiche Zalando affichait un champ
 * « Taille » dont la valeur était « Taille & coupe », un prix écrit
 * « Prix en dinars calculé à l'ajout. » et, au clic sur « Add to Cart » :
 * « Pas de devis serveur en dinars : ajout impossible sans prix calculé. »
 * (code `PRICE_UNAVAILABLE`). La même fiche, ouverte depuis le web, montrait
 * pourtant les tailles 35,5 / 36 / 36,5 avec leurs prix et leur stock.
 *
 * ── Les trois causes, mesurées sur le script de capture ────────────────────
 *   1. `a` et `button` figuraient parmi les nœuds de valeur : le LIEN « Taille &
 *      coupe » (guide des tailles) et le BOUTON « Ajouter au panier » devenaient
 *      des tailles ;
 *   2. `isIndexValue` écartait tout libellé purement numérique : les pointures
 *      ENTIÈRES (36, 38, 42…) disparaissaient, seules les demi-pointures
 *      survivaient ;
 *   3. le script ne lisait du `ProductGroup` que le PRIX GLOBAL : le prix et
 *      l'état PAR TAILLE (`hasVariant[].offers`) restaient invisibles, donc le
 *      serveur ne pouvait prouver ni le prix ni le stock de la taille choisie
 *      ⇒ `PRICE_UNAVAILABLE`, et aucun devis en dinars.
 *
 * Ce que ce test verrouille : la feuille reçoit les vraies tailles, sans lien ni
 * bouton, et le serveur peut prouver la taille choisie (prix + état), ce qui est
 * exactement la condition d'un devis en dinars et d'un ajout au panier.
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { ayWebsSelectionEvidence } from '../src/aywebs/variantEvidence';

const PAGE_URL = 'https://www.zalando.fr/nike-giannis-freak-8-basket-ni315d0a2-a11.html';

function run(html: string): Record<string, unknown> {
  const dom = new JSDOM(html, { url: PAGE_URL });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  return JSON.parse(String(evaluate(dom.window.document, dom.window.location, PAGE_URL)));
}

interface Group { name: string; values: string[]; selected: string[]; options?: Array<{ value: string; available: boolean | null; price: string | null }> }
function groups(capture: Record<string, unknown>): Group[] {
  return (capture.variantGroups as Group[] | undefined) ?? [];
}

const SIZES: Array<{ size: string; availability: string }> = [
  { size: '35.5', availability: 'InStock' },
  { size: '36', availability: 'InStock' },
  { size: '36.5', availability: 'OutOfStock' },
  { size: '51.5', availability: 'InStock' },
  { size: '52.5', availability: 'LimitedAvailability' },
];

const PRODUCT_GROUP = {
  '@context': 'https://schema.org',
  '@type': 'ProductGroup',
  name: 'GIANNIS FREAK 8 UNISEX - Chaussures de basket - star blue/lightening',
  productGroupID: 'NI315D0A2',
  brand: { '@type': 'Brand', name: 'Nike' },
  image: ['https://cdn.example.test/pair.webp'],
  hasVariant: SIZES.map((entry) => ({
    '@type': 'Product',
    sku: `NI315D0A2-A11-${entry.size}`,
    size: entry.size,
    color: 'star blue',
    offers: {
      '@type': 'Offer',
      price: '129.95',
      priceCurrency: 'EUR',
      availability: `https://schema.org/${entry.availability}`,
    },
  })),
};

/** Fiche Zalando : groupe de tailles en `<label><input>` + lien guide + bouton panier. */
function zalandoPage(options: { withSizeForm?: boolean; withJsonLd?: boolean } = {}): string {
  const { withSizeForm = true, withJsonLd = true } = options;
  const sizeForm = `
  <form class="size-selector">
    <h3>Taille</h3>
    <a href="/guide-des-tailles" class="size-guide">Taille &amp; coupe</a>
    <div class="size-options">
      <label class="size-checkbox"><input type="checkbox" value="35.5"><span>35.5</span></label>
      <label class="size-checkbox"><input type="checkbox" value="36" checked><span>36</span></label>
      <label class="size-checkbox is-disabled"><input type="checkbox" value="36.5" disabled><span>36.5</span></label>
    </div>
    <button type="submit" class="add-to-cart">Ajouter au panier</button>
  </form>`;
  return `<!doctype html><html lang="fr"><head>
    <title>GIANNIS FREAK 8 UNISEX | Zalando</title>
    <link rel="canonical" href="${PAGE_URL}">
    ${withJsonLd ? `<script type="application/ld+json">${JSON.stringify(PRODUCT_GROUP)}</script>` : ''}
  </head><body>
    <h1>GIANNIS FREAK 8 UNISEX - Chaussures de basket</h1>
    <div class="pdp-price"><span>129,95 €</span></div>
    ${withSizeForm ? sizeForm : ''}
    <div class="availability-message">En stock</div>
  </body></html>`;
}

describe('Zalando — la feuille reçoit des TAILLES, pas des liens ni des boutons', () => {
  it('publie la pointure entière 36 et n’accepte ni le guide ni le bouton panier', () => {
    const capture = run(zalandoPage());
    const found = groups(capture);
    const size = found.find((group) => /taille|size/i.test(group.name));
    expect(size).toBeTruthy();
    expect(size!.values).toContain('36');
    expect(size!.values).toContain('35.5');
    expect(size!.values).not.toContain('Taille & coupe');
    expect(size!.values).not.toContain('Ajouter au panier');
  });

  it('la taille cochée sur la page reste la sélection publiée', () => {
    const capture = run(zalandoPage());
    const size = groups(capture).find((group) => /taille|size/i.test(group.name));
    expect(size!.selected).toContain('36');
  });

  it('le prix et l’état de CHAQUE taille viennent du ProductGroup (offres imbriquées)', () => {
    const capture = run(zalandoPage());
    const size = groups(capture).find((group) => /taille|size/i.test(group.name));
    const option = size!.options?.find((entry) => entry.value === '36');
    expect(option).toBeTruthy();
    expect(option!.available).toBe(true);
    expect(String(option!.price)).toContain('129.95');
    // Une taille épuisée est publiée comme telle, jamais comme disponible.
    const soldOut = size!.options?.find((entry) => entry.value === '36.5');
    expect(soldOut).toBeTruthy();
    expect(soldOut!.available).toBe(false);
  });

  it('sans conteneur DOM de tailles, le groupe du ProductGroup est publié quand même', () => {
    const capture = run(zalandoPage({ withSizeForm: false }));
    const size = groups(capture).find((group) => /taille|size/i.test(group.name));
    expect(size).toBeTruthy();
    expect(size!.values).toEqual(expect.arrayContaining(['35.5', '36', '51.5', '52.5']));
    expect(size!.selected).toEqual([]);
  });

  it('sans JSON-LD, un lien guide ne devient jamais une taille', () => {
    const capture = run(zalandoPage({ withJsonLd: false }));
    for (const group of groups(capture)) {
      expect(group.values).not.toContain('Taille & coupe');
      expect(group.values).not.toContain('Ajouter au panier');
    }
  });
});

describe('aller-retour serveur : la taille choisie est prouvable ⇒ devis possible', () => {
  it('« 36 » survit au crible serveur AVEC son prix et son état', () => {
    const payload = run(zalandoPage());
    const verdict = validateAyWebsCapturedPage(payload, PAGE_URL, {
      requireCorroboration: false,
      requireProductPage: true,
    });
    expect(verdict.ok).toBe(true);
    const size = verdict.variantGroups.find((group) => /taille|size/i.test(group.name));
    expect(size).toBeTruthy();
    // Le filtre anti-index du serveur ne doit plus emporter une pointure entière.
    expect(size!.values).toContain('36');
    expect(size!.options?.some((option) => option.value === '36')).toBe(true);
  });

  it('le serveur peut affirmer prix + disponibilité de la combinaison choisie', () => {
    const payload = run(zalandoPage());
    const verdict = validateAyWebsCapturedPage(payload, PAGE_URL, {
      requireCorroboration: false,
      requireProductPage: true,
    });
    const evidence = ayWebsSelectionEvidence(verdict.variantGroups, { taille: '36' }, {
      currency: verdict.currency,
    });
    expect(evidence.complete).toBe(true);
    expect(evidence.blocked).toBe(false);
    expect(evidence.available).toBe(true);
    expect(evidence.price).toBeCloseTo(129.95, 2);
    expect(evidence.priceConflict).toBe(false);
  });

  it('une taille épuisée bloque l’ajout au lieu de promettre un stock', () => {
    const payload = run(zalandoPage());
    const verdict = validateAyWebsCapturedPage(payload, PAGE_URL, {
      requireCorroboration: false,
      requireProductPage: true,
    });
    const evidence = ayWebsSelectionEvidence(verdict.variantGroups, { taille: '36.5' }, {
      currency: verdict.currency,
    });
    expect(evidence.blocked).toBe(true);
  });

  it('une valeur qui n’est pas publiée reste introuvable (aucun prix inventé)', () => {
    const payload = run(zalandoPage());
    const verdict = validateAyWebsCapturedPage(payload, PAGE_URL, {
      requireCorroboration: false,
      requireProductPage: true,
    });
    const evidence = ayWebsSelectionEvidence(verdict.variantGroups, { taille: 'Taille & coupe' }, {
      currency: verdict.currency,
    });
    expect(evidence.complete).toBe(false);
    expect(evidence.price).toBeNull();
  });
});
