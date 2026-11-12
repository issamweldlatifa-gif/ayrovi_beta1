/**
 * Double authentification de la console — branchement HTTP (12/11/2026).
 *
 *  • `checkLoginSecondFactor` : appelé par `/auth/login` APRÈS un mot de passe juste ;
 *  • `/auth/2fa` (GET) : état du compte connecté ;
 *  • `/auth/2fa/setup` (POST, mot de passe) : secret en attente + lien `otpauth://` ;
 *  • `/auth/2fa/enable` (POST, code) : active et rend les 8 codes de secours (une seule fois) ;
 *  • `/auth/2fa/recovery` (POST, mot de passe + code) : régénère les codes de secours ;
 *  • `/auth/2fa/disable` (POST, mot de passe + code ou code de secours) : désactive.
 *
 * Toutes les écritures passent par `requireAdmin(db)` (session + CSRF) et sont auditées.
 */
import type { Request, Response, Router } from 'express';
import type { QatafoDatabase } from '../db/database';
import { requireAdmin, verifyPassword } from './auth';
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  openTotpSecret,
  otpauthUrl,
  parseRecoveryHashes,
  sealTotpSecret,
  verifyTotp,
} from './totp';

export type SecondFactorResult =
  | { ok: true; method: 'none' | 'totp' | 'recovery' }
  | { ok: false; code: 'TOTP_REQUIRED' | 'TOTP_INVALID'; error: string };

interface TotpRow {
  id: string;
  email: string;
  password_hash: string;
  totp_enabled?: number | null;
  totp_secret?: string | null;
  totp_pending?: string | null;
  totp_last_step?: number | null;
  totp_recovery?: string | null;
}

/** Lecture tolérante : `body.otp` (console) ou `body.code`. */
function suppliedCode(body: any): string {
  const raw = typeof body?.otp === 'string' ? body.otp : typeof body?.code === 'string' ? body.code : '';
  return raw.length <= 32 ? raw.trim() : '';
}

/**
 * Vérifie le second facteur d'un compte dont le mot de passe vient d'être validé.
 * Sans 2FA active : `{ ok: true, method: 'none' }` — comportement historique inchangé.
 */
export function checkLoginSecondFactor(db: QatafoDatabase, user: TotpRow, body: any): SecondFactorResult {
  if (!Number(user.totp_enabled)) return { ok: true, method: 'none' };
  const code = suppliedCode(body);
  if (!code) return { ok: false, code: 'TOTP_REQUIRED', error: 'Saisissez le code à 6 chiffres de votre application d’authentification.' };
  const secret = openTotpSecret(user.totp_secret);
  if (secret) {
    const step = verifyTotp(secret, code, Number(user.totp_last_step) || 0);
    if (step !== null) {
      db.run('UPDATE admin_users SET totp_last_step=? WHERE id=?', step, user.id);
      return { ok: true, method: 'totp' };
    }
  }
  if (looksLikeRecoveryCode(code)) {
    const remaining = consumeRecoveryCode(parseRecoveryHashes(user.totp_recovery), code);
    if (remaining) {
      db.run('UPDATE admin_users SET totp_recovery=? WHERE id=?', JSON.stringify(remaining), user.id);
      return { ok: true, method: 'recovery' };
    }
  }
  return { ok: false, code: 'TOTP_INVALID', error: 'Code de vérification incorrect ou expiré.' };
}

export function twoFactorStatus(row: Pick<TotpRow, 'totp_enabled' | 'totp_pending' | 'totp_recovery'> | null | undefined) {
  return {
    enabled: Boolean(Number(row?.totp_enabled)),
    pending: Boolean(row?.totp_pending) && !Number(row?.totp_enabled),
    recoveryRemaining: parseRecoveryHashes(row?.totp_recovery).length,
  };
}

type Audit = (req: Request, action: string, entityId: string) => void;

