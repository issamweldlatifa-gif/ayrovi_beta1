import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { QatafoDatabase } from '../db/database';
import type { AdminIdentity } from './auth';

export interface AdminAuditActor {
  id: string | null;
  name: string;
  ipAddress: string | null;
}

export function auditActorFromRequest(req: Request): AdminAuditActor {
  const actor = (req as Request & { admin?: AdminIdentity }).admin;
  return {
    id: actor?.id || null,
    name: actor?.name || 'Système',
    ipAddress: req.ip || null,
  };
}

/**
 * Canonical Administration audit writer. Payloads must be metadata-only:
 * callers must never pass source document bytes, provider payloads or secrets.
 */
export function recordAdminAudit(
  db: QatafoDatabase,
  actor: AdminAuditActor,
  action: string,
  module: string,
  entityId: string | null,
  oldValue: unknown,
  newValue: unknown,
): string {
  const id = `audit_${randomUUID()}`;
  db.run(`INSERT INTO audit_logs
    (id,user_id,user_name,action,module,entity_id,old_value,new_value,ip_address,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
  id,
  actor.id,
  String(actor.name || 'Système').slice(0, 160),
  String(action).slice(0, 100),
  String(module).slice(0, 100),
  entityId,
  oldValue == null ? null : JSON.stringify(oldValue),
  newValue == null ? null : JSON.stringify(newValue),
  actor.ipAddress,
  new Date().toISOString());
  return id;
}
