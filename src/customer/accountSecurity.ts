/**
 * Sécurité du compte client — appareils connectés et confirmation de l'adresse
 * e-mail (12/11/2026). Deux recommandations de `docs/auth-audit-2026-11-11_AR.md` :
 *
 * ── M5 : « se déconnecter de tous les appareils » ──────────────────────────
 *  • `GET  /account/sessions` : appareils ouverts (libellé lisible, IP masquée,
 *    dernière activité). L'identifiant exposé est une poignée DÉRIVÉE (HMAC) :
 *    ni le jeton, ni son empreinte de base ne sortent du serveur ;
 *  • `DELETE /account/sessions/:handle` : ferme UN autre appareil ;
 *  • `POST /auth/logout-all` : ferme tous les AUTRES appareils (par défaut), ou
 *    tous y compris celui-ci (`includeCurrent: true`). Les relais OAuth natifs en
 *    attente du compte sont aussi annulés.
 *
 * ── Faible n°5 : l'inscription ne confirmait pas l'adresse ─────────────────
 *  • `POST /account/email/verification/request` : code à 6 chiffres envoyé à
 *    l'adresse du compte CONNECTÉ ;
 *  • `POST /account/email/verification/confirm` : le code n'est accepté QUE dans
 *    une session de ce compte, et seulement si l'adresse n'a pas changé entre-temps.
 *
 *    Pourquoi un code saisi dans la session plutôt qu'un lien cliquable : avec un
 *    lien, quelqu'un qui s'inscrit avec l'adresse d'autrui obtiendrait un compte
 *    « confirmé » dès que la vraie personne clique par curiosité. Avec un code lié
 *    à la session, la vraie personne n'a aucune session sur ce compte et
 *    l'usurpateur n'a pas le code : la confirmation est impossible pour lui.
 *
 *    Choix assumé : la connexion par mot de passe reste possible avant
 *    confirmation (C2 ferme déjà la pré-appropriation ; bloquer couperait des
 *    clients au milieu d'une commande). Une adresse confirmée compte, comme un
 *    téléphone vérifié, pour la règle « contact vérifié » de la caisse.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { QatafoDatabase } from '../db/database';
import { mailerReady, sendMail } from '../services/mailer';
import {
  clearCustomerCookie, customerFromRequest, keyedHash, requireCustomer, safeEqualHash, type ResolvedCustomer,
} from './auth';
import { authMailTemplate } from './accountMail';
import { maskEmail } from './emailCode';
import { customerAuthRateAllowed } from './passwordRecovery';

export const EMAIL_VERIFY_TTL_MS = 15 * 60_000;
export const EMAIL_VERIFY_MAX_ATTEMPTS = 5;
export const EMAIL_VERIFY_PER_ACCOUNT_MAX = 3;

/* ───────────────────────── Outils purs (testés) ───────────────────────── */

