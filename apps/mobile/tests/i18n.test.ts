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

  /**
   * Cette assertion utilisait `common.phase`. Cette clé a été retirée avec
   * l'ancien en-tête d'écran (voir `copy.test.ts`) : la pastille de phase
   * n'existe plus. On vise `orders.items`, qui porte une vraie variable et
   * n'appartient à aucune structure transitoire — le test vérifie le
   * MÉCANISME d'interpolation, pas une clé particulière.
   */
  it('interpolent les variables et laissent intact un jeton inconnu', () => {
    expect(translate('fr', 'orders.items', { count: 3 })).toBe('3 article(s)');
    expect(translate('ar', 'orders.items', { count: 3 })).toBe('3 قطعة');
    expect(translate('fr', 'orders.items')).toContain('{count}');
  });

  /**
   * L'interpolation ne remplace que les jetons NOMMÉS (`{value}`, `{count}`).
   * Cinq libellés utilisaient un jeton anonyme `{}` : jamais remplacé, il
   * s'affichait tel quel — « -{} % » sur la pastille d'une promotion,
   * « jusqu'au {} », « par {} », « {} vues ».
   */
  it('n’utilisent aucun jeton anonyme `{}`', () => {
    const anonymous = [...Object.entries(fr), ...Object.entries(ar)]
      .filter(([, value]) => String(value).includes('{}'))
      .map(([key]) => key);
    expect(anonymous).toEqual([]);
    expect(translate('fr', 'sections.discountPercent', { value: '20' })).toBe('-20 %');
    expect(translate('ar', 'sections.until', { value: '12/11' })).toBe('لين 12/11');
    expect(translate('fr', 'social.views', { value: '8' })).toBe('8 vues');
  });
});
