/**
 * AYROVI Purchasing (P2.3) — audit, par l'UNIQUE écriture du système.
 *
 * Le module n'écrit jamais dans `audit_logs` : chaque mutation passe par `writeAuditEvent`,
 * ce qui donne l'acteur + l'identité employé, la requête/session, le type et l'id de
 * ressource, le diff champ à champ (`erp_audit_changes`) et l'événement ERP dérivé.
 *
 * Un refus n'est pas silencieux : `requireErpPermission({ permissive:false })` écrit déjà sa
 * ligne `ACCESS_DENIED` — le module n'ajoute pas un second journal de refus.
 */
import type { Request } from 'express';
import type { QatafoDatabase } from '../db/database';
import { fieldDiff, writeAuditEvent, type ErpAuditContextInput } from '../erp-core/audit';
import { resolveEmployee } from '../erp-core/identity';

export const PURCHASING_AUDIT_MODULE = 'PURCHASING';

export interface PurchasingActor {
  id: string | null;
  name: string | null;
  ipAddress?: string | null;
}

/**
 * Vocabulaire d'action : celui du moteur, pas un vocabulaire local.
 * `writeAuditEvent` dérive l'événement ERP du verbe (`CREATE` → `.created`,
 * `STATUS_CHANGE` → `.status-changed`), et l'écran d'audit filtre sur ces verbes ; un
 * `purchasing.order.approve` inventé ici serait une ligne invisible dans les filtres.
 * Le verbe métier (SUBMIT, APPROVE, POST…) voyage dans `note.transition`.
 */
export const PURCHASING_AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'STATUS_CHANGE'] as const;
export type PurchasingAuditAction = (typeof PURCHASING_AUDIT_ACTIONS)[number];

export const PURCHASING_TRANSITIONS = ['SUBMIT', 'APPROVE', 'REJECT', 'CANCEL', 'POST', 'DISCARD', 'DEACTIVATE', 'ACTIVATE'] as const;
export type PurchasingTransition = (typeof PURCHASING_TRANSITIONS)[number];

export interface PurchasingAuditInput {
  actor: PurchasingActor;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  note?: Record<string, unknown> | null;
  context?: ErpAuditContextInput | null;
}

/** Une transition de statut, racontée par le verbe du moteur + le verbe métier en note. */
export function auditPurchasingTransition(
  db: QatafoDatabase,
  input: {
    actor: PurchasingActor;
    transition: PurchasingTransition;
    resourceType: string;
    resourceId: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    reason?: string | null;
    context?: ErpAuditContextInput | null;
  },
): string {
  return auditPurchasing(db, {
    actor: input.actor, action: 'STATUS_CHANGE', resourceType: input.resourceType, resourceId: input.resourceId,
    before: input.before ?? null, after: input.after ?? null,
    note: { transition: input.transition, ...(input.reason ? { reason: input.reason } : {}) },
    context: input.context ?? null,
  });
}

export function purchasingContext(db: QatafoDatabase, req?: Request): ErpAuditContextInput {
  const admin = (req as (Request & { admin?: { id?: string; name?: string } }) | undefined)?.admin;
  return {
    requestId: (req as (Request & { requestId?: string }) | undefined)?.requestId ?? null,
    sessionId: admin?.id ? String(admin.id).slice(0, 80) : null,
    userAgent: req ? String(req.headers['user-agent'] || '').slice(0, 300) || null : null,
    employee: admin?.id ? resolveEmployee(db, String(admin.id)) : null,
  };
}

/** Point d'entrée unique de toute mutation des achats. Renvoie l'identifiant d'audit. */
export function auditPurchasing(db: QatafoDatabase, input: PurchasingAuditInput): string {
  const after = input.after
    ? (input.note ? { ...input.after, ...input.note } : input.after)
    : (input.note ?? null);
  return writeAuditEvent(db, {
    actor: { id: input.actor.id, name: input.actor.name, ipAddress: input.actor.ipAddress ?? null },
    action: input.action,
    module: PURCHASING_AUDIT_MODULE,
    resource: { type: input.resourceType, id: input.resourceId },
    oldValues: input.before ?? null,
    newValues: after,
    fieldChanges: fieldDiff(input.before, input.after),
    context: input.context ?? undefined,
  });
}