/** Libellé lisible d'un appareil à partir de son User-Agent (jamais affiché brut). */
export function describeUserAgent(userAgent: unknown): { platform: string; client: string } {
  const ua = String(userAgent || '');
  if (!ua) return { platform: 'Appareil inconnu', client: '' };
  if (/okhttp/i.test(ua)) return { platform: 'Android', client: 'Application ZAYROVI' };
  if (/CFNetwork|Darwin\//i.test(ua) && !/Mozilla/i.test(ua)) return { platform: 'iPhone', client: 'Application ZAYROVI' };
  const platform = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPod/i.test(ua) ? 'iPhone'
      : /iPad/i.test(ua) ? 'iPad'
        : /Windows/i.test(ua) ? 'Windows'
          : /Mac OS X|Macintosh/i.test(ua) ? 'Mac'
            : /CrOS/i.test(ua) ? 'Chromebook'
              : /Linux/i.test(ua) ? 'Linux' : 'Appareil inconnu';
  const client = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
      : /SamsungBrowser/i.test(ua) ? 'Samsung Internet'
        : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
          : /Chrome|CriOS/i.test(ua) ? 'Chrome'
            : /Safari/i.test(ua) ? 'Safari' : 'Navigateur';
  return { platform, client };
}

/** IP masquée : assez pour reconnaître « chez moi / ailleurs », pas pour pister. */
export function maskIp(ip: unknown): string {
  const raw = String(ip || '').trim().replace(/^::ffff:/i, '');
  if (!raw) return '';
  const v4 = raw.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  if (raw.includes(':')) {
    const groups = raw.split(':').filter(Boolean);
    return groups.length ? `${groups.slice(0, 2).join(':')}:…` : '';
  }
  return '';
}

/** Poignée publique d'une session : dérivée (HMAC), stable, non réversible. */
export function sessionHandle(sessionId: string): string {
  return keyedHash(`customer-session-handle:${sessionId}`).slice(0, 24);
}

function verificationCodeHtml(ar: boolean, code: string): string {
  const title = ar ? 'تأكيد بريدك الإلكتروني' : 'Confirmez votre adresse e-mail';
  const body = ar
    ? '<p>أدخل هذا الرمز في حسابك على ZAYROVI لتأكيد عنوان بريدك. صالح لمدة 15 دقيقة.</p>'
    : '<p>Saisissez ce code dans votre compte ZAYROVI pour confirmer votre adresse. Il est valable 15 minutes.</p>';
  const codeBlock = `<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:24px 0">${code}</p>`;
  const ignore = ar
    ? '<p>إذا لم تنشئ حسابًا على ZAYROVI، تجاهل هذه الرسالة: لن يتم تأكيد أي شيء بدون هذا الرمز.</p>'
    : '<p>Si vous n’avez pas créé de compte ZAYROVI, ignorez ce message : rien n’est confirmé sans ce code.</p>';
  return authMailTemplate(ar, title, body + codeBlock + ignore);
}

/* ───────────────────────── Routeur ───────────────────────── */

export function createAccountSecurityRouter(db: QatafoDatabase) {
  const router = Router();
  const text = (req: Request, fr: string, ar: string) => (req.body?.locale === 'ar' ? ar : fr);
  const current = (req: Request) => customerFromRequest(req) as ResolvedCustomer;

  const liveSessions = (accountId: string) => db.all<any>(
    'SELECT id,created_at,last_seen_at,ip_address,user_agent,expires_at FROM customer_sessions WHERE account_id=? AND expires_at>? ORDER BY last_seen_at DESC',
    accountId, new Date().toISOString(),
  );

  router.get('/account/sessions', requireCustomer(db), (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const me = current(req);
    const data = liveSessions(me.id).map((row) => ({
      handle: sessionHandle(row.id),
      current: row.id === me.sessionId,
      ...describeUserAgent(row.user_agent),
      ipMasked: maskIp(row.ip_address),
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
    }));
    res.json({ success: true, data });
  });

  router.delete('/account/sessions/:handle', requireCustomer(db), (req, res) => {
    const me = current(req);
    const handle = String(req.params.handle || '');
    const target = liveSessions(me.id).find((row) => sessionHandle(row.id) === handle);
    if (!target) return res.status(404).json({ success: false, code: 'SESSION_NOT_FOUND', error: text(req, 'Cet appareil n’est plus connecté.', 'هذا الجهاز لم يعد متصلاً.') });
    if (target.id === me.sessionId) {
      return res.status(400).json({ success: false, code: 'SESSION_IS_CURRENT', error: text(req, 'Pour cet appareil, utilisez « Se déconnecter ».', 'لهذا الجهاز استعمل «تسجيل الخروج».') });
    }
    db.run('DELETE FROM customer_sessions WHERE id=? AND account_id=?', target.id, me.id);
    res.json({ success: true, data: { revoked: 1 } });
  });

  router.post('/auth/logout-all', requireCustomer(db), (req, res) => {
    const me = current(req);
    const includeCurrent = req.body?.includeCurrent === true;
    const revoked = db.transaction(() => {
      const result = includeCurrent
        ? db.run('DELETE FROM customer_sessions WHERE account_id=?', me.id)
        : db.run('DELETE FROM customer_sessions WHERE account_id=? AND id<>?', me.id, me.sessionId);
      db.run('DELETE FROM customer_native_handoffs WHERE account_id=?', me.id);
      return Number(result.changes || 0);
    });
    if (includeCurrent) clearCustomerCookie(res);
    res.json({ success: true, data: { revoked, currentKept: !includeCurrent } });
  });

  /* ── Confirmation de l'adresse e-mail ── */

  const accountEmail = (accountId: string) => db.get<any>('SELECT email,email_verified_at,status FROM customer_accounts WHERE id=?', accountId);

  router.post('/account/email/verification/request', requireCustomer(db), async (req: Request, res: Response) => {
    const me = current(req);
    const row = accountEmail(me.id);
    const email = String(row?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, code: 'EMAIL_MISSING', error: text(req, 'Ajoutez d’abord une adresse e-mail à votre profil.', 'أضف أولاً بريدًا إلكترونيًا إلى ملفك.') });
    if (row?.email_verified_at) return res.json({ success: true, data: { alreadyVerified: true } });
    const ready = mailerReady();
    const production = process.env.NODE_ENV === 'production';
    if (!ready && production) {
      return res.status(503).json({ success: false, code: 'EMAIL_VERIFY_UNAVAILABLE', error: text(req, 'L’envoi des e-mails est momentanément indisponible.', 'إرسال البريد غير متاح حاليًا.') });
    }
    if (!customerAuthRateAllowed(db, 'email-verify-account', me.id, EMAIL_VERIFY_PER_ACCOUNT_MAX)
      || !customerAuthRateAllowed(db, 'email-verify-ip', req.ip || '', 30)) {
      res.setHeader('Retry-After', '900');
      return res.status(429).json({ success: false, code: 'EMAIL_VERIFY_RATE_LIMITED', error: text(req, 'Trop de demandes. Réessayez dans 15 minutes.', 'طلبات كثيرة. أعد المحاولة بعد 15 دقيقة.') });
    }
    const now = new Date();
    const challengeId = `everify_${randomUUID()}`;
    const code = String(randomInt(100000, 1000000));
    const ar = req.body?.locale === 'ar';
    db.run('UPDATE customer_email_verifications SET consumed_at=? WHERE account_id=? AND consumed_at IS NULL', now.toISOString(), me.id);
    db.run(`INSERT INTO customer_email_verifications (id,account_id,email,code_hash,expires_at,max_attempts,request_ip,created_at)
      VALUES (?,?,?,?,?,?,?,?)`, challengeId, me.id, email, keyedHash(`${challengeId}:${me.id}:${email}:${code}`),
    new Date(now.getTime() + EMAIL_VERIFY_TTL_MS).toISOString(), EMAIL_VERIFY_MAX_ATTEMPTS, req.ip || '', now.toISOString());
    try {
      if (ready) {
        const subject = ar ? `رمز تأكيد البريد على ZAYROVI: ${code}` : `Code de confirmation ZAYROVI : ${code}`;
        const delivery = await sendMail({ to: email, subject, html: verificationCodeHtml(ar, code), idempotencyKey: challengeId });
        if (!delivery.delivered) throw new Error(delivery.error || 'EMAIL_DELIVERY_FAILED');
      } else if (process.env.NODE_ENV !== 'test') {
        console.info(`[Customer Email Verify] ${maskEmail(email)}: ${code}`);
      }
      return res.status(201).json({ success: true, data: {
        challengeId,
        maskedEmail: maskEmail(email),
        expiresInSeconds: EMAIL_VERIFY_TTL_MS / 1000,
        ...(!ready ? { developmentCode: code } : {}),
      } });
    } catch (error: any) {
      db.run('DELETE FROM customer_email_verifications WHERE id=?', challengeId);
      console.error('[Customer Email Verify Delivery]', error?.message || error);
      return res.status(503).json({ success: false, code: 'EMAIL_DELIVERY_FAILED', error: text(req, 'Le courriel n’a pas pu être envoyé. Réessayez dans un instant.', 'تعذّر إرسال البريد. أعد المحاولة بعد قليل.') });
    }
  });

  router.post('/account/email/verification/confirm', requireCustomer(db), (req, res) => {
    const me = current(req);
    const challengeId = String(req.body?.challengeId || '').slice(0, 80);
    const code = String(req.body?.code || '').replace(/\D/g, '');
    const now = new Date().toISOString();
    const expired = () => res.status(400).json({ success: false, code: 'EMAIL_VERIFY_EXPIRED', error: text(req, 'Ce code a expiré. Demandez un nouveau code.', 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.') });
    const challenge = db.get<any>('SELECT * FROM customer_email_verifications WHERE id=? AND account_id=?', challengeId, me.id);
    if (!challenge || challenge.consumed_at || challenge.expires_at <= now) return expired();
    // L'adresse a changé depuis l'envoi : le code ne prouve plus rien pour la nouvelle.
    const row = accountEmail(me.id);
    if (String(row?.email || '').toLowerCase() !== String(challenge.email).toLowerCase()) return expired();
    if (Number(challenge.attempts) >= Number(challenge.max_attempts)) {
      return res.status(429).json({ success: false, code: 'EMAIL_VERIFY_LOCKED', error: text(req, 'Trop de tentatives. Demandez un nouveau code.', 'محاولات كثيرة. اطلب رمزًا جديدًا.') });
    }
    if (code.length !== 6 || !safeEqualHash(`${challengeId}:${me.id}:${challenge.email}:${code}`, challenge.code_hash)) {
      db.run('UPDATE customer_email_verifications SET attempts=attempts+1 WHERE id=?', challengeId);
      return res.status(400).json({ success: false, code: 'EMAIL_VERIFY_INVALID', error: text(req, 'Le code saisi est incorrect.', 'الرمز غير صحيح.') });
    }
    const confirmed = db.transaction(() => {
      const claimed = db.run('UPDATE customer_email_verifications SET consumed_at=? WHERE id=? AND consumed_at IS NULL', now, challengeId);
      if (!claimed.changes) return false;
      db.run('UPDATE customer_accounts SET email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE id=? AND email=? COLLATE NOCASE', now, now, me.id, challenge.email);
      db.run('UPDATE customer_email_verifications SET consumed_at=? WHERE account_id=? AND consumed_at IS NULL', now, me.id);
      return true;
    });
    if (!confirmed) return expired();
    res.json({ success: true, data: { emailVerified: true } });
  });

  return router;
}
