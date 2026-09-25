/*
 * FICHE PRODUIT « feuille montante » (25/09/2026) — contrat de présentation.
 *
 * Le comportement validé par le client : au repos le produit est ENTIER, puis
 * le panneau d'information monte PAR-DESSUS l'image, qui s'éteint derrière lui.
 * Ces tests gardent les trois pièces qui le rendent possible ; si l'une saute,
 * la fiche redevient une page ordinaire sans que personne ne s'en aperçoive.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const sheetCss = read('client/src/styles/product-sheet.css');
const component = read('client/src/ayrovix/components/ProductResult.tsx');

describe('fiche produit — feuille montante', () => {
  it('la feuille de style est chargée par l’application', () => {
    expect(read('client/src/index.css')).toContain('./styles/product-sheet.css');
  });

  it('le comportement est réservé au mobile — le bureau garde ses deux colonnes', () => {
    expect(sheetCss).toContain('@media (max-width: 767px)');
    expect(sheetCss.split('@media (max-width: 767px)')[1]).toContain('.flow-media');
  });

  it('une seule variable pilote le rendu, écrite par le composant et lue par le CSS', () => {
    expect(component).toContain("style.setProperty('--ay-pdp-reveal'");
    expect(sheetCss).toContain('var(--ay-pdp-reveal, 0)');
  });

  it('le voile est de l’encre pure et ne dépasse jamais 58 % : le produit reste lisible', () => {
    expect(sheetCss).toContain('background: #000');
    expect(sheetCss).toContain('calc(var(--ay-pdp-reveal, 0) * 0.58)');
    expect(component).toContain('ay-pdp-scrim');
  });

  it('les commandes flottantes de la photo s’effacent quand la feuille les recouvre', () => {
    expect(component).toContain('ay-pdp-media-controls');
    expect(sheetCss).toContain('[data-ay-pdp-covered="true"] .ay-pdp-media-controls');
  });

  it('le mouvement est désactivable (accessibilité)', () => {
    expect(sheetCss).toContain('prefers-reduced-motion');
  });

  it('l’échelle de recul est unique en X et en Y — aucune déformation du produit', () => {
    const scales = sheetCss.match(/scale\(calc\(1 - var\(--ay-pdp-reveal, 0\) \* 0\.04\)\)/g);
    expect(scales).toHaveLength(1);
  });
});
