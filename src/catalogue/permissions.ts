/**
 * AYROVI Catalogue (P2.1) — permissions as data, on the ERP engine.
 *
 * The catalogue does not invent a permission system (P1 owns it). It does two things:
 *   1. seeds `erp_role_permissions` rows for module `catalog`, action
 *      read|create|update|delete|approve, resource product|variant|category|brand|media
 *      — origin 'SEED', idempotent, revocable by editing a row instead of shipping code;
 *   2. exposes `requireCatalogue(action, resource)`, which composes the two existing
 *      middlewares: `requireAdmin(db)` for the session + the CSRF rule on writes, then
 *      `requireErpPermission({ permissive:false })` so an ungranted caller is refused
 *      AND the refusal is recorded in the single audit system.
 *
 * Parity, deliberately chosen: what the roles could already do through
 * `POST/PUT/DELETE /api/admin/products` (guarded by the legacy `content:read`/
 * `content:write`) is exactly what is seeded here. Nothing was redistributed in this
 * phase — that is a product decision — but from now on it CAN be, per resource and per
 * scope, which the old hard-coded `Set<AdminPermission>` never allowed.
 * ORDER_MANAGER gets no row because it has no product access today either.
 */
import type { QatafoDatabase } from '../db/database';
import { requireAdmin } from '../admin/auth';
import { can, requireErpPermission } from '../erp-core/permissions';
import { CATALOGUE_ACTIONS, CATALOGUE_MODULE_KEY, CATALOGUE_RESOURCES, type CatalogueAction } from './types';

export const CATALOGUE_SEED_GRANTS: ReadonlyArray<{ role: 'ADMIN' | 'CONTENT_MANAGER'; action: string; resourceType: string }> =
  (['ADMIN', 'CONTENT_MANAGER'] as const).flatMap((role) =>
    CATALOGUE_ACTIONS.flatMap((action) =>
      CATALOGUE_RESOURCES.map((resourceType) => ({ role, action, resourceType }))));

/** Idempotent: an existing row (even one an operator edited to granted=0) is never touched. */
export function seedCataloguePermissions(db: QatafoDatabase): { seeded: number } {
  const now = new Date().toISOString();
  let seeded = 0;
  for (const grant of CATALOGUE_SEED_GRANTS) {
    const id = `erpperm_${grant.role}_${CATALOGUE_MODULE_KEY}_${grant.action}_${grant.resourceType}`;
    if (db.get<{ id: string }>('SELECT id FROM erp_role_permissions WHERE id=?', id)) continue;
    const clash = db.get<{ id: string }>(
      `SELECT id FROM erp_role_permissions WHERE role=? AND module_key=? AND action=? AND resource_type=? AND scope='all'`,
      grant.role, CATALOGUE_MODULE_KEY, grant.action, grant.resourceType);
    if (clash) continue;
    db.run(`INSERT INTO erp_role_permissions (id,role,module_key,action,resource_type,scope,granted,origin,created_at,updated_at)
      VALUES (?,?,?,?,?,?,1,'SEED',?,?)`, id, grant.role, CATALOGUE_MODULE_KEY, grant.action, grant.resourceType, 'all', now, now);
    seeded += 1;
  }
  return { seeded };
}

/**
 * `[requireAdmin, requireErpPermission]` for one catalogue action.
 * `approve` is the transition into ACTIVE / out of ARCHIVED (a publish decision),
 * `delete` is the archive transition — the engine never hard-deletes a catalogue row.
 */
export function requireCatalogue(db: QatafoDatabase, action: CatalogueAction | string, resourceType: string) {
  return [
    requireAdmin(db),
    requireErpPermission(db, { module: CATALOGUE_MODULE_KEY, action: String(action), resourceType, permissive: false }),
  ];
}

/** Non-HTTP entry point (jobs, later modules) — same decision, no response object. */
export function canCatalogue(
  db: QatafoDatabase,
  role: string | null | undefined,
  action: CatalogueAction | string,
  resourceType: string,
  employee?: Parameters<typeof can>[2]['employee'],
) {
  return can(db, role, { module: CATALOGUE_MODULE_KEY, action: String(action), resourceType, employee: employee ?? null });
}
