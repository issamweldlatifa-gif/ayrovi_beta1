/**
 * Session client pour l'APPLICATION — le contrat qui relie le serveur à
 * AYROVI (React Native), et les garde-fous qui l'empêchent d'affaiblir le web.
 *
 * Ce que ces tests protègent :
 *   1. le client mobile déclaré reçoit un jeton ; un navigateur n'en reçoit JAMAIS ;
 *   2. l'ancienne coque Capacitor continue de fonctionner à l'identique ;
 *   3. « se déconnecter » révoque réellement la session, en Bearer comme en cookie ;
 *   4. les limites de débit comptent la SESSION avant l'IP (abonnés derrière un CGNAT).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { clientRateLimitKey } from '../src/services/rateKey';
import { isMobileClient, sessionExchangeFields } from '../src/customer/sessionExchange';
import { hashToken } from '../src/customer/auth';

const MOBILE = 'mobile/2.0.0';
// Numéro tunisien valide : 8 chiffres (mobile 2x/4x/5x/9x), unique par appel.
const uniquePhone = () =>
  `${[2, 4, 5, 9][Math.floor(Math.random() * 4)]}${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 10)}`;

/** Crée une session par SMS et renvoie le jeton remis au client déclaré. */
async function mobileLogin(phone: string, headers: Record<string, string>, agent = request(app)) {
  const challenge = await agent.post('/api/customer/auth/otp/request')
    .set(headers).send({ phone });
  expect(challenge.status).toBe(201);
  const verified = await agent.post('/api/customer/auth/otp/verify')
    .set(headers)
    .send({ challengeId: challenge.body.data.challengeId, code: challenge.body.data.developmentCode });
  expect(verified.status).toBe(200);
  return verified;
}

