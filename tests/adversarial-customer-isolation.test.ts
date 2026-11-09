/** Bounded local adversarial HTTP tests. In-memory data only; no external target. */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import express from 'express';
import request from 'supertest';
import { QatafoDatabase } from '../src/db/database';
import { createCustomerRouter } from '../src/customer/routes';
import { createCustomerSession, hashToken } from '../src/customer/auth';

let db: QatafoDatabase;
let app: express.Express;
let alice: ReturnType<typeof createCustomerSession>;
let bob: ReturnType<typeof createCustomerSession>;
let aliceAddress: string;
let bobAddress: string;
const aliceId = 'pentest-local-alice';
const bobId = 'pentest-local-bob';
const body = { recipientName: 'Test recipient', phone: '98112233', governorate: 'Tunis', addressLine: 'LOCAL FIXTURE ONLY', isDefault: true };
const req = (method: 'get' | 'post' | 'put' | 'delete', url: string, actor = alice, csrf = actor.csrfToken) =>
  request(app)[method](url).set('Authorization', `Bearer ${actor.token}`).set('x-csrf-token', csrf);
const victim = () => db.get('SELECT * FROM customer_addresses WHERE id=?', bobAddress);

beforeAll(() => {
  db = new QatafoDatabase(':memory:');
  const now = new Date().toISOString();
  for (const id of [aliceId, bobId]) db.run("INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES (?,?,'ACTIVE',?,?)", id, id, now, now);
  app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/customer', createCustomerRouter(db));
});
afterAll(() => { db.close(); });
beforeEach(async () => {
  db.run('DELETE FROM customer_sessions WHERE account_id IN (?,?)', aliceId, bobId);
  db.run('DELETE FROM customer_addresses WHERE account_id IN (?,?)', aliceId, bobId);
  db.run("UPDATE customer_accounts SET status='ACTIVE',display_name=id WHERE id IN (?,?)", aliceId, bobId);
  alice = createCustomerSession(db, aliceId, { ip: '127.0.0.1', headers: {} } as any);
  bob = createCustomerSession(db, bobId, { ip: '127.0.0.1', headers: {} } as any);
  const a = await req('post', '/api/customer/account/addresses').send(body);
  const b = await req('post', '/api/customer/account/addresses', bob).send(body);
  expect([a.status, b.status]).toEqual([201, 201]);
  aliceAddress = a.body.data.id; bobAddress = b.body.data.id;
});

describe('cross-account object access over actual HTTP handlers', () => {
  test.each(['put', 'delete'] as const)('%s cannot change another account address, even with valid attacker CSRF', async method => {
    const before = victim();
    const result = await req(method, `/api/customer/account/addresses/${bobAddress}`).send({ ...body, addressLine: 'ATTACKER CHANGED' });
    expect(result.status).toBe(404);
    expect(victim()).toEqual(before);
    const legitimate = await req('get', '/api/customer/account/addresses', bob);
    expect(legitimate.body.data.map((v: any) => v.id)).toEqual([bobAddress]);
  });
  test('listing ignores forged account selectors in query and headers', async () => {
    const result = await req('get', `/api/customer/account/addresses?account_id=${bobId}&accountId=${bobId}`).set('x-account-id', bobId);
    expect(result.status).toBe(200);
    expect(result.body.data.map((v: any) => v.id)).toEqual([aliceAddress]);
  });
  test('mass-assigned owner fields cannot put an attacker address in the victim account', async () => {
    const before = victim();
    const result = await req('post', '/api/customer/account/addresses').send({ ...body, id: bobAddress, account_id: bobId, accountId: bobId, customerId: bobId });
    expect(result.status).toBe(201);
    expect(result.body.data.id).not.toBe(bobAddress);
    expect(result.body.data.account_id).toBe(aliceId);
    expect(victim()).toEqual(before);
  });
  test.each(["' OR 1=1--", "x'; DELETE FROM customer_addresses;--", '../account/profile', '%00', '" OR "1"="1'])('object identifier %s cannot broaden a query or mutate a victim', async value => {
    const before = victim();
    const result = await req('delete', `/api/customer/account/addresses/${encodeURIComponent(value)}`);
    expect([400, 404]).toContain(result.status);
    expect(victim()).toEqual(before);
    expect(db.get<any>('SELECT COUNT(*) n FROM customer_accounts WHERE id IN (?,?)', aliceId, bobId).n).toBe(2);
  });
  test('SQL-like text is stored only as literal data in the owned row', async () => {
    const attack = "Robert'); DROP TABLE customer_accounts;--";
    const result = await req('put', `/api/customer/account/addresses/${aliceAddress}`).send({ ...body, recipientName: attack });
    expect(result.status).toBe(200);
    expect(db.get<any>('SELECT recipient_name FROM customer_addresses WHERE id=?', aliceAddress).recipient_name).toBe(attack);
    expect(db.get<any>('SELECT COUNT(*) n FROM customer_accounts WHERE id IN (?,?)', aliceId, bobId).n).toBe(2);
  });
});

