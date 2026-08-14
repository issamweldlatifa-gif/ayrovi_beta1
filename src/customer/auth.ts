import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { QatafoDatabase } from '../db/database';

const COOKIE_NAME = 'ayrovi_customer_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEVELOPMENT_SECRET = 'ayrovi-development-customer-auth-secret-not-for-production';

export interface CustomerIdentity {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  status: 'ACTIVE' | 'BLOCKED' | 'DELETED';
  locale: string;
  marketingOptIn: boolean;
}

interface ResolvedCustomer extends CustomerIdentity {
  sessionId: string;
}

function configuredSecret(): string {
  return (process.env.CUSTOMER_AUTH_SECRET || (process.env.NODE_ENV === 'production' ? '' : DEVELOPMENT_SECRET)).trim();
}

export function customerAuthReady(): boolean {
  return configuredSecret().length >= 32;
}

export function requireCustomerAuthSecret(): string {
  const secret = configuredSecret();
  if (secret.length < 32) throw new Error('CUSTOMER_AUTH_NOT_CONFIGURED');
  return secret;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function keyedHash(value: string): string {
  return createHash('sha256').update(`${requireCustomerAuthSecret()}\u0000${value}`).digest('hex');
}

export function safeEqualHash(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(keyedHash(value), 'hex');
  const expected = Buffer.from(expectedHash || '', 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseCookie(header: string | undefined, name: string): string {
  if (!header) return '';
  for (const item of header.split(';')) {
    const [key, ...value] = item.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(value.join('='));
      } catch {
        return '';
      }
    }
  }
  return '';
}

function cookieValue(token: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function appendCookie(res: Response, value: string) {
  const existing = res.getHeader('Set-Cookie');
  const values = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
  res.setHeader('Set-Cookie', [...values, value]);
}

function mapAccount(row: any): CustomerIdentity {
  return {
    id: row.account_id || row.id,
    displayName: String(row.display_name || ''),
    email: row.email || null,
    phone: row.phone || null,
    avatarUrl: String(row.avatar_url || ''),
    emailVerified: Boolean(row.email_verified_at),
    phoneVerified: Boolean(row.phone_verified_at),
    status: row.status,
    locale: String(row.locale || 'fr-TN'),
    marketingOptIn: Boolean(row.marketing_opt_in),
  };
}

export function createCustomerSession(db: QatafoDatabase, accountId: string, req: Request) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.run(`INSERT INTO customer_sessions
    (id,account_id,csrf_token,expires_at,created_at,last_seen_at,ip_address,user_agent)
    VALUES (?,?,?,?,?,?,?,?)`, hashToken(token), accountId, hashToken(csrfToken), expiresAt.toISOString(),
    now.toISOString(), now.toISOString(), req.ip || '', String(req.headers['user-agent'] || '').slice(0, 500));
  db.run('UPDATE customer_accounts SET last_login_at=?,updated_at=? WHERE id=?', now.toISOString(), now.toISOString(), accountId);
  return { token, csrfToken, expiresAt: expiresAt.toISOString() };
}

export function setCustomerCookie(res: Response, token: string) {
  appendCookie(res, cookieValue(token, Math.floor(SESSION_TTL_MS / 1000)));
}

export function clearCustomerCookie(res: Response) {
  appendCookie(res, cookieValue('', 0));
}

export function resolveCustomer(db: QatafoDatabase, req: Request): ResolvedCustomer | null {
  const token = parseCookie(req.headers.cookie, COOKIE_NAME);
  if (!token) return null;
  const session = db.get<any>(`SELECT s.id session_id,s.account_id,s.expires_at,
      a.display_name,a.email,a.phone,a.avatar_url,a.email_verified_at,a.phone_verified_at,
      a.status,a.locale,a.marketing_opt_in
    FROM customer_sessions s JOIN customer_accounts a ON a.id=s.account_id
    WHERE s.id=? AND s.expires_at>?`, hashToken(token), new Date().toISOString());
  if (!session || session.status !== 'ACTIVE') return null;
  db.run('UPDATE customer_sessions SET last_seen_at=? WHERE id=?', new Date().toISOString(), session.session_id);
  return { ...mapAccount(session), sessionId: session.session_id };
}

export function rotateCustomerCsrf(db: QatafoDatabase, req: Request): string | null {
  const token = parseCookie(req.headers.cookie, COOKIE_NAME);
  if (!token) return null;
  const csrfToken = randomBytes(24).toString('base64url');
  const result = db.run(`UPDATE customer_sessions SET csrf_token=?,last_seen_at=?
    WHERE id=? AND expires_at>?`, hashToken(csrfToken), new Date().toISOString(), hashToken(token), new Date().toISOString());
  return result.changes ? csrfToken : null;
}

export function requireCustomer(db: QatafoDatabase, options: { verifiedPhone?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const customer = resolveCustomer(db, req);
    if (!customer) {
      clearCustomerCookie(res);
      return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'Connectez-vous à votre compte AYROVI.' });
    }
    if (options.verifiedPhone && !customer.phoneVerified) {
      return res.status(403).json({ success: false, code: 'PHONE_VERIFICATION_REQUIRED', error: 'Vérifiez votre numéro de téléphone avant de confirmer la commande.' });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const token = parseCookie(req.headers.cookie, COOKIE_NAME);
      const session = db.get<any>('SELECT csrf_token FROM customer_sessions WHERE id=?', hashToken(token));
      const supplied = String(req.headers['x-csrf-token'] || '');
      if (!session || !supplied || hashToken(supplied) !== session.csrf_token) {
        return res.status(403).json({ success: false, code: 'INVALID_CSRF', error: 'Session de sécurité invalide. Actualisez la page.' });
      }
    }
    (req as any).customer = customer;
    next();
  };
}

export function optionalCustomer(db: QatafoDatabase) {
  return (req: Request, res: Response, next: NextFunction) => {
    const customer = resolveCustomer(db, req);
    if (!customer) return next();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const session = db.get<any>('SELECT csrf_token FROM customer_sessions WHERE id=?', customer.sessionId);
      const supplied = String(req.headers['x-csrf-token'] || '');
      if (!session || !supplied || hashToken(supplied) !== session.csrf_token) {
        return res.status(403).json({ success: false, code: 'INVALID_CSRF', error: 'Session de sécurité invalide. Actualisez la page.' });
      }
    }
    (req as any).customer = customer;
    next();
  };
}

export function destroyCustomerSession(db: QatafoDatabase, req: Request) {
  const token = parseCookie(req.headers.cookie, COOKIE_NAME);
  if (token) db.run('DELETE FROM customer_sessions WHERE id=?', hashToken(token));
}

export function customerFromRequest(req: Request): CustomerIdentity {
  return (req as any).customer as CustomerIdentity;
}

export function cleanupCustomerAuth(db: QatafoDatabase) {
  const now = new Date().toISOString();
  db.run('DELETE FROM customer_sessions WHERE expires_at<=?', now);
  db.run('DELETE FROM customer_otp_challenges WHERE expires_at<=?', now);
  db.run('DELETE FROM customer_oauth_states WHERE expires_at<=?', now);
}
