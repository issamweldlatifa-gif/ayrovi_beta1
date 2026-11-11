/** La cloche ouvre toujours l'écran visé (11/11) — fin des clics morts. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { notificationTarget } from '../client/src/admin/back-office/notificationTarget';

describe('cible d’une notification de la console', () => {
  it('lit `section` + identifiant (request, ticket, order)', () => {
    expect(notificationTarget('/admin?section=lens-requests&request=r1')).toEqual({ section: 'lens-requests', request: 'r1' });
    expect(notificationTarget('/admin?section=assistant-support&ticket=t1')).toEqual({ section: 'assistant-support', request: 't1' });
    expect(notificationTarget('/admin?section=crm-tasks')).toEqual({ section: 'crm-tasks' });
    expect(notificationTarget('/admin?section=aywebs-purchases&request=o9')).toEqual({ section: 'aywebs-purchases', request: 'o9' });
  });
  it('Commandes : le paramètre est un filtre de statut, jamais un identifiant', () => {
    expect(notificationTarget('/admin?section=orders&order=ord_1')).toEqual({ section: 'orders' });
    expect(notificationTarget('/admin/orders/ord_1')).toEqual({ section: 'orders' });
    expect(notificationTarget('/admin?tab=orders')).toEqual({ section: 'orders' });
  });
  it('refuse le vide, les autres origines et les chemins hors console', () => {
    expect(notificationTarget('')).toBeNull();
    expect(notificationTarget('https://evil.example/admin?section=users')).toBeNull();
    expect(notificationTarget('/compte/commandes/1')).toBeNull();
  });
  it('un achat AYWEBs payé prévient la console et ouvre la file', () => {
    const orders = readFileSync('src/aywebs/orders.ts', 'utf8');
    expect(orders).toContain("'Achat AYWEBs à effectuer'");
    expect(orders).toContain('/admin?section=aywebs-purchases&request=');
    expect(readFileSync('client/src/admin/back-office/NotificationsBell.tsx', 'utf8')).toContain('notificationTarget(');
  });
});
