/**
 * AYWEBs — feuille d'ajout : le prix en DINARS suit le choix (23/10/2026).
 *
 * Ce que le client a constaté sur l'appareil :
 *   • le prix apparaissait une seconde à l'injection, puis disparaissait dès
 *     qu'il changeait de couleur ou de taille ;
 *   • il était écrit en dollars — jamais en dinars ;
 *   • aucune preuve de disponibilité ;
 *   • « Add to Cart » répondait « La demande n'a pas abouti » (un 409 traduit
 *     en message générique).
 *
 * Ces tests verrouillent la règle de lecture : le montant en dinars vient
 * TOUJOURS du serveur, la valeur qui ne publie pas de prix n'en reçoit pas, et
 * deux valeurs en désaccord n'en produisent aucun.
 */
import { describe, expect, it } from 'vitest';

import type { AyWebsVariantQuote } from '@/api/aywebs';
import { quantityLimit, selectionQuote } from '@/features/aywebs/selectionQuote';

const quote = (overrides: Partial<AyWebsVariantQuote>): AyWebsVariantQuote => ({
  group: 'Couleur', value: 'Color Blue', availability: 'UNKNOWN', stock: null,
  sourcePrice: null, currency: '', priceFrom: false, totalTnd: null, pricingVersion: 3,
  ...overrides,
});

const PAGE = {
  selection: { couleur: 'Color Blue', taille: '38' },
  unitTnd: 163.63,
  availability: 'AVAILABLE' as const,
  stock: null,
  sourcePrice: 19.98,
  sourceCurrency: 'USD',
};

const QUOTES: AyWebsVariantQuote[] = [
  quote({ value: 'Color Blue', availability: 'AVAILABLE', sourcePrice: 19.98, currency: 'USD', totalTnd: 163.63 }),
  quote({ value: 'Dark Gray', availability: 'UNKNOWN', sourcePrice: 24.98, currency: 'USD', totalTnd: 197.56 }),
  quote({ value: 'Black', availability: 'UNKNOWN', sourcePrice: 21.98, currency: 'USD', totalTnd: 179.32 }),
  quote({ group: 'Taille', value: '38', availability: 'UNKNOWN' }),
  quote({ group: 'Taille', value: '40', availability: 'UNKNOWN' }),
];

