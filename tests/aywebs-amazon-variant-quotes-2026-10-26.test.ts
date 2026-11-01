/**
 * AYWEBs — AMAZON : LE DEVIS PAR TAILLE / COULEUR DOIT EXISTER (26/10/2026).
 *
 * ── Le symptôme rapporté ──────────────────────────────────────────────────
 * Dans l'application, sur Amazon : la fiche s'ouvre avec son prix en dinars,
 * mais dès qu'on choisit une AUTRE couleur ou une AUTRE taille dans la feuille,
 * le prix retombe sur « Prix en dinars calculé à l'ajout. » — la feuille ne
 * connaît aucun montant pour la valeur choisie.
 *
 * ── La cause ──────────────────────────────────────────────────────────────
 * Le bloc « groupes de variantes » du lecteur est sauté sur Amazon (le DOM y est
 * plein de prix de publicité, à juste titre). La capture publiait donc les
 * valeurs dans `amazon.options` / `amazon.variants` — mais JAMAIS dans
 * `variantGroups`. Or le serveur ne calcule un devis PAR VALEUR
 * (`variant_quotes`, `src/aywebs/variantQuotes.ts`) qu'à partir de ces groupes :
 * sans eux, seule la combinaison affichée par la page avait un prix en dinars.
 *
 * ── Ce que ce fichier verrouille ─────────────────────────────────────────
 *   1. la capture publie des groupes size / color avec, POUR CHAQUE valeur, le
 *      prix de la carte et l'état publiés par la page ;
 *   2. « indisponible » gagne, deux prix différents ne publient aucun prix ;
 *   3. le serveur peut prouver une valeur AUTRE que celle affichée (prix +
 *      état) — c'est la condition du devis en dinars et de l'ajout ;
 *   4. sans prix sur les cartes, la valeur reste listée sans prix : rien n'est
 *      inventé (le prix de la page ne vaut que pour la combinaison affichée).
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { buildAyWebsCaptureScript } from '../src/aywebs/captureScript';
const AYWEBS_CAPTURE_SCRIPT = buildAyWebsCaptureScript('amazon');
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { ayWebsSelectionEvidence } from '../src/aywebs/variantEvidence';
import { ayWebsVariantQuotes } from '../src/aywebs/variantQuotes';
import { calculatePrice, DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';

const RULES: PricingRules = {
  id: 'default', version: 3,
  rateEUR: 4, rateUSD: 4, rateGBP: 4.8, rateJPY: 0.0265,
  exchangeBufferPercent: 3, freightPerKgTND: 13, localDeliveryTND: 8,
  commissionPercent: 10, minimumCommissionTND: 0, rpdPercent: 3, rpdMinimumTND: 10,
  defaultTvaRate: 0.19, expressFeeTND: 15,
  categories: DEFAULT_CUSTOMS_CATEGORIES,
  updatedAt: new Date().toISOString(),
};

const PAGE_URL = 'https://www.amazon.fr/dp/B0GYM3V9H5';

function run(html: string): Record<string, unknown> {
  const dom = new JSDOM(html, { url: PAGE_URL });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  return JSON.parse(String(evaluate(dom.window.document, dom.window.location, PAGE_URL)));
}

interface Group { name: string; values: string[]; selected: string[]; options?: Array<{ value: string; available: boolean | null; price: string | null }> }
function groups(capture: Record<string, unknown>): Group[] {
  return (capture.variantGroups as Group[] | undefined) ?? [];
}

const TWISTER_DATA = {
  variationDisplayLabels: { size_name: 'Size', color_name: 'Color' },
  dimensionValuesDisplayData: {
    B0GYM3V9H5: ['Small', 'Emerald Leaf'],
    B0GYM7GTF3: ['Medium', 'Emerald Leaf'],
    B0GKCNZ3W5: ['X-Small', 'Camel'],
    B0GKBLB2HR: ['X-Large', 'Camel'],
  },
  variationValues: {},
};

/** Carte de choix telle qu'Amazon la rend : ASIN, libellé, prix, état. */
function card(input: { asin: string; label: string; price?: string; selected?: boolean; soldOut?: boolean }): string {
  return `
    <li id="size_name_${input.label.replace(/\W+/g, '_')}" data-asin="${input.asin}"
        title="${input.label}" aria-label="${input.label}"
        class="swatchElement ${input.selected ? 'selected' : ''} ${input.soldOut ? 'unavailable' : ''}">
      <span class="a-button-text">${input.label}</span>
      ${input.price ? `<span class="a-price"><span class="a-offscreen">${input.price}</span></span>` : ''}
      ${input.soldOut
        ? '<span class="swatchUnavailable">Sold out</span>'
        : '<span class="swatchAvailable">In Stock</span>'}
    </li>`;
}

