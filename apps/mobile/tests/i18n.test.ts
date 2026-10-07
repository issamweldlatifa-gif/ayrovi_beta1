import { describe, expect, it } from 'vitest';
import { ar } from '../src/i18n/ar';
import { fr } from '../src/i18n/fr';
import { translate } from '../src/i18n/keys';

const frKeys = Object.keys(fr).sort();
const arKeys = Object.keys(ar).sort();

describe('dictionnaires fr / ar', () => {
  it('exposent exactement les mêmes clés', () => {
    // Une clé présente d'un côté seulement produit un texte vide (ou français)
    // chez l'utilisateur arabophone — le défaut le plus difficile à voir en test.
    expect(arKeys).toEqual(frKeys);
  });

  it('n’ont aucune valeur vide', () => {
    for (const [key, value] of [...Object.entries(fr), ...Object.entries(ar)]) {
      expect(String(value).trim(), `clé vide : ${key}`).not.toBe('');
    }
  });

  it('translittèrent directement chaque clé', () => {
    expect(translate('fr', 'tabs.home')).toBe(fr['tabs.home']);
    expect(translate('ar', 'tabs.home')).toBe(ar['tabs.home']);
  });

  it('interpolent les variables et laissent intact un jeton inconnu', () => {
    expect(translate('fr', 'common.phase', { phase: 'P3' })).toBe('Phase P3');
    expect(translate('ar', 'common.phase', { phase: 'P3' })).toBe('المرحلة P3');
    expect(translate('fr', 'common.phase')).toContain('{phase}');
  });
});
