/**
 * Trois gestes que le support doit pouvoir faire SANS mentir :
 *   • fermer UN appareil (et pas tous) ;
 *   • enregistrer un remboursement, plafonné à ce qui a réellement été encaissé ;
 *   • donner au client un lien de facture qui fonctionne sur un téléphone.
 *
 * Un ERP qui refuse est préférable à un ERP qui affiche un chiffre faux : les
 * tests vérifient donc surtout les refus.
 */
import { beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app, db } from '../src/server';
import { sessionHandle } from '../src/customer/accountSecurity';

const admin = request.agent(app);
const customer = request.agent(app);
const secondDevice = request.agent(app);
const email = `refund-device-${Date.now()}@example.com`;
const password = 'Refund-device-1!';
let adminCsrf = '';
let customerCsrf = '';
let accountId = '';
let orderId = '';
let encashed = 0;

function createOrder(method: 'BANK_TRANSFER' | 'PENDING_SELECTION' = 'BANK_TRANSFER') {
  const now = new Date().toISOString();
  const sessionId = `rd-session-${randomUUID()}`;
  db.addItem(sessionId, {
    store: 'shein', url: `https://www.shein.com/vetement-p-${randomUUID()}.html`, title: 'Veste remboursable',
    imageUrl: '/uploads/product.jpg', sourcePrice: 50, sourceCurrency: 'EUR', priceTND: 200, quantity: 1,
  }, accountId);
  return db.createOrderFromCart(sessionId, {
    name: 'Client Remboursé', email, phone: `9${Math.floor(1000000 + Math.random() * 8999999)}`,
    governorate: 'Tunis', address: 'Tunis', paymentMethod: method, latitude: null, longitude: null,
    termsAcceptedAt: now, locale: 'fr-TN',
  }, accountId);
}

function markEncashed(id: string) {
  db.run("UPDATE payments SET status='PAID',confirmed_at=?,updated_at=? WHERE order_id=?", new Date().toISOString(), new Date().toISOString(), id);
  db.run("UPDATE orders SET status='CONFIRMED',payment_status='PAID',deposit_status='PAID',updated_at=? WHERE id=?", new Date().toISOString(), id);
  return Number(db.get<any>('SELECT amount_tnd FROM payments WHERE order_id=?', id)?.amount_tnd || 0);
}

beforeAll(async () => {
  const auth = await admin.post('/api/admin/auth/login').send({ email: 'admin@zayrovi.com', password: 'ZayroviBeta2026!' });
  expect(auth.status).toBe(200);
  adminCsrf = auth.body.data.csrfToken;

  const register = await customer.post('/api/customer/auth/email/register')
    .send({ email, password, displayName: 'Client Remboursé' });
  expect(register.status).toBe(200);
  accountId = register.body.data.account.id;
  customerCsrf = register.body.data.csrfToken;

  // Deuxième appareil du même client : il ne doit PAS être déconnecté par erreur.
  const second = await secondDevice.post('/api/customer/auth/login').send({ email, password });
  expect(second.status).toBe(200);

  orderId = createOrder().orderId;
  encashed = markEncashed(orderId);
  expect(encashed).toBeGreaterThan(0);
});

it('un remboursement partiel est plafonné et laisse le paiement inchangé', async () => {
  const partial = await admin.post(`/api/admin/orders/${orderId}/refunds`).set('x-csrf-token', adminCsrf)
    .send({ amountTnd: 10, method: 'BANK_TRANSFER', reference: 'VIR-1', reason: 'Article non conforme' });
  expect(partial.status).toBe(201);
  expect(partial.body.data.refund.refund_number).toMatch(/^RMB-\d{4}-\d+$/);
  expect(partial.body.data.refund.source).toBe('MANUAL');
  expect(partial.body.data.balance).toMatchObject({ refundedTnd: 10, encashedTnd: encashed });
  expect(partial.body.data.orderPaymentStatus).toBe('PAID');

  const detail = await admin.get(`/api/admin/orders/${orderId}`);
  expect(detail.status).toBe(200);
  expect(detail.body.data.refunds).toHaveLength(1);
  expect(detail.body.data.refundBalance.refundableTnd).toBeCloseTo(encashed - 10, 3);

  // Le client est prévenu, et sa préférence « Paiements » est respectée.
  const notice = db.get<any>("SELECT * FROM customer_notifications WHERE account_id=? AND title='Remboursement enregistré'", accountId);
  expect(notice).toBeTruthy();
  expect(notice.action_url).toBe(`/compte/commandes/${orderId}`);
});

