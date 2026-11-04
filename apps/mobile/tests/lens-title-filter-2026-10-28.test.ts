/**
 * Lens — le filtre par TITRE et l'ordre de confiance (28/10/2026).
 *
 * Le client a corrigé le tir en une phrase :
 *
 *   « نظام الفلاتر كون فقط فلتر على عنوان — كون عنوان منتج مش عنوان صفحة —
 *     وديما أفضلية للمواقع الموثوقة والعالمية. أي فلاتر عدا هذا يتحيّد. »
 *
 * Trois conséquences, toutes vérifiées ici :
 *   1. un SEUL filtre, et il porte sur le titre du PRODUIT (`lensTitle.ts`) ;
 *   2. les filtres ajoutés au tour d'avant (tri, prix vérifié, stock, puces
 *      par marchand) ont disparu — la grille ne les expose plus ;
 *   3. l'ordre, lui, n'est pas un réglage : les enseignes de confiance passent
 *      toujours devant les boutiques inconnues.
 *
 * Aucun rendu ici : un échec désigne la règle, jamais la mise en page.
 */
import { describe, expect, it } from 'vitest';

import { parseCandidate } from '@/api/lens';
import {
  applyLensFilters, filterCandidatesByTitle, merchantKey, merchantTier, rankCandidates,
} from '@/features/lens/lensRanking';
import { productTitle, titleMatches } from '@/features/lens/lensTitle';

const card = (overrides: Record<string, unknown>) => parseCandidate({
  id: String(overrides.id ?? overrides.sourceUrl ?? 'x'),
  kind: 'external',
  title: String(overrides.title ?? 'Produit'),
  source: String(overrides.source ?? 'Boutique'),
  sourceUrl: String(overrides.sourceUrl ?? 'https://example.com/p/1'),
  ...overrides,
});

describe('merchantKey / merchantTier — la confiance vient du DOMAINE', () => {
  it('reconnaît l’enseigne sous un sous-domaine et un domaine national', () => {
    expect(merchantKey('https://www.zalando.fr/baskets-1.html')).toBe('zalando');
    expect(merchantKey('https://www.amazon.co.uk/dp/B0ABC')).toBe('amazon');
    expect(merchantKey('https://fr.shein.com/p/1')).toBe('shein');
  });

  it('suit une redirection de suivi jusqu’au vrai marchand', () => {
    const wrapped = 'https://www.google.com/url?q=https%3A%2F%2Fwww.amazon.fr%2Fdp%2FB0ABC&sa=D';
    expect(merchantKey(wrapped)).toBe('amazon');
    expect(merchantTier(wrapped)).toBe(0);
  });

  it('trois rangs : enseigne connue, place de marché, inconnue', () => {
    expect(merchantTier('https://www.zara.com/fr/p/1')).toBe(0);
    expect(merchantTier('https://www.ebay.fr/itm/1')).toBe(1);
    expect(merchantTier('https://boutique-inconnue.tn/p/1')).toBe(2);
    expect(merchantTier('pas une url')).toBe(2);
  });
});

describe('rankCandidates — la confiance décide, sans réglage', () => {
  const unknown = card({ id: 'u', sourceUrl: 'https://inconnu-shop.tn/p/1', match: 99, priceTnd: 34 });
  const amazon = card({ id: 'a', sourceUrl: 'https://www.amazon.fr/dp/B0A', match: 40, priceTnd: 66 });
  const ebay = card({ id: 'e', sourceUrl: 'https://www.ebay.fr/itm/9', match: 80, priceTnd: 50 });
  const catalog = parseCandidate({
    id: 'cat', kind: 'catalog', title: 'Notre stock', source: 'Collection ZAYROVI',
    sourceUrl: 'https://ayrovi.tn/p/1', match: 1,
  });

  it('une boutique inconnue ne passe jamais devant une enseigne fiable', () => {
    const order = rankCandidates([unknown, amazon, ebay]).map((entry) => entry.id);
    expect(order).toEqual(['a', 'e', 'u']);
  });

  it('le catalogue ZAYROVI garde la tête', () => {
    expect(rankCandidates([unknown, amazon, catalog])[0]?.id).toBe('cat');
  });

  it('l’ordre est stable : deux appels rendent la même suite', () => {
    expect(rankCandidates([unknown, amazon, ebay]).map((entry) => entry.id))
      .toEqual(rankCandidates([ebay, unknown, amazon]).map((entry) => entry.id));
  });
});

