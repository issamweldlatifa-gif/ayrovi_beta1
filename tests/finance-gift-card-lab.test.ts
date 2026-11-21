import { beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';

const endpoint = '/api/admin/finance/gift-card-specimens';
const author = request.agent(app);
const approver = request.agent(app);
const operator = request.agent(app);
let authorCsrf: string;
let approverCsrf: string;
let operatorCsrf: string;

beforeAll(async () => {
  const auth = await author.post('/api/admin/auth/login').send({ email: 'admin@zayrovi.com', password: 'ZayroviBeta2026!' });
  expect(auth.status).toBe(200);
  authorCsrf = auth.body.data.csrfToken;
  for (const [agent, role] of [[approver, 'ADMIN'], [operator, 'ORDER_MANAGER']] as const) {
    const email = `gift-lab-${role.toLowerCase()}@example.com`;
    const password = 'Test-gift-card-lab-372!';
    const create = await author.post('/api/admin/users').set('x-csrf-token', authorCsrf).send({ name: role, email, password, role });
    expect(create.status).toBe(201);
    const login = await agent.post('/api/admin/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    if (role === 'ADMIN') approverCsrf = login.body.data.csrfToken;
    else operatorCsrf = login.body.data.csrfToken;
  }
});

it('guards draft creation and one-time specimen generation without issuing any financial value', async () => {
  const input = { design: 'sunburst', format: 'physical', amount: '٢٥٫١٢٣' };
  expect((await request(app).get(endpoint)).status).toBe(401);
  expect((await operator.get(endpoint)).status).toBe(403);
  expect((await operator.post(endpoint).set('x-csrf-token', operatorCsrf).send(input)).status).toBe(403);
  expect((await author.post(endpoint).send(input)).status).toBe(403);
  for (const invalid of [{ ...input, amount: '24.999' }, { ...input, amount: 25 }, { ...input, design: 'orbit' }, { ...input, format: 'cash' }]) {
    expect((await author.post(endpoint).set('x-csrf-token', authorCsrf).send(invalid)).status).toBe(400);
  }
  const create = await author.post(endpoint).set('x-csrf-token', authorCsrf).send(input);
  expect(create.status).toBe(201);
  expect(create.body.data).toMatchObject({ status: 'DRAFT', amountMillimes: 25123, reviewedAt: null });
  expect(JSON.stringify(create.body)).not.toMatch(/DEMO-|fingerprint/);
  const id = create.body.data.id;
  const approvePath = `${endpoint}/${id}/approve`;
  const table = 'finance_gift_card_specimens';
  expect(db.get(`SELECT fingerprint FROM ${table} WHERE id=?`, id)).toEqual({ fingerprint: null });
  expect((await author.post(approvePath).set('x-csrf-token', authorCsrf)).status).toBe(403);
  expect((await operator.post(approvePath).set('x-csrf-token', operatorCsrf)).status).toBe(403);
  expect((await approver.post(approvePath)).status).toBe(403);
  const originalFinancialCounts = ['orders', 'payments', 'payment_transactions'].map(table => db.get(`SELECT COUNT(*) AS n FROM ${table}`));
  const attempts = await Promise.all([1, 2].map(() => approver.post(approvePath).set('x-csrf-token', approverCsrf)));
  expect(attempts.map(result => result.status).sort()).toEqual([200, 409]);
  const approved = attempts.find(result => result.status === 200)!;
  expect(approved.headers['cache-control']).toBe('private, no-store');
  const specimen = approved.body.data.specimen;
  expect(specimen).toMatch(/^DEMO-[0-9A-F]{32}$/);
  expect(approved.body.data.row).toMatchObject({ status: 'APPROVED', reviewedAt: expect.any(String) });
  const stored = db.get<{ fingerprint: string }>(`SELECT fingerprint FROM ${table} WHERE id=?`, id)!;
  expect(stored.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  const list = await author.get(endpoint);
  expect(list.body.data.rows).toContainEqual(approved.body.data.row);
  expect(JSON.stringify(list.body)).not.toMatch(/DEMO-|fingerprint/);
  const audit = db.all<{ action: string }>('SELECT action,old_value,new_value FROM audit_logs WHERE resource_type=? AND entity_id=? ORDER BY created_at', 'gift_card_specimen', id);
  expect(audit.map(row => row.action)).toEqual(['CREATE', 'ACCESS_DENIED', 'APPROVE']);
  expect(JSON.stringify(audit)).not.toContain(specimen);
  expect(JSON.stringify(audit)).not.toContain(stored.fingerprint);
  expect(['orders', 'payments', 'payment_transactions'].map(table => db.get(`SELECT COUNT(*) AS n FROM ${table}`))).toEqual(originalFinancialCounts);
});
