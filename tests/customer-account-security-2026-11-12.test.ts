/**
 * Sécurité du compte client (12/11/2026) — audit M5 et faible n°5.
 *  • appareils connectés, fermeture d'un appareil, « tout déconnecter » ;
 *  • confirmation de l'adresse e-mail par code lié à la session du compte.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import express from 'express';
import request from 'supertest';
import { QatafoDatabase } from '../src/db/database';
import { createCustomerRouter } from '../src/customer/routes';
import { describeUserAgent, maskIp, sessionHandle } from '../src/customer/accountSecurity';

let db: QatafoDatabase;
let app: express.Express;
const password = 'Original-password-1!';

beforeEach(() => {
  db = new QatafoDatabase(':memory:');
  app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use('/api/customer', createCustomerRouter(db));
});
afterEach(() => { db.close(); });

async function register(email = 'customer@example.com') {
  const agent = request.agent(app);
  const result = await agent.post('/api/customer/auth/email/register')
    .set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36')
    .send({ email, password, displayName: 'Test Customer' });
  expect(result.status).toBe(200);
  return { agent, id: result.body.data.account.id as string, csrf: result.body.data.csrfToken as string };
}

async function loginFrom(userAgent: string, email = 'customer@example.com') {
  const agent = request.agent(app);
  const result = await agent.post('/api/customer/auth/email/login').set('user-agent', userAgent)
    .set('x-forwarded-for', '196.203.45.67').send({ email, password });
  expect(result.status).toBe(200);
  return { agent, csrf: result.body.data.csrfToken as string };
}

describe('outils purs', () => {
  test('libellé d’appareil lisible, jamais le User-Agent brut', () => {
    expect(describeUserAgent('okhttp/4.12.0')).toEqual({ platform: 'Android', client: 'Application ZAYROVI' });
    expect(describeUserAgent('ZAYROVI/57 CFNetwork/1568 Darwin/24.0.0')).toEqual({ platform: 'iPhone', client: 'Application ZAYROVI' });
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Version/18.0 Mobile Safari/604.1')).toEqual({ platform: 'iPhone', client: 'Safari' });
    expect(describeUserAgent('Mozilla/5.0 (Linux; Android 15) AppleWebKit Chrome/131 Mobile Safari/537.36')).toEqual({ platform: 'Android', client: 'Chrome' });
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/131 Safari/537.36 Edg/131')).toEqual({ platform: 'Windows', client: 'Edge' });
    expect(describeUserAgent('')).toEqual({ platform: 'Appareil inconnu', client: '' });
  });

  test('IP masquée (IPv4, IPv6, IPv4 mappée)', () => {
    expect(maskIp('196.203.45.67')).toBe('196.203.x.x');
    expect(maskIp('::ffff:10.0.0.12')).toBe('10.0.x.x');
    expect(maskIp('2a01:cb00:1234:5678::1')).toBe('2a01:cb00:…');
    expect(maskIp('')).toBe('');
  });
});

describe('appareils connectés et « tout déconnecter »', () => {
  test('liste : appareil courant marqué, poignée dérivée, IP masquée, rien de secret', async () => {
    const me = await register();
    await loginFrom('okhttp/4.12.0');
    const list = await me.agent.get('/api/customer/account/sessions');
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toContain('no-store');
    expect(list.body.data).toHaveLength(2);
    const [android] = list.body.data.filter((row: any) => row.platform === 'Android');
    expect(android).toMatchObject({ current: false, client: 'Application ZAYROVI', ipMasked: '196.203.x.x' });
    expect(list.body.data.filter((row: any) => row.current)).toHaveLength(1);
    const ids = db.all<any>('SELECT id FROM customer_sessions WHERE account_id=?', me.id).map((row) => row.id);
    const body = JSON.stringify(list.body);
    for (const id of ids) expect(body).not.toContain(id);
    expect(list.body.data.map((row: any) => row.handle).sort()).toEqual(ids.map(sessionHandle).sort());
  });

  test('fermer UN autre appareil ; l’appareil courant et un appareil d’autrui sont refusés', async () => {
    const me = await register();
    const phone = await loginFrom('okhttp/4.12.0');
    const stranger = await register('stranger@example.com');
    const list = (await me.agent.get('/api/customer/account/sessions')).body.data;
    const currentHandle = list.find((row: any) => row.current).handle;
    const phoneHandle = list.find((row: any) => !row.current).handle;
    expect((await me.agent.delete(`/api/customer/account/sessions/${phoneHandle}`)).status).toBe(403); // CSRF
    expect((await me.agent.delete(`/api/customer/account/sessions/${currentHandle}`).set('x-csrf-token', me.csrf)).body.code).toBe('SESSION_IS_CURRENT');
    expect((await stranger.agent.delete(`/api/customer/account/sessions/${phoneHandle}`).set('x-csrf-token', stranger.csrf)).status).toBe(404);
    expect((await me.agent.delete(`/api/customer/account/sessions/${phoneHandle}`).set('x-csrf-token', me.csrf)).status).toBe(200);
    expect((await phone.agent.get('/api/customer/auth/me')).status).toBe(401);
    expect((await me.agent.get('/api/customer/account/sessions')).body.data).toHaveLength(1);
  });

  test('logout-all garde l’appareil courant par défaut, ferme tout avec includeCurrent', async () => {
    const me = await register();
    const phone = await loginFrom('okhttp/4.12.0');
    const tablet = await loginFrom('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Safari/604.1');
    const stranger = await register('stranger@example.com');
    db.run(`INSERT INTO customer_native_handoffs (id,account_id,session_token,csrf_token,session_expires_at,expires_at,created_at)
      VALUES ('h1',?,'t','c','2999-01-01','2999-01-01','2026-11-12')`, me.id);

    const others = await me.agent.post('/api/customer/auth/logout-all').set('x-csrf-token', me.csrf).send({});
    expect(others.status).toBe(200);
    expect(others.body.data).toEqual({ revoked: 2, currentKept: true });
    expect((await phone.agent.get('/api/customer/auth/me')).status).toBe(401);
    expect((await tablet.agent.get('/api/customer/auth/me')).status).toBe(401);
    expect((await me.agent.get('/api/customer/account/sessions')).status).toBe(200);
    expect((await stranger.agent.get('/api/customer/account/sessions')).status).toBe(200);
    expect(db.get<any>('SELECT COUNT(*) n FROM customer_native_handoffs WHERE account_id=?', me.id).n).toBe(0);

    const all = await me.agent.post('/api/customer/auth/logout-all').set('x-csrf-token', me.csrf).send({ includeCurrent: true });
    expect(all.body.data).toEqual({ revoked: 1, currentKept: false });
    expect(String(all.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await me.agent.get('/api/customer/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/customer/auth/logout-all').send({})).status).toBe(401);
  });
});

describe('confirmation de l’adresse e-mail', () => {
  test('code envoyé à l’adresse du compte, accepté seulement dans sa session', async () => {
    const me = await register();
    const stranger = await register('stranger@example.com');
    expect((await me.agent.get('/api/customer/account/security')).body.data.emailVerified).toBe(false);

    const sent = await me.agent.post('/api/customer/account/email/verification/request').set('x-csrf-token', me.csrf).send({});
    expect(sent.status).toBe(201);
    const { challengeId, developmentCode, maskedEmail } = sent.body.data;
    expect(maskedEmail).not.toBe('customer@example.com');
    expect(developmentCode).toMatch(/^\d{6}$/);

    // Un autre compte ne peut pas consommer ce code (même juste).
    const foreign = await stranger.agent.post('/api/customer/account/email/verification/confirm').set('x-csrf-token', stranger.csrf).send({ challengeId, code: developmentCode });
    expect(foreign.body.code).toBe('EMAIL_VERIFY_EXPIRED');

    const wrong = await me.agent.post('/api/customer/account/email/verification/confirm').set('x-csrf-token', me.csrf)
      .send({ challengeId, code: developmentCode === '111111' ? '222222' : '111111' });
    expect(wrong.body.code).toBe('EMAIL_VERIFY_INVALID');

    const ok = await me.agent.post('/api/customer/account/email/verification/confirm').set('x-csrf-token', me.csrf).send({ challengeId, code: developmentCode });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ emailVerified: true });
    expect((await me.agent.get('/api/customer/account/security')).body.data.emailVerified).toBe(true);
    expect((await me.agent.post('/api/customer/account/email/verification/confirm').set('x-csrf-token', me.csrf).send({ challengeId, code: developmentCode })).body.code).toBe('EMAIL_VERIFY_EXPIRED');
    expect((await me.agent.post('/api/customer/account/email/verification/request').set('x-csrf-token', me.csrf).send({})).body.data).toEqual({ alreadyVerified: true });
    expect(db.get<any>('SELECT email_verified_at FROM customer_accounts WHERE id=?', stranger.id).email_verified_at).toBeNull();
  });

  test('adresse changée après l’envoi : l’ancien code ne confirme rien', async () => {
    const me = await register();
    const sent = await me.agent.post('/api/customer/account/email/verification/request').set('x-csrf-token', me.csrf).send({});
    const { challengeId, developmentCode } = sent.body.data;
    expect((await me.agent.put('/api/customer/account/profile').set('x-csrf-token', me.csrf).send({ displayName: 'Test Customer', email: 'new@example.com' })).status).toBe(200);
    const result = await me.agent.post('/api/customer/account/email/verification/confirm').set('x-csrf-token', me.csrf).send({ challengeId, code: developmentCode });
    expect(result.body.code).toBe('EMAIL_VERIFY_EXPIRED');
    expect(db.get<any>('SELECT email_verified_at FROM customer_accounts WHERE id=?', me.id).email_verified_at).toBeNull();
  });

  test('verrou après 5 essais, plafond de 3 demandes par compte', async () => {
    const me = await register();
    const sent = await me.agent.post('/api/customer/account/email/verification/request').set('x-csrf-token', me.csrf).send({});
    const { challengeId, developmentCode } = sent.body.data;
    const bad = developmentCode === '000000' ? '999999' : '000000';
    for (let i = 0; i < 5; i += 1) {
      await me.agent.post('/api/customer/account/email/verification/confirm').set('x-csrf-token', me.csrf).send({ challengeId, code: bad });
    }
    expect((await me.agent.post('/api/customer/account/email/verification/confirm').set('x-csrf-token', me.csrf).send({ challengeId, code: developmentCode })).body.code).toBe('EMAIL_VERIFY_LOCKED');
    expect((await me.agent.post('/api/customer/account/email/verification/request').set('x-csrf-token', me.csrf).send({})).status).toBe(201);
    expect((await me.agent.post('/api/customer/account/email/verification/request').set('x-csrf-token', me.csrf).send({})).status).toBe(201);
    expect((await me.agent.post('/api/customer/account/email/verification/request').set('x-csrf-token', me.csrf).send({})).body.code).toBe('EMAIL_VERIFY_RATE_LIMITED');
  });

  test('changer le mot de passe annule aussi les relais OAuth natifs en attente', async () => {
    const me = await register();
    db.run(`INSERT INTO customer_native_handoffs (id,account_id,session_token,csrf_token,session_expires_at,expires_at,created_at)
      VALUES ('h2',?,'t','c','2999-01-01','2999-01-01','2026-11-12')`, me.id);
    const changed = await me.agent.post('/api/customer/account/security/password').set('x-csrf-token', me.csrf)
      .send({ currentPassword: password, newPassword: 'Another-password-3!' });
    expect(changed.status).toBe(200);
    expect(db.get<any>('SELECT COUNT(*) n FROM customer_native_handoffs WHERE account_id=?', me.id).n).toBe(0);
  });
});
