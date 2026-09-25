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

/*
 * PARITÉ D'IMAGE entre la petite carte et la grande fiche (25/09/2026).
 * Le client a vu le défaut avant nous : la carte affichait le produit détouré
 * sur notre fond studio, la fiche affichait encore l'image marchand isolée.
 * Une seule chaîne sert désormais les deux surfaces.
 */
describe('image produit — une seule chaîne pour la carte et la fiche', () => {
  const service = read('client/src/ayrovix/services/mediaIsolation.ts');

  it('la chaîne va de la composition à l’image brute, dans cet ordre', () => {
    const body = service.split('export function productMediaChain')[1].split('}')[0];
    expect(body.indexOf('composedMediaUrl')).toBeLessThan(body.indexOf('isolatedMediaUrl'));
    expect(body).toContain('url');
  });

  it('la fiche consomme la composition, plus l’isolation seule', () => {
    expect(component).toContain('productMediaSrc');
    expect(component).not.toContain('isolatedSrc(');
  });

  it('un échec recule d’un cran au lieu de laisser un trou', () => {
    expect(component).toContain('hasMediaFallback');
    expect(component).toContain('stepDownMedia');
  });
});

/*
 * Forme téléphone : actions posées sur la photo, achat toujours atteignable.
 */
describe('fiche produit — format téléphone', () => {
  it('interroge le navigateur au lieu de dupliquer le balisage', () => {
    expect(component).toContain("window.matchMedia('(max-width: 767px)')");
    expect(component).toContain('useCompactLayout');
  });

  it('le panier quitte l’en-tête pour se poser sur la photo', () => {
    expect(component).toContain('onOpenCart && !compact');
    expect(component).toContain('ay-pdp-rail__action');
    expect(sheetCss).toContain('.ay-pdp-rail__action');
  });

  it('la barre d’achat est fixe et rend son espace au contenu', () => {
    expect(sheetCss).toContain('.ay-pdp-buybar');
    expect(sheetCss).toContain('position: fixed');
    expect(sheetCss).toContain('[data-ay-compact]');
    expect(sheetCss).toContain('padding-bottom: 96px');
  });
});
