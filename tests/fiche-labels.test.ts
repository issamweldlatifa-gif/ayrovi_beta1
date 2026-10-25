/**
 * LIBELLÉS DE LA FICHE — la donnée que le CRM écrit et que l'application lit.
 *
 * `products.fiche_labels` est une colonne JSON remplie par l'écran produit du
 * CRM (« Taille » → « Pointure », sections nommées par le propriétaire). Elle est
 * lue par une fonction **tolérante** : une colonne abîmée, une valeur trop
 * longue, un slug invalide ne cassent jamais la fiche — ils sont ignorés, et
 * l'application retombe sur son propre libellé.
 *
 * Ce fichier teste la lecture seule : aucun accès base, aucune dépendance native.
 */
import { describe, expect, test } from 'vitest';
import { FICHE_LABEL_MAX, readFicheLabels } from '../src/catalogue/products';

describe('fiche_labels — lecture tolérante', () => {
  test('un objet vide ou absent donne « aucun libellé »', () => {
    expect(readFicheLabels(undefined)).toEqual({});
    expect(readFicheLabels(null)).toEqual({});
    expect(readFicheLabels('')).toEqual({});
    expect(readFicheLabels('{}')).toEqual({});
    expect(readFicheLabels([])).toEqual({});
  });

  test('les deux dimensions et les sections nommées sont reprises', () => {
    expect(readFicheLabels({
      size: 'Pointure',
      color: 'Finition',
      sections: { matiere: 'Matière recyclée', measures: 'Mesures' },
    })).toEqual({
      size: 'Pointure',
      color: 'Finition',
      sections: { matiere: 'Matière recyclée', measures: 'Mesures' },
    });
  });

  test('la colonne est du JSON : une chaîne valide est lue, une chaîne abîmée est ignorée', () => {
    expect(readFicheLabels('{"size":"Contenance"}')).toEqual({ size: 'Contenance' });
    expect(readFicheLabels('{"size":')).toEqual({});
    expect(readFicheLabels('pas du json')).toEqual({});
  });

  test('un libellé vide n’est pas un libellé : l’application garde le sien', () => {
    expect(readFicheLabels({ size: '   ', color: '', sections: { matiere: '  ' } })).toEqual({});
  });

  test('les espaces multiples sont normalisés et la longueur bornée', () => {
    const long = 'x'.repeat(FICHE_LABEL_MAX + 20);
    const labels = readFicheLabels({ size: `  Pointure   large  `, color: long });
    expect(labels.size).toBe('Pointure large');
    expect(labels.color).toBe('x'.repeat(FICHE_LABEL_MAX));
  });

  test('un slug de section invalide est écarté, jamais deviné', () => {
    expect(readFicheLabels({
      sections: { 'bon_slug': 'Bon', 'Mauvais Slug': 'Non', 'accentué': 'Non', '': 'Non' },
    })).toEqual({ sections: { bon_slug: 'Bon' } });
  });

  test('les valeurs non textuelles ne deviennent jamais un libellé', () => {
    expect(readFicheLabels({ size: 42, color: null, sections: { matiere: { fr: 'Coton' } } })).toEqual({});
  });
});