it('dépasser l’encaissé, puis rembourser le solde, puis re-rembourser : refus explicites', async () => {
  const tooMuch = await admin.post(`/api/admin/orders/${orderId}/refunds`).set('x-csrf-token', adminCsrf)
    .send({ amountTnd: encashed, method: 'BANK_TRANSFER', reason: 'Trop' });
  expect(tooMuch.status).toBe(409);
  expect(tooMuch.body.code).toBe('REFUND_EXCEEDS_ENCASHED');

  const rest = encashed - 10;
  const settled = await admin.post(`/api/admin/orders/${orderId}/refunds`).set('x-csrf-token', adminCsrf)
    .send({ amountTnd: rest, method: 'CARD', reason: 'Solde' });
  expect(settled.status).toBe(201);
  expect(settled.body.data.orderPaymentStatus).toBe('REFUNDED');
  expect(settled.body.data.balance.refundableTnd).toBe(0);

  const again = await admin.post(`/api/admin/orders/${orderId}/refunds`).set('x-csrf-token', adminCsrf)
    .send({ amountTnd: 5, method: 'CARD', reason: 'Encore' });
  expect(again.status).toBe(409);
  expect(again.body.code).toBe('REFUND_ALREADY_SETTLED');
});

it('une commande sans encaissement ne peut pas être remboursée', async () => {
  const pending = createOrder('PENDING_SELECTION');
  const attempt = await admin.post(`/api/admin/orders/${pending.orderId}/refunds`).set('x-csrf-token', adminCsrf)
    .send({ amountTnd: 5, method: 'OTHER', reason: 'Rien reçu' });
  expect(attempt.status).toBe(409);
  expect(attempt.body.code).toBe('REFUND_NOTHING_ENCASHED');
  expect(db.all<any>('SELECT id FROM order_refunds WHERE order_id=?', pending.orderId)).toHaveLength(0);
});

it('le lien de facture est signé, borné dans le temps et lié à une seule facture', async () => {
  const notIssued = await customer.post(`/api/customer/account/orders/${orderId}/invoice/link`).set('x-csrf-token', customerCsrf);
  expect(notIssued.status).toBe(404);

  const now = new Date().toISOString();
  db.run("UPDATE orders SET invoice_number='INV-TEST-1',updated_at=? WHERE id=?", now, orderId);
  db.run(`INSERT INTO invoices (id,invoice_number,order_id,account_id,status,file_path,issued_at,created_at,updated_at)
    VALUES (?,?,?,?,'ISSUED',?,?,?,?)`, 'invoice_test_link', 'INV-TEST-1', orderId, accountId, '', now, now, now);

  const noPdf = await customer.post(`/api/customer/account/orders/${orderId}/invoice/link`).set('x-csrf-token', customerCsrf);
  expect(noPdf.status).toBe(409);
  expect(noPdf.body.code).toBe('INVOICE_PDF_NOT_READY');

  db.run("UPDATE invoices SET file_path=? WHERE id=?", '/tmp/does-not-exist.pdf', 'invoice_test_link');
  const link = await customer.post(`/api/customer/account/orders/${orderId}/invoice/link`).set('x-csrf-token', customerCsrf);
  expect(link.status).toBe(200);
  const url = String(link.body.data.url);
  expect(url).toMatch(/^\/api\/customer\/public\/invoices\/invoice_test_link\/\d{13}\./);

  // Sans session, le jeton reste la seule clé — et un jeton altéré est refusé.
  const tampered = await request(app).get(url.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')));
  expect(tampered.status).toBe(403);
  const expired = await request(app).get(`/api/customer/public/invoices/invoice_test_link/1${'a'.repeat(32)}`);
  expect([410, 403]).toContain(expired.status);
  const unknown = await request(app).get(`/api/customer/public/invoices/inconnu/${Date.now()}.${'a'.repeat(43)}`);
  expect(unknown.status).toBe(404);
});

it('le CRM ferme un seul appareil, l’autre continue de fonctionner', async () => {
  const before = await admin.get(`/api/admin/customer-accounts/${accountId}`);
  expect(before.status).toBe(200);
  expect(before.body.data.counts.devices).toBe(2);

  // La plus ancienne session est celle de l'inscription (premier agent) ; la
  // seconde vient de la connexion sur « l'autre appareil ».
  const target = db.get<any>('SELECT id FROM customer_sessions WHERE account_id=? ORDER BY created_at ASC LIMIT 1', accountId);
  expect(target?.id).toBeTruthy();
  const handle = sessionHandle(target.id);
  expect(before.body.data.devices.some((device: any) => device.handle === handle)).toBe(true);
  const revoke = await admin.delete(`/api/admin/customer-accounts/${accountId}/devices/${handle}`).set('x-csrf-token', adminCsrf);
  expect(revoke.status).toBe(200);
  expect(revoke.body.data.remainingSessions).toBe(1);

  // La session visée ne vaut plus rien…
  expect((await customer.get('/api/customer/auth/me')).status).toBe(401);

  // …l'autre appareil, si.
  expect((await secondDevice.get('/api/customer/auth/me')).status).toBe(200);
  expect((await admin.delete(`/api/admin/customer-accounts/${accountId}/devices/${handle}`).set('x-csrf-token', adminCsrf)).status).toBe(404);
});
