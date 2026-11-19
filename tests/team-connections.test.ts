import { beforeAll, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { totpCode } from '../src/admin/totp';
import { createLoginThrottle } from '../src/admin/loginThrottle';

const adminEmail = 'admin@zayrovi.com';
const adminPassword = 'ZayroviBeta2026!';
const memberEmail = 'assigned-content@example.com';
const memberPassword = 'Test-Connected-member-31!';
const root = '/api/admin/connections';
const login = '/api/admin/auth/login';
const superAdmin = request.agent(app);
const member = request.agent(app);
let memberId: string;
let adminCsrf: string;
let memberCsrf: string;

async function enroll(agent: typeof member, csrf: string, password: string) {
  const setup = await agent.post('/api/admin/auth/2fa/setup').set('x-csrf-token', csrf).send({ password });
  expect(setup.status).toBe(200);
  const enabled = await agent.post('/api/admin/auth/2fa/enable').set('x-csrf-token', csrf).send({ otp: totpCode(setup.body.data.secret) });
  expect(enabled.status).toBe(200);
  return enabled.body.data.recoveryCodes[0];
}

describe('Connected workspaces', () => {
  beforeAll(async () => {
    const adminSession = await superAdmin.post(login).send({ email: adminEmail, password: adminPassword });
    expect(adminSession.status).toBe(200);
    adminCsrf = adminSession.body.data.csrfToken;
    const created = await superAdmin.post('/api/admin/users').set('x-csrf-token', adminCsrf)
      .send({ email: memberEmail, password: memberPassword, name: 'CMS Operator', role: 'CONTENT_MANAGER' });
    expect(created.status).toBe(201);
    memberId = created.body.data.id;
    const memberSession = await member.post(login).send({ email: memberEmail, password: memberPassword });
    expect(memberSession.status).toBe(200);
    memberCsrf = memberSession.body.data.csrfToken;
  });

  test('requires authentication, explicitly scoped assignment, CSRF and a session verified with the second factor', async () => {
    expect((await request(app).get(`${root}/access`)).status).toBe(401);
    expect((await member.get(`${root}/teams/cms`)).status).toBe(403);
    expect((await member.get(`${root}/members`).query({ email: memberEmail })).status).toBe(403);
    expect((await member.get(`${root}/access`)).body.data.teams).toEqual([]);
    expect((await member.get('/api/admin/dashboard')).body.data).toEqual({ scope: 'workspace' });
    expect((await member.get('/api/admin/notifications')).status).toBe(403);
    expect((await member.post('/api/admin/notifications/read-all').set('x-csrf-token', memberCsrf)).status).toBe(403);
    expect((await superAdmin.put(`${root}/members/${memberId}/cms`).send({ granted: true })).status).toBe(403);
    expect((await superAdmin.put(`${root}/members/${memberId}/cms`).set('x-csrf-token', adminCsrf).send({ granted: true })).body.code).toBe('CONNECTION_MFA_REQUIRED');
    const staleDevice = request.agent(app);
    expect((await staleDevice.post(login).send({ email: adminEmail, password: adminPassword })).status).toBe(200);
    const recovery = await enroll(superAdmin, adminCsrf, adminPassword);
    expect((await staleDevice.get('/api/admin/auth/me')).status).toBe(401);
    expect((await superAdmin.get(`${root}/access`)).body.data.mfa).toBe(false);
    expect((await superAdmin.post(login).send({ email: adminEmail, password: adminPassword })).body.code).toBe('TOTP_REQUIRED');
    const verified = await superAdmin.post(login).send({ email: adminEmail, password: adminPassword, otp: recovery });
    expect(verified.status).toBe(200);
    adminCsrf = verified.body.data.csrfToken;
    expect((await superAdmin.put(`${root}/members/${memberId}/finance`).set('x-csrf-token', adminCsrf).send({ granted: true })).status).toBe(400);
    expect((await superAdmin.put(`${root}/members/${memberId}/cms`).set('x-csrf-token', adminCsrf).send({ granted: true })).status).toBe(200);
    expect((await member.get(`${root}/access`)).body.data).toEqual({ teams: ['cms'], mfa: false, manage: false });
    expect((await member.get(`${root}/teams/cms`)).headers['cache-control']).toBe('private, no-store');
    expect((await member.get(`${root}/teams/finance`)).status).toBe(403);
    expect((await member.post(`${root}/teams/cms/cms-canva`).set('x-csrf-token', memberCsrf).send({ action: 'REQUEST' })).body.code).toBe('CONNECTION_MFA_REQUIRED');
  });

  test('only accepts registered tools and workflow actions; never accepts secrets, URLs or an active status', async () => {
    const recovery = await enroll(member, memberCsrf, memberPassword);
    const verified = await member.post(login).send({ email: memberEmail, password: memberPassword, otp: recovery });
    expect(verified.status).toBe(200);
    memberCsrf = verified.body.data.csrfToken;
    const endpoint = `${root}/teams/cms/cms-canva`;
    for (const payload of [{ action: 'REQUEST', apiKey: 'TEST-SECRET-MUST-NOT-PERSIST' }, { action: 'CONNECTED' }, { action: 'REQUEST', url: 'https://example.com' }]) {
      expect((await member.post(endpoint).set('x-csrf-token', memberCsrf).send(payload)).status).toBe(400);
    }
    expect((await member.post(`${root}/teams/cms/finance-bank`).set('x-csrf-token', memberCsrf).send({ action: 'REQUEST' })).status).toBe(400);
    expect((await member.post(endpoint).set('x-csrf-token', memberCsrf).send({ action: 'REQUEST' })).status).toBe(200);
    expect((await member.post(endpoint).set('x-csrf-token', memberCsrf).send({ action: 'APPROVE' })).status).toBe(403);
    expect((await superAdmin.post(endpoint).set('x-csrf-token', adminCsrf).send({ action: 'APPROVE' })).status).toBe(200);
    expect((await member.get(`${root}/teams/cms`)).body.data).toEqual([{ provider: 'cms-canva', status: 'APPROVED_FOR_SETUP', updatedAt: expect.any(String) }]);
    expect(JSON.stringify(db.all("SELECT new_value FROM audit_logs WHERE module='CONNECTIONS'"))).not.toContain('TEST-SECRET');
    expect((await superAdmin.put(`${root}/members/${memberId}/cms`).set('x-csrf-token', adminCsrf).send({ granted: false })).status).toBe(200);
    expect((await member.get(`${root}/teams/cms`)).status).toBe(403);
  });

  test('only an approved shipment lookup can call DHL; no customer secrets or payment payloads cross domains', async () => {
    const orderId = 'ship-verified-order';
    const now = new Date().toISOString();
    db.run('INSERT INTO customers (id,name,phone,governorate,address,registered_at,updated_at) VALUES (?,?,?,?,?,?,?)', 'ship-verified-client', 'Private Name', '22000005', 'Tunis', 'Private Address', now, now);
    db.run('INSERT INTO customer_accounts (id,password_hash,created_at,updated_at) VALUES (?,?,?,?)', 'ship-verified-account', 'private-test-password-hash', now, now);
    db.run(`INSERT INTO orders (id,order_number,customer_id,account_id,status,subtotal_tnd,total_tnd,pricing_snapshot,governorate,address,phone,created_at,updated_at,invoice_path)
      VALUES (?,'AYR-889977','ship-verified-client','ship-verified-account','SHIPPED',50,50,'{}','Tunis','Private Address','22000005',?,?,'private-test-path')`, orderId, now, now);
    db.run(`INSERT INTO deliveries (id,order_id,governorate,address,phone,status,carrier,tracking_number,created_at,updated_at)
      VALUES ('ship-verified-delivery',?,'Tunis','Private Address','22000005','SHIPPED','DHL Express','TRACK-5678',?,?)`, orderId, now, now);
    db.run(`INSERT INTO payments (id,order_id,status,amount_tnd,reference,created_at,updated_at) VALUES ('payment-private',?,'PAID',10,'private-test-bank-ref',?,?)`, orderId, now, now);
    db.run(`INSERT INTO payment_transactions (id,transaction_number,payment_id,order_id,provider,provider_reference,checkout_url,provider_payload,amount_tnd,status,created_at,updated_at)
      VALUES ('trx-private','TXN-889977','payment-private',?,'STRIPE','private-test-provider-ref','https://private-test-url.invalid','{"secret":"private-test-payload"}',10,'PAID',?,?)`, orderId, now, now);
    expect(JSON.stringify((await superAdmin.get('/api/admin/customers/ship-verified-client')).body)).not.toContain('private-test-');
    expect(JSON.stringify((await superAdmin.get(`/api/admin/orders/${orderId}`)).body)).not.toContain('private-test-');
    const post = () => superAdmin.post(`/api/admin/orders/${orderId}/dhl-status`).set('x-csrf-token', adminCsrf);
    expect((await post()).status).toBe(409);
    const upstream = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ shipments: [{ id:'TRACK-5678', service:'express', status: { statusCode:'delivered', description:'not disclosed' } }] }), { headers: { 'content-type':'application/json' } }));
    vi.stubEnv('ZAYROVI_DHL_TRACKING_ENABLED', 'true');
    vi.stubEnv('ZAYROVI_DHL_TRACKING_API_KEY', 'example-fixture-key');
    vi.stubGlobal('fetch', upstream);
    try {
      expect((await post()).status).toBe(409);
      expect(upstream).not.toHaveBeenCalled();
      const connector = `${root}/teams/erp/erp-dhl-tracking`;
      expect((await superAdmin.post(connector).set('x-csrf-token', adminCsrf).send({ action: 'REQUEST' })).status).toBe(200);
      expect((await superAdmin.post(connector).set('x-csrf-token', adminCsrf).send({ action: 'APPROVE' })).status).toBe(200);
      expect((await member.post(`/api/admin/orders/${orderId}/dhl-status`).set('x-csrf-token', memberCsrf)).status).toBe(403);
      expect((await post().send({ reference:'another-reference' })).status).toBe(400);
      expect((await superAdmin.get(`/api/admin/orders/${orderId}`)).body.data.dhlTrackingAvailable).toBe(true);
      expect((await post()).body.data).toEqual({ status: 'delivered', observedAt: null });
      expect(upstream).toHaveBeenCalledTimes(1);
      expect((await post()).status).toBe(429);
      expect(db.get('SELECT status FROM orders WHERE id=?', orderId)).toEqual({ status:'SHIPPED' });
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });

});

describe('Login abuse controls', () => {
  test('limits a distributed target and an abusive address with independent budgets and expiry', () => {
    const limit = createLoginThrottle();
    for (let index = 0; index < 12; index++) limit.failure(`network-${index}`, 'target@example.com', 1);
    expect(limit.wait('new-address', 'target@example.com', 1)).toBe(900);
    expect(limit.wait('new-address', 'other@example.com', 1)).toBe(0);
    for (let index = 0; index < 8; index++) limit.failure('bad-address', `different-${index}@example.com`, 1);
    expect(limit.wait('bad-address', 'unrelated@example.com', 1)).toBe(900);
    expect(limit.wait('bad-address', 'target@example.com', 900_001)).toBe(0);
  });
  test('refuses cross-site browser login and does not cache the answer', async () => {
    const response = await request(app).post(login).set('Sec-Fetch-Site', 'cross-site').send({ email: memberEmail, password: memberPassword });
    expect(response.status).toBe(403);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
