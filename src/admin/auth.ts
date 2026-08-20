import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { QatafoDatabase } from '../db/database';
import { AdminPermission, AdminRole, hasPermission, permissionsForRole } from './permissions';

const COOKIE_NAME = 'ayrovi_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface AdminIdentity {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  permissions: AdminPermission[];
  csrfToken: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [scheme, salt, storedHex] = encoded.split('$');
  if (scheme !== 'scrypt' || !salt || !storedHex) return false;
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHex, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function parseCookie(header: string | undefined, name: string): string {
  if (!header) return '';
  for (const item of header.split(';')) {
    const [key, ...value] = item.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return '';
}

function cookieValue(token: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function ensureBootstrapAdmin(db: QatafoDatabase) {
  const email = (process.env.ADMIN_EMAIL || 'admin@ayrovi.tn').trim().toLowerCase();
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const forceReset = /^(1|true|yes|oui)$/i.test(String(process.env.ADMIN_BOOTSTRAP_RESET || '').trim());
  const existing = db.get<{ count: number }>('SELECT COUNT(*) AS count FROM admin_users');
  const hasAdmins = (existing?.count ?? 0) > 0;

  // Comportement normal : ne créer un compte que s'il n'existe aucun administrateur.
  if (hasAdmins && !forceReset) return;

  const password = configuredPassword || (process.env.NODE_ENV === 'production' ? '' : 'AyroviBeta2026!');
  if (!password) {
    console.warn('[Admin] Aucun compte créé. Définissez ADMIN_EMAIL et ADMIN_PASSWORD puis redémarrez.');
    return;
  }
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters');
  const now = new Date().toISOString();

  // Mode réinitialisation d'urgence (ADMIN_BOOTSTRAP_RESET=yes) : ré-applique le couple
  // ADMIN_EMAIL/ADMIN_PASSWORD sur le compte existant (ou le crée s'il n'existe pas).
  // Utile quand la base persistante contient déjà un administrateur dont le mot de passe est inconnu.
  if (hasAdmins && forceReset) {
    const target = db.get<{ id: string }>('SELECT id FROM admin_users WHERE email=? LIMIT 1', email)
      || db.get<{ id: string }>('SELECT id FROM admin_users ORDER BY created_at ASC LIMIT 1');
    if (target) {
      db.run('UPDATE admin_users SET email=?, password_hash=?, active=1, updated_at=? WHERE id=?',
        email, hashPassword(password), now, target.id);
      console.info(`[Admin] Mot de passe réinitialisé via ADMIN_BOOTSTRAP_RESET pour ${email}. Retirez cette variable après connexion.`);
      return;
    }
  }

  db.run(`INSERT INTO admin_users (id,email,name,password_hash,role,active,created_at,updated_at)
    VALUES (?,?,?,?, 'SUPER_ADMIN',1,?,?)`, `admin_${randomUUID()}`, email, 'AYSONIC Admin', hashPassword(password), now, now);
  if (!configuredPassword) console.warn('[Admin] Compte de développement créé: admin@ayrovi.tn (changez ADMIN_PASSWORD avant production).');
  if (forceReset) console.info(`[Admin] Compte administrateur créé en mode reset pour ${email}.`);
}

export function createAdminSession(db: QatafoDatabase, user: any) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.run(`INSERT INTO admin_sessions (id,user_id,csrf_token,expires_at,created_at,last_seen_at)
    VALUES (?,?,?,?,?,?)`, hashToken(token), user.id, hashToken(csrfToken), expiresAt.toISOString(), now.toISOString(), now.toISOString());
  db.run('UPDATE admin_users SET last_login_at=?, updated_at=? WHERE id=?', now.toISOString(), now.toISOString(), user.id);
  return { token, csrfToken, expiresAt: expiresAt.toISOString() };
}

export function rotateCsrfToken(db: QatafoDatabase, req: Request): string | null {
  const token = parseCookie(req.headers.cookie, COOKIE_NAME);
  if (!token) return null;
  const csrfToken = randomBytes(24).toString('base64url');
  const result = db.run('UPDATE admin_sessions SET csrf_token=?, last_seen_at=? WHERE id=? AND expires_at>?',
    hashToken(csrfToken), new Date().toISOString(), hashToken(token), new Date().toISOString());
  return result.changes > 0 ? csrfToken : null;
}

export function setAdminCookie(res: Response, token: string) {
  res.setHeader('Set-Cookie', cookieValue(token, Math.floor(SESSION_TTL_MS / 1000)));
}

export function clearAdminCookie(res: Response) {
  res.setHeader('Set-Cookie', cookieValue('', 0));
}

export function resolveAdmin(db: QatafoDatabase, req: Request): AdminIdentity | null {
  const token = parseCookie(req.headers.cookie, COOKIE_NAME);
  if (!token) return null;
  const session = db.get<any>(`SELECT s.*,u.email,u.name,u.role,u.active
    FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
    WHERE s.id=? AND s.expires_at>?`, hashToken(token), new Date().toISOString());
  if (!session || !session.active) return null;
  const csrfToken = String(req.headers['x-csrf-token'] || '');
  db.run('UPDATE admin_sessions SET last_seen_at=? WHERE id=?', new Date().toISOString(), session.id);
  return {
    id: session.user_id,
    email: session.email,
    name: session.name,
    role: session.role,
    permissions: permissionsForRole(session.role),
    csrfToken,
  };
}

export function requireAdmin(db: QatafoDatabase, permission?: AdminPermission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const admin = resolveAdmin(db, req);
    if (!admin) {
      clearAdminCookie(res);
      return res.status(401).json({ success: false, error: 'Session administrateur invalide ou expirée.' });
    }
    if (permission && !hasPermission(admin.role, permission)) {
      return res.status(403).json({ success: false, error: 'Vous ne disposez pas de cette permission.' });
    }
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const token = parseCookie(req.headers.cookie, COOKIE_NAME);
      const session = db.get<any>('SELECT csrf_token FROM admin_sessions WHERE id=?', hashToken(token));
      const supplied = String(req.headers['x-csrf-token'] || '');
      if (!session || !supplied || hashToken(supplied) !== session.csrf_token) {
        return res.status(403).json({ success: false, error: 'Jeton CSRF invalide.' });
      }
    }
    (req as any).admin = admin;
    next();
  };
}

export function destroySession(db: QatafoDatabase, req: Request) {
  const token = parseCookie(req.headers.cookie, COOKIE_NAME);
  if (token) db.run('DELETE FROM admin_sessions WHERE id=?', hashToken(token));
}

export function cleanupExpiredSessions(db: QatafoDatabase) {
  db.run('DELETE FROM admin_sessions WHERE expires_at<=?', new Date().toISOString());
}

export function sessionCookieName() {
  return COOKIE_NAME;
}
