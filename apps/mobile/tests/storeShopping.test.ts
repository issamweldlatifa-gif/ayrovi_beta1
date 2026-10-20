import { describe, expect, it } from 'vitest';
import type { AyWebsCart, AyWebsCartItem } from '../src/api/aywebs';
import type { AyroviCart, AyroviCartLine } from '../src/api/cart';
import type { Favorite } from '../src/api/account';
import {
  canonicalSourceUrl, isPageSaved, storeCartSections,
} from '../src/features/aywebs/storeShopping';

function awItem(overrides: Partial<AyWebsCartItem>): AyWebsCartItem {
  return {
    id: 'aw-1', itemNumber: '', productId: '', storeId: 'nike', storeName: 'Nike',
    sourceUrl: '', title: 'Joggers', images: [], unitPrice: 80, currency: 'TND',
    variantLabel: 'M / noir', quantity: 1, availability: '', status: 'ACTIVE',
    statusReason: '', customerNote: '', purchaseMode: '', checkoutReady: true,
    lineTotalTnd: null, linkedToAyrovi: null, createdAt: '', updatedAt: '',
    ...overrides,
  };
}

function awCart(items: AyWebsCartItem[]): AyWebsCart {
  return {
    hasCart: true, items, groups: [],
    totals: { units: items.length, productSubtotalTnd: null, currency: 'TND', blockedItems: 0, checkoutReady: true, unlinkedUnits: null },
    blockers: [],
  };
}

function ayLine(overrides: Partial<AyroviCartLine>): AyroviCartLine {
  return {
    id: 'ay-1', store: 'amazon', title: 'Tablette', imageUrl: '', sourceUrl: '', sourcePrice: 120,
    sourceCurrency: 'USD', quantity: 1, variant: '', customerNote: '', priceVerificationStatus: 'VERIFIED',
    priceTrust: '', priceTrustReason: '', priceTrustExpiresAt: '', availability: '', availabilityReason: '',
    lineTotalTND: 410, originalLineTotalTND: null, promoLabel: '', discountTND: null, updatedAt: '',
    ...overrides,
  };
}

function ayCart(items: AyroviCartLine[]): AyroviCart {
  return {
    sessionId: 's', serverNow: '', items, units: items.length, productSubtotalTND: 0,
    deliveryTND: 0, totalTND: 0, blockedIds: [],
  };
}

describe('storeCartSections — vues du panier', () => {
  const aywebs = awCart([
    awItem({ id: 'a', storeId: 'nike', storeName: 'Nike' }),
    awItem({ id: 'b', storeId: 'zara', storeName: 'Zara' }),
    awItem({ id: 'c', storeId: 'nike', storeName: 'Nike', title: 'T-shirt' }),
  ]);
  const ayrovi = ayCart([ayLine({ id: 'x', store: 'amazon' }), ayLine({ id: 'y', store: 'ayrovi', title: 'Shop' })]);

  it('« Ce magasin » ne garde que les lignes du magasin courant', () => {
    const sections = storeCartSections('thisStore', { aywebs, ayrovi, storeId: 'nike' });
    expect(sections).toHaveLength(1);
    expect(sections[0].storeKey).toBe('nike');
    expect(sections[0].rows.map((row) => row.id)).toEqual(['a', 'c']);
  });

  it('« Tous les magasins » regroupe les lignes AYWEBs par magasin', () => {
    const sections = storeCartSections('allStores', { aywebs, ayrovi, storeId: 'nike' });
    expect(sections.map((section) => section.storeKey)).toEqual(['nike', 'zara']);
    expect(sections[1].rows.map((row) => row.id)).toEqual(['b']);
  });

  it('« Lens & Shop » reprend le panier Ayrovi, regroupé par source', () => {
    const sections = storeCartSections('ayrovi', { aywebs, ayrovi, storeId: 'nike' });
    expect(sections.map((section) => section.storeKey)).toEqual(['amazon', 'ayrovi']);
  });

  it('le prix TND de la ligne passe avant le prix source', () => {
    const [section] = storeCartSections('ayrovi', { aywebs: null, ayrovi, storeId: 'nike' });
    expect(section.rows[0].priceText).toBe('410.00 TND');
  });

  it('sans prix TND, on affiche le prix source avec sa devise', () => {
    const cart = awCart([awItem({ lineTotalTnd: null, unitPrice: 25.5, currency: 'EUR' })]);
    const [section] = storeCartSections('allStores', { aywebs: cart, ayrovi: null, storeId: 'nike' });
    expect(section.rows[0].priceText).toBe('25.5 EUR');
  });

  it('sans panier chargé, rien à afficher (pas d’erreur)', () => {
    expect(storeCartSections('thisStore', { aywebs: null, ayrovi: null, storeId: 'nike' })).toEqual([]);
    expect(storeCartSections('ayrovi', { aywebs: null, ayrovi: null, storeId: 'nike' })).toEqual([]);
  });
});

describe('isPageSaved — la page est-elle déjà en favori ?', () => {
  const fav = (sourceUrl: string): Favorite => ({
    id: 'f', productId: '', sourceUrl, title: 'x', imageUrl: '', priceTnd: null, createdAt: '',
  });

  it('ignore le fragment et la barre finale', () => {
    expect(isPageSaved([fav('https://www.nike.com/t/joggers/')], 'https://www.nike.com/t/joggers#color=noir')).toBe(true);
  });

  it('une autre page n’est pas considérée enregistrée', () => {
    expect(isPageSaved([fav('https://www.nike.com/t/joggers')], 'https://www.nike.com/t/tshirt')).toBe(false);
  });

  it('la query compte : deux variantes d’URL restent deux pages', () => {
    expect(canonicalSourceUrl('https://a.com/p?id=1')).not.toBe(canonicalSourceUrl('https://a.com/p?id=2'));
  });

  it('pas d’adresse, pas de favori', () => {
    expect(isPageSaved([fav('https://a.com')], '')).toBe(false);
  });
});
