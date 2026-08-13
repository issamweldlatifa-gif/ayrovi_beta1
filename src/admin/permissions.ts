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
  | 'audit:read'
  | 'reports:read'
  | 'reports:write';

const rolePermissions: Record<AdminRole, Set<AdminPermission>> = {
  SUPER_ADMIN: new Set([
    'dashboard:read','content:read','content:write','commerce:read','orders:write',
    'pricing:write','payments:write','settings:write','users:write','audit:read',
    'reports:read','reports:write',
  ]),
  ADMIN: new Set([
    'dashboard:read','content:read','content:write','commerce:read','orders:write',
    'pricing:write','payments:write','settings:write','audit:read',
    'reports:read','reports:write',
  ]),
  CONTENT_MANAGER: new Set(['dashboard:read','content:read','content:write']),
  ORDER_MANAGER: new Set(['dashboard:read','commerce:read','orders:write','payments:write']),
};

export function hasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return rolePermissions[role]?.has(permission) ?? false;
}

export function permissionsForRole(role: AdminRole): AdminPermission[] {
  return [...(rolePermissions[role] || [])];
}