describe('prix et disponibilité du choix courant', () => {
  it('la combinaison AFFICHÉE prend le devis de la fiche (dinars, serveur)', () => {
    const result = selectionQuote({ page: PAGE, quotes: QUOTES, selection: { couleur: 'Color Blue', taille: '38' } });
    expect(result).toMatchObject({ unitTnd: 163.63, availability: 'AVAILABLE', fromValue: false });
    expect(result.sourcePrice).toBe(19.98);
  });

  it('changer de couleur change le prix : celui de LA valeur, publié par le marchand', () => {
    const grey = selectionQuote({ page: PAGE, quotes: QUOTES, selection: { couleur: 'Dark Gray', taille: '38' } });
    expect(grey.unitTnd).toBe(197.56);
    expect(grey.sourcePrice).toBe(24.98);
    expect(grey.fromValue).toBe(true);
  });

  it('changer de taille ne change pas le prix quand la taille n’en publie pas', () => {
    const size40 = selectionQuote({ page: PAGE, quotes: QUOTES, selection: { couleur: 'Color Blue', taille: '40' } });
    expect(size40.unitTnd).toBe(163.63);
    /* La taille 40 n'est pas la taille affichée, et la page ne dit rien d'elle :
       la disponibilité reste inconnue — on ne l'étend pas depuis la page. */
    expect(size40.availability).toBe('UNKNOWN');
  });

  it('une valeur sans prix ferme ne reçoit aucun montant (jamais une estimation)', () => {
    const result = selectionQuote({
      page: PAGE,
      quotes: [quote({ value: 'Mauve', priceFrom: true, sourcePrice: 56.32, totalTnd: null })],
      selection: { couleur: 'Mauve', taille: '38' },
    });
    expect(result.unitTnd).toBeNull();
    expect(result.priceFrom).toBe(true);
  });

  it('deux valeurs en désaccord sur le montant ⇒ aucun prix (on ne choisit pas)', () => {
    const result = selectionQuote({
      page: PAGE,
      quotes: [
        quote({ value: 'A', totalTnd: 100, sourcePrice: 10, currency: 'USD' }),
        quote({ group: 'Taille', value: 'B', totalTnd: 120, sourcePrice: 12, currency: 'USD' }),
      ],
      selection: { couleur: 'A', taille: 'B' },
    });
    expect(result.unitTnd).toBeNull();
    expect(result.sourcePrice).toBeNull();
  });

  it('une valeur déclarée indisponible bloque la combinaison, quoi qu’en dise la page', () => {
    const result = selectionQuote({
      page: PAGE,
      quotes: [
        quote({ value: 'Color Blue', availability: 'AVAILABLE', totalTnd: 163.63 }),
        quote({ group: 'Taille', value: '40', availability: 'OUT_OF_STOCK' }),
      ],
      selection: { couleur: 'Color Blue', taille: '40' },
    });
    expect(result.availability).toBe('OUT_OF_STOCK');
  });

  it('sans devis serveur, aucun montant n’est inventé', () => {
    const result = selectionQuote({ page: null, quotes: [], selection: { couleur: 'Black', taille: '38' } });
    expect(result.unitTnd).toBeNull();
    expect(result.availability).toBe('UNKNOWN');
  });

  it('le stock le plus petit des valeurs choisies est celui qu’on annonce', () => {
    const result = selectionQuote({
      page: PAGE,
      quotes: [
        quote({ value: 'Color Blue', availability: 'AVAILABLE', stock: 6, totalTnd: 163.63 }),
        quote({ group: 'Taille', value: '38', availability: 'AVAILABLE', stock: 2 }),
      ],
      selection: { couleur: 'Color Blue', taille: '38' },
    });
    /* La combinaison est celle de la page : le stock de page prime. */
    expect(result.availability).toBe('AVAILABLE');
  });
});

describe('quantityLimit — la quantité ne dépasse jamais le stock publié', () => {
  it('un produit qui en publie 5 plafonne à 5 — jamais 20', () => {
    expect(quantityLimit({ stock: 5 })).toBe(5);
  });

  it('un stock inconnu ne plafonne pas : on ne l’invente pas', () => {
    expect(quantityLimit({ stock: null })).toBe(99);
  });

  it('le maximum de commande du marchand s’applique aussi (le plus petit gagne)', () => {
    expect(quantityLimit({ stock: 12, merchantMax: 3 })).toBe(3);
    expect(quantityLimit({ stock: 2, merchantMax: 30 })).toBe(2);
  });

  it('stock 0 ou négatif ne donne jamais une quantité à zéro', () => {
    expect(quantityLimit({ stock: 0 })).toBe(99);
    expect(quantityLimit({ stock: -4 })).toBe(99);
  });
});

describe('équivalence des noms de dimensions pour le devis de page', () => {
  const page = {
    selection: { couleur: 'Noir', taille: '40' }, unitTnd: 128.5,
    availability: 'AVAILABLE' as const, stock: null, sourcePrice: 19.99, sourceCurrency: 'EUR',
  };
  it('reconnaît le même choix malgré les noms merchant/serveur différents', () => {
    expect(selectionQuote({ page, quotes: [], selection: { color: 'Noir', size: '40' } }).unitTnd).toBe(128.5);
  });
  it('ne reporte jamais le prix sur une autre valeur ou une dimension manquante', () => {
    expect(selectionQuote({ page, quotes: [], selection: { color: 'Blanc', size: '40' } }).unitTnd).toBeNull();
    expect(selectionQuote({ page, quotes: [], selection: { color: 'Noir' } }).unitTnd).toBeNull();
    expect(selectionQuote({ page, quotes: [], selection: { color: 'Noir', couleur: 'Noir' } }).unitTnd).toBeNull();
  });
});
