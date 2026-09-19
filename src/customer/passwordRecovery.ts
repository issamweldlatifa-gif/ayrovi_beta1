import { randomBytes, randomUUID } from 'node:crypto';
import { Router, Request, Response } from 'express';
import { QatafoDatabase } from '../db/database';
import { clearCustomerCookie, customerAuthReady, hashToken, keyedHash } from './auth';
import { authMailTemplate, customerPublicOrigin, enqueueAuthMail, passwordRecoveryReady } from './accountMail';
import { hashPassword } from './passwords';

const TTL_MS = 30 * 60_000;
const WINDOW_MS = 15 * 60_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const text = (req: Request, fr: string, ar: string) => req.body?.locale === 'ar' ? ar : fr;
export function customerAuthRateAllowed(db: QatafoDatabase, name: string, value: string, max: number): boolean {
  const bucket = keyedHash(`password-recovery:${name}:${value}`);
  return db.transaction(() => {
    const now = Date.now();
    // Keep unknown addresses indistinguishable and purge old buckets to bound retention.
    db.run('DELETE FROM customer_auth_rate_limits WHERE expires_at<=?', now);
    const row = db.get<any>('SELECT count FROM customer_auth_rate_limits WHERE bucket=?', bucket);
    if (row && row.count >= max) return false;
    db.run(`INSERT INTO customer_auth_rate_limits(bucket,count,expires_at) VALUES (?,1,?)
      ON CONFLICT(bucket) DO UPDATE SET count=count+1`, bucket, now + WINDOW_MS);
    return true;
  });
}
function activeReset(db: QatafoDatabase, token: string) {
  if (!TOKEN_PATTERN.test(token)) return undefined;
  return db.get<any>(`SELECT r.*,a.locale FROM customer_password_resets r JOIN customer_accounts a ON a.id=r.account_id
    WHERE r.token_hash=? AND r.consumed_at IS NULL AND r.expires_at>? AND a.status='ACTIVE'
      AND r.email=a.email COLLATE NOCASE AND r.password_snapshot=a.password_hash`, hashToken(token), new Date().toISOString());
}
export function createPasswordRecoveryRouter(db: QatafoDatabase) {
  const router = Router();
  router.use('/auth/password', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!customerAuthReady()) return res.status(503).json({ success: false, code: 'AUTH_UNAVAILABLE', error: text(req, 'Service momentanément indisponible.', 'الخدمة غير متاحة حاليًا.') });
    if (req.method !== 'POST' || !req.is('application/json')) return res.status(415).json({ success: false, code: 'JSON_REQUIRED', error: 'JSON requis.' });
    // No link or trust decision is built from Host/X-Forwarded-Host.
    const origin = req.headers.origin;
    const sameOrigin = `${req.protocol}://${req.get('host')}`;
    if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && origin !== customerPublicOrigin() && origin !== sameOrigin)) {
      return res.status(403).json({ success: false, code: 'ORIGIN_REJECTED', error: text(req, 'Requête non autorisée.', 'طلب غير مسموح.') });
    }
    next();
  });
  const limited = (req: Request, res: Response) => {
    res.setHeader('Retry-After', '900');
    return res.status(429).json({ success: false, code: 'RESET_RATE_LIMITED', error: text(req, 'Trop de demandes. Réessayez dans 15 minutes.', 'طلبات كثيرة. أعد المحاولة بعد 15 دقيقة.') });
  };
  const invalid = (req: Request, res: Response) => res.status(400).json({ success: false, code: 'RESET_LINK_INVALID', error: text(req,
    'Ce lien est invalide, expiré ou déjà utilisé. Demandez un nouveau lien.', 'الرابط غير صالح أو منتهي الصلاحية أو مستعمل. اطلب رابطًا جديدًا.') });

  router.post('/auth/password/request', (req, res) => {
    // Fail closed for everyone before account lookup. No fake mail-success when unconfigured.
    if (!passwordRecoveryReady()) return res.status(503).json({ success: false, code: 'RESET_UNAVAILABLE', error: text(req,
      'L’envoi des e-mails de récupération est momentanément indisponible. Réessayez plus tard ou utilisez votre moyen de connexion habituel.',
      'إرسال بريد الاسترجاع غير متاح حاليًا. حاول لاحقًا أو استخدم وسيلة دخولك المعتادة.') });
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length > 180 || !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)) return res.status(400).json({ success: false, code: 'EMAIL_INVALID', error: text(req, 'Adresse e-mail invalide.', 'عنوان بريد غير صالح.') });
    if (!customerAuthRateAllowed(db, 'request-ip', req.ip || '', 10) || !customerAuthRateAllowed(db, 'request-email', email, 3)) return limited(req, res);
    db.transaction(() => {
      const account = db.get<any>("SELECT * FROM customer_accounts WHERE email=? COLLATE NOCASE AND status='ACTIVE' AND password_hash IS NOT NULL AND password_hash!=''", email);
      if (!account) return;
      const token = randomBytes(32).toString('base64url');
      const hash = hashToken(token);
      const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
      const now = new Date().toISOString();
      db.run(`INSERT INTO customer_password_resets(token_hash,account_id,email,password_snapshot,expires_at,created_at) VALUES (?,?,?,?,?,?)`,
        hash, account.id, email, account.password_hash, expiresAt, now);
      const ar = req.body?.locale === 'ar';
      const url = `${customerPublicOrigin()}/reset-password#token=${token}`;
      const title = ar ? 'إعادة تعيين كلمة المرور' : 'Réinitialisez votre mot de passe';
      const body = ar
        ? '<p>تلقّينا طلبًا لتغيير كلمة مرور حسابك في AYROVI.</p><p>الرابط صالح لمدة 30 دقيقة، ويُستعمل مرة واحدة فقط. إذا لم تطلب هذا التغيير، تجاهل الرسالة؛ لن تتغير كلمة مرورك.</p>'
        : '<p>Nous avons reçu une demande de changement de mot de passe pour votre compte AYROVI.</p><p>Ce lien est valable 30 minutes et ne peut être utilisé qu’une fois. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.</p>';
      enqueueAuthMail(db, account.id, 'PASSWORD_RESET', { to: email, subject: title, html: authMailTemplate(ar, title, body, { label: title, url }) },
        { dedupKey: `reset:${hash}`, resetHash: hash, expiresAt });
    });
    // 202 means accepted, not delivered. Same response for unknown/blocked/social-only accounts.
    return res.status(202).json({ success: true, data: { status: 'accepted', retryAfterSeconds: 60 } });
  });
  router.post('/auth/password/check', (req, res) => {
    if (!customerAuthRateAllowed(db, 'check-ip', req.ip || '', 30)) return limited(req, res);
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (!activeReset(db, token)) return invalid(req, res);
    return res.json({ success: true, data: { valid: true } });
  });
  router.post('/auth/password/reset', (req, res) => {
    if (!customerAuthRateAllowed(db, 'confirm-ip', req.ip || '', 15)) return limited(req, res);
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 8 || password.length > 100) return res.status(400).json({ success: false, code: 'PASSWORD_WEAK', error: text(req, 'Utilisez entre 8 et 100 caractères.', 'استخدم من 8 إلى 100 حرف.') });
    const completed = db.transaction(() => {
      const reset = activeReset(db, token);
      if (!reset) return false;
      const now = new Date().toISOString();
      const updated = db.run(`UPDATE customer_password_resets SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL`, now, reset.token_hash);
      if (!updated.changes) return false;
      db.run('UPDATE customer_accounts SET password_hash=?,updated_at=? WHERE id=?', hashPassword(password), now, reset.account_id);
      db.run('DELETE FROM customer_sessions WHERE account_id=?', reset.account_id);
      db.run('UPDATE customer_password_resets SET consumed_at=? WHERE account_id=? AND consumed_at IS NULL', now, reset.account_id);
      db.run("UPDATE customer_auth_mail_jobs SET status='CANCELLED',payload='' WHERE account_id=? AND kind='PASSWORD_RESET' AND status IN ('PENDING','SENDING')", reset.account_id);
      const ar = req.body?.locale === 'ar';
      const title = ar ? 'تم تغيير كلمة مرورك' : 'Votre mot de passe a été modifié';
      enqueueAuthMail(db, reset.account_id, 'PASSWORD_CHANGED', { to: reset.email, subject: title, html: authMailTemplate(ar, title,
        ar ? '<p>تم تحديث كلمة المرور وإغلاق الجلسات السابقة. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.</p><p>إذا لم تقم بهذا التغيير، اطلب استرجاع حسابك فورًا وتواصل مع فريق AYROVI.</p>'
          : '<p>Votre mot de passe a été modifié et les anciennes sessions ont été fermées. Connectez-vous avec votre nouveau mot de passe.</p><p>Si vous n’êtes pas à l’origine de ce changement, demandez une récupération et contactez l’équipe AYROVI.</p>') }, { dedupKey: `password-changed:${randomUUID()}` });
      return true;
    });
    if (!completed) return invalid(req, res);
    clearCustomerCookie(res);
    return res.json({ success: true, data: { status: 'password_changed' } });
  });
  return router;
}
