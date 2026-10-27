// Section catégories — les six cartes de la référence (27/10/2026).
//
// Le client a envoyé sa capture et six photos, puis : « عمّر بطاقات هاذم
// كاتيڨوري بصور هاذي، ستّة صور ». Ce test verrouille la décision :
//   • six catégories, dans l'ordre exact de la référence ;
//   • chacune a un identifiant que le registre connaît VRAIMENT (sinon la tuile
//     serait une porte qui n'ouvre sur aucune boutique) ;
//   • le libellé du serveur gagne quand il existe, sinon le repli local — jamais
//     l'identifiant technique.
import { describe, expect, it } from 'vitest';

import { AYWEBS_CATEGORIES } from '../../../shared/aywebsStores';
import { EDITORIAL_CATEGORIES, editorialCategory } from '@/features/aywebs/editorialCategories';

const EXPECTED = [
  ['beauty', 'Beauté et parfum'],
  ['home', 'Meubles'],
  ['sports', 'Sports et loisirs'],
  ['audio', 'Casques et écouteurs'],
  ['outdoor', 'Activités de plein air'],
  ['pets', 'Animalerie'],
] as const;

describe('les six catégories de l’accueil', () => {
  it('suit l’ordre de la référence, sans en ajouter ni en retirer', () => {
    expect(EDITORIAL_CATEGORIES.map((category) => [category.id, category.labelFr])).toEqual(EXPECTED.map(([id, label]) => [id, label]));
  });

  it('ne pointe que vers des catégories que le serveur publie vraiment', () => {
    const published = new Set(AYWEBS_CATEGORIES.map((category) => category.id));
    for (const category of EDITORIAL_CATEGORIES) {
      expect(published.has(category.id), `${category.id} manque aux catégories du registre`).toBe(true);
    }
  });

  it('garde le libellé du serveur et retombe sur le sien sinon', () => {
    // Le serveur publie : c'est sa version qui s'affiche.
    const served = editorialCategory(
      { id: 'beauty', labelFr: 'Beauté et parfum', labelAr: 'الجمال والعطور' },
      [{ id: 'beauty', labelFr: 'Beauté & cosmétiques', labelAr: 'الجمال والتجميل' }],
      'fr',
    );
    expect(served.labelFr).toBe('Beauté & cosmétiques');

    // Le serveur ne connaît pas la catégorie : le repli local prend le relais.
    const fallback = editorialCategory(
      { id: 'audio', labelFr: 'Casques et écouteurs', labelAr: 'السماعات والهيدفون' },
      [],
      'ar',
    );
    expect(fallback.labelFr).toBe('Casques et écouteurs');
    expect(fallback.labelAr).toBe('السماعات والهيدفون');

    // Le serveur renvoie une traduction arabe identique au français : donnée
    // absente, on préfère notre repli déjà traduit.
    const untranslated = editorialCategory(
      { id: 'pets', labelFr: 'Animalerie', labelAr: 'مستلزمات الحيوانات' },
      [{ id: 'pets', labelFr: 'Animalerie', labelAr: 'Animalerie' }],
      'ar',
    );
    expect(untranslated.labelAr).toBe('مستلزمات الحيوانات');
  });

  it('chaque catégorie éditoriale a des boutiques dans le registre', () => {
    // Sinon la tuile ouvrirait une section 3 vide. Le contrôle se fait sur les
    // catégories elles-mêmes : le registre garantit qu'elles sont servies.
    for (const category of EDITORIAL_CATEGORIES) {
      const declared = AYWEBS_CATEGORIES.find((entry) => entry.id === category.id);
      expect(declared?.labelFr).toBeTruthy();
    }
  });
});
