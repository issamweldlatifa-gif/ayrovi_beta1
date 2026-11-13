import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

/*
 * Rail du back-office (13/11) : un libellé long (« Tableau de bord relationnel »,
 * « Fiches clients & partenaires ») passe sur deux lignes. Avec une hauteur FIXE de
 * 32 px, la seconde ligne débordait et recouvrait l'entrée suivante (constaté au
 * navigateur sur ?section=crm-parties). La hauteur doit être minimale, pas fixe.
 */
describe('rail du back-office — libellés sur deux lignes', () => {
  const css = readFileSync('client/src/styles/admin-console.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = css.match(/\.bo-shell \.admin-sidebar nav button \{([^}]*)\}/)?.[1] ?? '';

  test('hauteur minimale de 32 px, jamais une hauteur fixe', () => {
    expect(rule).toMatch(/min-height:\s*32px/);
    expect(rule).toMatch(/(^|[;\s])height:\s*auto/);
    expect(rule).not.toMatch(/(^|[;\s])height:\s*\d/);
  });
});

/*
 * Filtres de liste (13/11) : sur un téléphone (390 px), les trois listes « statut /
 * catégorie / marque » passent à 100 % de largeur — sans retour à la ligne, la
 * troisième sortait de l'écran (Catalogue › Produits). Elles doivent pouvoir passer
 * à la ligne.
 */
describe('filtres de liste — retour à la ligne', () => {
  test('.admin-filters autorise le passage à la ligne', () => {
    const css = readFileSync('client/src/admin/admin.css', 'utf8');
    expect(css.match(/\.admin-filters \{([^}]*)\}/)?.[1] ?? '').toMatch(/flex-wrap:\s*wrap/);
  });
});
