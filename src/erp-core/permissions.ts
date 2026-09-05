/**
 * AYROVI ERP Core — Permission engine (P1).
 *
 * Current system (kept, untouched): 4 roles, 12 `module:action` permissions in a
 * hard-coded `Record<AdminRole, Set<AdminPermission>>` (src/admin/permissions.ts),
 * applied by `requireAdmin(db, permission)`.
 *
 * This layer adds, without replacing:
 *   • grants as DATA in `erp_role_permissions` (editable, auditable, extensible);
 *   • `resource_type` (which object) and `scope` (all | organization | branch |
 *     department | team | own) so a grant can be narrowed later per branch;
 *   • new actions (`approve`, `export`, `delete`, `assign`, `manage`) that the
 *     legacy model has no word for;
 *   • `canEmployee(...)` / `requireErpPermission(...)`, with a hard guarantee:
 *     **legacy always wins** — a user the current system already authorises can
 *     never be locked out by the new table.
 */
import { NextFunction, Request, Response } from 'express';
import type { QatafoDatabase } from '../db/database';
import type { AdminPermission, AdminRole } from '../admin/permissions';
import { ALL_ADMIN_PERMISSIONS, hasPermission } from '../admin/permissions';
import { resolveAdmin } from '../admin/auth';
import { resolveEmployee } from './identity';
import { auditContextFromRequest, writeAuditEvent } from './audit';
import { type AuditActorIdentity } from './audit';

