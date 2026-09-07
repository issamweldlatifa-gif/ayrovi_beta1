/**
 * AYROVI CRM 360 (E1) — les permissions comme données, sur le moteur ERP.
 *
 * Même discipline que le stock et les achats :
 *  1. des lignes `erp_role_permissions` pour le module `crm360`, actions
 *     view|create|edit|archive|delete|export|manage, ressources party|contact|activity|
 *     task|note|issue|communication|timeline|dashboard|crm_config ;
 *  2. `requireCrm(action, resource)` = `requireAdmin(db)` (session + CSRF sur les écritures)
 *     puis `requireErpPermission({ permissive:false })` → un refus est un 403 **et** une
 *     ligne dans le journal unique.
 *
 * Répartition assumée (parité stricte avec l'existant, aucune porte verrouillée) :
 *  • les rôles qui accédaient déjà à l'écran « Clients » et au support (ADMIN et
 *    ORDER_MANAGER via `commerce:read`/`orders:write`) reçoivent view + create + edit
 *    sur les ressources relationnelles — ils ne perdent donc rien ;
 *  • SUPER_ADMIN est couvert par la règle « god role » du moteur et reçoit en plus des
 *    lignes seed pour l'affichage de la matrice ;
 *  • archive / delete / export / manage / crm_config ne sont octroyés à personne en seed
 *    (aucun rôle ne les détenait) : les accorder devient une décision de données, pas de code ;
 *  • CONTENT_MANAGER n'avait aucun accès clients/support legacy : il ne reçoit rien.
 */
import type { QatafoDatabase } from '../db/database';
import { requireAdmin } from '../admin/auth';
import { can, requireErpPermission } from '../erp-core/permissions';
import { CRM_ACTIONS, CRM_MODULE_KEY, CRM_RESOURCES, type CrmAction, type CrmResource } from './types';

/** Rôles complets : toutes les actions × toutes les ressources. */
const FULL_ACCESS_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

/** Opérateurs relationnels : lisent tout, créent/éditent le relationnel, jamais d'archivage/export/config. */
const OPERATOR_ROLES = ['ORDER_MANAGER'] as const;

const OPERATOR_CREATE_EDIT_RESOURCES: readonly CrmResource[] = [
  'party', 'contact', 'activity', 'task', 'note', 'issue', 'communication',
];

export const CRM_SEED_GRANTS: ReadonlyArray<{ role: string; action: string; resourceType: string }> = [
  ...FULL_ACCESS_ROLES.flatMap((role) =>
    CRM_ACTIONS.flatMap((action) => CRM_RESOURCES.map((resourceType) => ({ role, action, resourceType })))),
  ...OPERATOR_ROLES.flatMap((role) =>
    CRM_RESOURCES.map((resourceType) => ({ role, action: 'view' as const, resourceType }))),
  ...OPERATOR_ROLES.flatMap((role) =>
    OPERATOR_CREATE_EDIT_RESOURCES.flatMap((resourceType) => [
      { role, action: 'create' as const, resourceType },
      { role, action: 'edit' as const, resourceType },
    ])),
];

/** Idempotent : une ligne existante — même portée à granted=0 par un opérateur — n'est jamais touchée. */
export function seedCrmPermissions(db: QatafoDatabase): { seeded: number } {
  const now = new Date().toISOString();
  let seeded = 0;
  for (const grant of CRM_SEED_GRANTS) {
    const id = `erpperm_${grant.role}_${CRM_MODULE_KEY}_${grant.action}_${grant.resourceType}`;
    if (db.get<{ id: string }>('SELECT id FROM erp_role_permissions WHERE id=?', id)) continue;
    const clash = db.get<{ id: string }>(
      `SELECT id FROM erp_role_permissions WHERE role=? AND module_key=? AND action=? AND resource_type=? AND scope='all'`,
      grant.role, CRM_MODULE_KEY, grant.action, grant.resourceType);
    if (clash) continue;
    db.run(`INSERT INTO erp_role_permissions (id,role,module_key,action,resource_type,scope,granted,origin,created_at,updated_at)
      VALUES (?,?,?,?,?,?,1,'SEED',?,?)`, id, grant.role, CRM_MODULE_KEY, grant.action, grant.resourceType, 'all', now, now);
    seeded += 1;
  }
  return { seeded };
}

/** Garde HTTP d'une route CRM : session + CSRF, puis grant ERP `crm360:<action>` sur la ressource. */
export function requireCrm(db: QatafoDatabase, action: CrmAction | string, resourceType: CrmResource | string) {
  return [
    requireAdmin(db),
    requireErpPermission(db, { module: CRM_MODULE_KEY, action: String(action), resourceType: String(resourceType), permissive: false }),
  ];
}

/** Décision non HTTP (jobs, automatisation) — même moteur, sans objet réponse. */
export function canCrm(
  db: QatafoDatabase,
  role: string | null | undefined,
  action: CrmAction | string,
  resourceType: CrmResource | string,
  employee?: Parameters<typeof can>[2]['employee'],
) {
  return can(db, role, { module: CRM_MODULE_KEY, action: String(action), resourceType: String(resourceType), employee: employee ?? null });
}