describe('remise de session à un client déclaré', () => {
  test('le client mobile reçoit son jeton, jamais l’ancienne clé native', async () => {
    const verified = await mobileLogin(uniquePhone(), { 'x-ayrovi-client': MOBILE });
    const data = verified.body.data;
    expect(typeof data.session_token).toBe('string');
    expect(data.session_token.length).toBeGreaterThan(30);
    expect(new Date(data.session_expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(data.native_session_token).toBeUndefined();
    // Le cookie reste posé : le même endpoint sert le web et l'application.
    expect(verified.headers['set-cookie']?.[0]).toContain('ayrovi_customer_session=');
  });

  test('l’ancienne coque Capacitor fonctionne exactement comme avant', async () => {
    const verified = await mobileLogin(uniquePhone(), { 'x-ayrovi-native': '1' });
    expect(typeof verified.body.data.native_session_token).toBe('string');
    expect(verified.body.data.session_token).toBeUndefined();
  });

  test('un navigateur ne reçoit AUCUN jeton dans le corps de la réponse', async () => {
    const verified = await mobileLogin(uniquePhone(), {});
    expect(verified.body.data.session_token).toBeUndefined();
    expect(verified.body.data.native_session_token).toBeUndefined();
    // Son jeton est dans un cookie HttpOnly — hors de portée du JavaScript.
    expect(verified.headers['set-cookie']?.[0]).toMatch(/HttpOnly/);
  });

  test('une déclaration fantaisiste n’ouvre aucun jeton', async () => {
    for (const header of ['mobile', 'mobile/', 'mobile/x', 'Android', 'mobile/2.0.0 extra', 'MOTOROLA']) {
      const verified = await mobileLogin(uniquePhone(), { 'x-ayrovi-client': header });
      expect(verified.body.data.session_token, `en-tête accepté à tort : ${header}`).toBeUndefined();
    }
    expect(isMobileClient({ headers: { 'x-ayrovi-client': MOBILE } } as any)).toBe(true);
    expect(isMobileClient({ headers: {} } as any)).toBe(false);
  });
});

describe('session Bearer mobile', () => {
  test('/auth/me identifie le client, fait tourner le jeton CSRF et annonce l’expiration', async () => {
    const login = await mobileLogin(uniquePhone(), { 'x-ayrovi-client': MOBILE });
    const token = login.body.data.session_token;

    const me = await request(app).get('/api/customer/auth/me')
      .set('Authorization', `Bearer ${token}`).set('x-ayrovi-client', MOBILE);
    expect(me.status).toBe(200);
    expect(me.body.data.account.phone).toBe(login.body.data.account.phone);
    expect(typeof me.body.data.csrfToken).toBe('string');
    expect(new Date(me.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    // Le jeton CSRF a réellement tourné en base.
    expect(me.body.data.csrfToken).not.toBe(login.body.data.csrfToken);
  });

  test('un jeton inconnu ne donne accès à rien', async () => {
    const me = await request(app).get('/api/customer/auth/me')
      .set('Authorization', 'Bearer pas-un-vrai-jeton-de-session');
    expect(me.status).toBe(401);
    expect(me.body.code).toBe('AUTH_REQUIRED');
  });

  test('écrire sans jeton CSRF est refusé, même avec un Bearer valide', async () => {
    const login = await mobileLogin(uniquePhone(), { 'x-ayrovi-client': MOBILE });
    const token = login.body.data.session_token;
    const payload = { orderUpdates: true, paymentUpdates: false, shippingUpdates: false, invoiceUpdates: false, darkMode: false };

    const refused = await request(app).put('/api/customer/account/preferences')
      .set('Authorization', `Bearer ${token}`).send(payload);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('INVALID_CSRF');

    const accepted = await request(app).put('/api/customer/account/preferences')
      .set('Authorization', `Bearer ${token}`)
      .set('x-csrf-token', login.body.data.csrfToken)
      .send(payload);
    expect(accepted.status).toBe(200);
  });

  test('« se déconnecter » révoque réellement la session mise au porteur', async () => {
    const login = await mobileLogin(uniquePhone(), { 'x-ayrovi-client': MOBILE });
    const token = login.body.data.session_token;
    const hash = hashToken(token);
    expect(db.get('SELECT id FROM customer_sessions WHERE id=?', hash)).toBeTruthy();

    const logout = await request(app).post('/api/customer/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .set('x-csrf-token', login.body.data.csrfToken);
    expect(logout.status).toBe(200);

    // Le point qui compte : la session a disparu de la base, elle ne survivra
    // pas trente jours après un « se déconnecter ».
    expect(db.get('SELECT id FROM customer_sessions WHERE id=?', hash)).toBeFalsy();
    const me = await request(app).get('/api/customer/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
  });

  test('le jeton de session n’est stocké que haché', async () => {
    const login = await mobileLogin(uniquePhone(), { 'x-ayrovi-client': MOBILE });
    const token = login.body.data.session_token;
    const plain = db.get('SELECT id FROM customer_sessions WHERE id=?', token);
    expect(plain).toBeFalsy();
    expect(db.get('SELECT id FROM customer_sessions WHERE id=?', hashToken(token))).toBeTruthy();
  });
});

describe('clé de limitation de débit', () => {
  test('compte la session avant l’IP — un opérateur n’est pas un client', () => {
    const sharedIp = { ip: '41.226.0.7', headers: {} } as any;
    const phoneA = clientRateLimitKey(sharedIp);
    const phoneB = clientRateLimitKey(sharedIp);
    expect(phoneA).toBe(phoneB);
    expect(phoneA).toContain('41.226.0.7');

    const aliceSameNat = clientRateLimitKey({ ip: '41.226.0.7', headers: { authorization: 'Bearer jeton-alice' } } as any);
    const bobSameNat = clientRateLimitKey({ ip: '41.226.0.7', headers: { authorization: 'Bearer jeton-bob' } } as any);
    expect(aliceSameNat).not.toBe(bobSameNat);
    expect(aliceSameNat.startsWith('session:')).toBe(true);
    // Le jeton lui-même ne doit jamais apparaître dans la clé.
    expect(aliceSameNat).not.toContain('jeton-alice');
  });

  test('accepte aussi le cookie du web', () => {
    const web = clientRateLimitKey({ ip: '41.226.0.7', headers: { cookie: 'ayrovi_customer_session=jeton-web' } } as any);
    expect(web.startsWith('session:')).toBe(true);
    expect(web).not.toContain('jeton-web');
  });
});

describe('champs d’échange de session', () => {
  test('sont vides pour un client qui n’en a pas besoin', () => {
    expect(sessionExchangeFields({ headers: {} } as any, { token: 't', expiresAt: 'x' })).toEqual({});
  });
  test('n’exposent jamais les deux clés à la fois', () => {
    const both = sessionExchangeFields(
      { headers: { 'x-ayrovi-client': MOBILE, 'x-ayrovi-native': '1' } } as any,
      { token: 't', expiresAt: '2026-11-07T00:00:00.000Z' },
    );
    // Une déclaration contradictoire ne donne pas deux jetons : le client
    // déclaré le plus récent l'emporte, la clé historique disparaît.
    expect(both).toEqual({ session_token: 't', session_expires_at: '2026-11-07T00:00:00.000Z' });
    expect(both).not.toHaveProperty('native_session_token');
  });
});

describe('plafonds SMS dimensionnés pour un réseau partagé', () => {
  test('le plafond par numéro ne dépend plus de l’adresse IP', async () => {
    const { otpRateLimitKey } = await import('../src/server');
    const keyA = otpRateLimitKey({ ip: '41.226.0.7', body: { phone: '+216 20 111 222' } } as any);
    const keyB = otpRateLimitKey({ ip: '197.0.0.9', body: { phone: '20 111 222' } } as any);
    // Même numéro, deux adresses : un seul quota. C'est ce qui protège la
    // personne (et la facture) d'une attaque distribuée.
    expect(keyA).toBe(keyB);
    expect(keyA).not.toContain('20111222');
  });

  test('cent demandes depuis une même adresse passent, la cent-unième est refusée', async () => {
    /*
     * On vérifie le comportement RÉEL de la route (et pas une relecture du
     * code) : on sature le compteur d'une adresse IP en base, puis on regarde
     * ce que le serveur répond. L'IP est découverte par la première requête au
     * lieu d'être supposée (IPv4 mappée, boucle locale, etc.).
     */
    const first = await request(app).post('/api/customer/auth/otp/request').send({ phone: uniquePhone() });
    expect(first.status).toBe(201);
    const ip = String(db.get<any>('SELECT request_ip ip FROM customer_otp_challenges WHERE id=?', first.body.data.challengeId)?.ip || '');
    expect(ip.length).toBeGreaterThan(0);
    const now = new Date().toISOString();
    const filler = (count: number) => {
      for (let index = 0; index < count; index += 1) {
        db.run(`INSERT INTO customer_otp_challenges
          (id,phone,code_hash,provider,expires_at,max_attempts,request_ip,created_at)
          VALUES (?,?,?,?,?,5,?,?)`,
        `probe_${index}_${randomUUID()}`, `2165${index}000000`, 'hash', 'local', now, ip, now);
      }
    };
    try {
      // On complète jusqu'à 99 demandes pour cette adresse : la centième passe
      // (l'ancien seuil de 10 l'aurait refusée).
      const since = new Date(Date.now() - 15 * 60_000).toISOString();
      const existing = Number(db.get<any>(
        'SELECT COUNT(*) count FROM customer_otp_challenges WHERE request_ip=? AND created_at>=?', ip, since,
      )?.count || 0);
      filler(Math.max(0, 99 - existing));
      const hundredth = await request(app).post('/api/customer/auth/otp/request').send({ phone: uniquePhone() });
      expect(hundredth.status).toBe(201);
      // La cent-unième est refusée — c'est le garde-fou contre l'abus massif.
      const refused = await request(app).post('/api/customer/auth/otp/request').send({ phone: uniquePhone() });
      expect(refused.status).toBe(429);
    } finally {
      db.run('DELETE FROM customer_otp_challenges WHERE request_ip=?', ip);
    }
    // Le compteur retombé, la connexion repart : le refus était bien un plafond
    // de débit, pas une panne.
    const after = await request(app).post('/api/customer/auth/otp/request').send({ phone: uniquePhone() });
    expect(after.status).toBe(201);
  });
});

describe('anti-régression', () => {
  test('les trois routes qui créent une session remettent bien le jeton au mobile', async () => {
    // OTP vérifié ci-dessus ; on contrôle l'inscription et la connexion e-mail,
    // qui partagent le même mécanisme mais par un autre chemin de code.
    const email = `mobile.${Date.now()}@ayrovi.test`;
    const created = await request(app).post('/api/customer/auth/email/register')
      .set('x-ayrovi-client', MOBILE)
      .send({ email, password: 'MotDePasse2026!', displayName: 'Client Mobile', termsAccepted: true });
    expect(created.status).toBe(200);
    expect(typeof created.body.data.session_token).toBe('string');

    const logged = await request(app).post('/api/customer/auth/email/login')
      .set('x-ayrovi-client', MOBILE).send({ email, password: 'MotDePasse2026!' });
    expect(logged.status).toBe(200);
    expect(typeof logged.body.data.session_token).toBe('string');
    expect(logged.body.data.session_token).not.toBe(created.body.data.session_token);
  });
});
