/**
 * Connexion par code e-mail (façon ChatGPT), entièrement dans l'application.
 *
 * Ce que ces tests protègent :
 *   1. la demande ne révèle ni l'adresse complète ni l'existence d'un compte ;
 *   2. un code faux compte, un code juste ouvre une session (jeton pour le client mobile) ;
 *   3. un code ne sert qu'une fois, et se verrouille après trop d'essais ;
 *   4. une adresse nouvelle crée un compte SANS mot de passe, e-mail marqué vérifié ;
 *   5. les limites de débit par adresse sont appliquées ;
 *   6. les helpers purs (masquage, nom, gabarit) tiennent.
 */
import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { displayNameFromEmail, emailCodeHtml, maskEmail } from '../src/customer/emailCode';

const MOBILE = 'mobile/2.0.0';
const uniqueEmail = (tag = 'user') =>
  `${tag}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.tn`;

/** Demande un code : en test (pas de service mail), le serveur renvoie le code. */
async function requestCode(email: string, headers: Record<string, string> = {}) {
  return request(app).post('/api/customer/auth/email-code/request').set(headers).send({ email, locale: 'fr' });
}

describe('demande de code e-mail', () => {
  test('répond 201, masque l’adresse et renvoie le code en développement seulement', async () => {
    const email = uniqueEmail('masque');
    const res = await requestCode(email);
    expect(res.status).toBe(201);
    expect(res.body.data.challengeId).toMatch(/^ecode_/);
    expect(res.body.data.maskedEmail).not.toContain(email);
    expect(res.body.data.maskedEmail).toContain('@');
    expect(res.body.data.developmentCode).toMatch(/^\d{6}$/);
    // Le code n'est jamais stocké en clair.
    const row = db.get<any>('SELECT code_hash FROM customer_email_code_challenges WHERE id=?', res.body.data.challengeId);
    expect(row.code_hash).not.toContain(res.body.data.developmentCode);
  });

  test('refuse une adresse invalide, sans rien consommer', async () => {
    const res = await requestCode('pas-une-adresse');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_INVALID');
  });

  test('plafond par adresse : la 4e demande dans la fenêtre est refusée', async () => {
    const email = uniqueEmail('limite');
    for (let i = 0; i < 3; i += 1) expect((await requestCode(email)).status).toBe(201);
    const blocked = await requestCode(email);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('EMAIL_CODE_RATE_LIMITED');
  });
});

describe('vérification du code', () => {
  test('un code faux compte une tentative et ne connecte pas', async () => {
    const email = uniqueEmail('faux');
    const issued = await requestCode(email);
    const wrong = issued.body.data.developmentCode === '000000' ? '111111' : '000000';
    const res = await request(app).post('/api/customer/auth/email-code/verify')
      .send({ challengeId: issued.body.data.challengeId, code: wrong });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_CODE_INVALID');
    const row = db.get<any>('SELECT attempts FROM customer_email_code_challenges WHERE id=?', issued.body.data.challengeId);
    expect(row.attempts).toBe(1);
  });

  test('le bon code ouvre une session ; le client mobile reçoit son jeton', async () => {
    const email = uniqueEmail('ouvre');
    const issued = await requestCode(email);
    const res = await request(app).post('/api/customer/auth/email-code/verify')
      .set('x-ayrovi-client', MOBILE)
      .send({ challengeId: issued.body.data.challengeId, code: issued.body.data.developmentCode });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.session_token).toBe('string');
    expect(res.body.data.session_token.length).toBeGreaterThan(30);
    expect(res.body.data.account.email).toBe(email);
    expect(res.headers['set-cookie']?.[0]).toMatch(/HttpOnly/);
  });

  test('une adresse nouvelle crée un compte SANS mot de passe, e-mail vérifié', async () => {
    const email = uniqueEmail('nouveau');
    const issued = await requestCode(email);
    const res = await request(app).post('/api/customer/auth/email-code/verify')
      .send({ challengeId: issued.body.data.challengeId, code: issued.body.data.developmentCode });
    expect(res.status).toBe(200);
    const account = db.get<any>('SELECT password_hash, email_verified_at, display_name, status FROM customer_accounts WHERE email=? COLLATE NOCASE', email);
    expect(account.password_hash).toBeNull();
    expect(account.email_verified_at).toBeTruthy();
    expect(account.display_name).toBe(displayNameFromEmail(email));
    expect(account.status).toBe('ACTIVE');
  });

  test('une adresse déjà connue réutilise le même compte', async () => {
    const email = uniqueEmail('retour');
    const first = await requestCode(email);
    const a = await request(app).post('/api/customer/auth/email-code/verify')
      .send({ challengeId: first.body.data.challengeId, code: first.body.data.developmentCode });
    const second = await requestCode(email);
    const b = await request(app).post('/api/customer/auth/email-code/verify')
      .send({ challengeId: second.body.data.challengeId, code: second.body.data.developmentCode });
    expect(b.status).toBe(200);
    expect(b.body.data.account.id).toBe(a.body.data.account.id);
  });

  test('un code ne sert qu’une fois', async () => {
    const email = uniqueEmail('unefois');
    const issued = await requestCode(email);
    const body = { challengeId: issued.body.data.challengeId, code: issued.body.data.developmentCode };
    expect((await request(app).post('/api/customer/auth/email-code/verify').send(body)).status).toBe(200);
    const again = await request(app).post('/api/customer/auth/email-code/verify').send(body);
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('EMAIL_CODE_EXPIRED');
  });

  test('après 5 mauvais essais, le code est verrouillé même pour la bonne valeur', async () => {
    const email = uniqueEmail('verrou');
    const issued = await requestCode(email);
    const challengeId = issued.body.data.challengeId;
    const wrong = issued.body.data.developmentCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/customer/auth/email-code/verify').send({ challengeId, code: wrong });
    }
    const res = await request(app).post('/api/customer/auth/email-code/verify')
      .send({ challengeId, code: issued.body.data.developmentCode });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('EMAIL_CODE_LOCKED');
  });

  test('une nouvelle demande consomme l’ancien code', async () => {
    const email = uniqueEmail('remplace');
    const old = await requestCode(email);
    await requestCode(email);
    const res = await request(app).post('/api/customer/auth/email-code/verify')
      .send({ challengeId: old.body.data.challengeId, code: old.body.data.developmentCode });
    expect(res.status).toBe(400);
  });
});

describe('configuration exposée à l’application', () => {
  test('/auth/config annonce la connexion par code e-mail', async () => {
    const res = await request(app).get('/api/customer/auth/config');
    expect(res.status).toBe(200);
    expect(res.body.data.emailCode).toEqual({ enabled: expect.any(Boolean) });
  });
});

describe('helpers purs', () => {
  test('maskEmail ne laisse voir que le début de chaque partie', () => {
    expect(maskEmail('ahmed.ben@gmail.com')).toBe('ah***@gm***.com');
    expect(maskEmail('x@ab.tn')).toBe('x***@ab***.tn');
    expect(maskEmail('pas-une-adresse')).toBe('');
  });

  test('displayNameFromEmail : partie locale nettoyée, repli si trop court', () => {
    expect(displayNameFromEmail('ahmed.ben-salah@gmail.com')).toBe('ahmed ben salah');
    expect(displayNameFromEmail('a@gmail.com')).toBe('Client AYROVI');
  });

  test('le gabarit contient le code, en français ou en arabe', () => {
    expect(emailCodeHtml(false, '482913')).toContain('482913');
    expect(emailCodeHtml(false, '482913')).toContain('lang="fr"');
    expect(emailCodeHtml(true, '482913')).toContain('dir="rtl"');
  });
});
