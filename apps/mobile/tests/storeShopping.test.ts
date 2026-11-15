import { describe, expect, it } from 'vitest';
import type { AyWebsCart, AyWebsCartItem } from '../src/api/aywebs';
import type { ZayroviCart, ZayroviCartLine } from '../src/api/cart';
import type { Favorite } from '../src/api/account';
import {
  canonicalSourceUrl, isPageSaved, pendingAyWebsLines, pendingAyWebsUnits, storeCartSections,
} from '../src/features/aywebs/storeShopping';

function awItem(overrides: Partial<AyWebsCartItem>): AyWebsCartItem {
  return {
    id: 'aw-1', itemNumber: '', productId: '', storeId: 'nike', storeName: 'Nike',
    sourceUrl: '', title: 'Joggers', images: [], unitPrice: 80, currency: 'TND',
    variantLabel: 'M / noir', quantity: 1, availability: '', status: 'ACTIVE',
    statusReason: '', customerNote: '', purchaseMode: '', checkoutReady: true,
    lineTotalTnd: null, linkedToZayrovi: null, createdAt: '', updatedAt: '',
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

function ayLine(overrides: Partial<ZayroviCartLine>): ZayroviCartLine {
  return {
    id: 'ay-1', store: 'amazon', title: 'Tablette', imageUrl: '', sourceUrl: '', sourcePrice: 120,
    sourceCurrency: 'USD', quantity: 1, variant: '', customerNote: '', priceVerificationStatus: 'VERIFIED',
    priceTrust: '', priceTrustReason: '', priceTrustExpiresAt: '', availability: '', availabilityReason: '',
    lineTotalTND: 410, originalLineTotalTND: null, promoLabel: '', discountTND: null, updatedAt: '',
    ...overrides,
  };
}

function ayCart(items: ZayroviCartLine[]): ZayroviCart {
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
  const zayrovi = ayCart([ayLine({ id: 'x', store: 'amazon' }), ayLine({ id: 'y', store: 'zayrovi', title: 'Shop' })]);

  it('« Ce magasin » ne garde que les lignes du magasin courant', () => {
    const sections = storeCartSections('thisStore', { aywebs, zayrovi, storeId: 'nike' });
    expect(sections).toHaveLength(1);
    expect(sections[0].storeKey).toBe('nike');
    expect(sections[0].rows.map((row) => row.id)).toEqual(['a', 'c']);
  });

  it('« Tous les magasins » regroupe les lignes AYWEBs par magasin', () => {
    const sections = storeCartSections('allStores', { aywebs, zayrovi, storeId: 'nike' });
    expect(sections.map((section) => section.storeKey)).toEqual(['nike', 'zara']);
    expect(sections[1].rows.map((row) => row.id)).toEqual(['b']);
  });

  it('« Lens & Shop » reprend le panier Zayrovi, regroupé par source', () => {
    const sections = storeCartSections('zayrovi', { aywebs, zayrovi, storeId: 'nike' });
    expect(sections.map((section) => section.storeKey)).toEqual(['amazon', 'zayrovi']);
  });

  it('le prix TND de la ligne passe avant le prix source', () => {
    const [section] = storeCartSections('zayrovi', { aywebs: null, zayrovi, storeId: 'nike' });
    expect(section.rows[0].priceText).toBe('410.00 TND');
  });

  it('sans prix TND, on affiche le prix source avec sa devise', () => {
    const cart = awCart([awItem({ lineTotalTnd: null, unitPrice: 25.5, currency: 'EUR' })]);
    const [section] = storeCartSections('allStores', { aywebs: cart, zayrovi: null, storeId: 'nike' });
    expect(section.rows[0].priceText).toBe('25.5 EUR');
  });

  it('sans panier chargé, rien à afficher (pas d’erreur)', () => {
    expect(storeCartSections('thisStore', { aywebs: null, zayrovi: null, storeId: 'nike' })).toEqual([]);
    expect(storeCartSections('zayrovi', { aywebs: null, zayrovi: null, storeId: 'nike' })).toEqual([]);
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

describe('lignes AYWEBs en attente de liaison (23/10/2026)', () => {
  it('seules les lignes que le serveur dit NON liées sont en attente', () => {
    const items = [
      awItem({ id: 'a', linkedToZayrovi: true }),
      awItem({ id: 'b', linkedToZayrovi: false }),
      /* `null` = le serveur n'a rien dit : ni liée, ni « perdue ». */
      awItem({ id: 'c', linkedToZayrovi: null }),
    ];
    expect(pendingAyWebsLines(items).map((item) => item.id)).toEqual(['b']);
  });

  it('les unités en attente s’additionnent (le client voit le nombre réel)', () => {
    const items = [
      awItem({ id: 'a', linkedToZayrovi: false, quantity: 2 }),
      awItem({ id: 'b', linkedToZayrovi: false, quantity: 3 }),
      awItem({ id: 'c', linkedToZayrovi: true, quantity: 4 }),
    ];
    expect(pendingAyWebsUnits(items)).toBe(5);
  });

  it('panier vide ou tout lié ⇒ rien à signaler', () => {
    expect(pendingAyWebsLines([])).toEqual([]);
    expect(pendingAyWebsUnits([awItem({ linkedToZayrovi: true, quantity: 2 })])).toBe(0);
  });
});
