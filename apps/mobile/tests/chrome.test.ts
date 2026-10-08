/**
 * Chrome réactif — barre d'onglets qui s'efface en descendant (Q8).
 *
 * Le risque de ce genre d'effet, ce n'est pas qu'il ne marche pas : c'est
 * qu'il scintille. Un seuil mal choisi, et la barre clignote au moindre
 * tremblement du doigt — pénible, et impossible à voir en relisant le code.
 * Ces tests fixent le comportement.
 */
import { describe, expect, it } from 'vitest';
import { CHROME_THRESHOLD, chromeHiddenFor, headerSolidFor } from '../src/design/chromeLogic';

describe('descendre ⇒ masquer', () => {
  it('une vraie course vers le bas masque la barre', () => {
    expect(chromeHiddenFor(200, 100, false)).toBe(true);
  });

  it('masquée, elle le RESTE en continuant à descendre', () => {
    expect(chromeHiddenFor(300, 200, true)).toBe(true);
  });
});

describe('remonter ⇒ révéler', () => {
  it('une vraie course vers le haut la fait revenir', () => {
    expect(chromeHiddenFor(100, 200, true)).toBe(false);
  });

  it('visible, elle le reste en continuant à monter', () => {
    expect(chromeHiddenFor(50, 120, false)).toBe(false);
  });
});

describe('haut de page : toujours visible', () => {
  it('position zéro ⇒ jamais masquée', () => {
    expect(chromeHiddenFor(0, 40, true)).toBe(false);
  });

  it('léger dépassement négatif (rebond iOS) ⇒ visible', () => {
    expect(chromeHiddenFor(-12, 30, true)).toBe(false);
  });

  it('même en pleine course vers le bas, le sommet reste visible', () => {
    // On vient de sauter en haut : la barre ne doit pas disparaître au premier
    // geste, sinon l'écran paraît cassé.
    expect(chromeHiddenFor(0, 900, true)).toBe(false);
  });
});

describe('seuil — pas de scintillement', () => {
  it('sous le seuil, RIEN ne change (visible reste visible)', () => {
    expect(chromeHiddenFor(104, 100, false)).toBe(false);
  });

  it('sous le seuil, RIEN ne change (masquée reste masquée)', () => {
    expect(chromeHiddenFor(104, 100, true)).toBe(true);
  });

  it('exactement au seuil : pas encore (strictement supérieur)', () => {
    expect(chromeHiddenFor(100 + CHROME_THRESHOLD, 100, false)).toBe(false);
  });

  it('un point de plus que le seuil, et ça bouge', () => {
    expect(chromeHiddenFor(100 + CHROME_THRESHOLD + 1, 100, false)).toBe(true);
  });

  it('seuil personnalisé respecté', () => {
    expect(chromeHiddenFor(120, 100, false, 30)).toBe(false);
    expect(chromeHiddenFor(131, 100, false, 30)).toBe(true);
  });
});

describe('en-tête transparent puis solide', () => {
  it('reste transparent au sommet et sous le seuil de défilement', () => {
    expect(headerSolidFor(0)).toBe(false);
    expect(headerSolidFor(CHROME_THRESHOLD)).toBe(false);
    expect(headerSolidFor(CHROME_THRESHOLD - 1)).toBe(false);
  });

  it('devient solide après le seuil, sans toucher à sa géométrie', () => {
    expect(headerSolidFor(CHROME_THRESHOLD + 0.01)).toBe(true);
    expect(headerSolidFor(100)).toBe(true);
  });

  it('mesure invalide ou seuil non valide : retombe sur un état sûr', () => {
    expect(headerSolidFor(Number.NaN)).toBe(false);
    expect(headerSolidFor(Number.POSITIVE_INFINITY)).toBe(false);
    expect(headerSolidFor(-1)).toBe(false);
    expect(headerSolidFor(CHROME_THRESHOLD + 1, Number.NaN)).toBe(true);
  });
});

describe('mesures invraisemblables', () => {
  it('position non finie ⇒ visible (jamais d’écran sans barre)', () => {
    expect(chromeHiddenFor(Number.NaN, 100, true)).toBe(false);
    expect(chromeHiddenFor(Number.POSITIVE_INFINITY, 100, true)).toBe(false);
  });

  it('référence précédente absente ⇒ on juge la position, sans planter', () => {
    expect(chromeHiddenFor(500, Number.NaN, false)).toBe(true);
    expect(chromeHiddenFor(2, Number.NaN, false)).toBe(false);
  });
});
