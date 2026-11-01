/**
 * AYWEBs — DEVIS PAR VALEUR (23/10/2026).
 *
 * La feuille d'ajout doit écrire, sous chaque couleur / taille / volume, son
 * prix en DINARS — et ce prix doit venir du serveur, jamais d'une règle de
 * trois côté application. Ces tests verrouillent les trois refus :
 *   • une valeur sans prix ferme publié n'obtient aucun montant ;
 *   • un « à partir de » n'est pas un prix ferme ;
 *   • sans preuve de prix + devise, aucun devis n'est publié.
 * Et l'état publié par la page (disponible / indisponible / inconnu) est
 * recopié tel quel — le silence ne devient jamais « disponible ».
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { calculatePrice } from '../src/services/pricing';
import { ayWebsVariantQuotes } from '../src/aywebs/variantQuotes';

const rules: PricingRules = {
  id: 'default', version: 3,
  rateEUR: 4, rateUSD: 4, rateGBP: 4.8, rateJPY: 0.0265,
  exchangeBufferPercent: 3, freightPerKgTND: 13, localDeliveryTND: 8,
  commissionPercent: 10, minimumCommissionTND: 0, rpdPercent: 3, rpdMinimumTND: 10,
  defaultTvaRate: 0.19, expressFeeTND: 15,
  categories: DEFAULT_CUSTOMS_CATEGORIES,
  updatedAt: new Date().toISOString(),
};

const GROUPS = [
  {
    name: 'Couleur',
    values: ['Color Blue', 'Dark Gray', 'Pink'],
    selected: ['Color Blue'],
    options: [
      { value: 'Color Blue', available: true, price: '$19.98', priceFrom: false, stock: null },
      { value: 'Dark Gray', available: null, price: '$24.98', priceFrom: false, stock: null },
      { value: 'Pink', available: null, price: '$56.32', priceFrom: true, stock: null },
    ],
  },
  {
    name: 'Taille',
    values: ['38', '40'],
    selected: ['38'],
    options: [
      { value: '38', available: null, price: null, priceFrom: false, stock: null },
      { value: '40', available: false, price: null, priceFrom: false, stock: null },
    ],
  },
];

const input = {
  groups: GROUPS,
  rules,
  product: { title: 'Pantalon de randonnée', price: 19.98, currency: 'USD' },
  quoteVerified: true,
};

describe('devis par valeur — le prix en dinars vient du serveur', () => {
  const quotes = ayWebsVariantQuotes(input);
  const find = (group: string, value: string) => quotes.find((entry) => entry.group === group && entry.value === value)!;

  it('chaque valeur publiée a une ligne — et une seule', () => {
    expect(quotes.map((entry) => `${entry.group}/${entry.value}`)).toEqual([
      'Couleur/Color Blue', 'Couleur/Dark Gray', 'Couleur/Pink', 'Taille/38', 'Taille/40',
    ]);
  });

  it('le montant en dinars est celui du moteur tarifaire, pas une règle de trois', () => {
    const blue = find('Couleur', 'Color Blue');
    const quote = calculatePrice(rules, 19.98, 'USD', { title: 'Pantalon de randonnée' });
    expect(blue.source_price).toBe(19.98);
    expect(blue.currency).toBe('USD');
    expect(blue.total_tnd).toBeCloseTo(quote!.totalTND, 3);
    expect(blue.pricing_version).toBe(quote!.pricingVersion);
  });

  it('une autre couleur a SON prix — la différence vient du marchand', () => {
    const grey = find('Couleur', 'Dark Gray');
    expect(grey.source_price).toBe(24.98);
    expect(grey.total_tnd).toBeGreaterThan(find('Couleur', 'Color Blue').total_tnd!);
  });

  it('« à partir de » n’obtient aucun montant ferme, mais reste signalé', () => {
    const pink = find('Couleur', 'Pink');
    expect(pink.price_from).toBe(true);
    expect(pink.total_tnd).toBeNull();
  });

  it('une valeur sans prix publié n’invente rien (la taille)', () => {
    expect(find('Taille', '38')).toMatchObject({ source_price: null, total_tnd: null, availability: 'UNKNOWN' });
  });

  it('l’état publié est recopié tel quel — le négatif gagne', () => {
    expect(find('Couleur', 'Color Blue').availability).toBe('AVAILABLE');
    expect(find('Couleur', 'Dark Gray').availability).toBe('UNKNOWN');
    expect(find('Taille', '40').availability).toBe('OUT_OF_STOCK');
  });

  it('sans preuve de prix + devise, aucun devis n’est publié', () => {
    const unverified = ayWebsVariantQuotes({ ...input, quoteVerified: false });
    expect(unverified.every((entry) => entry.total_tnd === null)).toBe(true);
    /* Le montant marchand reste visible : c'est un fait de la page. */
    expect(unverified.find((entry) => entry.value === 'Color Blue')!.source_price).toBe(19.98);
  });
});
