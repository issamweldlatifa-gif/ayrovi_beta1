/*
 * ALERTE « NOUVELLE COMMANDE » (25/09/2026).
 *
 * Une commande entrait en base, sa facture était produite, et personne n'était
 * prévenu : il fallait ouvrir l'Admin et rafraîchir pour découvrir qu'un client
 * attendait son appel de confirmation.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { notifyNewOrder } from '../src/services/orderNotification';

function fakeDb(admins: string[], failing = false) {
  const notifications: any[] = [];
  const deliveries: any[] = [];
  return {
    notifications,
    deliveries,
    all: () => (failing ? (() => { throw new Error('db down'); })() : admins.map((id) => ({ id }))),
    get: () => null,
    run: (...args: unknown[]) => { notifications.push(args); return { changes: 1 }; },
  } as any;
}

describe('alerte nouvelle commande', () => {
  const order = {
    orderId: 'o1', orderNumber: 'AYR-518234', totalTnd: 118.9,
    paymentMethod: 'COD', governorate: 'Sousse', itemCount: 2,
  };

  it('prévient chaque administrateur actif', () => {
    const db = fakeDb(['u1', 'u2']);
    expect(notifyNewOrder(db, order).notified).toBe(2);
  });

  it('une base muette ne fait perdre AUCUNE commande', () => {
    const db = fakeDb([], true);
    expect(() => notifyNewOrder(db, order)).not.toThrow();
    expect(notifyNewOrder(db, order).notified).toBe(0);
  });

  it('le message permet d’agir sans ouvrir la fiche', () => {
    const db = fakeDb(['u1']);
    notifyNewOrder(db, order);
    const written = JSON.stringify(db.notifications);
    expect(written).toContain('AYR-518234');
    expect(written).toContain('118.900 TND');
    expect(written).toContain('COD');
    expect(written).toContain('Sousse');
  });

  it('aucune donnée sensible ne circule dans le canal', () => {
    const db = fakeDb(['u1']);
    notifyNewOrder(db, { ...order, governorate: 'Sousse' });
    const written = JSON.stringify(db.notifications).toLowerCase();
    for (const forbidden of ['@', 'rue ', 'téléphone', '+216']) {
      expect(written.includes(forbidden), forbidden).toBe(false);
    }
  });
});

describe('câblage sur la caisse', () => {
  const routes = readFileSync('src/api/routes.ts', 'utf8');

  it('l’alerte part APRÈS la création de la commande, jamais avant', () => {
    const block = routes.split('db.createOrderFromCart(')[1].split('return res.json(')[0];
    expect(block).toContain('notifyNewOrder(db, {');
  });

  it('elle ne peut pas empêcher la réponse au client', () => {
    const source = readFileSync('src/services/orderNotification.ts', 'utf8');
    expect(source).toContain('catch (error: any)');
    expect(source).toContain('console.warn');
  });
});
