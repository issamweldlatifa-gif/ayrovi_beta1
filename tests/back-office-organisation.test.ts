/**
 * Organisation de la console (12/11/2026) : chaque groupe suit le flux de travail.
 *  • Contenu   : éditorial → accueil → campagnes → anciens écrans (doublons du Catalogue) ;
 *  • Commerce  : ventes → service client → achats → stock → prix → rapports → laboratoires.
 * Les anciens écrans Produits/Marques restent dans la navigation (snapshot legacy figé),
 * mais leur libellé dit qu'ils sont anciens et ils ferment le groupe.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/back-office/resources.ts', 'utf8');

function navOrder(section: string): { group: string; order: number } {
  const at = source.indexOf(`section: '${section}'`);
  expect(at, `section ${section}`).toBeGreaterThan(-1);
  const match = /nav: \{ group: '([^']+)', order: (\d+)/.exec(source.slice(at, at + 900));
  expect(match, `nav ${section}`).toBeTruthy();
  return { group: match![1], order: Number(match![2]) };
}

function expectFlow(group: string, sections: string[]) {
  const orders = sections.map((section) => {
    const nav = navOrder(section);
    expect(nav.group, section).toBe(group);
    return nav.order;
  });
  expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  expect(new Set(orders).size).toBe(orders.length);
}

describe('organisation des groupes', () => {
  it('Contenu : éditorial, accueil, campagnes, puis anciens écrans', () => {
    expectFlow('Contenu', [
      'news', 'magazine-agent', 'social',
      'hero', 'home-featured', 'home-sections', 'stories', 'lens-section', 'public-nav',
      'arrivals', 'promotions',
      'products', 'brands',
    ]);
  });

  it('Commerce : ventes → service → achats → stock → prix → rapports → labos', () => {
    expectFlow('Commerce', [
      'orders', 'aywebs-purchases', 'customers', 'assistant-support', 'lens-requests',
      'arrival-ingestion', 'purchasing', 'purchasing-orders', 'purchasing-receipts',
      'inventory', 'inventory-movements', 'inventory-stocktakes',
      'pricing', 'promos', 'reports', 'lens-lab', 'ai-discovery',
    ]);
  });

  it('les doublons legacy se présentent comme anciens écrans', () => {
    expect(source).toContain("label: 'Produits (ancien écran)'");
    expect(source).toContain("label: 'Marques (ancien écran)'");
    const search = readFileSync('src/back-office/search.ts', 'utf8');
    expect(search).toContain("label: 'Produits (ancien écran)'");
    expect(search).toContain("label: 'Marques (ancien écran)'");
  });
});
