/**
 * Connexion par fournisseur DANS l'application — remise de session (04/10/2026).
 *
 * Le défaut d'origine : dans l'APK, « Continuer avec Google » ouvrait un lien
 * RELATIF depuis `https://localhost` (paquet Capacitor) → 404. Le correctif
 * ouvre le flux dans le navigateur système ; la session doit donc revenir à
 * l'application par un canal explicite.
 *
 * Ce test exerce le VRAI routeur HTTP, pas une simulation :
 *   1. `/auth/google/start` accepte `nativeHandoff` et refuse de sortir en 404 ;
 *   2. `/auth/native/claim` répond 404 HANDOFF_PENDING tant que rien n'a abouti ;
 *   3. une fois la remise déposée, il rend la session UNE SEULE FOIS ;
 *   4. le jeton rendu ouvre réellement l'espace compte (Bearer natif) ;
 *   5. un code expiré, inconnu ou malformé ne rend jamais de session.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { QatafoDatabase } from '../src/db/database';
import { createCustomerRouter } from '../src/customer/routes';
import { createCustomerSession, hashToken } from '../src/customer/auth';

let db: QatafoDatabase;
let app: express.Express;

const HANDOFF = 'K2pQ7w-NativeHandoff_Code_000000000000001';

beforeEach(() => {
  vi.stubEnv('PUBLIC_BASE_URL', 'https://shop.example.com');
  vi.stubEnv('CUSTOMER_AUTH_SECRET', 'test-customer-auth-secret-not-real-0001');
  db = new QatafoDatabase(':memory:');
  app = express();
  app.use(express.json());
  app.use('/api/customer', createCustomerRouter(db));
});

afterEach(() => { db.close(); vi.unstubAllEnvs(); });

/** Compte + session réels, puis dépôt de la remise comme le fait le callback. */
function depositHandoff(handoff = HANDOFF, ttlMs = 10 * 60 * 1000) {
  const now = new Date();
  const accountId = 'account_native_handoff_test';
  db.run(`INSERT INTO customer_accounts (id,display_name,email,email_verified_at,status,created_at,updated_at)
    VALUES (?,?,?,?,'ACTIVE',?,?)`, accountId, 'Cliente Native', 'native@example.com',
  now.toISOString(), now.toISOString(), now.toISOString());
  const session = createCustomerSession(db, accountId, { ip: '127.0.0.1', headers: {} } as any);
  db.run(`INSERT INTO customer_native_handoffs (id,account_id,session_token,csrf_token,session_expires_at,expires_at,created_at)
    VALUES (?,?,?,?,?,?,?)`, hashToken(handoff), accountId, session.token, session.csrfToken,
  session.expiresAt, new Date(now.getTime() + ttlMs).toISOString(), now.toISOString());
  return { accountId, session };
}

describe('Remise de session native après OAuth', () => {
  test('le démarrage Google accepte nativeHandoff sans jamais répondre 404', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id-not-real');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret-not-real');
    const response = await request(app)
      .get('/api/customer/auth/google/start')
      .query({ cartSessionId: 'session-abcdefgh', returnTo: '/', nativeHandoff: HANDOFF });
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('accounts.google.com');
    // Le code est conservé HACHÉ : la base ne contient jamais le secret.
    const state = db.get<any>("SELECT * FROM customer_oauth_states WHERE provider='GOOGLE'");
    expect(state.native_handoff_id).toBe(hashToken(HANDOFF));
    expect(state.native_handoff_id).not.toBe(HANDOFF);
  });

  test('un démarrage web ordinaire ne stocke aucun code de remise', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id-not-real');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret-not-real');
    await request(app).get('/api/customer/auth/google/start').query({ returnTo: '/' });
    expect(db.get<any>("SELECT * FROM customer_oauth_states WHERE provider='GOOGLE'").native_handoff_id).toBe('');
  });

  test('tant que le flux n’a pas abouti, la réclamation attend (404 HANDOFF_PENDING)', async () => {
    const response = await request(app).post('/api/customer/auth/native/claim').send({ handoff: HANDOFF });
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('HANDOFF_PENDING');
    expect(response.body.data).toBeUndefined();
  });

  test('la session est remise une fois, puis le code est mort', async () => {
    const { session } = depositHandoff();
    const first = await request(app).post('/api/customer/auth/native/claim').send({ handoff: HANDOFF });
    expect(first.status).toBe(200);
    expect(first.body.data.native_session_token).toBe(session.token);
    expect(first.body.data.csrfToken).toBe(session.csrfToken);
    expect(first.body.data.account.email).toBe('native@example.com');

    const second = await request(app).post('/api/customer/auth/native/claim').send({ handoff: HANDOFF });
    expect(second.status).toBe(404);
    expect(second.body.code).toBe('HANDOFF_PENDING');
  });

  test('le jeton remis ouvre réellement le compte en Bearer natif', async () => {
    depositHandoff();
    const claim = await request(app).post('/api/customer/auth/native/claim').send({ handoff: HANDOFF });
    const token = claim.body.data.native_session_token;
    const me = await request(app)
      .get('/api/customer/account/favorites')
      .set('Authorization', `Bearer ${token}`)
      .set('x-ayrovi-native', '1');
    expect(me.status).toBe(200);
    expect(me.body.success).toBe(true);
  });

  test('un code expiré ne rend rien et disparaît', async () => {
    depositHandoff(HANDOFF, -1_000);
    const response = await request(app).post('/api/customer/auth/native/claim').send({ handoff: HANDOFF });
    expect(response.status).toBe(404);
    expect(db.get<any>('SELECT COUNT(*) c FROM customer_native_handoffs').c).toBe(0);
  });

  test('un code malformé est refusé sans toucher à la base', async () => {
    depositHandoff();
    for (const handoff of ['', 'court', 'avec espace et accents éé', '../../etc/passwd']) {
      const response = await request(app).post('/api/customer/auth/native/claim').send({ handoff });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('HANDOFF_INVALID');
    }
    expect(db.get<any>('SELECT COUNT(*) c FROM customer_native_handoffs').c).toBe(1);
  });
});
