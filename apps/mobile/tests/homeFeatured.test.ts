/**
 * Section « à la une » — lecture de la réponse serveur (logique pure).
 *
 *  • une réponse illisible ou sans identifiant ne produit AUCUNE section ;
 *  • les textes sont nettoyés, le libellé du bouton est borné ;
 *  • l'application n'invente jamais de publication.
 */
import { describe, expect, it } from 'vitest';
import { parseHomeFeatured } from '../src/api/public';

describe('parseHomeFeatured', () => {
  it('lit une publication complète', () => {
    expect(parseHomeFeatured({
      publication: { id: 'p1', title: ' Titre ', subtitle: 'Sous-titre', imageUrl: '/m/a.jpg' },
      ctaLabel: ' Lire ',
    })).toEqual({
      publication: { id: 'p1', title: 'Titre', subtitle: 'Sous-titre', imageUrl: '/m/a.jpg' },
      ctaLabel: 'Lire',
    });
  });

  it('publication null ⇒ aucune section', () => {
    expect(parseHomeFeatured({ publication: null, ctaLabel: 'Lire' })).toEqual({ publication: null, ctaLabel: '' });
  });

  it('réponse illisible ⇒ aucune section, jamais une publication inventée', () => {
    expect(parseHomeFeatured(undefined)).toEqual({ publication: null, ctaLabel: '' });
    expect(parseHomeFeatured('texte')).toEqual({ publication: null, ctaLabel: '' });
    expect(parseHomeFeatured({ publication: { title: 'Sans identifiant' } })).toEqual({ publication: null, ctaLabel: '' });
    expect(parseHomeFeatured({ publication: { id: '   ' } })).toEqual({ publication: null, ctaLabel: '' });
  });

  it('un champ manquant devient vide, sans casser le reste', () => {
    expect(parseHomeFeatured({ publication: { id: 'p9' } })).toEqual({
      publication: { id: 'p9', title: '', subtitle: '', imageUrl: '' },
      ctaLabel: '',
    });
  });

  it('le libellé du bouton est borné à 40 caractères', () => {
    const long = 'x'.repeat(80);
    const parsed = parseHomeFeatured({ publication: { id: 'p1' }, ctaLabel: long });
    expect(parsed.ctaLabel).toHaveLength(40);
  });
});
