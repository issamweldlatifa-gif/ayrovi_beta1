/**
 * Clé de limitation de débit : session VALIDÉE d'abord, IP ensuite.
 *
 * Les opérateurs mobiles font sortir de nombreux abonnés derrière une même IP
 * publique (CGNAT). Les sessions actives peuvent donc avoir des quotas séparés.
 * Mais une simple valeur Bearer/cookie fournie par l'appelant n'est pas une
 * preuve de session : seul un jeton présent en base, non expiré et rattaché à
 * un compte actif reçoit un bucket de compte. Toute autre requête retombe sur
 * l'IP, ce qui empêche de créer des buckets en faisant tourner de faux jetons.
 */
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { hashToken, sessionTokenFromRequest } from '../customer/auth';

export function clientRateLimitKey(
  req: Pick<Request, 'headers' | 'ip'>,
  db: QatafoDatabase | null,
): string {
  const token = sessionTokenFromRequest(req as Request);
  if (token && db) {
    try {
      const session = db.get<{ account_id: string }>(
        `SELECT s.account_id FROM customer_sessions s
         JOIN customer_accounts a ON a.id=s.account_id
         WHERE s.id=? AND s.expires_at>? AND a.status='ACTIVE'`,
        hashToken(token),
        new Date().toISOString(),
      );
      if (session?.account_id) {
        // Account-level buckets keep a fresh login/session from resetting the
        // customer's allowance while separating authenticated users on NAT.
        const accountKey = createHash('sha256').update(session.account_id).digest('hex').slice(0, 24);
        return `account:${accountKey}`;
      }
    } catch {
      // If auth/database state is unavailable, never trust the caller's token.
    }
  }
  return `ip:${req.ip || 'unknown'}`;
}
