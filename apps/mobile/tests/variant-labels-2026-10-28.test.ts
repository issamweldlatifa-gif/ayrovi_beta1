/**
 * AYWEBs — le crible des valeurs d'interface, côté application (28/10/2026).
 *
 * La correction est faite à la source (`src/aywebs/captureScript.ts`) ; ce
 * fichier protège la SECONDE barrière : une fiche DÉJÀ lue (cache du serveur,
 * capture enregistrée) garde ses vieilles valeurs d'interface. Sans ce crible,
 * la feuille continuerait d'afficher « Taille : Taille, Votre taille » sur ces
 * fiches-là, alors que la lecture est réparée pour les nouvelles.
 *
 * Rien n'est traduit ni inventé : on retire les libellés qui ne sont pas des
 * choix du marchand, et rien d'autre.
 */
import { describe, expect, it } from 'vitest';

import { choiceKey, isRealChoiceValue, isUiChoiceLabel, realChoiceGroups } from '@/features/aywebs/variantLabels';

describe('isUiChoiceLabel — les libellés d’interface connus', () => {
  it('écarte les recommandations et les aides, dans les langues des boutiques', () => {
    for (const label of [
      'Votre taille', 'votre taille', 'Your size', 'Ma taille', 'Deine Größe',
      'Taille & coupe', 'Size & fit', 'Guide des tailles', 'Size guide',
      'Sélectionnez votre taille', 'Choisissez une couleur', 'Toutes les couleurs', 'All colours',
      'Please select', 'Pick your size',
    ]) {
      expect(isUiChoiceLabel(label), label).toBe(true);
    }
  });

  it('ne touche pas aux vraies valeurs du marchand', () => {
    for (const label of ['S', 'M', '36', '36,5', 'Tailleur', 'Noir', 'Bleu marine', 'Taille unique', '150 ml']) {
      expect(isUiChoiceLabel(label), label).toBe(false);
    }
  });
});

describe('isRealChoiceValue — le nom du groupe n’est pas une valeur', () => {
  it('écarte la répétition du nom du groupe', () => {
    expect(isRealChoiceValue('Taille', 'Taille')).toBe(false);
    expect(isRealChoiceValue('Taille :', 'taille')).toBe(false);
    expect(isRealChoiceValue('Couleur', 'Couleur')).toBe(false);
  });

  it('garde une vraie valeur sous un groupe de même famille', () => {
    expect(isRealChoiceValue('Taille', 'M')).toBe(true);
    expect(isRealChoiceValue('Couleur', 'Noir')).toBe(true);
  });
});

describe('realChoiceGroups — la feuille ne montre que des choix réels', () => {
  it('retire les valeurs d’interface et garde les autres', () => {
    const groups = realChoiceGroups([
      { attribute: 'Taille', values: ['Taille', 'Votre taille', 'S', 'M'] },
      { attribute: 'Couleur', values: ['Couleur', 'Noir', 'Kaki'] },
    ]);
    expect(groups).toEqual([
      { attribute: 'Taille', values: ['S', 'M'] },
      { attribute: 'Couleur', values: ['Noir', 'Kaki'] },
    ]);
  });

  it('retire un groupe qui ne garde AUCUNE valeur réelle', () => {
    expect(realChoiceGroups([{ attribute: 'Taille', values: ['Taille', 'Votre taille'] }])).toEqual([]);
  });

  it('ne modifie pas les groupes reçus (aucune mutation d’état)', () => {
    const input = [{ attribute: 'Taille', values: ['Taille', 'S', 'M'] }];
    const snapshot = JSON.stringify(input);
    realChoiceGroups(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('résiste à une entrée absente ou mal formée (aucune exception)', () => {
    expect(realChoiceGroups(null)).toEqual([]);
    expect(realChoiceGroups(undefined)).toEqual([]);
    expect(realChoiceGroups([{ attribute: '', values: ['S'] } as never])).toEqual([]);
  });
});

describe('choiceKey — comparaison stable', () => {
  it('ignore casse, espaces et ponctuation de fin', () => {
    expect(choiceKey('  Votre   Taille : ')).toBe('votre taille');
    expect(choiceKey('Größe')).toBe(choiceKey('größe'));
  });
});
