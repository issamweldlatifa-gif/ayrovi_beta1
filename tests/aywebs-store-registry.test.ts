import { describe, expect, it } from 'vitest';
import {
  AYWEBS_CATEGORIES, AYWEBS_STORES, detectAyWebsStore, validateAyWebsStoreRegistry, type AyWebsStoreDefinition,
} from '../shared/aywebsStores';
import { AYWEBS_CATALOG_STORES } from '../shared/aywebsStoreCatalog';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

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

describe('catalogue des boutiques (liste de référence, non ouvertes)', () => {
  it('toutes les boutiques du catalogue sont désactivées, sans capacité ni adaptateur de capture', () => {
    expect(AYWEBS_CATALOG_STORES.length).toBeGreaterThan(300);
    for (const entry of AYWEBS_CATALOG_STORES) {
      expect(entry.enabled).toBe(false);
      expect(entry.capabilities).toEqual(['browse']);
      expect(entry.captureSupported).toBe(false);
      expect(entry.integrationType).toBe('URL_REQUEST');
    }
  });

  it('une boutique du catalogue n\'est jamais détectée par domaine (la détection ne change pas)', () => {
    expect(detectAyWebsStore('https://www.ebay.com/itm/123')).toBeNull();
    expect(detectAyWebsStore('https://www.zara.com/fr/')).toBeNull();
    expect(detectAyWebsStore('https://www.amazon.com/dp/B000000000')?.id).toBe('amazon');
  });

  it('un marchand présent dans plusieurs catégories reste UNE entrée avec toutes ses catégories', () => {
    const samsung = AYWEBS_CATALOG_STORES.filter((s) => s.domains.includes('samsung.com'));
    expect(samsung).toHaveLength(1);
    expect(samsung[0].categories).toEqual(expect.arrayContaining(['electronics', 'smartphones', 'kitchen']));
    const razer = AYWEBS_CATALOG_STORES.filter((s) => s.domains.includes('razer.com'));
    expect(razer).toHaveLength(1);
    expect(razer[0].categories).toEqual(expect.arrayContaining(['electronics', 'gaming']));
  });

  it('les boutiques existantes gardent leur identifiant et leur adresse', () => {
    const byId = Object.fromEntries(AYWEBS_STORES.map((s) => [s.id, s.homeUrl]));
    expect(byId.amazon).toBe('https://www.amazon.com/');
    expect(byId.shein).toBeTruthy();
    expect(byId.temu).toBeTruthy();
    expect(byId.aliexpress).toBeTruthy();
    const catalogIds = new Set(AYWEBS_CATALOG_STORES.map((s) => s.id));
    for (const id of Object.keys(byId)) expect(catalogIds.has(id)).toBe(false);
  });

  it('marketplace inclut les quatre marchés de la liste (AliExpress, Temu, Amazon)', () => {
    for (const id of ['amazon', 'aliexpress', 'temu']) {
      const store = AYWEBS_STORES.find((s) => s.id === id);
      expect(store?.categories).toContain('marketplace');
    }
  });

  it('chaque catégorie a au moins une boutique (catalogue + registre)', () => {
    const all = [...AYWEBS_STORES, ...AYWEBS_CATALOG_STORES];
    for (const category of AYWEBS_CATEGORIES) {
      expect(all.some((s) => s.categories.includes(category.id)), category.id).toBe(true);
    }
  });

  it('les libellés arabes des catégories suivent le tableau validé', () => {
    const ar = Object.fromEntries(AYWEBS_CATEGORIES.map((c) => [c.id, c.labelAr]));
    expect(ar.marketplace).toBe('متاجر متنوعة');
    expect(ar.smartphones).toBe('الهواتف والإكسسوارات');
    expect(ar.beauty).toBe('الجمال والتجميل');
    expect(ar.toys).toBe('الألعاب والأطفال');
    expect(ar.garden).toBe('الحديقة والخارج');
    expect(ar.health).toBe('العناية الشخصية');
  });
});

describe('logos du catalogue — fichiers présents (main.pdf)', () => {
  const LOGO_DIR = join(__dirname, '..', 'client', 'public');

  it('chaque logo déclaré existe sous client/public', () => {
    const missing = AYWEBS_CATALOG_STORES
      .filter((s) => s.logo)
      .filter((s) => !existsSync(join(LOGO_DIR, s.logo)))
      .map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it('les marchands sans logo dans main.pdf gardent une chaîne vide (lettre affichée)', () => {
    const noLogo = AYWEBS_CATALOG_STORES.filter((s) => !s.logo).map((s) => s.id).sort();
    expect(noLogo).toEqual(['chain-reaction-cycles', 'joann', 'ninja-kitchen', 'oshkosh-b-gosh']);
  });

  it('le logo suit le modèle /stores/<id>.png', () => {
    for (const s of AYWEBS_CATALOG_STORES.filter((x) => x.logo)) {
      expect(s.logo).toBe(`/stores/${s.id}.png`);
    }
  });
});