export const PERMISSION_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS erp_role_permissions (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN','ADMIN','CONTENT_MANAGER','ORDER_MANAGER')),
    module_key TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL DEFAULT '*',
    scope TEXT NOT NULL DEFAULT 'all' CHECK(scope IN ('all','organization','branch','department','team','own')),
    granted INTEGER NOT NULL DEFAULT 1 CHECK(granted IN (0,1)),
    origin TEXT NOT NULL DEFAULT 'SEED' CHECK(origin IN ('SEED','MANUAL','IMPORT')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_role_permissions_unique
    ON erp_role_permissions(role, module_key, action, resource_type, scope);
  CREATE INDEX IF NOT EXISTS idx_erp_role_permissions_role ON erp_role_permissions(role, module_key, granted);
`;

/** How the legacy `module:action` strings map onto the new shape. */
const LEGACY_PERMISSION_MAP: Record<string, { module: string; action: string }> = {
  'dashboard:read': { module: 'core', action: 'read' },
  'content:read': { module: 'cms', action: 'read' },
  'content:write': { module: 'cms', action: 'write' },
  'commerce:read': { module: 'sales', action: 'read' },
  'orders:write': { module: 'sales', action: 'write' },
  'pricing:write': { module: 'catalog', action: 'write' },
  'payments:write': { module: 'finance', action: 'write' },
  'settings:write': { module: 'settings', action: 'write' },
  'users:write': { module: 'users', action: 'write' },
  // P1 closure gate: `GET /users` était gated users:write (un droit d'écriture pour
  // une lecture) et `ai-knowledge` settings:write (droit du module réglages pour une
  // ressource IA). Ces deux lignes rendent la lecture/écriture nommable en données.
  'users:read': { module: 'users', action: 'read' },
  'ai:read': { module: 'ai', action: 'read' },
  'ai:write': { module: 'ai', action: 'write' },
  'audit:read': { module: 'audit', action: 'read' },
  'reports:read': { module: 'reports', action: 'read' },
  'reports:write': { module: 'finance', action: 'export' },
};

/** Per-module resources the engine knows about (used for `*` expansion). */
/** Reverse mirror: ERP `module:action` -> the legacy permission string it came from. */
const CANONICAL_LEGACY: Record<string, string> = Object.fromEntries(
  Object.entries(LEGACY_PERMISSION_MAP).map(([permission, mapped]) => [`${mapped.module}:${mapped.action}`, permission]),
);

const MODULE_RESOURCES: Record<string, string[]> = {
  sales: ['order', 'delivery'],
  finance: ['payment', 'payment_transaction', 'payment_proof', 'invoice', 'expense'],
  customers: ['customer', 'customer_account'],
  catalog: ['product', 'brand'],
  cms: ['publication', 'reel', 'story_publisher', 'story', 'news', 'hero_visual', 'media', 'setting'],
  users: ['admin_user', 'employee'],
  ai: ['ai_knowledge', 'ai_suggestion'],
  employees: ['employee'],
  organization: ['organization', 'branch', 'department', 'team'],
  permissions: ['role_permission'],
  audit: ['audit_event'],
  reports: ['financial_report', 'order_export'],
  crm: ['crm_arrival', 'crm_arrival_client', 'crm_extracted_product', 'crm_shipment'],
};

export const ERP_ACTIONS = ['read', 'write', 'create', 'update', 'delete', 'approve', 'export', 'assign', 'manage'] as const;
export const ERP_SCOPES = ['all', 'organization', 'branch', 'department', 'team', 'own'] as const;

export function ensurePermissionSchema(db: QatafoDatabase): void {
  db.runSchema(PERMISSION_SCHEMA_SQL);
}

/**
 * Mirrors the legacy role map into `erp_role_permissions` (idempotent, origin=SEED).
 * Kept in sync with src/admin/permissions.ts so a role added there is granted here.
 */
export function seedLegacyPermissions(db: QatafoDatabase): { inserted: number } {
  ensurePermissionSchema(db);
  const roles = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'ORDER_MANAGER'] as const;
  const now = new Date().toISOString();
  let inserted = 0;
  for (const role of roles) {
    // Liste dérivée du modèle lui-même: un droit ajouté dans src/admin/permissions.ts
    // est automatiquement mirroité ici (aucune liste à maintenir à deux endroits).
    const legacy = ALL_ADMIN_PERMISSIONS.filter((permission) => hasPermission(role as AdminRole, permission));
    for (const permission of legacy) {
      const mapped = LEGACY_PERMISSION_MAP[permission];
      if (!mapped) continue;
      const before = db.get<{ id: string }>(
        'SELECT id FROM erp_role_permissions WHERE role=? AND module_key=? AND action=? AND resource_type=? AND scope=?',
        role, mapped.module, mapped.action, '*', 'all');
      if (before) continue;
      db.run(`INSERT INTO erp_role_permissions (id,role,module_key,action,resource_type,scope,granted,origin,created_at,updated_at)
        VALUES (?,?,?,?,?,?,1,'SEED',?,?)`, `erpperm_${role}_${mapped.module}_${mapped.action}`, role, mapped.module, mapped.action, '*', 'all', now, now);
      inserted += 1;
    }
  }
  // SUPER_ADMIN is the god role in the legacy model (every one of the 12 strings,
  // and nothing can lock it out). Mirror that explicitly in the table so an
  // ERP-only action (delete / approve / export / assign / manage) resolves through
  // data instead of a hard-coded exception, and so the admin screen can display it.
  for (const moduleKey of Object.keys(MODULE_RESOURCES)) {
    for (const action of ERP_ACTIONS) {
      const id = `erpperm_SUPER_ADMIN_${moduleKey}_${action}`;
      if (db.get<{ id: string }>('SELECT id FROM erp_role_permissions WHERE id=?', id)) continue;
      const existing = db.get<{ id: string }>(
        'SELECT id FROM erp_role_permissions WHERE role=? AND module_key=? AND action=? AND resource_type=? AND scope=?',
        'SUPER_ADMIN', moduleKey, action, '*', 'all');
      if (existing) { db.run('UPDATE erp_role_permissions SET granted=1 WHERE id=?', existing.id); continue; }
      db.run(`INSERT INTO erp_role_permissions (id,role,module_key,action,resource_type,scope,granted,origin,created_at,updated_at)
        VALUES (?,?,?,?,?,?,1,'SEED',?,?)`, id, 'SUPER_ADMIN', moduleKey, action, '*', 'all', now, now);
      inserted += 1;
    }
  }
  return { inserted };
}

export interface PermissionCheckInput {
  action: string;
  module: string;
  resourceType?: string | null;
  /** Record under evaluation, when the caller can provide it (for scoped checks). */
  record?: Record<string, unknown> | null;
  employee?: { id: string; branchId?: string | null; departmentId?: string | null; organizationId?: string | null } | null;
}

export interface PermissionDecision {
  allowed: boolean;
  /** Why the decision was made — surfaced in audit and in the debug endpoint. */
  reason: 'legacy-role' | 'erp-grant' | 'erp-denial' | 'no-grant' | 'denied-by-row';
  scope: string;
  grantId: string | null;
}

function scopeSatisfies(scope: string, grant: { scope: string }, check: PermissionCheckInput): boolean {
  if (grant.scope === 'all' || grant.scope === 'organization') return true;
  const employee = check.employee;
  if (!employee) return grant.scope === 'all';
  if (grant.scope === 'branch') return Boolean(employee.branchId) && String(employee.branchId) === String((check.record as any)?.branch_id ?? employee.branchId);
  if (grant.scope === 'department') return Boolean(employee.departmentId) && String(employee.departmentId) === String((check.record as any)?.department_id ?? employee.departmentId);
  if (grant.scope === 'team') return String((check.record as any)?.team_id ?? '') === String(employee.id ?? '');
  if (grant.scope === 'own') return !check.record
    || String((check.record as any)?.created_by ?? (check.record as any)?.owner_id ?? '') === String(employee.id ?? '')
    || ['created_by', 'owner_id'].some((field) => String((check.record as any)?.[field] ?? '') === String(employee.id ?? ''));
  return scope === 'all';
}

/** The engine. `legacyRole` is the role string carried by the current session. */
export function can(
  db: QatafoDatabase,
  legacyRole: AdminRole | string | null | undefined,
  check: PermissionCheckInput,
): PermissionDecision {
  const mapped = legacyRole ? LEGACY_PERMISSION_MAP[`${check.module === 'core' ? 'dashboard:read' : `${check.module}:${check.action}`}`] : null;
  const legacyPermission = `${check.module}:${check.action}` as AdminPermission;
  const legacyAllowed = Boolean(legacyRole) && hasPermission(legacyRole as AdminRole, legacyPermission);
  if (legacyAllowed) return { allowed: true, reason: 'legacy-role', scope: 'all', grantId: null };
  // The legacy model already treats SUPER_ADMIN as all-powerful (there is no row
  // that can revoke it); mirror that so no back-office action is ever denied to it.
  if (legacyRole === 'SUPER_ADMIN') return { allowed: true, reason: 'erp-grant', scope: 'all', grantId: null };
  // Canonical naming: a legacy string may be addressed by its ERP equivalent
  // (`content:read` == `cms:read`), so a role never gains or loses access by spelling.
  const canonical = CANONICAL_LEGACY[`${check.module}:${check.action}`];
  if (legacyRole && canonical && hasPermission(legacyRole as AdminRole, canonical as AdminPermission)) {
    return { allowed: true, reason: 'legacy-role', scope: 'all', grantId: null };
  }
  // Some legacy strings are module-prefixed differently (e.g. cms:write) — accept the
  // explicitly mapped equivalent so a role never gains or loses access by naming.
  if (legacyRole && mapped && hasPermission(legacyRole as AdminRole, `${mapped.module}:${mapped.action}` as AdminPermission)) {
    return { allowed: true, reason: 'legacy-role', scope: 'all', grantId: null };
  }
  if (!legacyRole) return { allowed: false, reason: 'no-grant', scope: 'all', grantId: null };
  const candidates = db.all<any>(
    `SELECT * FROM erp_role_permissions WHERE role=? AND module_key IN (?, 'system') AND action IN (?, 'manage') AND granted=1
     ORDER BY CASE resource_type WHEN '*' THEN 2 ELSE 1 END`, String(legacyRole), String(check.module), String(check.action));
  for (const row of candidates) {
    const resourceMatches = !row.resource_type || row.resource_type === '*'
      || !check.resourceType || String(row.resource_type) === String(check.resourceType);
    if (!resourceMatches) continue;
    const decision: PermissionDecision = {
      allowed: row.granted === 1 && scopeSatisfies(String(row.scope), row, check),
      reason: row.granted === 1 ? (row.origin === 'SEED' ? 'erp-grant' : 'erp-grant') : 'denied-by-row',
      scope: String(row.scope), grantId: String(row.id),
    };
    if (!decision.allowed && row.granted === 0) return { allowed: false, reason: 'denied-by-row', scope: decision.scope, grantId: decision.grantId };
    if (decision.allowed) return decision;
  }
  return { allowed: false, reason: 'no-grant', scope: 'all', grantId: null };
}

export interface EffectivePermission {
  legacy: string;
  allowed: boolean;
  module: string;
  action: string;
  scope: string;
  origin: string;
}

/** Full matrix for a role — what the back office needs to show/hide actions. */
export function permissionsForRoleExtended(db: QatafoDatabase, role: AdminRole | string) {
  const legacyPermissions = Object.keys(LEGACY_PERMISSION_MAP).filter((permission) =>
    hasPermission(role as AdminRole, permission as AdminPermission));
  const rows = db.all<any>(`SELECT rp.*,m.label AS module_label FROM erp_role_permissions rp
    LEFT JOIN (SELECT 'core' AS key, 'ERP Core' AS label UNION SELECT 'employees','Employés' UNION SELECT 'organization','Organisation'
      UNION SELECT 'permissions','Permissions' UNION SELECT 'audit','Audit' UNION SELECT 'crm','CRM' UNION SELECT 'sales','Ventes'
      UNION SELECT 'catalog','Catalogue' UNION SELECT 'inventory','Stock' UNION SELECT 'purchasing','Achats' UNION SELECT 'finance','Finance'
      UNION SELECT 'accounting','Comptabilité' UNION SELECT 'shipping','Expéditions' UNION SELECT 'cms','CMS' UNION SELECT 'marketing','Marketing'
      UNION SELECT 'support','Support' UNION SELECT 'reports','Rapports' UNION SELECT 'automation','Automatisation'
      UNION SELECT 'settings','Paramètres' UNION SELECT 'users','Comptes') m ON m.key = rp.module_key
    WHERE rp.role=? ORDER BY rp.module_key,rp.action,rp.resource_type,rp.scope`, String(role));
  const effective: EffectivePermission[] = legacyPermissions.map((permission) => {
    const [moduleKey, action] = permission.split(':');
    return { legacy: permission, allowed: true, module: moduleKey, action, scope: 'all', origin: 'legacy-role' };
  });
  for (const row of rows) {
    const legacyEquivalent = `${row.module_key}:${row.action}`;
    if (effective.some((entry) => entry.legacy === legacyEquivalent && entry.scope === row.scope)) continue;
    effective.push({
      legacy: legacyEquivalent, allowed: Number(row.granted) === 1, module: String(row.module_key),
      action: String(row.action), scope: String(row.scope), origin: Number(row.granted) === 1 ? `erp:${row.origin}` : 'erp:denial',
    });
  }
  return { role, legacyPermissions, grants: rows.map((row: any) => ({
    id: String(row.id), module: String(row.module_key), action: String(row.action),
    resourceType: String(row.resource_type), scope: String(row.scope), granted: Number(row.granted) === 1, origin: String(row.origin),
    moduleLabel: row.module_label ? String(row.module_label) : String(row.module_key),
  })), effective };
}

/** Employee-facing helper used by services that have no HTTP role string. */
export function canEmployee(db: QatafoDatabase, employee: { userId?: string | null; id?: string } | null, check: PermissionCheckInput): PermissionDecision {
  const role = employee?.userId
    ? db.get<{ role: string }>('SELECT role FROM admin_users WHERE id=? AND active=1', String(employee.userId))?.role ?? null
    : null;
  return can(db, role, { ...check, employee: employee ? { id: String(employee.id ?? ''), ...check.employee } : null });
}

export interface ErpPermissionRouteOptions {
  /** Legacy permission kept as the primary guard (Rule Zero). */
  legacy?: AdminPermission;
  module?: string;
  action?: string;
  resourceType?: string | null;
  /** When true, a missing ERP grant does not deny: legacy decides (default true). */
  permissive?: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      erpEmployee?: ReturnType<typeof resolveEmployee>;
      erpAuditContext?: { employee?: AuditActorIdentity | null; requestId?: string | null; sessionId?: string | null; userAgent?: string | null };
    }
  }
}

/**
 * Drop-in companion to `requireAdmin`: same session resolution, same legacy
 * permission decision, plus the ERP identity attached to the request so handlers
 * and the audit writer never re-query it.
 */
export function requireErpPermission(db: QatafoDatabase, options: ErpPermissionRouteOptions = {}) {
  const moduleName = options.module ?? 'core';
  const actionName = options.action ?? 'read';
  return (req: Request, res: Response, next: NextFunction) => {
    const identity = resolveAdmin(db, req);
    if (!identity) return res.status(401).json({ success: false, error: 'Session administrateur invalide ou expirée.' });
    if (options.legacy && !hasPermission(identity.role, options.legacy)) {
      return res.status(403).json({ success: false, error: 'Vous ne disposez pas de cette permission.' });
    }
    const employee = resolveEmployee(db, identity.id);
    const decision = can(db, identity.role, { module: moduleName, action: actionName, resourceType: options.resourceType ?? null, employee });
    if (!decision.allowed && options.permissive === false) {
      writeAuditEvent(db, {
        actor: { id: identity.id, name: identity.name, ipAddress: req.ip || null },
        action: 'ACCESS_DENIED', module: 'PERMISSIONS', resource: { type: 'role_permission', id: null },
        newValues: { status: 403, module: moduleName, action: actionName, reason: decision.reason },
        context: auditContextFromRequest(db, req),
      });
      return res.status(403).json({ success: false, code: 'ERP_PERMISSION_DENIED', error: 'Permission ERP insuffisante pour cette action.' });
    }
    (req as Request & { admin?: unknown }).admin = identity;
    req.erpEmployee = employee;
    req.erpAuditContext = { employee, requestId: (req as Request & { requestId?: string }).requestId ?? null, sessionId: identity.id, userAgent: identity.csrfToken ? String(req.headers['user-agent'] || '').slice(0, 300) : null };
    next();
  };
}
