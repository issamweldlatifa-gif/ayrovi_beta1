/**
 * AYWEBs — extraction des pickers de taille/variante des boutiques catalogue
 * (Zalando, 25/10/2026).
 *
 * Le client constatait une feuille d'ajout SANS aucune taille. Deux structures de
 * page réelles étaient en cause :
 *   • boutons role=radio dans un radiogroup (déjà couvert) ;
 *   • <label class="size-checkbox"><input type="checkbox"><span>S</span></label>
 *     dans un <form class="size-selector"> : l'état vit sur l'input ENFANT, pas
 *     sur le label, et aucun aria-checked n'est publié.
 *
 * On verrouille :
 *   1. les deux structures produisent un groupe nommé, ses valeurs, et la valeur
 *      cochée (input enfant suivi) ;
 *   2. SANS aucune sélection, le groupe est quand même publié (la feuille doit
 *      proposer les tailles), mais `selected` reste vide : aucune combinaison
 *      n'est affirmée à tort ;
 *   3. un libellé technique de classe (« size selector ») cède la place au titre
 *      humain publié dans le conteneur (« Taille »).
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';

const PAGE_URL = 'https://www.zalando.fr/tee-shirt-basic-CHP21O01B-M11.html';

function run(html: string): Record<string, unknown> {
  const dom = new JSDOM(html, { url: PAGE_URL });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  return JSON.parse(String(evaluate(dom.window.document, dom.window.location, PAGE_URL)));
}

type Group = { name: string; values: string[]; selected: string[] };
function groups(capture: Record<string, unknown>): Group[] {
  return (capture.variantGroups as Group[] | undefined) ?? [];
}

const RADIO_PAGE = `<!doctype html><html lang="fr"><body>
  <div data-testid="size-selector-form" role="radiogroup" aria-label="Taille">
    <button type="button" role="radio" aria-checked="false" data-testid="size-selector-size-S">S</button>
    <button type="button" role="radio" aria-checked="true" data-testid="size-selector-size-M">M</button>
    <button type="button" role="radio" aria-checked="false" data-testid="size-selector-size-L">L</button>
  </div>
  <div data-testid="product-price">27,95 €</div>
</body></html>`;

const CHECKBOX_PAGE = `<!doctype html><html lang="fr"><body>
  <form class="size-selector"><h3>Taille</h3>
    <label class="size-checkbox"><input type="checkbox"><span>S</span></label>
    <label class="size-checkbox"><input type="checkbox" checked><span>M</span></label>
    <label class="size-checkbox"><input type="checkbox"><span>L</span></label>
  </form>
  <div class="z-3-zqtg" data-testid="product-price"><span>27,95 €</span></div>
</body></html>`;

const CHECKBOX_NO_SELECTION_PAGE = `<!doctype html><html lang="fr"><body>
  <form class="size-selector"><h3>Taille</h3>
    <label class="size-checkbox"><input type="checkbox"><span>S</span></label>
    <label class="size-checkbox"><input type="checkbox"><span>M</span></label>
    <label class="size-checkbox"><input type="checkbox"><span>L</span></label>
  </form>
  <div data-testid="product-price">27,95 €</div>
</body></html>`;

describe('lecture des pickers de taille Zalando', () => {
  it('boutons radio : groupe Taille [S, M, L], M sélectionnée', () => {
    const found = groups(run(RADIO_PAGE));
    expect(found).toEqual([
      expect.objectContaining({ name: 'Taille', values: ['S', 'M', 'L'], selected: ['M'] }),
    ]);
  });

  it('checkbox dans un label : le input enfant coché fonde la sélection, le titre donne le nom', () => {
    const capture = run(CHECKBOX_PAGE);
    const found = groups(capture);
    expect(found).toEqual([
      expect.objectContaining({ name: 'Taille', values: ['S', 'M', 'L'], selected: ['M'] }),
    ]);
    /* Le texte de la valeur affichée alimente l'évidence de sélection (vue sur la page). */
    expect((capture.selectedVariantTexts as string[])).toContain('M');
  });

  it('aucune sélection : le groupe reste publié mais selected est vide (pas de combinaison inventée)', () => {
    const capture = run(CHECKBOX_NO_SELECTION_PAGE);
    const found = groups(capture);
    expect(found).toEqual([
      expect.objectContaining({ name: 'Taille', values: ['S', 'M', 'L'], selected: [] }),
    ]);
    /* Honnêteté : sans choix repéré, aucun texte de sélection n'est prétendu. */
    expect((capture.selectedVariantTexts as string[])).toEqual([]);
  });

  it('un conteneur nommé par sa classe seule garde un nom exploitable, pas un nom vide', () => {
    /* Des tailles purement numériques seraient écartées par le garde-fou anti-index
       (isIndexValue) : on utilise donc des codes lettre, qui sont de vrais choix. */
    const page = `<!doctype html><html><body>
      <div class="size-selector">
        <button type="button">XS</button><button type="button">S</button><button type="button">M</button>
      </div></body></html>`;
    const found = groups(run(page));
    expect(found).toHaveLength(1);
    expect(found[0]!.values).toEqual(['XS', 'S', 'M']);
    expect(found[0]!.name).toBeTruthy();
  });
});

describe('aller-retour serveur : les choix publiés survivent, la prépreuve non', () => {
  it('groupe sans sélection conservé par le serveur, aucun texte de sélection inventé', () => {
    const page = `<!doctype html><html lang="fr"><head><title>Tee Zalando</title>
      <script type="application/ld+json">{"@type":"Product","name":"Tee","offers":{"@type":"Offer","price":"27.95","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}</script>
      </head><body><h1>Tee</h1>
      <form class="size-selector"><h3>Taille</h3>
        <label class="size-checkbox"><input type="checkbox"><span>S</span></label>
        <label class="size-checkbox"><input type="checkbox"><span>M</span></label>
        <label class="size-checkbox"><input type="checkbox"><span>L</span></label>
      </form>
      <div data-testid="product-price">27,95 €</div>
      </body></html>`;
    const payload = run(page);
    const verdict = validateAyWebsCapturedPage(payload, PAGE_URL, {
      requireCorroboration: true,
      requireProductPage: true,
    });

    /* La fiche est valide (prix corroboré par JSON-LD) et le groupe de tailles
       parvient au client même si aucune valeur n'est cochée sur la page. */
    expect(verdict.ok).toBe(true);
    expect(verdict.variantGroups).toEqual([
      expect.objectContaining({ name: 'Taille', values: ['S', 'M', 'L'], selected: [] }),
    ]);
    /* Aucune combinaison courante n'est affirmée : l'évidence de sélection reste vide. */
    expect(verdict.selectedVariantTexts).toEqual([]);
  });
});