describe('productTitle — le titre du PRODUIT, pas celui de la PAGE', () => {
  it('retire le nom de la boutique collé au titre', () => {
    expect(productTitle('Nike Air Max 90 | Zalando', card({ source: 'Zalando', sourceUrl: 'https://www.zalando.fr/p/1' })))
      .toBe('Nike Air Max 90');
    expect(productTitle('Robe fleurie - SHEIN France', card({ source: 'SHEIN', sourceUrl: 'https://fr.shein.com/p/1' })))
      .toBe('Robe fleurie');
    expect(productTitle('Amazon.fr: Chaussures de running Homme', card({ source: 'Amazon', sourceUrl: 'https://www.amazon.fr/dp/1' })))
      .toBe('Chaussures de running Homme');
  });

  it('retire le verbe d’achat et la queue « sur <boutique> »', () => {
    expect(productTitle('Acheter Robe fleurie sur SHEIN', card({ source: 'SHEIN', sourceUrl: 'https://fr.shein.com/p/1' })))
      .toBe('Robe fleurie');
  });

  it('ne touche pas à un titre déjà propre', () => {
    const clean = 'Casque Sony WH-1000XM5 Bluetooth';
    expect(productTitle(clean, card({ source: 'Fnac', sourceUrl: 'https://www.fnac.com/a/1' }))).toBe(clean);
  });

  it('ne rend jamais une carte sans titre', () => {
    expect(productTitle('Zalando', card({ source: 'Zalando', sourceUrl: 'https://www.zalando.fr/' })))
      .toBe('Zalando');
  });
});

describe('filterCandidatesByTitle — le seul filtre', () => {
  const robe = card({ id: 'robe', title: 'Robe fleurie | Zalando', source: 'Zalando', sourceUrl: 'https://www.zalando.fr/p/1' });
  const casque = card({ id: 'casque', title: 'Casque Sony WH-1000XM5', source: 'Fnac', sourceUrl: 'https://www.fnac.com/a/1' });

  it('garde les titres qui contiennent la recherche', () => {
    expect(filterCandidatesByTitle([robe, casque], 'robe').map((entry) => entry.id)).toEqual(['robe']);
  });

  it('ignore la casse et les accents', () => {
    expect(filterCandidatesByTitle([robe, casque], 'CASQUE').map((entry) => entry.id)).toEqual(['casque']);
    expect(filterCandidatesByTitle([casque], 'écouteurs')).toEqual([]);
  });

  it('ne filtre PAS sur le nom de la boutique', () => {
    /* « zalando » n'est plus dans le titre affiché : le filtre ne doit pas
       ramener la carte par son marchand, sinon il redeviendrait un filtre de
       page. */
    expect(filterCandidatesByTitle([robe, casque], 'zalando')).toEqual([]);
    expect(titleMatches(productTitle(robe.title, robe), 'zalando')).toBe(false);
  });

  it('une recherche vide rend tout, dans l’ordre de confiance', () => {
    const unknown = card({ id: 'u', title: 'Robe simple', sourceUrl: 'https://inconnu.tn/p/1' });
    expect(applyLensFilters([unknown, robe], '').map((entry) => entry.id)).toEqual(['robe', 'u']);
  });
});

describe('la grille n’expose plus aucun autre filtre', () => {
  it('ni tri, ni prix vérifié, ni stock, ni puces par marchand', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const grid = readFileSync(path.join(root, 'src/features/lens/LensResultsGrid.tsx'), 'utf8');
    expect(grid).toContain('LensTitleFilter');
    for (const gone of ['lens-sort-', 'lens-filter-priced', 'lens-filter-instock', 'lens-filter-trusted', 'lens-merchant-', 'presentMerchants']) {
      expect(grid.includes(gone), gone).toBe(false);
    }
    const ranking = readFileSync(path.join(root, 'src/features/lens/lensRanking.ts'), 'utf8');
    for (const gone of ['type LensSort', 'interface LensFilters', 'DEFAULT_FILTERS', 'presentMerchants', 'trustedOnly']) {
      expect(ranking.includes(gone), gone).toBe(false);
    }
  });
});
