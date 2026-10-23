/**
 * AYWEBs — lecture PROFONDE des options (23/10/2026).
 *
 * Constat du client, capture d'écran à l'appui : la feuille de choix ne montrait
 * que la surface de la page, et il fallait réinjecter le lecteur à chaque
 * changement de couleur. Or la page publie, sur CHAQUE valeur, son état (valeur
 * désactivée = indisponible) et souvent son prix.
 *
 * Ces tests exécutent le vrai script sur des pages de boutique (pas Amazon) et
 * vérifient la chaîne entière :
 *   1. groupes nommés : <select>, <fieldset>, pastilles (« chips ») ;
 *   2. état par valeur : `disabled` / `aria-disabled` ⇒ `available:false` ;
 *   3. prix par valeur quand la page l'écrit ;
 *   4. le serveur CONSERVE ces états (nettoyage borné) — sinon la feuille
 *      recevrait les libellés sans les faits ;
 *   5. un bouton « Ajouter » activé est un fait du marchand : il prouve la
 *      disponibilité de la page (vocabulaire fermé), pas l'inverse.
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { AYWEBS_CAPTURE_VERSION } from '../shared/aywebsCapture';

const SHOP_URL = 'https://www.zalando.fr/rituals-face-cleansing-foam-150-ml.html';

function run(html: string, url = SHOP_URL): Record<string, unknown> {
  const dom = new JSDOM(html, { url });
  const evaluate = new Function('document', 'location', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  return JSON.parse(evaluate(dom.window.document, dom.window.location) as string) as Record<string, unknown>;
}

function shop(body: string): string {
  return `<!doctype html><html lang="fr"><head><title>Rituals — mousse nettoyante 150 ml</title>
    <meta property="product:price:amount" content="12.95">
    <meta property="product:price:currency" content="EUR">
    </head><body><main>${body}</main></body></html>`;
}

interface Option { value: string; available?: boolean | null; price?: string | null; priceFrom?: boolean }
interface Group { name: string; values: string[]; selected?: string[]; options?: Option[] }

const groupsOf = (capture: Record<string, unknown>): Group[] => (capture.variantGroups as Group[]) || [];
const groupNamed = (capture: Record<string, unknown>, name: string): Group | undefined =>
  groupsOf(capture).find((group) => group.name.toLowerCase() === name.toLowerCase());

describe('script — groupes nommés et état par valeur', () => {
  it('<select> : chaque option publiée, la désactivée marquée indisponible', () => {
    const capture = run(shop(`
      <label for="size">Taille</label>
      <select id="size" name="size">
        <option value="150">150 ml</option>
        <option value="250" disabled>250 ml</option>
      </select>
      <button>Ajouter au panier</button>`));
    const group = groupNamed(capture, 'Taille');
    expect(group).toBeTruthy();
    expect(group!.values).toEqual(['150 ml', '250 ml']);
    expect(group!.selected).toEqual(['150 ml']);
    expect(group!.options?.find((option) => option.value === '250 ml')?.available).toBe(false);
    expect(group!.options?.find((option) => option.value === '150 ml')?.available ?? null).toBeNull();
  });

  it('<fieldset> : une valeur désactivée reste dans les valeurs, avec son état', () => {
    const capture = run(shop(`
      <fieldset>
        <legend>Couleur</legend>
        <input type="radio" id="c1" name="color" value="Noir" checked>
        <label for="c1">Noir</label>
        <input type="radio" id="c2" name="color" value="Rouge" disabled>
        <label for="c2">Rouge</label>
      </fieldset>
      <button>Ajouter au panier</button>`));
    const group = groupNamed(capture, 'Couleur');
    expect(group).toBeTruthy();
    expect(group!.values).toEqual(['Noir', 'Rouge']);
    expect(group!.selected).toEqual(['Noir']);
    expect(group!.options?.find((option) => option.value === 'Rouge')?.available).toBe(false);
    expect(group!.options?.find((option) => option.value === 'Noir')?.available ?? null).toBeNull();
  });

  it('pastilles (chips) : groupe nommé par aria-label, état et prix par valeur', () => {
    const capture = run(shop(`
      <div role="radiogroup" aria-label="Taille">
        <button role="radio" aria-checked="true">150 ml <span class="price">12,95 €</span></button>
        <button role="radio" aria-checked="false" aria-disabled="true">250 ml <span class="price">19,95 €</span></button>
      </div>
      <button>Ajouter au panier</button>`));
    const group = groupNamed(capture, 'Taille');
    expect(group).toBeTruthy();
    /* Le prix est publié À PART : il n'est pas répété dans le libellé. */
    expect(group!.values).toEqual(['150 ml', '250 ml']);
    const disabled = group!.options?.find((option) => option.value === '250 ml');
    expect(disabled?.available).toBe(false);
    expect(disabled?.price).toBe('19,95 €');
  });

  it('le serveur CONSERVE les états par valeur (nettoyage borné)', () => {
    const capture = run(shop(`
      <div role="radiogroup" aria-label="Taille">
        <button role="radio" aria-checked="true">150 ml</button>
        <button role="radio" aria-checked="false" aria-disabled="true">250 ml</button>
      </div>
      <button>Ajouter au panier</button>`));
    const validation = validateAyWebsCapturedPage(
      { ...capture, v: AYWEBS_CAPTURE_VERSION, capturedAt: new Date().toISOString() } as never,
      SHOP_URL,
    );
    expect(validation.ok, JSON.stringify(validation.notes)).toBe(true);
    const group = validation.variantGroups.find((entry) => entry.name.toLowerCase() === 'taille');
    expect(group).toBeTruthy();
    expect(group!.options?.find((option) => option.value === '250 ml')).toMatchObject({ available: false });
  });

  it('un bouton d’achat ACTIVÉ prouve la disponibilité de la page (fait du marchand)', () => {
    const capture = run(shop(`
      <p>Mousse nettoyante douce, 150 ml.</p>
      <button>Ajouter au panier</button>`));
    const validation = validateAyWebsCapturedPage(
      { ...capture, v: AYWEBS_CAPTURE_VERSION, capturedAt: new Date().toISOString() } as never,
      SHOP_URL,
    );
    expect(validation.ok, JSON.stringify(validation.notes)).toBe(true);
    expect(validation.availability).toBe('AVAILABLE');
  });

  it('« Ajouter à ma liste d’envies » n’est PAS un contrôle d’achat', () => {
    const capture = run(shop(`
      <p>Mousse nettoyante douce, 150 ml.</p>
      <button>Ajouter à ma liste d’envies</button>`));
    expect(capture.addToCartText ?? null).toBeNull();
  });
});
