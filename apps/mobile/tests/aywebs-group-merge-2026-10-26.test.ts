/**
 * AYWEBs — la feuille affiche TOUS les choix du marchand, sous les noms du
 * serveur (26/10/2026).
 *
 * ── Le symptôme ───────────────────────────────────────────────────────────
 * Fiche Zalando « REVOLUTION 8 » (64.95 EUR), taille 36 choisie, disponibilité
 * affichée — et au clic : « Choisissez toutes les options requises : le serveur
 * refuse un ajout sans choix explicite » (`VARIANT_REQUIRED`). Sur le web, la
 * même fiche s'ajoutait.
 *
 * ── La cause ──────────────────────────────────────────────────────────────
 * Deux lectures, deux vocabulaires : la capture du navigateur publie le nom
 * AFFICHÉ (« Taille », parfois seule), la lecture serveur publie le nom de la
 * DONNÉE (« size », « color »). La feuille affichait donc un seul champ, et
 * envoyait une clé que le serveur ne reconnaissait pas.
 *
 * ── Ce que ce fichier verrouille ─────────────────────────────────────────
 *   1. même dimension ⇒ UN groupe, sous le nom du serveur, valeurs unies ;
 *   2. une dimension que la capture n'a pas vue est AJOUTÉE (la couleur) ;
 *   3. la sélection est ré-alignée (`taille` → `size`) et rien n'est perdu ;
 *   4. les manquants sont NOMMÉS — on ne devine jamais une valeur ;
 *   5. le miroir `attributeKeys.ts` reste identique à `shared/aywebsAttributes.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { alignSelection, mergeVariantGroups, missingAttributes } from '@/features/aywebs/groupMerge';
import { ayWebsAttributeDimension, ayWebsSameAttribute } from '@/features/aywebs/attributeKeys';

describe('union des deux lectures', () => {
  it('même dimension : un seul groupe, nom du serveur, valeurs unies', () => {
    const merged = mergeVariantGroups(
      [{ attribute: 'Taille', values: ['35.5', '36'] }],
      [{ attribute: 'size', values: ['36', '36.5'] }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].attribute).toBe('size');
    expect(merged[0].values).toEqual(['36', '36.5', '35.5']);
  });

  it('la couleur que la capture n’a pas vue est ajoutée', () => {
    const merged = mergeVariantGroups(
      [{ attribute: 'Taille', values: ['36'] }],
      [{ attribute: 'size', values: ['36'] }, { attribute: 'color', values: ['black/white'] }],
    );
    expect(merged.map((group) => group.attribute)).toEqual(['size', 'color']);
  });

  it('une dimension propre à la capture est conservée', () => {
    const merged = mergeVariantGroups(
      [{ attribute: 'Taille', values: ['36'] }, { attribute: 'Matière', values: ['tissu'] }],
      [{ attribute: 'size', values: ['36'] }],
    );
    expect(merged.map((group) => group.attribute)).toEqual(['size', 'Matière']);
  });

  it('sans lecture serveur, la capture est rendue telle quelle', () => {
    const local = [{ attribute: 'Taille', values: ['36'] }];
    expect(mergeVariantGroups(local, [])).toEqual(local);
    expect(mergeVariantGroups([], [])).toEqual([]);
  });
});

describe('sélection : jamais une clé que le serveur ignore', () => {
  const groups = [{ attribute: 'size', values: ['36'] }, { attribute: 'color', values: ['black/white'] }];

  it('ré-aligne « taille » sur « size » sans perdre la valeur', () => {
    expect(alignSelection(groups, { taille: '36' })).toEqual({ size: '36' });
  });

  it('conserve une clé inconnue (le serveur refusera en connaissance de cause)', () => {
    expect(alignSelection(groups, { hauteur: '30 cm' })).toEqual({ hauteur: '30 cm' });
  });

  it('nomme ce qui manque au lieu de le deviner', () => {
    expect(missingAttributes(groups, { size: '36' })).toEqual(['color']);
    expect(missingAttributes(groups, { taille: '36', couleur: 'black/white' })).toEqual([]);
  });
});

describe('vocabulaire partagé', () => {
  it('les deux noms désignent la même dimension', () => {
    expect(ayWebsSameAttribute('Taille', 'size')).toBe(true);
    expect(ayWebsSameAttribute('Couleur', 'color')).toBe(true);
    expect(ayWebsAttributeDimension('Größe')).toBe('size');
    expect(ayWebsSameAttribute('Taille', 'Couleur')).toBe(false);
  });

  it('le miroir de l’application est identique au module partagé', () => {
    const mirror = readFileSync(new URL('../src/features/aywebs/attributeKeys.ts', import.meta.url), 'utf8');
    const shared = readFileSync(new URL('../../../shared/aywebsAttributes.ts', import.meta.url), 'utf8');
    /* On compare le corps exécutable : l'en-tête du miroir explique la copie. */
    const body = (text: string): string => text.slice(text.indexOf('/** Dimensions reconnues')).trim();
    expect(body(mirror)).toBe(body(shared));
  });
});
