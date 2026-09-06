/**
 * AYROVI Purchasing (P2.3) — les permissions comme données, sur le moteur ERP.
 *
 * Comme pour le stock (P2.2), le module n'installe aucune autorisation parallèle :
 *  1. il sème des lignes `erp_role_permissions` pour `purchasing`, actions
 *  read|create|update|write|approve, ressources supplier|purchase_order|purchase_order_line|goods_receipt ;
 *  2. il expose `requirePurchasing(action, resource)` = `requireAdmin(db)` (session + CSRF sur
 *  les écritures) puis `requireErpPermission({ permissive:false })`, donc un refus est un 403
 *  **et** une ligne dans le journal unique.
 *
 * Répartition assumée : les achats engagent de l'argent, donc rien n'est accordé « par
 * compatibilité » — aucun rôle legacy n'avait de droits d'achat. ADMIN reçoit les cinq
 * actions ; SUPER_ADMIN est couvert par la règle du miroir legacy ; les autres rôles ne
 * reçoivent rien et le voient (boutons inertes motivés, jamais un 403 après le clic).
 * `approve` (valider une commande) et `write` (réceptionner) restent deux droits distincts :
 * qui engage n'est pas nécessairement qui reçoit.
 */
import type { QatafoDatabase } from '../db/database';
import { requireAdmin } from '../admin/auth';
import { can, requireErpPermission } from '../erp-core/permissions';
import { PURCHASING_ACTIONS, PURCHASING_MODULE_KEY, PURCHASING_RESOURCES, type PurchasingAction } from './types';

const FULL_ACCESS_ROLES = ['ADMIN'] as const;
/** Rôles en lecture seule : rien pour l'instant, et c'est un choix de données, pas une limite technique. */
const READ_ONLY_ROLES: readonly string[] = [];

export const PURCHASING_SEED_GRANTS: ReadonlyArray<{ role: string; action: string; resourceType: string }> = [
  ...FULL_ACCESS_ROLES.flatMap((role) =>
    PURCHASING_ACTIONS.flatMap((action) => PURCHASING_RESOURCES.map((resourceType) => ({ role, action, resourceType })))),
  ...READ_ONLY_ROLES.flatMap((role) =>
    PURCHASING_RESOURCES.map((resourceType) => ({ role, action: 'read' as const, resourceType }))),
];

/** Idempotent : une ligne existante — même portée à granted=0 par un opérateur — n'est jamais touchée. */
export function seedPurchasingPermissions(db: QatafoDatabase): { seeded: number } {
  const now = new Date().toISOString();
  let seeded = 0;
  for (const grant of PURCHASING_SEED_GRANTS) {
    const id = `erpperm_${grant.role}_${PURCHASING_MODULE_KEY}_${grant.action}_${grant.resourceType}`;
    if (db.get<{ id: string }>('SELECT id FROM erp_role_permissions WHERE id=?', id)) continue;
    const clash = db.get<{ id: string }>(
      `SELECT id FROM erp_role_permissions WHERE role=? AND module_key=? AND action=? AND resource_type=? AND scope='all'`,
      grant.role, PURCHASING_MODULE_KEY, grant.action, grant.resourceType);
    if (clash) continue;
    db.run(`INSERT INTO erp_role_permissions (id,role,module_key,action,resource_type,scope,granted,origin,created_at,updated_at)
      VALUES (?,?,?,?,?,?,1,'SEED',?,?)`, id, grant.role, PURCHASING_MODULE_KEY, grant.action, grant.resourceType, 'all', now, now);
    seeded += 1;
  }
  return { seeded };
}

export function requirePurchasing(db: QatafoDatabase, action: PurchasingAction | string, resourceType: string) {
  return [
    requireAdmin(db),
    requireErpPermission(db, { module: PURCHASING_MODULE_KEY, action: String(action), resourceType, permissive: false }),
  ];
}

/** Entrée non HTTP (jobs, P5 automatisation) — même décision, sans objet réponse. */
export function canPurchasing(
  db: QatafoDatabase,
  role: string | null | undefined,
  action: PurchasingAction | string,
  resourceType: string,
  employee?: Parameters<typeof can>[2]['employee'],
) {
  return can(db, role, { module: PURCHASING_MODULE_KEY, action: String(action), resourceType, employee: employee ?? null });
}
