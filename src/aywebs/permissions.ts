import type { QatafoDatabase } from '../db/database';

/**
 * AYWEBs — permissions comme DONNÉES sur le moteur ERP existant (§31, §45).
 *
 * Même discipline que le Stock (P2.2) et les Achats (P2.3) : AYWEBs n'installe
 * aucun système d'autorisation parallèle. Il sème des lignes
 * `erp_role_permissions` pour le module `aywebs`, et les routes composent
 * `requireAdmin(db, …)` (session + CSRF) puis `can()` (refus tracé).
 *
 * Répartition assumée : AYWEBs engage de l'argent client et des achats réels.
 * ADMIN reçoit read|write|approve ; SUPER_ADMIN est couvert par la règle du
 * miroir legacy ; CONTENT_MANAGER et ORDER_MANAGER reçoivent la lecture
 * uniquement pour les demandes et les exceptions, jamais la validation d'un
 * paiement. Qui valide un paiement (`approve`) n'est pas qui saisit (`write`).
 */

export const AYWEBS_MODULE_KEY = 'aywebs';

export const AYWEBS_ACTIONS = ['read', 'write', 'approve'] as const;
export type AyWebsAction = (typeof AYWEBS_ACTIONS)[number];

export const AYWEBS_RESOURCES = [
  'store',
  'store_adapter',
  'order',
  'order_item',
  'purchase_request',
  'store_request',
  'payment',
  'exception',
  'audit',
  'warehouse',
  'package',
  'shipping',
] as const;
export type AyWebsResource = (typeof AYWEBS_RESOURCES)[number];

const FULL_ACCESS_ROLES = ['ADMIN'] as const;
/** Lecture opérationnelle : les gestionnaires de commandes voient les demandes, sans valider. */
const READ_ONLY_ROLES = ['ORDER_MANAGER'] as const;

/**
 * Grants semés, au format de la maison : une ligne par (rôle, module, action)
 * avec `resource_type='*'`, exactement comme `seedLegacyPermissions`. Le miroir
 * SUPER_ADMIN (tous les verbes ERP) est produit par le moteur lui-même dès que
 * `aywebs` déclare ses ressources dans `MODULE_RESOURCES` — il n'est pas ressemé
 * ici, pour ne jamais écrire deux fois le même droit.
 *
 * Le resserrement par ressource reste possible plus tard, comme donnée :
 * `can()` accepte `resource_type='*'` OU la ressource exacte.
 */
export const AYWEBS_SEED_GRANTS: ReadonlyArray<{ role: string; action: AyWebsAction; resourceType: '*' }> = [
  ...FULL_ACCESS_ROLES.flatMap((role) => AYWEBS_ACTIONS.map((action) => ({ role, action, resourceType: '*' as const }))),
  ...READ_ONLY_ROLES.flatMap((role) => [{ role, action: 'read' as const, resourceType: '*' as const }]),
];

/**
 * Idempotent : une ligne existante — même passée à `granted=0` par un
 * opérateur — n'est jamais réactivée par le seed.
 */
export function seedAyWebsPermissions(db: QatafoDatabase): { seeded: number; skipped: number } {
  let seeded = 0;
  let skipped = 0;
  try {
    const table = db.get<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name='erp_role_permissions'`);
    if (!table) return { seeded: 0, skipped: AYWEBS_SEED_GRANTS.length };
    const now = new Date().toISOString();
    for (const grant of AYWEBS_SEED_GRANTS) {
      const id = `erpperm_${grant.role}_${AYWEBS_MODULE_KEY}_${grant.action}`;
      if (db.get<{ id: string }>('SELECT id FROM erp_role_permissions WHERE id=?', id)) { skipped += 1; continue; }
      const clash = db.get<{ id: string }>(
        `SELECT id FROM erp_role_permissions WHERE role=? AND module_key=? AND action=? AND resource_type=? AND scope='all'`,
        grant.role, AYWEBS_MODULE_KEY, grant.action, grant.resourceType,
      );
      if (clash) { skipped += 1; continue; }
      db.run(
        `INSERT INTO erp_role_permissions (id,role,module_key,action,resource_type,scope,granted,origin,created_at,updated_at)
         VALUES (?,?,?,?,?,?,1,'SEED',?,?)`,
        id, grant.role, AYWEBS_MODULE_KEY, grant.action, grant.resourceType, 'all', now, now,
      );
      seeded += 1;
    }
  } catch (error) {
    // Un échec de seed ne doit jamais empêcher le démarrage : l'Admin verra des
    // boutons motivés plutôt qu'un 403 après le clic, et le journal le dit.
    console.warn('[aywebs] permission seed failed:', error instanceof Error ? error.message : error);
  }
  return { seeded, skipped };
}
