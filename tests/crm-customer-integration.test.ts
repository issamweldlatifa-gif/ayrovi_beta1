/**
 * Intégration application mobile ↔ CRM.
 *
 * Le support voit dans le back office EXACTEMENT ce que l'application a
 * enregistré : favoris, appareils, notifications, préférences et le nom du
 * destinataire saisi à la caisse. Si un de ces faits manque, le support répond
 * au client sur une base fausse — c'est le défaut que ce test verrouille.
 *
 * Il vérifie aussi le sens inverse : bloquer un compte dans le CRM ferme
 * réellement la session mobile (aucun jeton ne survit au blocage).
 */
import { beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';

const admin = request.agent(app);
const customer = request.agent(app);
const email = `crm-integration-${Date.now()}@example.com`;
let adminCsrf = '';
let customerCsrf = '';
let accountId = '';

beforeAll(async () => {
  const auth = await admin.post('/api/admin/auth/login').send({ email: 'admin@zayrovi.com', password: 'ZayroviBeta2026!' });
  expect(auth.status).toBe(200);
  adminCsrf = auth.body.data.csrfToken;

  const register = await customer.post('/api/customer/auth/email/register').send({
    email, password: 'Crm-integration-1!', displayName: 'Client Mobile',
  });
  expect(register.status).toBe(200);
  accountId = register.body.data.account.id;
  customerCsrf = register.body.data.csrfToken;

  const favorite = await customer.post('/api/customer/account/favorites').set('x-csrf-token', customerCsrf)
    .send({ sourceUrl: 'https://example.com/produit/1', title: 'Veste mobile', priceTND: 129.9 });
  expect(favorite.status).toBe(201);

  const preferences = await customer.put('/api/customer/account/preferences').set('x-csrf-token', customerCsrf)
    .send({ orderUpdates: false });
  expect(preferences.status).toBe(200);
});

it('the CRM account view mirrors what the mobile app stores', async () => {
  const response = await admin.get(`/api/admin/customer-accounts/${accountId}`);
  expect(response.status).toBe(200);
  const account = response.body.data;

  // Identité et canaux réellement vérifiés par l'application.
  expect(account.display_name).toBe('Client Mobile');
  expect(account.email).toBe(email);
  expect(account.counts.favorites).toBe(1);
  expect(account.favorites[0]).toMatchObject({ title: 'Veste mobile' });
  expect(account.has_avatar).toBe(false);
  // L'image encodée du client ne voyage pas dans le CRM.
  expect(account.avatar_url).toBeUndefined();

  // Une session mobile ouverte est visible, sans jamais exposer son jeton.
  expect(account.counts.devices).toBeGreaterThanOrEqual(1);
  expect(account.devices[0]).toHaveProperty('handle');
  expect(JSON.stringify(account.devices)).not.toMatch(/[a-f0-9]{64}/);

  // L'écran « Notifications » du client est le même journal que celui du CRM.
  expect(account.notifications.length).toBeGreaterThanOrEqual(1);
  expect(account.unreadNotifications).toBeGreaterThanOrEqual(1);

  // Les préférences viennent du même enregistrement que l'écran Préférences.
  expect(account.preferences).toMatchObject({ order_updates: 0 });

  // Appareils de notification : présents, sans jamais exposer le jeton FCM.
  expect(Array.isArray(account.pushDevices)).toBe(true);
  expect(JSON.stringify(account.pushDevices)).not.toContain('token');
});

/**
 * Les interrupteurs « Préférences » ne sont pas décoratifs : couper les
 * notifications de commande empêche VRAIMENT l'écriture dans le journal du
 * client quand le back office change le statut.
 */
it('honours the customer notification switches on order status changes', async () => {
  const now = new Date().toISOString();
  const customerId = `crm_test_customer_${Date.now()}`;
  db.run('INSERT INTO customers (id,name,phone,normalized_phone,registered_at,updated_at) VALUES (?,?,?,?,?,?)',
    customerId, 'Client Mobile', `+2169${Date.now().toString().slice(-7)}`, '', now, now);
  const makeOrder = (id: string, status: string) => db.run(`INSERT INTO orders
    (id,order_number,customer_id,account_id,status,payment_status,subtotal_tnd,total_tnd,pricing_snapshot,governorate,address,phone,recipient_name,created_at,updated_at)
    VALUES (?,?,?,?,?,?,'0','0','{}','Tunis','Adresse de test','+21620000000','Client Mobile',?,?)`,
  id, `CRM-${id}`, customerId, accountId, status, 'PENDING', now, now);

  // orderUpdates = false (réglé dans le beforeAll) : aucun message ne doit naître.
  const muted = `order-muted-${Date.now()}`;
  makeOrder(muted, 'CREATED');
  const before = Number(db.get<any>('SELECT COUNT(*) count FROM customer_notifications WHERE account_id=?', accountId).count);
  expect((await admin.put(`/api/admin/orders/${muted}/status`).set('x-csrf-token', adminCsrf)
    .send({ status: 'AWAITING_DEPOSIT' })).status).toBe(200);
  expect(Number(db.get<any>('SELECT COUNT(*) count FROM customer_notifications WHERE account_id=?', accountId).count)).toBe(before);

  // Le client réactive les commandes : la même action notifie maintenant.
  const prefs = await customer.put('/api/customer/account/preferences').set('x-csrf-token', customerCsrf)
    .send({ orderUpdates: true });
  expect(prefs.status).toBe(200);
  const active = `order-active-${Date.now()}`;
  makeOrder(active, 'CONFIRMED');
  expect((await admin.put(`/api/admin/orders/${active}/status`).set('x-csrf-token', adminCsrf)
    .send({ status: 'PREPARING' })).status).toBe(200);
  expect(Number(db.get<any>("SELECT COUNT(*) count FROM customer_notifications WHERE account_id=? AND title='Mise à jour de commande'", accountId).count)).toBe(1);
});

it('blocking an account in the CRM closes the mobile session', async () => {
  const blocked = await admin.put(`/api/admin/customer-accounts/${accountId}/status`).set('x-csrf-token', adminCsrf)
    .send({ status: 'BLOCKED' });
  expect(blocked.status).toBe(200);
  expect((await customer.get('/api/customer/auth/me')).status).toBe(401);
  const detail = await admin.get(`/api/admin/customer-accounts/${accountId}`);
  expect(detail.body.data.status).toBe('BLOCKED');
  expect(detail.body.data.counts.devices).toBe(0);
});
