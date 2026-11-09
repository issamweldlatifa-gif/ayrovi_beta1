/**
 * Use an authenticated account bucket, never a caller's asserted token.
 * Valid accounts behind one mobile carrier/NAT keep independent allowances;
 * rotating unknown, expired or revoked Bearers/cookies shares the IP fallback.
 * Multiple sessions of one account share its allowance. No raw secrets are kept
 * in the limiter. Without a session store, fail safe to the IP bucket.
 */
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { hashToken, sessionTokenFromRequest } from '../customer/auth';
import type { QatafoDatabase } from '../db/database';

export function clientRateLimitKey(
  req: Pick<Request, 'headers' | 'ip'>,
  db?: Pick<QatafoDatabase, 'get'>,
): string {
  const token = sessionTokenFromRequest(req as Request);
  if (token && token.length <= 512 && db) {
    // Read-only: checking a budget must not renew a session or write last_seen.
    const session = db.get<{ account_id: string }>(`SELECT s.account_id
      FROM customer_sessions s JOIN customer_accounts a ON a.id=s.account_id
      WHERE s.id=? AND s.expires_at>? AND a.status='ACTIVE'`, hashToken(token), new Date().toISOString());
    if (session) return `account:${createHash('sha256').update(session.account_id).digest('hex').slice(0, 24)}`;
  }
  return `ip:${req.ip || 'unknown'}`;
}
