/**
 * AYROVI Catalogue (P2.1) — audit, through the ONE writer.
 *
 * The catalogue never writes `audit_logs` itself: every mutation goes through
 * `writeAuditEvent`, which is what gives this module, for free, the guarantees built in
 * P1 — actor + employee identity (`EMP-*`), request/session/user-agent, resource type and
 * id, before/after images, a row per changed field in `erp_audit_changes`, and the
 * derived ERP event (`product.created`, `variant.updated`, `product.archived`, …).
 *
 * Sensitive values are excluded by the writer's own deny-list (`password_hash`,
 * `csrf_token`, provider payloads, raw extraction blobs); the catalogue adds nothing to
 * it and never puts credentials, cookies or tokens in `before`/`after`.
 */
import type { Request } from 'express';
import type { QatafoDatabase } from '../db/database';
import { fieldDiff, writeAuditEvent, type ErpAuditContextInput } from '../erp-core/audit';
import { resolveEmployee } from '../erp-core/identity';

export const CATALOGUE_AUDIT_MODULE = 'CATALOGUE';

export interface CatalogueActor {
  id: string | null;
  name: string | null;
  ipAddress?: string | null;
}

export interface CatalogueAuditInput {
  actor: CatalogueActor;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Extra non-secret context merged into the recorded "after" (e.g. counts). */
  note?: Record<string, unknown> | null;
  context?: ErpAuditContextInput | null;
}

/** Builds the audit context from a request the way the ERP core routes do. */
export function catalogueContext(db: QatafoDatabase, req?: Request): ErpAuditContextInput {
  const admin = (req as (Request & { admin?: { id?: string; name?: string } }) | undefined)?.admin;
  return {
    requestId: (req as (Request & { requestId?: string }) | undefined)?.requestId ?? null,
    sessionId: admin?.id ? String(admin.id).slice(0, 80) : null,
    userAgent: req ? String(req.headers['user-agent'] || '').slice(0, 300) || null : null,
    employee: admin?.id ? resolveEmployee(db, String(admin.id)) : null,
  };
}

/** One entry point for every catalogue mutation. Returns the audit id. */
export function auditCatalogue(db: QatafoDatabase, input: CatalogueAuditInput): string {
  const after = input.after
    ? (input.note ? { ...input.after, ...input.note } : input.after)
    : (input.note ?? null);
  return writeAuditEvent(db, {
    actor: { id: input.actor.id, name: input.actor.name, ipAddress: input.actor.ipAddress ?? null },
    action: input.action,
    module: CATALOGUE_AUDIT_MODULE,
    resource: { type: input.resourceType, id: input.resourceId },
    oldValues: input.before ?? null,
    newValues: after,
    fieldChanges: fieldDiff(input.before, input.after),
    context: input.context ?? undefined,
  });
}