export function registerTwoFactorRoutes(router: Router, db: QatafoDatabase, audit: Audit) {
  const actorRow = (req: Request): TotpRow | null => {
    const actor = (req as any).admin as { id: string } | undefined;
    return actor ? db.get<TotpRow>('SELECT * FROM admin_users WHERE id=? AND active=1', actor.id) ?? null : null;
  };
  const passwordOk = (row: TotpRow, req: Request) => {
    const password = typeof req.body?.password === 'string' && req.body.password.length <= 1024 ? req.body.password : '';
    return Boolean(password) && verifyPassword(password, row.password_hash);
  };
  const fail = (res: Response, status: number, code: string, error: string) => res.status(status).json({ success: false, code, error });

  router.get('/auth/2fa', requireAdmin(db), (req, res) => {
    const row = actorRow(req);
    if (!row) return fail(res, 401, 'UNAUTHENTICATED', 'Non authentifié.');
    res.json({ success: true, data: twoFactorStatus(row) });
  });

  router.post('/auth/2fa/setup', requireAdmin(db), (req, res) => {
    const row = actorRow(req);
    if (!row) return fail(res, 401, 'UNAUTHENTICATED', 'Non authentifié.');
    if (Number(row.totp_enabled)) return fail(res, 409, 'TOTP_ALREADY_ENABLED', 'La double authentification est déjà active.');
    if (!passwordOk(row, req)) return fail(res, 400, 'PASSWORD_INVALID', 'Mot de passe incorrect.');
    const secret = generateTotpSecret();
    db.run('UPDATE admin_users SET totp_pending=?, updated_at=? WHERE id=?', sealTotpSecret(secret), new Date().toISOString(), row.id);
    res.json({ success: true, data: { secret, otpauthUrl: otpauthUrl(secret, row.email) } });
  });

  router.post('/auth/2fa/enable', requireAdmin(db), (req, res) => {
    const row = actorRow(req);
    if (!row) return fail(res, 401, 'UNAUTHENTICATED', 'Non authentifié.');
    if (Number(row.totp_enabled)) return fail(res, 409, 'TOTP_ALREADY_ENABLED', 'La double authentification est déjà active.');
    const secret = openTotpSecret(row.totp_pending);
    if (!secret) return fail(res, 400, 'TOTP_NOT_STARTED', 'Commencez par générer une clé.');
    const step = verifyTotp(secret, suppliedCode(req.body), 0);
    if (step === null) return fail(res, 400, 'TOTP_INVALID', 'Code incorrect. Vérifiez l’heure du téléphone et réessayez.');
    const codes = generateRecoveryCodes();
    db.run(
      'UPDATE admin_users SET totp_enabled=1, totp_secret=?, totp_pending=NULL, totp_last_step=?, totp_recovery=?, updated_at=? WHERE id=?',
      sealTotpSecret(secret), step, JSON.stringify(codes.map(hashRecoveryCode)), new Date().toISOString(), row.id,
    );
    audit(req, 'ENABLE_2FA', row.id);
    res.json({ success: true, data: { enabled: true, recoveryCodes: codes } });
  });

  const verifyCurrentFactor = (row: TotpRow, req: Request): boolean => {
    const result = checkLoginSecondFactor(db, row, req.body);
    return result.ok;
  };

  router.post('/auth/2fa/recovery', requireAdmin(db), (req, res) => {
    const row = actorRow(req);
    if (!row) return fail(res, 401, 'UNAUTHENTICATED', 'Non authentifié.');
    if (!Number(row.totp_enabled)) return fail(res, 409, 'TOTP_DISABLED', 'La double authentification n’est pas active.');
    if (!passwordOk(row, req)) return fail(res, 400, 'PASSWORD_INVALID', 'Mot de passe incorrect.');
    if (!verifyCurrentFactor(row, req)) return fail(res, 400, 'TOTP_INVALID', 'Code de vérification incorrect ou expiré.');
    const codes = generateRecoveryCodes();
    db.run('UPDATE admin_users SET totp_recovery=?, updated_at=? WHERE id=?', JSON.stringify(codes.map(hashRecoveryCode)), new Date().toISOString(), row.id);
    audit(req, 'REGENERATE_2FA_RECOVERY', row.id);
    res.json({ success: true, data: { recoveryCodes: codes } });
  });

  router.post('/auth/2fa/disable', requireAdmin(db), (req, res) => {
    const row = actorRow(req);
    if (!row) return fail(res, 401, 'UNAUTHENTICATED', 'Non authentifié.');
    if (!Number(row.totp_enabled)) {
      db.run('UPDATE admin_users SET totp_pending=NULL WHERE id=?', row.id);
      return res.json({ success: true, data: twoFactorStatus({ ...row, totp_pending: null }) });
    }
    if (!passwordOk(row, req)) return fail(res, 400, 'PASSWORD_INVALID', 'Mot de passe incorrect.');
    if (!verifyCurrentFactor(row, req)) return fail(res, 400, 'TOTP_INVALID', 'Code de vérification incorrect ou expiré.');
    db.run("UPDATE admin_users SET totp_enabled=0, totp_secret=NULL, totp_pending=NULL, totp_last_step=0, totp_recovery='[]', updated_at=? WHERE id=?", new Date().toISOString(), row.id);
    audit(req, 'DISABLE_2FA', row.id);
    res.json({ success: true, data: { enabled: false, pending: false, recoveryRemaining: 0 } });
  });
}

/** Réinitialisation par un responsable (`users:write`) — compte bloqué, téléphone perdu. */
export function resetTwoFactor(db: QatafoDatabase, userId: string) {
  db.run("UPDATE admin_users SET totp_enabled=0, totp_secret=NULL, totp_pending=NULL, totp_last_step=0, totp_recovery='[]', updated_at=? WHERE id=?", new Date().toISOString(), userId);
  db.run('DELETE FROM admin_sessions WHERE user_id=?', userId);
}
