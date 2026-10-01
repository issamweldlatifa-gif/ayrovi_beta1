export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'CONTENT_MANAGER' | 'ORDER_MANAGER';

export type AdminPermission =
  | 'dashboard:read'
  | 'content:read'
  | 'content:write'
  | 'commerce:read'
  | 'orders:write'
  | 'pricing:write'
  | 'payments:write'
  | 'settings:write'
  // Lecture des réglages, distincte de leur écriture. Sans ce nom, lire la configuration
  // n'avait pas de gate propre : `GET /settings` était gardé par `content:read` (donc
  // ouvert à CONTENT_MANAGER) et les surfaces d'exploitation par `dashboard:read` — que
  // les QUATRE rôles détiennent, ce qui en faisait « être connecté », pas « voir le
  // système ». N'est accordé qu'aux rôles qui détenaient déjà `settings:write`, donc il
  // ne nomme qu'un accès déjà exercé : il n'élargit personne et il resserre deux rôles.
  | 'settings:read'
  | 'users:write'
  // P1 closure gate — ces trois droits n'élargissent personne : ils nomment des accès
  // déjà exercés via users:write (SUPER_ADMIN) et settings:write (SUPER_ADMIN + ADMIN).
  // `users:read` n'est détenu que par SUPER_ADMIN, ce qui reproduit l'état exact d'avant.
  | 'users:read'
  | 'ai:read'
  | 'ai:write'
  | 'audit:read'
  | 'reports:read'
  | 'reports:write';

const rolePermissions: Record<AdminRole, Set<AdminPermission>> = {
  SUPER_ADMIN: new Set([
    'dashboard:read','content:read','content:write','commerce:read','orders:write',
    'pricing:write','payments:write','settings:write','settings:read','users:write','users:read',
    'ai:read','ai:write','audit:read','reports:read','reports:write',
  ]),
  ADMIN: new Set([
    // `ai:read` / `ai:write` ne donnent rien de nouveau : ADMIN disposait deja de
    // `settings:write`, qui etait le gate reel des ressources IA. C'est un renommage
    // semantique, pas une elargissement.
    // `users:read` est volontairement absent : la separation « ADMIN gere les reglages
    // mais ne voit pas les comptes » est une attente figee par tests/ayrovi.test.ts
    // (RBAC). Le gate etant now nommable, l'accorder ne sera plus qu'une decision de
    // donnees (ligne dans erp_role_permissions), plus une modification de code.
    'dashboard:read','content:read','content:write','commerce:read','orders:write',
    'pricing:write','payments:write','settings:write','settings:read',
    'ai:read','ai:write','audit:read','reports:read','reports:write',
  ]),
  CONTENT_MANAGER: new Set(['dashboard:read','content:read','content:write']),
  ORDER_MANAGER: new Set(['dashboard:read','commerce:read','orders:write','payments:write']),
};

export function hasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return rolePermissions[role]?.has(permission) ?? false;
}

/** Liste littérale de tous les droits — source unique pour le miroir ERP (seed). */
export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = [
  'dashboard:read','content:read','content:write','commerce:read','orders:write',
  'pricing:write','payments:write','settings:write','settings:read','users:write','users:read',
  'ai:read','ai:write','audit:read','reports:read','reports:write',
];

/**
 * Surfaces d'exploitation : elles décrivent l'installation (chemins, réglages, journal
 * d'audit) et non l'activité commerciale. `dashboard:read` ne les garde plus, parce que
 * les quatre rôles le détiennent — il signifie « peut ouvrir la console ». Ce contrat est
 * vérifié par `tests/admin-permission-boundaries.test.ts`, pour qu'un futur endpoint
 * d'exploitation ne puisse pas retomber sur le droit le plus faible par défaut.
 */
export const OPERATIONAL_PERMISSION_FOR: Record<'environment' | 'events', AdminPermission> = {
  environment: 'settings:read',
  events: 'audit:read',
};

export function permissionsForRole(role: AdminRole): AdminPermission[] {
  return [...(rolePermissions[role] || [])];
}
