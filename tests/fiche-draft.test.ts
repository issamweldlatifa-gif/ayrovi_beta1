import { describe, expect, test } from 'vitest';
import {
  cleanSectionLabels,
  colorTiles,
  ficheLabelsPayload,
  salePrice,
  skuFor,
  tokenList,
  variantPlan,
} from '../client/src/admin/ficheDraft';

describe('tokenList — une saisie libre devient une liste propre', () => {
  test('virgules, espaces et retours à la ligne donnent le même résultat', () => {
    expect(tokenList('39, 40,41')).toEqual(['39', '40', '41']);
    expect(tokenList('39 40  41')).toEqual(['39', '40', '41']);
    expect(tokenList('39\n40\r\n41')).toEqual(['39', '40', '41']);
  });

  test('les doublons insensibles à la casse disparaissent, l’ordre reste', () => {
    expect(tokenList('Gris, gris, GRIS, Multicolore')).toEqual(['Gris', 'Multicolore']);
  });

  test('une saisie vide ne produit aucune valeur', () => {
    expect(tokenList('')).toEqual([]);
    expect(tokenList('   ,,  \n ')).toEqual([]);
  });

  test('les valeurs sont bornées (40 caractères, 30 valeurs)', () => {
    expect(tokenList('x'.repeat(80))[0]).toHaveLength(40);
    expect(tokenList(Array.from({ length: 60 }, (_, index) => `t${index}`).join(','))).toHaveLength(30);
  });
});

describe('skuFor — un SKU que le serveur accepte', () => {
  test('majuscules, chiffres, « . », « _ », « - » seulement', () => {
    expect(skuFor('baskets-route', '39', 'Gris')).toBe('BASKETS-ROUTE-39-GRIS');
    expect(skuFor('Baskets Côte d’Azur', '40', 'Bleu nuit')).toBe('BASKETS-COTE-D-AZUR-40-BLEU-NUIT');
  });

  test('jamais vide : une valeur arabe garde une base lisible', () => {
    // « مقاس » n'a pas de translittération : on retombe sur le rang, jamais sur du néant.
    expect(skuFor('prd', 'مقاس', '', 0)).toBe('PRD-S1');
    expect(skuFor('', '', '')).toBe('PRD');
  });

  test('64 caractères au plus, sans séparateur final', () => {
    const sku = skuFor('a'.repeat(80), '39', 'GRIS');
    expect(sku.length).toBeLessThanOrEqual(64);
    expect(sku.endsWith('-')).toBe(false);
  });
});

describe('variantPlan — les tailles et couleurs saisies deviennent des variantes', () => {
  test('produit cartésien tailles × couleurs', () => {
    const plan = variantPlan([], ['39', '40'], ['Gris', 'Noir'], 'baskets');
    expect(plan.map((entry) => `${entry.size}/${entry.color}`)).toEqual([
      '39/Gris', '39/Noir', '40/Gris', '40/Noir',
    ]);
    expect(new Set(plan.map((entry) => entry.sku)).size).toBe(4);
  });

  test('les couples déjà présents ne sont pas recréés (enregistrer deux fois)', () => {
    const plan = variantPlan([{ size: '39', color: 'gris' }], ['39', '40'], ['Gris'], 'baskets');
    expect(plan).toEqual([{ sku: 'BASKETS-40-GRIS', size: '40', color: 'Gris' }]);
  });

  test('aucune taille ni couleur ⇒ aucune variante (la fiche n’affiche pas de choix vide)', () => {
    expect(variantPlan([], [], [], 'baskets')).toEqual([]);
  });

  test('une seule couleur déclarée reste une dimension : une variante par taille', () => {
    const plan = variantPlan([], ['39', '40', '41'], [], 'baskets');
    expect(plan.map((entry) => entry.sku)).toEqual(['BASKETS-39', 'BASKETS-40', 'BASKETS-41']);
  });

  test('des couleurs sans tailles restent commandables', () => {
    expect(variantPlan([], [], ['Gris', 'Noir'], 'sac').map((entry) => entry.sku)).toEqual(['SAC-GRIS', 'SAC-NOIR']);
  });

  test('deux valeurs qui donnent le même SKU ne se marchent pas dessus', () => {
    const plan = variantPlan([], ['39', '39 mm'], [], 'p');
    expect(plan.map((entry) => entry.sku)).toEqual(['P-39', 'P-39-MM']);
  });
});

describe('ficheLabelsPayload — un libellé vide n’écrase pas celui de l’application', () => {
  test('les clés absentes le restent', () => {
    expect(ficheLabelsPayload('', '', {})).toEqual({});
    expect(ficheLabelsPayload('Pointure', '', {})).toEqual({ size: 'Pointure' });
  });

  test('espaces écrasés, sections vides retirées', () => {
    expect(ficheLabelsPayload('  Pointure  ', 'Color', { matiere: ' Matière et entretien ', vide: '   ' }))
      .toEqual({ size: 'Pointure', color: 'Color', sections: { matiere: 'Matière et entretien' } });
    expect(cleanSectionLabels({ ' ': 'x', ok: 'Bien' })).toEqual({ ok: 'Bien' });
  });
});

describe('colorTiles — la bande de vignettes, règle de l’application', () => {
  test('une seule couleur n’est pas un choix : aucune vignette', () => {
    expect(colorTiles(['Gris'])).toEqual([]);
    expect(colorTiles([])).toEqual([]);
  });

  test('une couleur sans photo garde son nom et ne vole pas la photo d’une autre', () => {
    expect(colorTiles(['Gris', 'Noir'], { Gris: '/g.jpg' })).toEqual([
      { color: 'Gris', image: '/g.jpg' },
      { color: 'Noir', image: null },
    ]);
  });
});

describe('salePrice — le prix publié est un vrai prix', () => {
  test('accepte un entier ou une décimale, virgule comprise', () => {
    expect(salePrice('89')).toBe(89);
    expect(salePrice('89,5')).toBe(89.5);
    expect(salePrice('89.456')).toBe(89.46);
  });

  test('refuse le vide, le zéro, le négatif et le texte', () => {
    expect(salePrice('')).toBeNull();
    expect(salePrice('0')).toBeNull();
    expect(salePrice('-3')).toBeNull();
    expect(salePrice('abc')).toBeNull();
  });
});
