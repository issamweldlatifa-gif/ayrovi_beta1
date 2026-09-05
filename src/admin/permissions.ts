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
    'pricing:write','payments:write','settings:write','users:write','users:read',
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
    'pricing:write','payments:write','settings:write',
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
  'pricing:write','payments:write','settings:write','users:write','users:read',
  'ai:read','ai:write','audit:read','reports:read','reports:write',
];

export function permissionsForRole(role: AdminRole): AdminPermission[] {
  return [...(rolePermissions[role] || [])];
}
