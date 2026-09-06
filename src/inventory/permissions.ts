/**
 * AYROVI Inventory (P2.2) — les permissions comme données, sur le moteur ERP.
 *
 * Le module n'invente pas de système d'autorisation (P1 en est un). Il fait deux choses :
 *  1. il sème des lignes `erp_role_permissions` pour le module `inventory`, action
 *  read|create|update|write|approve, ressource stock_item|stock_movement|stocktake —
 *  origine 'SEED', idempotent, révocables en éditant une ligne plutôt qu'en livrant du
 *  code ;
 *  2. il expose `requireInventory(action, resource)`, qui compose les deux gardes
 *  existantes : `requireAdmin(db)` (session + règle CSRF sur les écritures), puis
 *  `requireErpPermission({ permissive: false })` — un appelant non granté est refusé ET
 *  le refus est tracé dans le système d'audit unique.
 *
 * Répartition assumée et documentée : le stock n'existait pas avant P2.2, donc il n'y a
 * aucune parité à reproduire. ADMIN reçoit les cinq actions ; CONTENT_MANAGER et
 * ORDER_MANAGER ne reçoivent rien (ils n'avaient aucun accès au stock à préserver) ;
 * SUPER_ADMIN est couvert par la règle du miroir legacy (`seedLegacyPermissions`).
 * Ce choix est une donnée : il se modifie dans l'écran « Rôles & permissions », pas ici.
 */
import type { QatafoDatabase } from '../db/database';
import { requireAdmin } from '../admin/auth';
import { can, requireErpPermission } from '../erp-core/permissions';
import { INVENTORY_ACTIONS, INVENTORY_MODULE_KEY, INVENTORY_RESOURCES, type InventoryAction } from './types';

/** Rôles qui reçoivent un jeu complet à l'ouverture du module. */
const FULL_ACCESS_ROLES = ['ADMIN'] as const;
/** Rôles qui ne reçoivent que la lecture (visibilité sans écriture). */
const READ_ONLY_ROLES: readonly string[] = [];

export const INVENTORY_SEED_GRANTS: ReadonlyArray<{ role: string; action: string; resourceType: string }> = [
  ...FULL_ACCESS_ROLES.flatMap((role) =>
    INVENTORY_ACTIONS.flatMap((action) => INVENTORY_RESOURCES.map((resourceType) => ({ role, action, resourceType })))),
  ...READ_ONLY_ROLES.flatMap((role) =>
    INVENTORY_RESOURCES.map((resourceType) => ({ role, action: 'read' as const, resourceType }))),
];

/** Idempotent : une ligne existante — même portée à granted=0 par un opérateur — n'est jamais touchée. */
export function seedInventoryPermissions(db: QatafoDatabase): { seeded: number } {
  const now = new Date().toISOString();
  let seeded = 0;
  for (const grant of INVENTORY_SEED_GRANTS) {
    const id = `erpperm_${grant.role}_${INVENTORY_MODULE_KEY}_${grant.action}_${grant.resourceType}`;
    if (db.get<{ id: string }>('SELECT id FROM erp_role_permissions WHERE id=?', id)) continue;
    const clash = db.get<{ id: string }>(
      `SELECT id FROM erp_role_permissions WHERE role=? AND module_key=? AND action=? AND resource_type=? AND scope='all'`,
      grant.role, INVENTORY_MODULE_KEY, grant.action, grant.resourceType);
    if (clash) continue;
    db.run(`INSERT INTO erp_role_permissions (id,role,module_key,action,resource_type,scope,granted,origin,created_at,updated_at)
      VALUES (?,?,?,?,?,?,1,'SEED',?,?)`, id, grant.role, INVENTORY_MODULE_KEY, grant.action, grant.resourceType, 'all', now, now);
    seeded += 1;
  }
  return { seeded };
}

/**
 * `[requireAdmin, requireErpPermission]` pour une action du stock.
 * `write` est l'écriture d'un mouvement libre (entrée, sortie, ajustement motivé),
 * `approve` est la validation d'un écart
 * d'inventaire — deux droits distincts, parce que corriger son stock et valider
 * l'inventaire de tout le monde ne sont pas le même acte.
 */
export function requireInventory(db: QatafoDatabase, action: InventoryAction | string, resourceType: string) {
  return [
    requireAdmin(db),
    requireErpPermission(db, { module: INVENTORY_MODULE_KEY, action: String(action), resourceType, permissive: false }),
  ];
}

/** Entrée non HTTP (jobs, modules suivants) — même décision, sans objet réponse. */
export function canInventory(
  db: QatafoDatabase,
  role: string | null | undefined,
  action: InventoryAction | string,
  resourceType: string,
  employee?: Parameters<typeof can>[2]['employee'],
) {
  return can(db, role, { module: INVENTORY_MODULE_KEY, action: String(action), resourceType, employee: employee ?? null });
}

/** Ce que le module déclare dans la matrice — lu par l'écran « Rôles & permissions ». */
export const INVENTORY_MODULE_RESOURCES = { [INVENTORY_MODULE_KEY]: [...INVENTORY_RESOURCES] } as const;
