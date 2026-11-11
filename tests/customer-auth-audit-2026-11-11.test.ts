/**
 * Audit du système de connexion — 11/11/2026 (docs/auth-audit-2026-11-11_AR.md).
 *
 * Chaque test verrouille un défaut RÉEL trouvé pendant l'audit :
 *   C1. un compte bloqué se débloquait seul par code SMS ;
 *   C2. le code e-mail « validait » un compte créé par un tiers avec l'adresse
 *       d'autrui (pré-appropriation) — le tiers gardait mot de passe et sessions ;
 *   H1. aucun plafond PAR ADRESSE sur la connexion e-mail (essais répartis sur
 *       des milliers d'IP) ;
 *   H2. Apple : `response_mode=query` refusé par Apple, et aucun lien avec le
 *       navigateur (CSRF de connexion) ;
 *   M1. `/auth/google/native` remettait le jeton de session dans le corps à un
 *       simple appel du site.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { QatafoDatabase } from '../src/db/database';
import { createCustomerRouter } from '../src/customer/routes';
import { createCustomerSession, hashToken } from '../src/customer/auth';
import { hashPassword } from '../src/customer/passwords';
import { generateKeyPairSync } from 'node:crypto';

// Vraie clé ES256 jetable : sans elle, l'ancien code échouait AVANT l'appel à
// Apple et le test de liaison au navigateur ne distinguait rien.
const APPLE_TEST_KEY = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  .privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

let db: QatafoDatabase;
let app: express.Express;
let ipCounter = 0;
/** Une IP neuve par appel : isole le plafond PAR ADRESSE du plafond par IP. */
const freshIp = () => `10.20.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;
const uid = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

beforeEach(() => {
  vi.stubEnv('PUBLIC_BASE_URL', 'https://shop.example.com');
  vi.stubEnv('CUSTOMER_AUTH_SECRET', 'test-customer-auth-secret-not-real-0001');
  db = new QatafoDatabase(':memory:');
  app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/customer', createCustomerRouter(db));
});

afterEach(() => { db.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function insertAccount(fields: Record<string, unknown>) {
  const now = new Date().toISOString();
  const id = `account_${uid()}`;
  const row = { display_name: 'Client', status: 'ACTIVE', created_at: now, updated_at: now, ...fields };
  const keys = Object.keys(row);
  db.run(`INSERT INTO customer_accounts (id,${keys.join(',')}) VALUES (?,${keys.map(() => '?').join(',')})`,
    id, ...keys.map((k) => (row as any)[k]));
  return id;
}

async function emailCodeLogin(email: string) {
  const ask = await request(app).post('/api/customer/auth/email-code/request')
    .set('x-forwarded-for', freshIp()).send({ email, locale: 'fr' });
  expect(ask.status).toBe(201);
  return request(app).post('/api/customer/auth/email-code/verify')
    .set('x-forwarded-for', freshIp()).set('x-ayrovi-client', 'mobile/2.0.0')
    .send({ challengeId: ask.body.data.challengeId, code: ask.body.data.developmentCode });
}

describe('C1 — un compte bloqué reste bloqué', () => {
  test('le code SMS ne lève plus le blocage décidé par l’administration', async () => {
    const phone = '+21622123456';
    const id = insertAccount({ phone, phone_verified_at: new Date().toISOString(), status: 'BLOCKED' });
    const ask = await request(app).post('/api/customer/auth/otp/request').send({ phone: '22123456' });
    expect(ask.status).toBe(201);
    const verify = await request(app).post('/api/customer/auth/otp/verify')
      .send({ challengeId: ask.body.data.challengeId, code: ask.body.data.developmentCode });
    expect(verify.status).toBe(403);
    expect(verify.body.code).toBe('ACCOUNT_BLOCKED');
    expect(db.get<any>('SELECT status FROM customer_accounts WHERE id=?', id).status).toBe('BLOCKED');
    expect(db.get<any>('SELECT COUNT(*) n FROM customer_sessions WHERE account_id=?', id).n).toBe(0);
  });

  test('un compte neuf ne peut pas absorber le compte bloqué via son numéro', async () => {
    const phone = '+21622654321';
    const blocked = insertAccount({ phone, phone_verified_at: new Date().toISOString(), status: 'BLOCKED' });
    const fresh = insertAccount({ email: `fresh.${uid()}@example.tn`, email_verified_at: new Date().toISOString() });
    const session = createCustomerSession(db, fresh, { ip: '127.0.0.1', headers: {} } as any);
    const ask = await request(app).post('/api/customer/auth/otp/request').send({ phone: '22654321' });
    const verify = await request(app).post('/api/customer/auth/otp/verify')
      .set('Authorization', `Bearer ${session.token}`).set('x-csrf-token', session.csrfToken)
      .send({ challengeId: ask.body.data.challengeId, code: ask.body.data.developmentCode });
    expect(verify.status).toBe(403);
    expect(db.get<any>('SELECT status FROM customer_accounts WHERE id=?', blocked).status).toBe('BLOCKED');
    expect(db.get<any>('SELECT phone FROM customer_accounts WHERE id=?', fresh).phone).toBeNull();
  });
});

describe('C2 — pré-appropriation par adresse e-mail non vérifiée', () => {
  test('compte à mot de passe seul : le propriétaire garde le compte, l’auteur perd tout accès', async () => {
    const email = `victime.${uid()}@example.tn`;
    const squatter = insertAccount({ email, password_hash: hashPassword('motdepasse-du-tiers') });
    const squatterSession = createCustomerSession(db, squatter, { ip: '127.0.0.1', headers: {} } as any);

    const verified = await emailCodeLogin(email);
    expect(verified.status).toBe(200);
    const row = db.get<any>('SELECT * FROM customer_accounts WHERE id=?', squatter);
    expect(row.email_verified_at).toBeTruthy();
    expect(row.password_hash).toBeNull();
    // L'ancienne session du tiers est révoquée ; seule la nouvelle survit.
    expect(db.get<any>('SELECT 1 FROM customer_sessions WHERE id=?', hashToken(squatterSession.token))).toBeUndefined();
    const login = await request(app).post('/api/customer/auth/email/login')
      .set('x-forwarded-for', freshIp()).send({ email, password: 'motdepasse-du-tiers' });
    expect(login.status).toBe(401);
  });

  test('compte portant un autre moyen de connexion : l’adresse lui est retirée, le propriétaire a un compte neuf', async () => {
    const email = `cible.${uid()}@example.tn`;
    const squatter = insertAccount({ email, phone: '+21698111222', phone_verified_at: new Date().toISOString() });
    const verified = await emailCodeLogin(email);
    expect(verified.status).toBe(200);
    expect(verified.body.data.account.id).not.toBe(squatter);
    expect(db.get<any>('SELECT email FROM customer_accounts WHERE id=?', squatter).email).toBeNull();
    const owner = db.get<any>('SELECT * FROM customer_accounts WHERE email=? COLLATE NOCASE', email);
    expect(owner.id).toBe(verified.body.data.account.id);
    expect(owner.email_verified_at).toBeTruthy();
  });

  test('adresse déjà vérifiée : comportement inchangé (même compte, mot de passe conservé)', async () => {
    const email = `fidele.${uid()}@example.tn`;
    const id = insertAccount({ email, email_verified_at: new Date().toISOString(), password_hash: hashPassword('motdepasse-fidele') });
    const verified = await emailCodeLogin(email);
    expect(verified.status).toBe(200);
    expect(verified.body.data.account.id).toBe(id);
    expect(db.get<any>('SELECT password_hash FROM customer_accounts WHERE id=?', id).password_hash).toBeTruthy();
  });
});

describe('H1 — plafond de connexion PAR ADRESSE', () => {
  test('10 échecs répartis sur 10 IP verrouillent l’adresse 15 minutes', async () => {
    const email = `stuffing.${uid()}@example.tn`;
    insertAccount({ email, email_verified_at: new Date().toISOString(), password_hash: hashPassword('le-vrai-motdepasse') });
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).post('/api/customer/auth/email/login')
        .set('x-forwarded-for', freshIp()).send({ email, password: `mauvais-${i}-motdepasse` });
      expect(res.status).toBe(401);
    }
    const locked = await request(app).post('/api/customer/auth/email/login')
      .set('x-forwarded-for', freshIp()).send({ email, password: 'le-vrai-motdepasse' });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('LOGIN_RATE_LIMITED');
  });

  test('une connexion réussie remet le compteur de l’adresse à zéro', async () => {
    const email = `reset.${uid()}@example.tn`;
    insertAccount({ email, email_verified_at: new Date().toISOString(), password_hash: hashPassword('le-bon-motdepasse') });
    for (let i = 0; i < 9; i += 1) {
      await request(app).post('/api/customer/auth/email/login').set('x-forwarded-for', freshIp()).send({ email, password: `faux-${i}-motdepasse` });
    }
    const ok = await request(app).post('/api/customer/auth/email/login').set('x-forwarded-for', freshIp()).send({ email, password: 'le-bon-motdepasse' });
    expect(ok.status).toBe(200);
    const again = await request(app).post('/api/customer/auth/email/login').set('x-forwarded-for', freshIp()).send({ email, password: 'encore-faux-motdepasse' });
    expect(again.status).toBe(401);
  });

  test('une adresse inconnue est aussi plafonnée (aucun oracle d’existence)', async () => {
    const email = `fantome.${uid()}@example.tn`;
    for (let i = 0; i < 10; i += 1) {
      await request(app).post('/api/customer/auth/email/login').set('x-forwarded-for', freshIp()).send({ email, password: `essai-${i}-motdepasse` });
    }
    const res = await request(app).post('/api/customer/auth/email/login').set('x-forwarded-for', freshIp()).send({ email, password: 'nimporte-quoi-1' });
    expect(res.status).toBe(429);
  });
});

describe('H2 — Apple : form_post et liaison au navigateur', () => {
  beforeEach(() => {
    vi.stubEnv('APPLE_CLIENT_ID', 'tn.ayrovi.signin');
    vi.stubEnv('APPLE_TEAM_ID', 'TEAMID1234');
    vi.stubEnv('APPLE_KEY_ID', 'KEYID12345');
    vi.stubEnv('APPLE_PRIVATE_KEY', APPLE_TEST_KEY);
  });

  test('le démarrage demande form_post et pose un cookie d’état', async () => {
    const res = await request(app).get('/api/customer/auth/apple/start');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get('response_mode')).toBe('form_post');
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('ayrovi_customer_apple_oauth='));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/customer\/auth\/apple/);
    expect(decodeURIComponent(cookie!.split(';')[0].split('=')[1])).toBe(location.searchParams.get('state'));
  });

  test('le retour POST d’Apple est relayé en 303 vers le GET (code et état seulement)', async () => {
    const state = 'S'.repeat(43);
    const res = await request(app).post('/api/customer/auth/apple/callback')
      .type('form').send({ code: 'c0de.abc-123', state, user: '{"name":{"firstName":"X"}}' });
    expect(res.status).toBe(303);
    const target = new URL(res.headers.location, 'https://shop.example.com');
    expect(target.pathname).toBe('/api/customer/auth/apple/callback');
    expect(target.searchParams.get('code')).toBe('c0de.abc-123');
    expect(target.searchParams.get('state')).toBe(state);
    expect(target.searchParams.has('user')).toBe(false);
  });

  test('un état valide présenté SANS le cookie du navigateur est refusé (CSRF de connexion)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const start = await request(app).get('/api/customer/auth/apple/start');
    const state = new URL(start.headers.location).searchParams.get('state')!;
    const res = await request(app).get('/api/customer/auth/apple/callback').query({ code: 'abc', state });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/?customerAuth=error');
    expect(fetchSpy).not.toHaveBeenCalled();
    // L'état est consommé : il ne peut pas être rejoué ensuite.
    expect(db.get<any>('SELECT 1 FROM customer_oauth_states WHERE id=?', hashToken(state))).toBeUndefined();
  });
});

describe('H2 — Apple : parcours complet', () => {
  beforeEach(() => {
    vi.stubEnv('APPLE_CLIENT_ID', 'tn.ayrovi.signin');
    vi.stubEnv('APPLE_TEAM_ID', 'TEAMID1234');
    vi.stubEnv('APPLE_KEY_ID', 'KEYID12345');
    vi.stubEnv('APPLE_PRIVATE_KEY', APPLE_TEST_KEY);
  });
  const idToken = (claims: Record<string, unknown>) =>
    `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;

  async function appleRoundTrip(claims: Record<string, unknown>) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id_token: idToken(claims) }), { status: 200 })));
    const start = await request(app).get('/api/customer/auth/apple/start');
    const state = new URL(start.headers.location).searchParams.get('state')!;
    const cookie = (start.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('ayrovi_customer_apple_oauth='))!.split(';')[0];
    const relay = await request(app).post('/api/customer/auth/apple/callback').type('form').send({ code: 'apple-code', state });
    return request(app).get(relay.headers.location).set('Cookie', cookie);
  }

  test('form_post → 303 → GET avec cookie : session ouverte', async () => {
    const res = await appleRoundTrip({
      iss: 'https://appleid.apple.com', aud: 'tn.ayrovi.signin', exp: Math.floor(Date.now() / 1000) + 600,
      sub: `apple-${uid()}`, email: `a.${uid()}@privaterelay.appleid.com`, email_verified: 'true',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('customerAuth=success');
    expect(String(res.headers['set-cookie'])).toContain('ayrovi_customer_session=');
  });

  test('un id_token destiné à une autre application est refusé', async () => {
    const res = await appleRoundTrip({
      iss: 'https://appleid.apple.com', aud: 'com.autre.app', exp: Math.floor(Date.now() / 1000) + 600, sub: `apple-${uid()}`,
    });
    expect(res.headers.location).toBe('/?customerAuth=error');
  });
});

