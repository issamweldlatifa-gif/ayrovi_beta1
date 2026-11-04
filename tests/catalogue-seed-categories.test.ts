/**
 * Catégories internationales — l'arbre est une DONNÉE, et il ne s'installe
 * jamais tout seul (24/10/2026).
 *
 * Ce que ces tests protègent :
 *  • les slugs sont uniques dans tout l'arbre (un doublon ferait échouer
 *    l'installation au milieu, laissant une famille sans ses rayons) ;
 *  • les 9 familles attendues existent, chacune avec ses rayons ;
 *  • l'installation est **explicite** : elle n'est PAS appelée au démarrage
 *    (`bootstrap.ts` ne doit pas fabriquer de contenu), elle a une route dédiée.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { INTERNATIONAL_CATEGORIES, type SeedNode } from '../src/catalogue/seedCategories';
import { ATTRIBUTE_MATRIX } from '../src/catalogue/seedAttributes';

const at = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

function flatten(nodes: SeedNode[], depth = 0): Array<{ node: SeedNode; depth: number }> {
  return nodes.flatMap((node) => [{ node, depth }, ...flatten(node.children ?? [], depth + 1)]);
}

const ALL = flatten(INTERNATIONAL_CATEGORIES);

describe('catégories internationales — l’arbre', () => {
  it('les 9 familles demandées sont là', () => {
    expect(INTERNATIONAL_CATEGORIES.map((node) => node.slug)).toEqual([
      'femme', 'homme', 'enfants', 'chaussures', 'accessoires', 'beaute', 'electronique', 'maison', 'essentiels',
    ]);
  });

  it('chaque famille a au moins deux rayons', () => {
    for (const family of INTERNATIONAL_CATEGORIES) {
      expect((family.children ?? []).length, family.slug).toBeGreaterThanOrEqual(2);
    }
  });

  it('aucun slug en double (un doublon casserait l’installation à mi-arbre)', () => {
    const slugs = ALL.map((entry) => entry.node.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('aucun nœud sans nom, et les enfants sont bien à un niveau de plus', () => {
    for (const entry of ALL) {
      expect(entry.node.name.trim(), entry.node.slug).not.toBe('');
      expect(entry.depth).toBeLessThanOrEqual(1); // familles → rayons, pas plus
    }
  });

  it('la matrice d’attributs ne vise que des familles qui existent', () => {
    const families = new Set(INTERNATIONAL_CATEGORIES.map((node) => node.slug));
    for (const attribute of ATTRIBUTE_MATRIX) {
      for (const family of attribute.families) expect(families.has(family), `${attribute.key} → ${family}`).toBe(true);
    }
  });

  it('la matrice est propre : clés uniques, SELECT avec options, libellés non vides', () => {
    const keys = ATTRIBUTE_MATRIX.map((attribute) => attribute.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const attribute of ATTRIBUTE_MATRIX) {
      expect(attribute.label.trim(), attribute.key).not.toBe('');
      expect(attribute.families.length, attribute.key).toBeGreaterThan(0);
      if (attribute.dataType === 'SELECT') expect((attribute.options ?? []).length, attribute.key).toBeGreaterThan(0);
    }
    // Les deux attributs « capacitaires » demandés par le propriétaire.
    expect(keys).toContain('memory_storage');
    expect(keys).toContain('power_capacity');
  });

  it('la matrice s’installe par une route explicite, jamais au démarrage', () => {
    const routes = at('src/catalogue/routes.ts');
    expect(routes).toContain("router.post('/attributes/seed'");
  });

  it('l’arbre est une donnée : il ne dépend d’aucun nom écrit dans l’écran', () => {
    const routes = at('src/catalogue/routes.ts');
    expect(routes).toContain("router.post('/categories/seed'");
    const boot = at('src/catalogue/bootstrap.ts');
    expect(boot).not.toMatch(/seedInternationalCategories/);
  });
});
