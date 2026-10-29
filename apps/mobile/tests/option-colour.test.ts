/**
 * Pastilles de variante — la traduction d'un nom de couleur publié par le
 * marchand en une teinte lisible (27/10/2026).
 *
 * Ce que ces tests protègent : une pastille n'invente jamais une couleur. Si le
 * nom n'est pas une couleur (« Default », « One Size »), la fonction répond
 * `null` et l'écran affiche une pastille neutre — pas un bleu au hasard.
 */
import { describe, expect, it } from 'vitest';
import { colourForOption, needsOutline, normalizeColourName } from '../src/features/aywebs/optionColour';

describe('pastille de couleur d’une variante', () => {
  it('reconnaît les noms simples, avec ou sans casse et accent', () => {
    expect(colourForOption('Black')).toBe('#0A0A0A');
    expect(colourForOption('white')).toBe('#FFFFFF');
    expect(colourForOption('Noir')).toBe('#0A0A0A');
    expect(normalizeColourName('Light Grey')).toBe('lightgrey');
  });

  it('compose les noms en deux mots, et retombe sur le mot couleur', () => {
    // Nom entier connu
    expect(colourForOption('Royal Blue')).toBe('#2A4FD7');
    // Nom entier connu (« Bud Green » est une teinte du marchand)
    expect(colourForOption('Bud Green')).toBe('#7FBF6A');
    // « Drak » = faute de frappe du marchand pour « Dark » : connue, donc précise.
    expect(colourForOption('Drak Khaki')).toBe('#8C8446');
  });

  it('ne devine rien pour une valeur qui n’est pas une couleur', () => {
    expect(colourForOption('Default')).toBeNull();
    expect(colourForOption('One Size')).toBeNull();
    expect(colourForOption('')).toBeNull();
  });

  it('ajoute un liseré aux pastilles trop claires pour le fond blanc', () => {
    expect(needsOutline('White')).toBe(true);
    expect(needsOutline('Black')).toBe(false);
    expect(needsOutline('Default')).toBe(true);
  });

  it('reconnaît les teintes denim françaises et les couleurs arabes courantes (SHEIN / AliExpress)', () => {
    expect(colourForOption('Jean clair')).toBe('#8FB8DE');
    expect(colourForOption('Bleu jean')).toBe('#4B749F');
    expect(colourForOption('Bleu marine')).toBe('#1B2440');
    expect(colourForOption('أسود')).toBe('#0A0A0A');
    expect(colourForOption('أبيض')).toBe('#FFFFFF');
    expect(colourForOption('كحلي')).toBe('#1B2440');
    expect(needsOutline('أبيض')).toBe(true);
    expect(needsOutline('أسود')).toBe(false);
  });
});