describe('M1 — Google natif : pas de jeton dans le corps pour le site', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id-not-real');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret-not-real');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      aud: 'client-id-not-real', iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 600,
      sub: `g-${uid()}`, email: `g.${uid()}@example.tn`, email_verified: 'true', name: 'G',
    }), { status: 200 })));
  });

  test('un appel du site reçoit le cookie, jamais le jeton', async () => {
    const res = await request(app).post('/api/customer/auth/google/native').send({ idToken: 'a.b.c' });
    expect(res.status).toBe(200);
    expect(res.body.data.native_session_token).toBeUndefined();
    expect(res.body.data.session_token).toBeUndefined();
    expect(String(res.headers['set-cookie'])).toContain('ayrovi_customer_session=');
  });

  test('l’application déclarée reçoit session_token ; l’ancienne coque native_session_token', async () => {
    const mobile = await request(app).post('/api/customer/auth/google/native').set('x-ayrovi-client', 'mobile/2.0.0').send({ idToken: 'a.b.c' });
    expect(typeof mobile.body.data.session_token).toBe('string');
    const legacy = await request(app).post('/api/customer/auth/google/native').set('x-ayrovi-native', '1').send({ idToken: 'a.b.c' });
    expect(typeof legacy.body.data.native_session_token).toBe('string');
  });

  test('une identité Google rattachée à un compte bloqué est refusée en 403', async () => {
    const sub = 'g-blocked-subject';
    const blocked = insertAccount({ email: `blk.${uid()}@example.tn`, email_verified_at: new Date().toISOString(), status: 'BLOCKED' });
    db.run(`INSERT INTO customer_auth_identities (id,account_id,provider,provider_subject,created_at) VALUES (?,?,'GOOGLE',?,?)`,
      `identity_${uid()}`, blocked, sub, new Date().toISOString());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      aud: 'client-id-not-real', iss: 'accounts.google.com', exp: Math.floor(Date.now() / 1000) + 600,
      sub, email: `other.${uid()}@example.tn`, email_verified: true,
    }), { status: 200 })));
    const res = await request(app).post('/api/customer/auth/google/native').set('x-ayrovi-client', 'mobile/2.0.0').send({ idToken: 'a.b.c' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_BLOCKED');
    expect(db.get<any>('SELECT COUNT(*) n FROM customer_sessions WHERE account_id=?', blocked).n).toBe(0);
  });
});
