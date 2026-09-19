import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { QatafoDatabase } from '../src/db/database';
import { createCustomerRouter } from '../src/customer/routes';
import { enqueueWelcomeMail, processCustomerAuthMail, customerPublicOrigin } from '../src/customer/accountMail';
import { hashToken } from '../src/customer/auth';

let db: QatafoDatabase;
let app: express.Express;
let sent: Array<any>;
let transport: ReturnType<typeof vi.fn>;
const oldPassword = 'Original-password-1!';
const newPassword = 'Updated-password-2!';
const email = 'customer@example.com';
beforeEach(() => {
  vi.stubEnv('PUBLIC_BASE_URL', 'https://shop.example.com');
  vi.stubEnv('MAIL_PROVIDER', 'resend');
  vi.stubEnv('MAIL_API_KEY', 'test-not-real');
  vi.stubEnv('MAIL_FROM', 'AYROVI <no-reply@example.com>');
  db = new QatafoDatabase(':memory:');
  app = express(); app.use(express.json()); app.use('/api/customer', createCustomerRouter(db));
  sent = [];
  transport = vi.fn(async (_url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', {status: 200}); });
  vi.stubGlobal('fetch', transport);
});
afterEach(() => { db.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const register = (agent = request.agent(app), extra = {}) => agent.post('/api/customer/auth/email/register').send({displayName: 'Client <script>alert(1)</script>', email, password: oldPassword, ...extra});
const requestReset = (address = email, locale = 'fr') => request(app).post('/api/customer/auth/password/request').send({email: address, locale});
async function tokenFor(address = email, locale = 'fr') {
  expect((await requestReset(address, locale)).status).toBe(202);
  await processCustomerAuthMail(db);
  const message = [...sent].reverse().find(mail => mail.html.includes('/reset-password#token='));
  expect(message).toBeDefined();
  return message.html.match(/#token=([A-Za-z0-9_-]{43})/)[1] as string;
}
const check = (token: string) => request(app).post('/api/customer/auth/password/check').send({token});
const reset = (token: string, password = newPassword) => request(app).post('/api/customer/auth/password/reset').send({token, password});

describe('Customer welcome and password recovery', () => {
  test('registration enqueues one escaped/localized welcome, not on login; provider accepted then payload erased', async () => {
    const result = await register(undefined, {locale: 'ar'});
    expect(result.status).toBe(200);
    expect(transport).not.toHaveBeenCalled();
    const accountId = result.body.data.account.id;
    enqueueWelcomeMail(db, accountId);
    expect(db.get<any>('SELECT COUNT(*) n FROM customer_auth_mail_jobs').n).toBe(1);
    await processCustomerAuthMail(db);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('مرحبًا');
    expect(sent[0].html).toContain('&lt;script&gt;');
    expect(sent[0].html).not.toContain('<script>');
    expect(sent[0].html).not.toContain(oldPassword);
    expect(db.get<any>('SELECT status,payload FROM customer_auth_mail_jobs')).toMatchObject({status: 'SENT', payload: ''});
    expect((await request(app).post('/api/customer/auth/email/login').send({email,password:oldPassword})).status).toBe(200);
    await processCustomerAuthMail(db);
    expect(sent).toHaveLength(1);
  });
  test('unconfigured mail does not break registration, never fakes a reset send', async () => {
    vi.stubEnv('MAIL_API_KEY', '');
    expect((await register()).status).toBe(200);
    await processCustomerAuthMail(db);
    expect(transport).not.toHaveBeenCalled();
    expect(db.get<any>('SELECT status FROM customer_auth_mail_jobs').status).toBe('PENDING');
    expect((await request(app).get('/api/customer/auth/config')).body.data.passwordReset.enabled).toBe(false);
    expect((await requestReset()).status).toBe(503);
    expect((await requestReset('unknown@example.com')).status).toBe(503);
  });
  test('temporary provider failure is durable and retried with stable idempotency key', async () => {
    await register();
    transport.mockResolvedValueOnce(new Response('{}', {status: 503}));
    await processCustomerAuthMail(db);
    expect(db.get<any>('SELECT status,attempts FROM customer_auth_mail_jobs')).toMatchObject({status:'PENDING',attempts:1});
    db.run("UPDATE customer_auth_mail_jobs SET next_attempt_at='2000-01-01'");
    await processCustomerAuthMail(db);
    expect(db.get<any>('SELECT status FROM customer_auth_mail_jobs').status).toBe('SENT');
    expect(transport.mock.calls[0][1].headers['Idempotency-Key']).toBe(transport.mock.calls[1][1].headers['Idempotency-Key']);
  });
  test('end-to-end reset: hashed token, encrypted payload, no session/password in responses; single-use and all sessions revoked', async () => {
    const agent = request.agent(app);
    const created = await register(agent);
    const id = created.body.data.account.id;
    await request.agent(app).post('/api/customer/auth/email/login').send({email,password:oldPassword});
    expect(db.get<any>('SELECT COUNT(*) n FROM customer_sessions WHERE account_id=?',id).n).toBe(2);
    await requestReset();
    const queued = db.get<any>("SELECT payload FROM customer_auth_mail_jobs WHERE kind='PASSWORD_RESET'").payload;
    expect(queued).not.toContain('https:'); expect(queued).not.toContain(email);
    await processCustomerAuthMail(db);
    const token = sent.find(mail=>mail.html.includes('#token=')).html.match(/#token=([A-Za-z0-9_-]{43})/)[1];
    expect(db.get<any>('SELECT token_hash FROM customer_password_resets').token_hash).toBe(hashToken(token));
    expect((await check(token)).body).toEqual({success:true,data:{valid:true}});
    expect((await check(token)).status).toBe(200); // opening/scanning a link does not consume it
    expect((await reset(token)).status).toBe(200);
    expect(db.get<any>('SELECT COUNT(*) n FROM customer_sessions WHERE account_id=?',id).n).toBe(0);
    expect((await agent.get('/api/customer/auth/me')).status).toBe(401);
    expect((await reset(token)).status).toBe(400);
    expect((await check(token)).status).toBe(400);
    expect((await request(app).post('/api/customer/auth/email/login').send({email,password:oldPassword})).status).toBe(401);
    expect((await request(app).post('/api/customer/auth/email/login').send({email,password:newPassword})).status).toBe(200);
    expect(db.get<any>("SELECT count(*) n FROM customer_auth_mail_jobs WHERE kind='PASSWORD_CHANGED'").n).toBe(1);
  });
  test('unknown, blocked, and social-only accounts get identical responses without reset mail', async () => {
    const created = await register();
    const id = created.body.data.account.id;
    const unknown = await requestReset('unknown@example.com');
    db.run("UPDATE customer_accounts SET status='BLOCKED' WHERE id=?",id);
    expect((await requestReset()).body).toEqual(unknown.body);
    db.run("UPDATE customer_accounts SET status='ACTIVE',password_hash=NULL WHERE id=?",id);
    expect((await requestReset()).body).toEqual(unknown.body);
    expect(db.get<any>("SELECT COUNT(*) n FROM customer_auth_mail_jobs WHERE kind='PASSWORD_RESET'").n).toBe(0);
  });
  test('expiry, tampering, blocked account and changed email invalidate a link', async () => {
    const result=await register(); const id=result.body.data.account.id;
    const token=await tokenFor();
    expect((await check('x'.repeat(43))).status).toBe(400);
    db.run("UPDATE customer_accounts SET status='BLOCKED' WHERE id=?",id);
    expect((await check(token)).status).toBe(400);
    db.run("UPDATE customer_accounts SET status='ACTIVE',email='other@example.com' WHERE id=?",id);
    expect((await check(token)).status).toBe(400);
    db.run('UPDATE customer_accounts SET email=? WHERE id=?',email,id);
    db.run("UPDATE customer_password_resets SET expires_at='2000-01-01'");
    expect((await reset(token)).status).toBe(400);
  });
  test('validating password does not consume token; consuming one invalidates all outstanding links', async () => {
    await register();
    const first=await tokenFor(); const second=await tokenFor();
    expect(first).not.toBe(second);
    expect((await reset(first,'short')).status).toBe(400);
    expect((await reset(first,'x'.repeat(101))).status).toBe(400);
    expect((await check(first)).status).toBe(200);
    expect((await reset(second)).status).toBe(200);
    expect((await reset(first)).status).toBe(400);
  });
  test('per-address and IP limits apply to unknown addresses as well', async () => {
    for(let i=0;i<3;i++) expect((await requestReset('unknown@example.com')).status).toBe(202);
    expect((await requestReset('unknown@example.com')).status).toBe(429);
    for(let i=0;i<6;i++) expect((await requestReset(`unknown-${i}@example.com`)).status).toBe(202);
    expect((await requestReset('another@example.com')).status).toBe(429);
    expect(JSON.stringify(db.all('SELECT bucket FROM customer_auth_rate_limits'))).not.toContain('@');
  });
  test('rejects non-JSON and cross-origin POSTs and uses configured origin, never Host, for email links', async () => {
    await register();
    expect((await request(app).post('/api/customer/auth/password/request').type('form').send({email})).status).toBe(415);
    expect((await request(app).post('/api/customer/auth/password/request').set('Origin','https://evil.example').send({email})).status).toBe(403);
    expect((await request(app).post('/api/customer/auth/password/request').set('Host','evil.example').send({email})).status).toBe(202);
    await processCustomerAuthMail(db);
    expect(sent.find(mail=>mail.html.includes('#token=')).html).toContain('https://shop.example.com/reset-password#token=');
    expect(sent.find(mail=>mail.html.includes('#token=')).html).not.toContain('evil.example');
  });
  test('untrusted public origins fail readiness and expired jobs never send', async () => {
    for (const origin of ['http://shop.example.com','https://user:password@example.com','javascript:alert(1)','https://example.com/?redirect=evil','https://example.com/path']) {
      vi.stubEnv('PUBLIC_BASE_URL',origin); expect(customerPublicOrigin()).toBe('');
    }
    vi.stubEnv('PUBLIC_BASE_URL','https://shop.example.com');
    await register(); db.run("UPDATE customer_auth_mail_jobs SET expires_at='2000-01-01'");
    await processCustomerAuthMail(db); expect(transport).not.toHaveBeenCalled();
    expect(db.get<any>('SELECT status,payload FROM customer_auth_mail_jobs')).toMatchObject({status:'CANCELLED',payload:''});
  });
});
