/**
 * Double authentification de la console (TOTP) — 12/11/2026.
 * Recommandation n°1 de docs/auth-audit-2026-11-11_AR.md.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import {
  base32Decode, base32Encode, consumeRecoveryCode, generateRecoveryCodes, hashRecoveryCode, hotp,
  openTotpSecret, otpauthUrl, sealTotpSecret, totpCode, verifyTotp,
} from '../src/admin/totp';

describe('TOTP — primitives (RFC 6238)', () => {
  test('vecteurs RFC 4226 (secret « 12345678901234567890 »)', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    expect(hotp(secret, 0)).toBe('755224');
    expect(hotp(secret, 1)).toBe('287082');
    expect(hotp(secret, 9)).toBe('520489');
    // RFC 6238, T = 59 s → 94287082 (8 chiffres) → 287082 sur 6.
    expect(totpCode(secret, 59_000)).toBe('287082');
  });

  test('fenêtre ±1 pas, anti-rejeu, format strict', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpCode(secret, now), 0, now)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), 0, now)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, now + 30_000), 0, now)).toBe(step + 1);
    expect(verifyTotp(secret, totpCode(secret, now - 90_000), 0, now)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, now), step, now)).toBeNull();
    expect(verifyTotp(secret, '12345', 0, now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', 0, now)).toBeNull();
  });

  test('secret chiffré au repos, lien otpauth, codes de secours à usage unique', () => {
    const sealed = sealTotpSecret('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(openTotpSecret(sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(openTotpSecret(`${sealed.slice(0, -2)}xx`)).toBeNull();
    expect(otpauthUrl('JBSWY3DPEHPK3PXP', 'a@b.tn')).toMatch(/^otpauth:\/\/totp\/ZAYROVI%20Console%3Aa%40b\.tn\?secret=JBSWY3DPEHPK3PXP&issuer=ZAYROVI\+Console/);
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    const hashes = codes.map(hashRecoveryCode);
    const after = consumeRecoveryCode(hashes, codes[3].toUpperCase().replace('-', ''));
    expect(after).toHaveLength(7);
    expect(consumeRecoveryCode(after!, codes[3])).toBeNull();
  });
});

describe('TOTP — parcours console', () => {
  const email = `totp-${Date.now()}@test.ayrovi.tn`;
  const password = 'TotpSecure2026!x';
  let superAgent: ReturnType<typeof request.agent>;
  let superCsrf = '';
  let userId = '';

  beforeAll(async () => {
    superAgent = request.agent(app);
    const login = await superAgent.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    superCsrf = login.body.data.csrfToken;
    const created = await superAgent.post('/api/admin/users').set('x-csrf-token', superCsrf)
      .send({ name: 'TOTP Test', email, password, role: 'ORDER_MANAGER' });
    expect(created.status).toBe(201);
    userId = created.body.data.id;
  });

  afterAll(() => {
    db.run('DELETE FROM admin_sessions WHERE user_id=?', userId);
    db.run('DELETE FROM admin_users WHERE id=?', userId);
  });

  test('activation, connexion en deux temps, rejeu refusé, code de secours, réinitialisation', async () => {
    const agent = request.agent(app);
    const first = await agent.post('/api/admin/auth/login').send({ email, password });
    expect(first.status).toBe(200);
    const csrf = first.body.data.csrfToken;

    expect((await agent.get('/api/admin/auth/2fa')).body.data).toEqual({ enabled: false, pending: false, recoveryRemaining: 0 });
    expect((await agent.post('/api/admin/auth/2fa/setup').set('x-csrf-token', csrf).send({ password: 'mauvais-mot-de-passe' })).status).toBe(400);
    // CSRF obligatoire.
    expect((await agent.post('/api/admin/auth/2fa/setup').send({ password })).status).toBe(403);

    const setup = await agent.post('/api/admin/auth/2fa/setup').set('x-csrf-token', csrf).send({ password });
    expect(setup.status).toBe(200);
    const secret: string = setup.body.data.secret;
    expect(setup.body.data.otpauthUrl).toContain(`secret=${secret}`);
    const stored = db.get<any>('SELECT totp_pending, totp_enabled FROM admin_users WHERE id=?', userId);
    expect(stored.totp_enabled).toBe(0);
    expect(stored.totp_pending).not.toContain(secret);

    expect((await agent.post('/api/admin/auth/2fa/enable').set('x-csrf-token', csrf).send({ code: '000000' })).status).toBe(400);
    const enable = await agent.post('/api/admin/auth/2fa/enable').set('x-csrf-token', csrf).send({ code: totpCode(secret) });
    expect(enable.status).toBe(200);
    const recoveryCodes: string[] = enable.body.data.recoveryCodes;
    expect(recoveryCodes).toHaveLength(8);
    expect((await agent.get('/api/admin/auth/2fa')).body.data).toEqual({ enabled: true, pending: false, recoveryRemaining: 8 });

    // Mot de passe seul : refusé, sans session.
    const noCode = await request(app).post('/api/admin/auth/login').send({ email, password });
    expect(noCode.status).toBe(401);
    expect(noCode.body.code).toBe('TOTP_REQUIRED');
    expect(noCode.headers['set-cookie']).toBeUndefined();
    // Mauvais mot de passe : toujours le message générique, jamais l'indice 2FA.
    const badPassword = await request(app).post('/api/admin/auth/login').send({ email, password: 'pas-le-bon-mot-de-passe', otp: '123456' });
    expect(badPassword.status).toBe(401);
    expect(badPassword.body.code).toBeUndefined();

    const wrong = await request(app).post('/api/admin/auth/login').send({ email, password, otp: '000000' });
    expect(wrong.body.code).toBe('TOTP_INVALID');

    // Pas suivant (le pas courant a été consommé par l'activation).
    const next = totpCode(secret, Date.now() + 30_000);
    const ok = await request(app).post('/api/admin/auth/login').send({ email, password, otp: next });
    expect(ok.status).toBe(200);
    const replay = await request(app).post('/api/admin/auth/login').send({ email, password, otp: next });
    expect(replay.body.code).toBe('TOTP_INVALID');

    const recovery = await request(app).post('/api/admin/auth/login').send({ email, password, otp: recoveryCodes[0] });
    expect(recovery.status).toBe(200);
    expect((await request(app).post('/api/admin/auth/login').send({ email, password, otp: recoveryCodes[0] })).body.code).toBe('TOTP_INVALID');

    const users = await superAgent.get('/api/admin/users');
    expect(users.body.data.find((row: any) => row.id === userId).totp_enabled).toBe(1);

    // Réinitialisation par un responsable : 2FA levée, sessions fermées.
    const reset = await superAgent.put(`/api/admin/users/${userId}`).set('x-csrf-token', superCsrf).send({ resetTwoFactor: true });
    expect(reset.status).toBe(200);
    expect((await agent.get('/api/admin/auth/2fa')).status).toBe(401);
    const plain = await request(app).post('/api/admin/auth/login').send({ email, password });
    expect(plain.status).toBe(200);
    const audit = db.all<any>("SELECT action FROM audit_logs WHERE entity_id=? AND action IN ('ENABLE_2FA','RESET_2FA','LOGIN_RECOVERY_CODE')", userId).map((row) => row.action).sort();
    expect(audit).toEqual(['ENABLE_2FA', 'LOGIN_RECOVERY_CODE', 'RESET_2FA']);
  });

  test('désactivation : mot de passe ET code exigés', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/admin/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    const csrf = login.body.data.csrfToken;
    const setup = await agent.post('/api/admin/auth/2fa/setup').set('x-csrf-token', csrf).send({ password });
    const secret: string = setup.body.data.secret;
    await agent.post('/api/admin/auth/2fa/enable').set('x-csrf-token', csrf).send({ code: totpCode(secret) });
    const next = totpCode(secret, Date.now() + 30_000);
    expect((await agent.post('/api/admin/auth/2fa/disable').set('x-csrf-token', csrf).send({ password, code: '111111' })).status).toBe(400);
    expect((await agent.post('/api/admin/auth/2fa/disable').set('x-csrf-token', csrf).send({ password: 'faux-faux-faux', code: next })).status).toBe(400);
    const off = await agent.post('/api/admin/auth/2fa/disable').set('x-csrf-token', csrf).send({ password, code: next });
    expect(off.status).toBe(200);
    expect(off.body.data.enabled).toBe(false);
    expect((await request(app).post('/api/admin/auth/login').send({ email, password })).status).toBe(200);
  });
});
