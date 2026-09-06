/**
 * AYROVI Inventory (P2.2) — audit, par l'UNIQUE écriture du système.
 *
 * Le module n'écrit jamais dans `audit_logs` directement : chaque mutation passe par
 * `writeAuditEvent`, ce qui lui donne gratuitement les garanties posées en P1 — acteur +
 * identité employé (`EMP-*`), requête/session/user-agent, type et id de ressource, images
 * avant/après, une ligne par champ modifié dans `erp_audit_changes`, et l'événement ERP
 * dérivé (`stock.item.created`, `stock.movement.recorded`, `stocktake.approved`, …).
 *
 * Le stock n'a aucune donnée sensible à masquer : aucun mot de passe, cookie ni jeton
 * n'entre dans `before`/`after`, et la liste d'exclusion du moteur n'est pas étendue.
 */
import type { Request } from 'express';
import type { QatafoDatabase } from '../db/database';
import { fieldDiff, writeAuditEvent, type ErpAuditContextInput } from '../erp-core/audit';
import { resolveEmployee } from '../erp-core/identity';

export const INVENTORY_AUDIT_MODULE = 'INVENTORY';

export interface InventoryActor {
  id: string | null;
  name: string | null;
  ipAddress?: string | null;
}

export interface InventoryAuditInput {
  actor: InventoryActor;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Contexte non sensible ajouté à l'image « après » (ex. solde recalculé). */
  note?: Record<string, unknown> | null;
  context?: ErpAuditContextInput | null;
}

/** Construit le contexte d'audit depuis une requête, comme les routes ERP Core. */
export function inventoryContext(db: QatafoDatabase, req?: Request): ErpAuditContextInput {
  const admin = (req as (Request & { admin?: { id?: string; name?: string } }) | undefined)?.admin;
  return {
    requestId: (req as (Request & { requestId?: string }) | undefined)?.requestId ?? null,
    sessionId: admin?.id ? String(admin.id).slice(0, 80) : null,
    userAgent: req ? String(req.headers['user-agent'] || '').slice(0, 300) || null : null,
    employee: admin?.id ? resolveEmployee(db, String(admin.id)) : null,
  };
}

/** Point d'entrée unique de toute mutation du module. Renvoie l'identifiant d'audit. */
export function auditInventory(db: QatafoDatabase, input: InventoryAuditInput): string {
  const after = input.after
    ? (input.note ? { ...input.after, ...input.note } : input.after)
    : (input.note ?? null);
  return writeAuditEvent(db, {
    actor: { id: input.actor.id, name: input.actor.name, ipAddress: input.actor.ipAddress ?? null },
    action: input.action,
    module: INVENTORY_AUDIT_MODULE,
    resource: { type: input.resourceType, id: input.resourceId },
    oldValues: input.before ?? null,
    newValues: after,
    fieldChanges: fieldDiff(input.before, input.after),
    context: input.context ?? undefined,
  });
}
