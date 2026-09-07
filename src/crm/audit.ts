/**
 * AYROVI CRM 360 (E1) — audit par l'UNIQUE écriture du système.
 *
 * Le module n'écrit jamais dans `audit_logs` directement : chaque mutation passe par
 * `writeAuditEvent` (acteur employé, requête/session, type et id de ressource, diff champ
 * à champ, événement ERP dérivé). En plus, une mutation d'état écrit une ligne lisible
 * dans `crm360_status_events` qui alimente la timeline métier — les deux écritures sont
 * faites ensemble par `recordCrmMutation`.
 *
 * Un refus n'est pas silencieux : `requireErpPermission({ permissive:false })` écrit déjà
 * sa ligne `ACCESS_DENIED`.
 */
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { QatafoDatabase } from '../db/database';
import { fieldDiff, writeAuditEvent, type ErpAuditContextInput } from '../erp-core/audit';
import { resolveEmployee } from '../erp-core/identity';

export const CRM_AUDIT_MODULE = 'CRM';

export interface CrmActor {
  id: string | null;
  name: string | null;
  ipAddress?: string | null;
}

/** Contexte d'audit attaché à la requête par `requireErpPermission` (employee résolu). */
export function crmContext(db: QatafoDatabase, req?: Request): ErpAuditContextInput {
  const admin = (req as (Request & { admin?: { id?: string; name?: string } }) | undefined)?.admin;
  return {
    requestId: (req as (Request & { requestId?: string }) | undefined)?.requestId ?? null,
    sessionId: admin?.id ? String(admin.id).slice(0, 80) : null,
    userAgent: req ? String(req.headers['user-agent'] || '').slice(0, 300) || null : null,
    employee: admin?.id ? resolveEmployee(db, String(admin.id)) : null,
  };
}

export interface CrmMutationInput {
  actor: CrmActor;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  note?: Record<string, unknown> | null;
  context?: ErpAuditContextInput | null;
  /** Événement métier optionnel écrit dans `crm360_status_events`. */
  statusEvent?: {
    entityType: string;
    entityId: string;
    verb: string;
    fromValue?: string | null;
    toValue?: string | null;
    note?: string;
    actorEmployeeId?: string | null;
    at?: string;
  } | null;
}

/** Enregistre l'audit puis, le cas échéant, l'événement de timeline. Renvoie l'id d'audit. */
export function recordCrmMutation(db: QatafoDatabase, input: CrmMutationInput): string {
  const after = input.after ? (input.note ? { ...input.after, ...input.note } : input.after) : (input.note ?? null);
  const auditId = writeAuditEvent(db, {
    actor: { id: input.actor.id, name: input.actor.name, ipAddress: input.actor.ipAddress ?? null },
    action: input.action,
    module: CRM_AUDIT_MODULE,
    resource: { type: input.resourceType, id: input.resourceId },
    oldValues: input.before ?? null,
    newValues: after,
    fieldChanges: fieldDiff(input.before, input.after),
    context: input.context ?? undefined,
  });
  if (input.statusEvent) {
    const event = input.statusEvent;
    db.run(`INSERT INTO crm360_status_events
      (id,entity_type,entity_id,verb,from_value,to_value,note,actor_employee_id,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`,
    `st_${randomUUID()}`, event.entityType, String(event.entityId).slice(0, 160), String(event.verb).slice(0, 40),
    event.fromValue != null ? String(event.fromValue).slice(0, 200) : null,
    event.toValue != null ? String(event.toValue).slice(0, 200) : null,
    String(event.note ?? '').slice(0, 2000),
    event.actorEmployeeId ? String(event.actorEmployeeId).slice(0, 160) : null,
    event.at ?? new Date().toISOString());
  }
  return auditId;
}
