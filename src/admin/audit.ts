/**
 * AYROVI Administration — audit actor plumbing.
 *
 * The writer itself lives in `src/erp-core/audit.ts` (ONE audit system for the
 * whole back office, including the CRM). This module keeps the API the 13
 * arrival-ingestion services already call (`AdminAuditActor`,
 * `auditActorFromRequest`, `recordAdminAudit`) and forwards to that writer, so
 * no call site changed while every row now carries employee identity, resource
 * type, request id and a field-level diff.
 */
import type { Request } from 'express';
import type { QatafoDatabase } from '../db/database';
import { writeAuditEvent, type ErpFieldChange } from '../erp-core/audit';

export interface AdminAuditActor {
  id: string | null;
  name: string;
  ipAddress: string | null;
}

export function auditActorFromRequest(req: Request): AdminAuditActor {
  const actor = (req as Request & { admin?: { id?: string; name?: string } }).admin;
  return {
    id: actor?.id || null,
    name: actor?.name || 'Système',
    ipAddress: req.ip || null,
  };
}

/** Request-scoped context the ERP audit writer needs (no extra DB read here). */
export function auditContextFromAdminRequest(req: Request) {
  const actor = (req as Request & { admin?: { id?: string } }).admin;
  return {
    requestId: (req as Request & { requestId?: string }).requestId ?? null,
    sessionId: actor?.id ? String(actor.id).slice(0, 80) : null,
    userAgent: (String(req.headers['user-agent'] || '').slice(0, 300) || null),
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
  extra?: { resourceType?: string; fieldChanges?: ErpFieldChange[]; context?: Parameters<typeof writeAuditEvent>[1]['context'] },
): string {
  return writeAuditEvent(db, {
    actor,
    action,
    module,
    resource: { type: extra?.resourceType, id: entityId },
    oldValues: oldValue,
    newValues: newValue,
    fieldChanges: extra?.fieldChanges,
    context: extra?.context,
  });
}
