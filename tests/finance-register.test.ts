import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';

const path = '/api/admin/finance/transactions';
const admin = request.agent(app);
const operator = request.agent(app);
const content = request.agent(app);
let actorId: string;
let operatorId: string;

describe('Finance transaction register', () => {
  beforeAll(async () => {
    const auth = await admin.post('/api/admin/auth/login').send({ email: 'admin@zayrovi.com', password: 'ZayroviBeta2026!' });
    expect(auth.status).toBe(200);
    actorId = auth.body.data.user.id;
    for (const [agent, role] of [[operator, 'ORDER_MANAGER'], [content, 'CONTENT_MANAGER']] as const) {
      const email = `finance-${role.toLowerCase()}@example.com`;
      const password = 'Test-finance-register-839!';
      expect((await admin.post('/api/admin/users').set('x-csrf-token', auth.body.data.csrfToken)
        .send({ name: role, email, password, role })).status).toBe(201);
      const session = await agent.post('/api/admin/auth/login').send({ email, password });
      expect(session.status).toBe(200);
      if (role === 'ORDER_MANAGER') operatorId = session.body.data.user.id;
    }
    const now = new Date(Date.now() - 60_000).toISOString();
    db.run('INSERT INTO customers (id,name,phone,governorate,address,registered_at,updated_at) VALUES (?,?,?,?,?,?,?)', 'finance-customer', 'secret-name', '20000001', 'Tunis', 'secret-address', now, now);
    db.run(`INSERT INTO orders (id,order_number,customer_id,status,subtotal_tnd,total_tnd,pricing_snapshot,governorate,address,phone,created_at,updated_at)
      VALUES ('finance-order','AYR-123456','finance-customer','CONFIRMED',100,100,'{}','Tunis','secret-address','20000001',?,?)`, now, now);
    db.run(`INSERT INTO payments (id,order_id,method,status,amount_tnd,created_at,updated_at) VALUES ('finance-payment','finance-order','CARD','PAID',21.123,?,?)`, now, now);
    for (let i = 0; i < 29; i++) {
      const date = i < 27 ? now : new Date(Date.now() - (i === 27 ? 45 : 100) * 86_400_000).toISOString();
      const status = i % 2 ? 'FAILED' : 'PAID';
      db.run(`INSERT INTO payment_transactions (id,transaction_number,order_id,payment_id,provider,provider_reference,checkout_url,provider_payload,amount_tnd,status,created_at,updated_at,confirmed_at)
        VALUES (?,?,'finance-order','finance-payment','STRIPE',?,'https://secret.invalid','{"secret":true}',21.123,?,?,?,?)`,
        `finance-tx-${`${i}`.padStart(2, '0')}`, `TXN-2026-${100000 + i}`, `secret-${i}`, status, date, date, status === 'PAID' ? date : null);
    }
  });
  it('requires login and refuses operators and content roles; refusal audit identifies the authenticated actor', async () => {
    expect((await request(app).get(path)).status).toBe(401);
    expect((await operator.get(path)).status).toBe(403);
    expect((await content.get(path)).status).toBe(403);
    const denied = db.get<{ user_id: string }>("SELECT user_id FROM audit_logs WHERE action='ACCESS_DENIED' AND module='FINANCE' AND user_id=?", operatorId);
    expect(denied?.user_id).toBe(operatorId);
  });
  it('returns only projected data, consistent order for equal timestamps, fixed size and a capped period', async () => {
    const first = await admin.get(path);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(first.body.data.pagination).toEqual({ page: 1, pageSize: 25, total: 27, totalPages: 2 });
    expect(first.body.data.rows).toHaveLength(25);
    expect(first.body.data.rows[0]).toEqual({
      id: 'finance-tx-26', transactionNumber: 'TXN-2026-100026', orderId: 'finance-order', orderNumber: 'AYR-123456',
      provider: 'STRIPE', status: 'PAID', amountTnd: 21.123, createdAt: expect.any(String), confirmedAt: expect.any(String),
    });
    expect(JSON.stringify(first.body)).not.toContain('secret');
    const second = await admin.get(`${path}?page=2`);
    expect(second.body.data.rows.map((row: { id: string }) => row.id)).toEqual(['finance-tx-01', 'finance-tx-00']);
    expect((await admin.get(`${path}?days=90`)).body.data.pagination.total).toBe(28);
    expect((await admin.get(`${path}?reference=ayr-123456&status=FAILED`)).body.data.pagination.total).toBe(13);
  });
  it('rejects malformed filters and logs only access metadata, without emitting a payment mutation', async () => {
    for (const search of ['days=365', 'page=10001', 'page=1&page=2', 'status=OTHER', 'reference=A%25']) {
      expect((await admin.get(`${path}?${search}`)).status).toBe(400);
    }
    const exact = await admin.get(`${path}?reference=txn-2026-100012`);
    expect(exact.body.data.rows).toHaveLength(1);
    const audit = db.all<{ new_value: string }>("SELECT new_value FROM audit_logs WHERE module='FINANCE' AND action='ACCESS' AND user_id=?", actorId);
    expect(audit.some(row => JSON.parse(row.new_value).rowCount === 1)).toBe(true);
    expect(JSON.stringify(audit)).not.toMatch(/TXN|AYR|secret|STRIPE/);
    expect(db.get("SELECT id FROM erp_events WHERE resource_type='payment_transaction' AND event_name='payment_transaction.updated'")).toBeUndefined();
  });
});