function amazonPage(input: { cards?: boolean; withPrices?: boolean } = {}): string {
  const { cards = true, withPrices = true } = input;
  return `<!doctype html><html lang="en">
  <head><title>Amazon.fr: Robe</title></head>
  <body>
    <div id="dp-container">
      <h1 id="productTitle">Vince Camuto Robe plissée</h1>
      <div id="corePriceDisplay_desktop_feature_div">
        <span id="apex-pricetopay-accessibility-label" class="aok-offscreen"> $109.00 </span>
        <span class="a-price"><span class="a-offscreen"></span>
          <span aria-hidden="true"><span class="a-price-symbol">$</span><span class="a-price-whole">109</span><span class="a-price-fraction">00</span></span>
        </span>
      </div>
      <div id="availability"><span class="a-color-success">In Stock</span></div>
      <div id="twister">
        <div id="inline-twister-row-size_name">
          <ul>
            ${cards ? card({ asin: 'B0GKCNZ3W5', label: 'X-Small', price: withPrices ? '$99.00' : undefined, soldOut: true }) : ''}
            ${cards ? card({ asin: 'B0GYM3V9H5', label: 'Small', price: withPrices ? '$109.00' : undefined, selected: true }) : ''}
            ${cards ? card({ asin: 'B0GYM7GTF3', label: 'Medium', price: withPrices ? '$119.00' : undefined }) : ''}
          </ul>
        </div>
        <div id="inline-twister-row-color_name">
          <ul>
            ${cards ? card({ asin: 'B0GYM3V9H5', label: 'Emerald Leaf', price: '$109.00', selected: true }) : ''}
            ${cards ? card({ asin: 'B0GKBLB2HR', label: 'Camel', price: '$109.00' }) : ''}
          </ul>
        </div>
      </div>
      <script type="text/javascript">
        var dataToReturn = ${JSON.stringify(TWISTER_DATA)};
      </script>
    </div>
  </body></html>`;
}

describe('Amazon — la capture publie un fait PAR VALEUR (pas seulement pour la combinaison affichée)', () => {
  it('les groupes size / color existent, avec le prix de chaque carte', () => {
    const capture = run(amazonPage());
    const size = groups(capture).find((group) => group.name === 'size');
    expect(size).toBeTruthy();
    expect(size!.values).toEqual(expect.arrayContaining(['Small', 'Medium', 'X-Small']));
    const medium = size!.options?.find((option) => option.value === 'Medium');
    expect(medium).toBeTruthy();
    expect(String(medium!.price)).toContain('119');
    expect(medium!.available).toBe(true);
    /* La valeur AFFICHÉE est publiée comme telle. */
    expect(size!.selected).toContain('Small');
  });

  it('« indisponible » gagne, et aucune valeur n’hérite du prix de la page', () => {
    const capture = run(amazonPage());
    const size = groups(capture).find((group) => group.name === 'size');
    const xsmall = size!.options?.find((option) => option.value === 'X-Small');
    expect(xsmall!.available).toBe(false);
    for (const option of size!.options ?? []) {
      /* Chaque prix vient de SA carte : aucun ne vaut 109 par contagion. */
      if (option.value === 'Small') expect(String(option.price)).toContain('109');
      if (option.value === 'Medium') expect(String(option.price)).toContain('119');
    }
  });

  it('sans prix sur les cartes, la valeur reste listée SANS prix inventé', () => {
    const capture = run(amazonPage({ withPrices: false }));
    const size = groups(capture).find((group) => group.name === 'size');
    expect(size).toBeTruthy();
    expect(size!.values).toContain('Medium');
    const medium = size!.options?.find((option) => option.value === 'Medium');
    /* Une carte sans prix ne prouve pas de prix : soit pas de ligne, soit null. */
    expect(medium?.price ?? null).toBeNull();
    expect(JSON.stringify(capture)).not.toContain('109.00 USD');
  });

  it('le serveur prouve une valeur AUTRE que celle affichée (prix + état)', () => {
    const payload = run(amazonPage());
    const verdict = validateAyWebsCapturedPage(payload, PAGE_URL, {
      requireCorroboration: false,
      requireProductPage: true,
    });
    expect(verdict.ok).toBe(true);
    const medium = ayWebsSelectionEvidence(verdict.variantGroups as never, { size: 'Medium' }, {
      currency: verdict.currency,
    }).attributes[0];
    expect(medium.price).toBeCloseTo(119, 2);
    expect(medium.state).toBe('AVAILABLE');
    /* Et la valeur épuisée bloque au lieu de promettre un stock. */
    const xsmall = ayWebsSelectionEvidence(verdict.variantGroups as never, { size: 'X-Small' }, {
      currency: verdict.currency,
    }).attributes[0];
    expect(xsmall.state).toBe('OUT_OF_STOCK');
  });

  it('le groupe garde son nom publié (size / color), pas un libellé de gabarit', () => {
    const capture = run(amazonPage());
    const names = groups(capture).map((group) => group.name);
    expect(names).toEqual(expect.arrayContaining(['size', 'color']));
    expect(names).not.toContain('option 1');
  });

  it('le serveur PUBLIE un devis en dinars pour une taille non affichée (la feuille l’affiche)', () => {
    /* C'est exactement ce qui manquait : changer de taille dans la feuille
       affichait « Prix en dinars calculé à l'ajout. » faute de ligne de devis. */
    const payload = run(amazonPage());
    const verdict = validateAyWebsCapturedPage(payload, PAGE_URL, {
      requireCorroboration: false,
      requireProductPage: true,
    });
    const quotes = ayWebsVariantQuotes({
      groups: verdict.variantGroups,
      rules: RULES,
      product: { title: 'Vince Camuto Robe plissée', price: verdict.price, currency: verdict.currency },
      quoteVerified: verdict.priceVerified && verdict.currencyVerified,
    });
    const medium = quotes.find((entry) => entry.value === 'Medium' && /size/i.test(entry.group));
    expect(medium).toBeTruthy();
    expect(medium!.source_price).toBeCloseTo(119, 2);
    expect(medium!.total_tnd).toBeGreaterThan(0);
    /* Le montant est bien celui du moteur tarifaire, jamais une règle de trois. */
    expect(medium!.total_tnd).toBeCloseTo(calculatePrice(RULES, 119, 'USD', { title: 'Vince Camuto Robe plissée' })!.totalTND, 2);
    /* La valeur épuisée n'obtient AUCUN devis utilisable. */
    const xsmall = quotes.find((entry) => entry.value === 'X-Small' && /size/i.test(entry.group));
    expect(xsmall?.availability).toBe('OUT_OF_STOCK');
  });
});
