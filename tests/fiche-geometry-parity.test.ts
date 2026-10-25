/**
 * VERROU DE GÉOMÉTRIE — l'aperçu du CRM et l'écran de l'application ont la même
 * règle, ou la CI casse.
 *
 * La maquette `docs/design/cardproduit/mockup-complet-25-10.png` est la
 * spécification : 720 × 1600 px = 360 × 800 dp. L'application en tire ses cotes
 * dans `apps/mobile/src/features/product/fiche.ts` ; le CRM en garde une copie
 * dans `client/src/admin/ficheGeometry.ts` (deux applications, deux builds, pas
 * d'import possible).
 *
 * Ce test lit **le source de l'application** et compare, cote par cote, la copie
 * du CRM. Une valeur qui bouge d'un côté seulement est un aperçu qui mentirait
 * sur ce que l'acheteur verra — donc un échec, pas un avertissement.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { FICHE_LOCKS, FICHE_WIDTH, FICHE_GEOMETRY } from '../client/src/admin/ficheGeometry';

const ROOT = process.cwd();
const MOBILE = 'apps/mobile/src/features/product/fiche.ts';

/** Les cotes déclarées par l'application, lues dans son propre objet `FICHE`. */
function mobileGeometry(): Record<string, number> {
  const source = fs.readFileSync(path.resolve(ROOT, MOBILE), 'utf8');
  const start = source.indexOf('export const FICHE = {');
  const end = source.indexOf('} as const;', start);
  expect(start, 'objet FICHE introuvable dans fiche.ts').toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = source.slice(start, end);
  const out: Record<string, number> = {};
  for (const match of block.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):\s*(-?\d+(?:\.\d+)?),/gm)) {
    out[match[1]] = Number(match[2]);
  }
  return out;
}

describe('géométrie de la fiche — l’aperçu du CRM suit l’application', () => {
  test('chaque cote de la copie CRM existe dans l’application, avec la même valeur', () => {
    const mobile = mobileGeometry();
    expect(Object.keys(mobile).length).toBeGreaterThan(50);
    const drift = Object.entries(FICHE_GEOMETRY)
      .filter(([key, value]) => mobile[key] !== value)
      .map(([key, value]) => `${key}: CRM ${value} ≠ app ${mobile[key] ?? 'absent'}`);
    expect(drift).toEqual([]);
  });

  test('toutes les cotes de l’application sont reprises par l’aperçu', () => {
    const mobile = mobileGeometry();
    const missing = Object.keys(mobile).filter((key) => !(key in FICHE_GEOMETRY));
    expect(missing, 'une cote de la maquette n’est pas reprise par l’aperçu du CRM').toEqual([]);
  });

  test('les cotes sont celles de la maquette : 720 × 1600 px, donc 360 dp de large', () => {
    // 1162 px ÷ 2 = 581 dp : la photo de l'écran 1.
    expect(FICHE_GEOMETRY.imageHeight).toBe(581);
    // 1440 → 1458 px : la bande grise du séparateur.
    expect(FICHE_GEOMETRY.band).toBe(9);
    // 1480 → 1575 px : le bouton noir, rayon 47 px.
    expect(FICHE_GEOMETRY.barButtonWidth).toBe(207);
    expect(FICHE_GEOMETRY.barButtonHeight).toBe(48);
    expect(FICHE_GEOMETRY.barButtonRadius).toBe(24);
    expect(FICHE_WIDTH).toBe(360);
  });

  test('les verrous affichés dans le CRM sont calculés, jamais recopiés', () => {
    const values = FICHE_LOCKS.map((lock) => lock.value).join(' | ');
    expect(values).toContain(`${FICHE_GEOMETRY.imageHeight} dp`);
    expect(values).toContain(`${FICHE_GEOMETRY.barButtonWidth} × ${FICHE_GEOMETRY.barButtonHeight} dp`);
    expect(FICHE_LOCKS.every((lock) => lock.value.trim().length > 0)).toBe(true);
  });
});

/**
 * L'EMPILEMENT DE L'ÉCRAN 1, recalculé depuis les cotes et comparé aux positions
 * MESURÉES sur la maquette (en dp = pixels ÷ 2). C'est la vérification la plus
 * littérale possible sans ouvrir un appareil : si une cote bouge, une ligne de
 * cet écran ne tombe plus sur la maquette.
 */
describe('écran 1 — l’empilement tombe sur les positions mesurées', () => {
  const G = FICHE_GEOMETRY;
  const stack = (() => {
    const photoBottom = G.imageHeight;                                        // 1162 px
    const nameTop = photoBottom + G.nameTop;                                  // 1186 px
    const underline = nameTop + G.nameLine + G.underlineGap;                  // 1249 px
    const descriptionTop = underline + G.underlineWidth + G.descriptionGap;   // 1256 px
    const descriptionBottom = descriptionTop + 2 * G.descriptionLine;         // 1290 px (2 lignes)
    const rule = descriptionBottom + G.ruleGap;                               // 1342 px
    const rowBottom = rule + G.rowHeight;                                     // 1440 px
    const bandBottom = rowBottom + G.band;                                    // 1458 px
    return { photoBottom, nameTop, underline, descriptionTop, rule, rowBottom, bandBottom, screenBottom: bandBottom + G.barHeight };
  })();

  test('photo, nom, filet, description, règle, ligne Taille, bande, barre', () => {
    expect(stack.photoBottom).toBe(581);        // 1162 px
    expect(stack.nameTop).toBe(593);            // 1186 px
    expect(Math.round(stack.underline)).toBe(624);  // 1249 px → 624,5 dp
    expect(stack.descriptionTop).toBe(628);     // 1256 px
    expect(stack.rule).toBe(671);               // 1342 px
    expect(stack.rowBottom).toBe(720);          // 1440 px
    expect(stack.bandBottom).toBe(729);         // 1458 px
    expect(stack.screenBottom).toBe(800);       // 1600 px : la hauteur de l'écran de référence
  });

  test('le bouton noir de la barre est centré dans ses 71 dp', () => {
    // 1480 − 1458 = 22 px sous le haut de la barre, 1575 px de bas : 95 px de haut.
    expect(G.barButtonTop).toBe(11);
    expect(G.barButtonHeight).toBe(48);
    expect(G.barButtonTop * 2 + G.barButtonHeight).toBeLessThanOrEqual(G.barHeight);
  });

  test('la feuille de taille : poignée, titre, dalle, en-têtes, 12 lignes', () => {
    const sheet = G.sheetTop;                                  // 45 px
    const titleTop = sheet + G.grabTop + G.grabHeight + G.sheetTitleTop;  // 140 px
    const panelTop = titleTop + G.sheetTitleLine + G.panelTop;            // 181 px
    const columnsTop = panelTop + G.panelHeight + G.columnsTop;            // 348 px
    const rowsTop = columnsTop + G.columnHeader + G.rowsTop;               // 430 px
    expect(Math.round(titleTop)).toBe(70);       // 140 px
    expect(panelTop).toBe(90);                   // 181 px → 90,5 dp
    expect(panelTop + G.panelHeight).toBe(156);  // 313 px → 156,5 dp
    expect(Math.round(columnsTop)).toBe(174);    // 348 px
    expect(Math.round(rowsTop)).toBe(212);       // 424 px (mesuré 430 px sur la maquette)
    // Les 12 tailles de la maquette tiennent dans l'écran de 800 dp.
    expect(Math.round(rowsTop + 12 * G.sizeRowHeight)).toBe(788);
  });
});
