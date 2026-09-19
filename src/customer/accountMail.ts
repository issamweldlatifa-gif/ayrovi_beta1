/** Durable transactional mail. Sensitive payloads are encrypted at rest, never logged. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { QatafoDatabase } from '../db/database';
import { MailInput, mailerReady, sendMail } from '../services/mailer';
import { customerAuthReady, requireCustomerAuthSecret } from './auth';

export function customerPublicOrigin(): string {
  try {
    const url = new URL(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '');
    const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') return '';
    return url.origin;
  } catch { return ''; }
}
export const passwordRecoveryReady = () => customerAuthReady() && mailerReady() && Boolean(customerPublicOrigin());
const escape = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const key = () => createHash('sha256').update(`ayrovi-auth-mail-v1\0${requireCustomerAuthSecret()}`).digest();
function seal(input: MailInput): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(input), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}
function unseal(payload: string): MailInput {
  const buffer = Buffer.from(payload, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8'));
}
export function authMailTemplate(ar: boolean, title: string, body: string, action?: { label: string; url: string }): string {
  return `<!doctype html><html lang="${ar ? 'ar' : 'fr'}" dir="${ar ? 'rtl' : 'ltr'}"><meta charset="utf-8"><body style="margin:0;background:#f8f9fa;font-family:Arial,sans-serif;color:#111"><div style="max-width:520px;margin:32px auto;background:#fff;border-radius:24px;overflow:hidden"><div style="background:#ff6900;padding:24px;text-align:center;font-weight:bold;letter-spacing:3px">AYROVI</div><div style="padding:32px;line-height:1.8"><h1 style="font-size:24px">${escape(title)}</h1>${body}${action ? `<p style="margin:28px 0"><a href="${escape(action.url)}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:24px;text-decoration:none;font-weight:bold">${escape(action.label)}</a></p>` : ''}<p style="font-size:12px;color:#666">${ar ? 'لن تطلب منك AYROVI كلمة المرور أو رمز التحقق عبر البريد.' : 'AYROVI ne vous demandera jamais votre mot de passe ou votre code de vérification par e-mail.'}</p></div></div></body></html>`;
}
export function enqueueAuthMail(db: QatafoDatabase, accountId: string, kind: string, input: MailInput, options: { dedupKey: string; expiresAt?: string; resetHash?: string }) {
  const now = new Date().toISOString();
  db.run(`INSERT OR IGNORE INTO customer_auth_mail_jobs (id,dedup_key,account_id,kind,reset_hash,payload,next_attempt_at,expires_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`, randomUUID(), options.dedupKey, accountId, kind, options.resetHash || null, seal(input), now,
    options.expiresAt || new Date(Date.now() + 7 * 86400_000).toISOString(), now);
}
export function enqueueWelcomeMail(db: QatafoDatabase, accountId: string) {
  const account = db.get<any>('SELECT * FROM customer_accounts WHERE id=?', accountId);
  if (!account?.email || account.status !== 'ACTIVE') return;
  const ar = account.locale?.startsWith('ar');
  const title = ar ? 'مرحبًا بك في AYROVI!' : 'Bienvenue chez AYROVI !';
  const name = escape(account.display_name || (ar ? 'عميلنا العزيز' : 'cher client'));
  const origin = customerPublicOrigin();
  enqueueAuthMail(db, accountId, 'WELCOME', { to: account.email, subject: title, html: authMailTemplate(ar, title,
    ar ? `<p>أهلًا ${name}،</p><p>تم إنشاء حسابك بنجاح. يمكنك الآن حفظ منتجاتك المفضلة ومتابعة طلباتك من حسابك.</p><p>شكرًا لاختيارك AYROVI.</p>`
      : `<p>Bonjour ${name},</p><p>Votre compte a été créé. Retrouvez vos favoris et suivez vos commandes depuis votre espace personnel.</p><p>Merci de rejoindre AYROVI.</p>`,
    origin ? { label: ar ? 'اكتشف AYROVI' : 'Découvrir AYROVI', url: origin } : undefined) }, { dedupKey: `welcome:${accountId}` });
}

/** Single-process guard + database leases for multiple workers. Provider acceptance != inbox delivery. */
const running = new WeakSet<QatafoDatabase>();
export async function processCustomerAuthMail(db: QatafoDatabase): Promise<void> {
  if (running.has(db) || !customerAuthReady()) return;
  running.add(db);
  try {
    const now = new Date().toISOString();
    db.run(`UPDATE customer_auth_mail_jobs SET status='CANCELLED',payload='' WHERE status IN ('PENDING','SENDING') AND expires_at<=?`, now);
    db.run(`DELETE FROM customer_auth_mail_jobs WHERE created_at<? AND status IN ('SENT','FAILED','CANCELLED')`, new Date(Date.now() - 30 * 86400_000).toISOString());
    db.run('DELETE FROM customer_password_resets WHERE expires_at<?', new Date(Date.now() - 86400_000).toISOString());
    db.run('DELETE FROM customer_auth_rate_limits WHERE expires_at<?', Date.now());
    if (!mailerReady()) return;
    const jobs = db.all<any>(`SELECT * FROM customer_auth_mail_jobs WHERE (status='PENDING' AND next_attempt_at<=?) OR (status='SENDING' AND lease_until<=?) ORDER BY created_at LIMIT 5`, now, now);
    for (const job of jobs) {
      const claimed = db.run(`UPDATE customer_auth_mail_jobs SET status='SENDING',lease_until=?,attempts=attempts+1 WHERE id=? AND (status='PENDING' OR (status='SENDING' AND lease_until<=?))`,
        new Date(Date.now() + 60_000).toISOString(), job.id, now);
      if (!claimed.changes) continue;
      try {
        const input = unseal(job.payload);
        const account = db.get<any>('SELECT email,status FROM customer_accounts WHERE id=?', job.account_id);
        const reset = job.reset_hash ? db.get<any>('SELECT * FROM customer_password_resets WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?', job.reset_hash, new Date().toISOString()) : null;
        if (account?.status !== 'ACTIVE' || account.email?.toLowerCase() !== input.to.toLowerCase() || (job.reset_hash && !reset)) {
          db.run("UPDATE customer_auth_mail_jobs SET status='CANCELLED',payload='' WHERE id=?", job.id); continue;
        }
        const result = await sendMail({ ...input, idempotencyKey: job.id });
        if (result.delivered) db.run("UPDATE customer_auth_mail_jobs SET status='SENT',payload='',last_error=NULL,sent_at=? WHERE id=? AND status='SENDING'", new Date().toISOString(), job.id);
        else {
          const terminal = job.attempts + 1 >= 5;
          db.run('UPDATE customer_auth_mail_jobs SET status=?,last_error=?,next_attempt_at=?,payload=CASE WHEN ? THEN ? ELSE payload END WHERE id=?',
            terminal ? 'FAILED' : 'PENDING', result.error || 'MAIL_FAILED', new Date(Date.now() + Math.min(900_000, 30_000 * 2 ** job.attempts)).toISOString(), terminal ? 1 : 0, '', job.id);
        }
      } catch {
        // Never log the payload (it can contain a password-reset link).
        db.run("UPDATE customer_auth_mail_jobs SET status='FAILED',last_error='PAYLOAD_ERROR',payload='' WHERE id=?", job.id);
        console.warn('[Customer Auth Mail] Job failed; inspect status/last_error in the database.');
      }
    }
  } finally { running.delete(db); }
}