describe('CSRF and session replay attacks', () => {
  test.each(['missing', 'wrong', 'other-account', 'duplicate'] as const)('CSRF %s never changes an authenticated profile', async variant => {
    const before = db.get('SELECT * FROM customer_accounts WHERE id=?', aliceId);
    let call = request(app).put('/api/customer/account/profile').set('Authorization', `Bearer ${alice.token}`);
    if (variant === 'wrong') call = call.set('x-csrf-token', 'forged-csrf');
    if (variant === 'other-account') call = call.set('x-csrf-token', bob.csrfToken);
    if (variant === 'duplicate') call = call.set('x-csrf-token', `${alice.csrfToken}, ${bob.csrfToken}`);
    const result = await call.send({ displayName: 'UNAUTHORIZED CHANGE' });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('INVALID_CSRF');
    expect(db.get('SELECT * FROM customer_accounts WHERE id=?', aliceId)).toEqual(before);
  });
  test.each(['expired', 'revoked', 'blocked', 'deleted'] as const)('%s sessions cannot read or write even with their original CSRF', async state => {
    if (state === 'expired') db.run('UPDATE customer_sessions SET expires_at=? WHERE id=?', '2000-01-01T00:00:00.000Z', hashToken(alice.token));
    if (state === 'revoked') db.run('DELETE FROM customer_sessions WHERE id=?', hashToken(alice.token));
    if (state === 'blocked' || state === 'deleted') db.run('UPDATE customer_accounts SET status=? WHERE id=?', state.toUpperCase(), aliceId);
    const before = db.get('SELECT * FROM customer_addresses WHERE id=?', aliceAddress);
    expect((await req('get', '/api/customer/account/addresses')).status).toBe(401);
    expect((await req('delete', `/api/customer/account/addresses/${aliceAddress}`)).status).toBe(401);
    expect(db.get('SELECT * FROM customer_addresses WHERE id=?', aliceAddress)).toEqual(before);
  });
  test('logout revokes a mobile Bearer and its replay immediately', async () => {
    expect((await req('post', '/api/customer/auth/logout')).status).toBe(200);
    expect((await req('get', '/api/customer/account/addresses')).status).toBe(401);
    expect((await req('delete', `/api/customer/account/addresses/${aliceAddress}`)).status).toBe(401);
  });
  test.each(['random-token', "' OR 1=1--", 'x'.repeat(1024)])('forged session variant %# cannot authenticate', async token => {
    const result = await request(app).get('/api/customer/account/addresses').set('Authorization', `Bearer ${token}`);
    expect(result.status).toBe(401);
    expect(result.body).not.toHaveProperty('data');
  });
  test('a poisoned cookie cannot borrow valid Bearer CSRF to cross identities', async () => {
    const before = victim();
    const result = await req('delete', `/api/customer/account/addresses/${bobAddress}`).set('Cookie', `ayrovi_customer_session=${bob.token}`);
    expect(result.status).toBe(403);
    expect(victim()).toEqual(before);
  });
});

test('mass-assigned privilege and verification fields are ignored in profile writes', async () => {
  const before = db.get('SELECT * FROM customer_accounts WHERE id=?', bobId);
  const result = await req('put', '/api/customer/account/profile').send({
    displayName: 'Owned profile update', id: bobId, account_id: bobId,
    role: 'SUPER_ADMIN', isAdmin: true, status: 'DELETED', phone_verified_at: '2099-01-01', email_verified_at: '2099-01-01',
  });
  expect(result.status).toBe(200);
  const row = db.get<any>('SELECT * FROM customer_accounts WHERE id=?', aliceId);
  expect(row.status).toBe('ACTIVE');
  expect(row.phone_verified_at).toBeFalsy();
  expect(row.email_verified_at).toBeFalsy();
  expect(db.get('SELECT * FROM customer_accounts WHERE id=?', bobId)).toEqual(before);
});

test('eight overlapping cross-account mutations all fail without changing victim state', async () => {
  const before = victim();
  const calls = Array.from({ length: 8 }, (_, i) =>
    req(i % 2 ? 'put' : 'delete', `/api/customer/account/addresses/${bobAddress}`).send({ ...body, addressLine: `attack-${i}` }));
  const responses = await Promise.all(calls);
  expect(responses.map(result => result.status)).toEqual(Array(8).fill(404));
  expect(victim()).toEqual(before);
});
