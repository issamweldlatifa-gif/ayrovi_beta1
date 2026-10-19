import { describe, expect, it } from 'vitest';
import {
  AYWEBS_CATEGORIES, AYWEBS_STORES, validateAyWebsStoreRegistry, type AyWebsStoreDefinition,
} from '../shared/aywebsStores';

const base = AYWEBS_STORES[0];
const store = (overrides: Partial<AyWebsStoreDefinition>): AyWebsStoreDefinition => ({ ...base, ...overrides });

describe('registre des boutiques AYWEBs — contrôle avant publication', () => {
  it('le registre réel est sain (identifiants, domaines, noms, catégories)', () => {
    expect(validateAyWebsStoreRegistry()).toEqual([]);
  });

  it('la liste des catégories correspond au tableau validé (30, identifiants uniques)', () => {
    expect(AYWEBS_CATEGORIES).toHaveLength(30);
    expect(new Set(AYWEBS_CATEGORIES.map((c) => c.id)).size).toBe(30);
  });

  it('une boutique multi-catégories reste UNE seule entrée', () => {
    const amazon = AYWEBS_STORES.filter((s) => s.id === 'amazon');
    expect(amazon).toHaveLength(1);
    expect(amazon[0].categories).toContain('marketplace');
    expect(amazon[0].categories.length).toBeGreaterThan(1);
  });

  it('signale un identifiant en double', () => {
    const problems = validateAyWebsStoreRegistry([store({ id: 'amazon' }), store({ id: 'amazon', domains: ['x.test'], displayName: 'X' })]);
    expect(problems.some((p) => p.includes('identifiant en double'))).toBe(true);
  });

  it('signale un domaine partagé entre deux boutiques', () => {
    const problems = validateAyWebsStoreRegistry([
      store({ id: 'a', displayName: 'A', domains: ['same.test'] }),
      store({ id: 'b', displayName: 'B', domains: ['same.test'] }),
    ]);
    expect(problems.some((p) => p.includes('domaine partagé'))).toBe(true);
  });

  it('signale un nom affiché en double, sans tenir compte de la casse', () => {
    const problems = validateAyWebsStoreRegistry([
      store({ id: 'a', displayName: 'Shop', domains: ['a.test'] }),
      store({ id: 'b', displayName: 'SHOP', domains: ['b.test'] }),
    ]);
    expect(problems.some((p) => p.includes('nom en double'))).toBe(true);
  });

  it('signale une catégorie inconnue et une boutique sans catégorie', () => {
    const problems = validateAyWebsStoreRegistry([
      store({ id: 'a', displayName: 'A', domains: ['a.test'], categories: ['inconnue'] }),
      store({ id: 'b', displayName: 'B', domains: ['b.test'], categories: [] }),
    ]);
    expect(problems.some((p) => p.includes('catégorie inconnue'))).toBe(true);
    expect(problems.some((p) => p.includes('aucune catégorie'))).toBe(true);
  });

  it('une même catégorie répétée dans une boutique est signalée', () => {
    const problems = validateAyWebsStoreRegistry([
      store({ id: 'a', displayName: 'A', domains: ['a.test'], categories: ['fashion', 'fashion'] }),
    ]);
    expect(problems.some((p) => p.includes('catégorie répétée'))).toBe(true);
  });
});
