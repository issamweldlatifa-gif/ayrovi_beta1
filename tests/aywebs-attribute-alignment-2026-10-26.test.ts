/**
 * AYWEBs — LE NOM D'UN ATTRIBUT N'EST PAS SON IDENTITÉ (26/10/2026).
 *
 * ── Le symptôme mesuré ────────────────────────────────────────────────────
 * Même fiche Zalando (« REVOLUTION 8 », 64.95 EUR), taille 36 choisie à
 * l'écran, disponibilité affichée « Disponible » — et au clic :
 * « Choisissez toutes les options requises : le serveur refuse un ajout sans
 * choix explicite » (`VARIANT_REQUIRED`). La même fiche s'ajoutait depuis le
 * web.
 *
 * ── La cause ──────────────────────────────────────────────────────────────
 * `ayWebsSplitVariantSelection` comparait les noms d'attribut CARACTÈRE PAR
 * CARACTÈRE. La capture du navigateur publie le nom affiché par la page
 * (« Taille ») ; la lecture serveur publie le nom de la donnée (« size »).
 * `taille` n'étant pas « publié », la sélection partait en métadonnée, le choix
 * devenait VIDE côté serveur, et l'ajout était refusé.
 *
 * ── Ce que ce fichier verrouille ─────────────────────────────────────────
 *   1. `Taille` / `size` / `Größe` / `مقاس` = la même dimension, et la
 *      sélection alignée porte le nom PUBLIÉ par le serveur (sinon la clé de
 *      variante ne retrouve aucune variante) ;
 *   2. les VALEURS restent comparées exactement — aucune tolérance nouvelle ;
 *   3. une dimension inconnue (« matière ») reste une métadonnée d'affichage ;
 *   4. `taille` et `couleur` ne fusionnent jamais.
 */
import { describe, expect, it } from 'vitest';

import {
  ayWebsAlignAttributes,
  ayWebsAttributeDimension,
  ayWebsAttributeKey,
  ayWebsSameAttribute,
} from '../shared/aywebsAttributes';
import { ayWebsSplitVariantSelection, ayWebsVariantKey } from '../src/aywebs/productNormalizer';

/**
 * Produit « tel que le serveur le publie » : les groupes portent les noms de la
 * DONNÉE (`size`, `color`), les variantes aussi. Le test ne vérifie que
 * l'alignement des noms, donc les champs d'affichage restent neutres.
 */
const variant = (size: string, id: string) => ({
  sourceVariantId: id,
  attributes: { size, color: 'black/white' },
  label: `Taille ${size}`,
  price: 64.95,
  currency: 'EUR',
  available: true,
  availability: 'AVAILABLE' as const,
  availabilityReason: '',
  image: '',
});

const PRODUCT = {
  variantGroups: [
    { attribute: 'size', values: ['35.5', '36', '36.5'] },
    { attribute: 'color', values: ['black/white'] },
  ],
  variants: [variant('36', 'A-36'), variant('35.5', 'A-355')],
};

describe('dimensions : un nom, plusieurs langues', () => {
  it('reconnaît la même dimension sous ses autres noms', () => {
    for (const name of ['Taille', 'taille', 'size', 'Size', 'Größe', 'GROSSE', 'talla', 'taglia', 'مقاس', 'Size (EU)']) {
      expect(ayWebsAttributeDimension(name), name).toBe('size');
    }
    for (const name of ['Couleur', 'couleur', 'color', 'Colour', 'Farbe', 'colore', 'لون']) {
      expect(ayWebsAttributeDimension(name), name).toBe('color');
    }
  });

  it('ne confond pas une dimension inconnue avec taille ou couleur', () => {
    expect(ayWebsAttributeDimension('matière')).toBeNull();
    expect(ayWebsAttributeDimension('contenance')).toBeNull();
    expect(ayWebsSameAttribute('Taille', 'Couleur')).toBe(false);
    expect(ayWebsSameAttribute('matière', 'composition')).toBe(false);
    expect(ayWebsSameAttribute('matière', 'Matière')).toBe(true);
  });

  it('normalise accents, casse et séparateurs', () => {
    expect(ayWebsAttributeKey('  Größe ')).toBe('grosse');
    expect(ayWebsAttributeKey('Size_EU')).toBe('size eu');
  });
});

describe('la sélection envoyée par l’app est alignée sur les noms PUBLIÉS', () => {
  it('« Taille » (capture) retrouve « size » (lecture serveur)', () => {
    const { matching, metadata } = ayWebsSplitVariantSelection(PRODUCT, { taille: '36' });
    expect(matching).toEqual({ size: '36' });
    expect(metadata).toBeNull();
  });

  it('une sélection COMPLÈTE, nommée par la capture, retrouve la variante publiée', () => {
    /* C'est le cas qui échouait : la capture dit « Taille » + « Couleur », la
       lecture serveur publie « size » + « color ». La clé de variante doit
       tomber sur la variante réelle, sinon VARIANT_UNKNOWN. */
    const { matching } = ayWebsSplitVariantSelection(PRODUCT, { Taille: '36', Couleur: 'black/white' });
    const key = ayWebsVariantKey(matching);
    const variant = PRODUCT.variants.find((entry) => ayWebsVariantKey(entry.attributes) === key);
    expect(variant?.sourceVariantId).toBe('A-36');
  });

  it('deux dimensions alignées en même temps', () => {
    const { matching } = ayWebsSplitVariantSelection(PRODUCT, { Taille: '36', Couleur: 'black/white' });
    expect(matching).toEqual({ size: '36', color: 'black/white' });
    expect(ayWebsVariantKey(matching))
      .toBe(ayWebsVariantKey({ size: '36', color: 'black/white' }));
  });

  it('la VALEUR reste comparée exactement : aucune tolérance ajoutée', () => {
    const { matching } = ayWebsSplitVariantSelection(PRODUCT, { taille: '36 EU' });
    /* Le nom est reconnu (donc `matching` existe) mais la valeur ne correspond à
       aucune variante : le serveur répondra VARIANT_UNKNOWN, jamais un substitut. */
    expect(matching).toEqual({ size: '36 EU' });
    expect(ayWebsVariantKey(matching)).not.toBe(ayWebsVariantKey({ size: '36', color: 'black/white' }));
  });

  it('une dimension non publiée reste une métadonnée d’affichage', () => {
    const { matching, metadata } = ayWebsSplitVariantSelection(PRODUCT, { taille: '36', 'matière': 'tissu' });
    expect(matching).toEqual({ size: '36' });
    expect(metadata).toEqual({ 'matière': 'tissu' });
  });

  it('sans nom publié du tout, rien n’est inventé', () => {
    const { aligned, unmatched } = ayWebsAlignAttributes(['size'], { hauteur: '30 cm' });
    expect(aligned).toEqual({});
    expect(unmatched).toEqual({ hauteur: '30 cm' });
  });
});
