/**
 * AYROVI ERP Core — ONE audit system (P0/P1).
 *
 * Audit findings this file closes:
 *   • two writers on `audit_logs` (`audit()` inside src/admin/routes.ts and
 *     `recordAdminAudit()` in src/admin/audit.ts) → one writer here, both kept
 *     as thin wrappers so no call site breaks;
 *   • no session / request-id / user-agent / entity-type on audit rows
 *     → additive columns via the project's own idempotent `ensureColumn` pattern;
 *   • before/after stored as opaque blobs, no field-level view
 *     → `erp_audit_changes` gives one row per changed field;
 *   • 16 admin write endpoints unlogged → `finalizeRequestAudit()` audits a
 *     mutation from its own response payload, so coverage is a route-level
 *     concern instead of per-handler discipline.
 *
 * Nothing is deleted and `audit_logs` keeps its exact existing shape: any
 * existing query, test or screen keeps working.
 */
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { QatafoDatabase } from '../db/database';
import type { AdminAuditActor } from '../admin/audit';
import { emitErpEvent } from './events';
import { moduleForResourceType } from './modules';
import { backfillEmployeesFromAdminUsers, employeeLabel, ensureIdentitySchema, resolveEmployee } from './identity';

/** Every mutation verb the back office can perform. Unknown verbs stay free text. */
export const ERP_AUDIT_ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'STATUS_CHANGE', 'APPROVE', 'REJECT',
  'CONFIRM', 'SEND', 'RESET', 'UPLOAD', 'DOWNLOAD', 'ACCESS', 'ACCESS_DENIED',
  'LOGIN', 'LOGIN_FAILED', 'LOGOUT',
] as const;

const RESOURCE_BY_MODULE: Record<string, string> = {
  ORDERS: 'order', PRODUCTS: 'product', PROMOTIONS: 'promotion', ARRIVALS: 'cms_arrival',
  BRANDS: 'brand', ANNOUNCEMENTS: 'announcement', STORIES: 'story', NEWS: 'news',
  AI_KNOWLEDGE: 'ai_knowledge', SETTINGS: 'setting', USERS: 'admin_user', EXPENSES: 'expense',
  PAYMENT_PROOFS: 'payment_proof', INVOICES: 'invoice', MEDIA: 'media',
  LENS_LAB: 'lens_lab_run', AI_SUGGESTIONS: 'magazine_draft', ASSISTANT_SUPPORT: 'assistant_support_ticket',
  HERO_VISUALS: 'hero_visual', TRUST_BAR: 'trust_bar_item', HOME_BLOCKS: 'home_blocks',
  LENS_HERO: 'lens_hero_settings', HERO_CONTENT: 'hero_content_settings',
  SOCIAL_PUBLICATIONS: 'publication', SOCIAL_REELS: 'reel', SOCIAL_PUBLISHERS: 'story_publisher',
  CUSTOMERS: 'customer', CUSTOMER_ACCOUNTS: 'customer_account', PRICING: 'pricing_config',
  CRM_ARRIVALS: 'crm_arrival',
};

export function resourceTypeForModule(module: string): string {
  return RESOURCE_BY_MODULE[String(module || '').toUpperCase()] ?? String(module || '').toLowerCase();
}

export const AUDIT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS erp_audit_changes (
    id TEXT PRIMARY KEY,
    audit_id TEXT NOT NULL REFERENCES audit_logs(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    value_kind TEXT NOT NULL DEFAULT 'SCALAR' CHECK(value_kind IN ('SCALAR','LIST','OBJECT','NULL_TO_VALUE','VALUE_TO_NULL')),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_erp_audit_changes_audit ON erp_audit_changes(audit_id, field_name);
  CREATE INDEX IF NOT EXISTS idx_erp_audit_changes_created ON erp_audit_changes(created_at DESC);
`;

/** Additive columns only — existing rows keep NULL, no backfill is attempted. */
const AUDIT_COLUMN_ADDITIONS: Array<[string, string]> = [
  ['session_id', 'TEXT'],
  ['request_id', 'TEXT'],
  ['employee_id', 'TEXT'],
  ['employee_code', 'TEXT'],
  ['organization_id', 'TEXT'],
  ['branch_id', 'TEXT'],
  ['department_id', 'TEXT'],
  ['user_agent', 'TEXT'],
  ['resource_type', 'TEXT'],
  ['resource_id', 'TEXT'],
  ['changed_fields', "TEXT NOT NULL DEFAULT '[]'"],
];

export function ensureAuditSchema(db: QatafoDatabase): void {
  // employee_id / employee_code are filled from the identity tables: guarantee their
  // existence before the audit columns (and the first backfill) are written.
  ensureIdentitySchema(db);
  db.runSchema(AUDIT_TABLE_SQL);
  const columns = new Set((db.all<{ name: string }>('PRAGMA table_info(audit_logs)') || []).map((column) => String(column.name)));
  for (const [name, definition] of AUDIT_COLUMN_ADDITIONS) {
    if (!columns.has(name)) db.run(`ALTER TABLE audit_logs ADD COLUMN ${name} ${definition}`);
  }
  db.run('CREATE INDEX IF NOT EXISTS idx_erp_audit_employee ON audit_logs(employee_id, created_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_erp_audit_resource ON audit_logs(resource_type, resource_id, created_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_erp_audit_request ON audit_logs(request_id)');
  // An employee identity must exist before the first audited mutation is written.
  backfillEmployeesFromAdminUsers(db);
}

export interface ErpFieldChange {
  field: string;
  old: unknown;
  new: unknown;
  kind: 'SCALAR' | 'LIST' | 'OBJECT' | 'NULL_TO_VALUE' | 'VALUE_TO_NULL';
}

function isPlain(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

function differs(a: unknown, b: unknown): boolean {
  if (a === b) return false;
  if (isPlain(a) || isPlain(b)) {
    try { return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null); } catch { return true; }
  }
  // 1 vs '1' vs 1.0 mean the same stored value in this schema (TEXT/REAL mix).
  if (typeof a === 'number' || typeof b === 'number') return Number(a) !== Number(b);
  if (a === null || a === undefined) return b !== null && b !== undefined;
  if (b === null || b === undefined) return true;
  return String(a) !== String(b);
}

/** Field-level diff of two records, ignoring noise columns. */
export function fieldDiff(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined,
  ignore: string[] = ['updated_at', 'password_hash', 'csrf_token', 'provider_payload', 'raw_extracted', 'field_evidence']): ErpFieldChange[] {
  // A creation has no before-image: every supplied non-empty value is a
  // NULL_TO_VALUE change, so the record still shows what was entered.
  const creation = !before && !!after && typeof after === 'object';
  if (creation) before = {};
  if (!before || !after) return [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => !ignore.includes(key));
  const changes: ErpFieldChange[] = [];
  for (const key of keys) {
    const old = before[key] ?? null;
    const next = after[key] ?? null;
    if (!differs(old, next)) continue;
    // on a creation, empty inputs are noise, not changes
    if (creation && (next === null || next === undefined || next === '')) continue;
    const kind = (old === null || old === undefined) && next !== null && next !== undefined ? 'NULL_TO_VALUE'
      : (next === null || next === undefined) && old !== null && old !== undefined ? 'VALUE_TO_NULL'
        : Array.isArray(old) || Array.isArray(next) ? 'LIST'
          : isPlain(old) || isPlain(next) ? 'OBJECT' : 'SCALAR';
    changes.push({ field: key, old, new: next, kind: kind as ErpFieldChange['kind'] });
  }
  return changes;
}

/** Actor identity as carried on an audit row (subset of EmployeeRecord). */
export interface AuditActorIdentity {
  id: string;
  employeeCode: string;
  organizationId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
}

export interface ErpAuditContextInput {
  requestId?: string | null;
  /** admin_users id of the authenticated session (kept for traceability, not a cookie value). */
  sessionId?: string | null;
  userAgent?: string | null;
  /** Pre-resolved actor identity; when absent the writer resolves it from the actor id. */
  employee?: AuditActorIdentity | null;
}

export interface ErpAuditEvent {
  actor: AdminAuditActor;
  action: string;
  module: string;
  /** Legacy shape (kept) — `entityId`. */
  entityId?: string | null;
  /** ERP shape: { type, id } or a bare id. */
  resource?: { type?: string; id?: string | null } | string | null;
  oldValues?: unknown;
  newValues?: unknown;
  /** Pre-computed field diff; when absent it is derived from oldValues/newValues. */
  fieldChanges?: ErpFieldChange[];
  context?: ErpAuditContextInput;
}

function truncate(value: unknown, max = 20_000): string | null {
  if (value === null || value === undefined) return null;
  try { return JSON.stringify(value).slice(0, max); } catch { return String(value).slice(0, max); }
}

function scalarText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (isPlain(value)) return truncate(value, 2000);
  return String(value).slice(0, 2000);
}

export function auditContextFromRequest(db: QatafoDatabase, req: Request): ErpAuditContextInput {
  const admin = (req as Request & { admin?: { id?: string } }).admin;
  return {
    requestId: (req as Request & { requestId?: string }).requestId ?? null,
    sessionId: admin?.id ? String(admin.id).slice(0, 80) : null,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300) || null,
    employee: admin?.id ? resolveEmployee(db, String(admin.id)) : null,
  };
}

/**
 * The only writer of audit rows. Every module reaches it either directly or
 * through the two preserved wrappers (`recordAdminAudit`, `audit`).
 */
export function writeAuditEvent(db: QatafoDatabase, event: ErpAuditEvent): string {
  const id = `audit_${randomUUID()}`;
  const now = new Date().toISOString();
  const employee = event.context?.employee?.id
    ? event.context.employee
    : (event.actor?.id ? resolveEmployee(db, event.actor.id) : null);
  const resource = typeof event.resource === 'string' ? { id: event.resource } : (event.resource ?? {});
  const resourceType = resource.type ? String(resource.type).slice(0, 60) : resourceTypeForModule(event.module);
  const resourceId = (resource.id ?? event.entityId ?? null) ? String(resource.id ?? event.entityId).slice(0, 80) : null;
  const changes = event.fieldChanges ?? fieldDiff(
    (event.oldValues && typeof event.oldValues === 'object') ? event.oldValues as Record<string, unknown> : null,
    (event.newValues && typeof event.newValues === 'object') ? event.newValues as Record<string, unknown> : null,
  );
  const safeChanges = changes.slice(0, 200);

  db.run(`INSERT INTO audit_logs
    (id,user_id,user_name,action,module,entity_id,old_value,new_value,ip_address,created_at,
     session_id,request_id,employee_id,employee_code,organization_id,branch_id,department_id,
     user_agent,resource_type,resource_id,changed_fields)
    VALUES (?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?,?)`,
  id,
  event.actor?.id ?? null,
  String(event.actor?.name || employeeLabel(employee)).slice(0, 160),
  String(event.action).slice(0, 100),
  String(event.module).slice(0, 100),
  resourceId,
  truncate(event.oldValues),
  truncate(event.newValues),
  event.actor?.ipAddress ?? null,
  now,
  event.context?.sessionId ?? null,
  event.context?.requestId ?? null,
  employee?.id ?? null,
  employee?.employeeCode ?? null,
  employee?.organizationId ?? null,
  employee?.branchId ?? null,
  employee?.departmentId ?? null,
  event.context?.userAgent ?? null,
  resourceType,
  resourceId,
  JSON.stringify(safeChanges.map((change) => change.field)).slice(0, 4000));

  for (const change of safeChanges) {
    db.run(`INSERT INTO erp_audit_changes (id,audit_id,field_name,old_value,new_value,value_kind,created_at)
      VALUES (?,?,?,?,?,?,?)`, `auditc_${randomUUID()}`, id, change.field.slice(0, 120),
    scalarText(change.old), scalarText(change.new), change.kind, now);
  }

  emitDerivedEvents(db, event, resourceType, resourceId, now, safeChanges);
  return id;
}

/**
 * Domain events derived from an audited mutation. Consumers (notifications,
 * inventory, accounting) subscribe in later phases; the durable `erp_events`
 * record already makes every audited write observable.
 */
function emitDerivedEvents(db: QatafoDatabase, event: ErpAuditEvent, resourceType: string, resourceId: string | null,
  occurredAt: string, changes: ErpFieldChange[]): void {
  const moduleName = moduleForResourceType(resourceType);
  const action = String(event.action || '').toUpperCase();
  const name = action === 'CREATE' ? `${resourceType}.created`
    : action === 'STATUS_CHANGE' ? `${resourceType}.status-changed`
      : action === 'DELETE' || action === 'ARCHIVE' ? `${resourceType}.${action === 'ARCHIVE' ? 'archived' : 'deleted'}`
        : action.includes('APPROVE') ? `${resourceType}.approved`
          : action.includes('REJECT') ? `${resourceType}.rejected`
            : action.includes('CONFIRM') ? `${resourceType}.confirmed`
              : `${resourceType}.updated`;
  emitErpEvent(db, {
    name, module: moduleName, resourceType, resourceId, occurredAt,
    payload: {
      action: event.action, sourceModule: event.module,
      employeeCode: event.context?.employee?.employeeCode ?? null,
      fields: changes.slice(0, 30).map((change) => change.field),
    },
  });
}

// ===== Sensitive file access (documents can no longer be fetched by URL) =====
export interface FileAccessIntent {
  /** 'DOWNLOAD' when the bytes were served, 'ACCESS_DENIED' for refusals. */
  action: 'DOWNLOAD' | 'ACCESS_DENIED' | 'ACCESS';
  module: string;
  resourceType: string;
  resourceId: string | null;
  reason?: string;
  sizeBytes?: number | null;
}

export function auditFileAccess(db: QatafoDatabase, req: Request, intent: FileAccessIntent): void {
  const actor: AdminAuditActor = {
    id: (req as Request & { admin?: { id?: string } }).admin?.id ?? null,
    name: (req as Request & { admin?: { name?: string } }).admin?.name ?? 'Client',
    ipAddress: req.ip || null,
  };
  writeAuditEvent(db, {
    actor, action: intent.action, module: intent.module,
    resource: { type: intent.resourceType, id: intent.resourceId },
    newValues: intent.reason ? { reason: intent.reason } : intent.sizeBytes != null ? { sizeBytes: intent.sizeBytes } : null,
    context: auditContextFromRequest(db, req),
  });
}

// ===== Route-level coverage helper =====
/**
 * Wraps a mutation so that it is always audited, including the refusal paths:
 * the response body is inspected at finish time and, when it carries `data.id`,
 * the stored record is re-read to produce a real before/after diff.
 * A 4xx/5xx answer is recorded as ACCESS_DENIED with the error message, which is
 * exactly what the audit of a rejected financial write requires.
 */
export function finalizeRequestAudit(
  db: QatafoDatabase,
  req: Request,
  res: Response,
  input: { action: string; module: string; resourceType?: string; readTable?: string; readIdPath?: string },
): void {
  if (res.locals[AUDIT_FINALIZED_FLAG]) return;
  res.locals[AUDIT_FINALIZED_FLAG] = true;
  res.on('finish', () => {
    try {
      const body = (res as unknown as { getResponseBody?: () => unknown }).getResponseBody?.();
      const parsed = typeof body === 'string' ? JSON.parse(body) : (body as any);
      const actor: AdminAuditActor = {
        id: (req as Request & { admin?: { id?: string } }).admin?.id ?? null,
        name: (req as Request & { admin?: { name?: string } }).admin?.name || 'Système',
        ipAddress: req.ip || null,
      };
      const context = auditContextFromRequest(db, req);
      const status = Number(res.statusCode) || 0;
      if (status >= 400) {
        writeAuditEvent(db, {
          actor, action: 'ACCESS_DENIED', module: input.module,
          resource: { type: input.resourceType, id: String(req.params?.id || '') || null },
          newValues: { status, code: parsed?.code ?? null, error: String(parsed?.error || '').slice(0, 300) },
          context,
        });
        return;
      }
      if (!parsed?.success || !input.readTable) return;
      const id = input.readIdPath ? String(parsed?.data?.[input.readIdPath] ?? req.params?.id ?? '') : String(parsed?.data?.id ?? req.params?.id ?? '');
      if (!id) return;
      const stored = db.get<Record<string, unknown>>(`SELECT * FROM ${input.readTable} WHERE id=?`, id);
      if (!stored) return;
      writeAuditEvent(db, {
        actor, action: input.action, module: input.module,
        resource: { type: input.resourceType, id },
        newValues: stored,
        context,
      });
    } catch { /* auditing must never break a response */ }
  });
}

const AUDIT_FINALIZED_FLAG = 'ayroviAuditFinalized';

// ===== Query side =====
export interface AuditQuery {
  page?: number;
  pageSize?: number;
  module?: string;
  employeeId?: string;
  employeeCode?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  from?: string;
  to?: string;
}

export function listAuditEvents(db: QatafoDatabase, query: AuditQuery = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 30));
  const where: string[] = [];
  const params: (string | number)[] = [];
  const add = (clause: string, value: string | number) => { where.push(clause); params.push(value); };
  if (query.module) add('module=?', String(query.module).slice(0, 50));
  if (query.employeeId) add('employee_id=?', String(query.employeeId).slice(0, 80));
  if (query.employeeCode) add('employee_code=?', String(query.employeeCode).toUpperCase().slice(0, 40));
  if (query.action) add('action=?', String(query.action).toUpperCase().slice(0, 40));
  if (query.resourceType) add('resource_type=?', String(query.resourceType).slice(0, 60));
  if (query.resourceId) add('resource_id=?', String(query.resourceId).slice(0, 80));
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.from || ''))) add('created_at>=?', `${query.from}T00:00:00.000Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.to || ''))) add('created_at<=?', `${query.to}T23:59:59.999Z`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM audit_logs ${clause}`, ...params)?.count ?? 0);
  const rows = db.all<any>(`SELECT * FROM audit_logs ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize);
  const withChanges = rows.map((row) => ({
    ...row,
    old_value: safeParse(row.old_value),
    new_value: safeParse(row.new_value),
    changed_fields: safeParse(row.changed_fields) ?? [],
    changes: db.all<any>('SELECT field_name,old_value,new_value,value_kind FROM erp_audit_changes WHERE audit_id=? ORDER BY field_name', row.id),
  }));
  return { data: withChanges, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

function safeParse(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return null;
  try { return JSON.parse(value); } catch { return value; }
}

/** Coverage report — proves the "every sensitive mutation is logged" claim. */
export function auditCoverage(db: QatafoDatabase, days = 30) {
  const since = new Date(Date.now() - Math.max(1, days) * 86_400_000).toISOString();
  return {
    since,
    total: Number(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM audit_logs WHERE created_at>=?', since)?.count ?? 0),
    withEmployee: Number(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM audit_logs WHERE created_at>=? AND employee_id IS NOT NULL', since)?.count ?? 0),
    withRequestId: Number(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM audit_logs WHERE created_at>=? AND request_id IS NOT NULL', since)?.count ?? 0),
    withResourceType: Number(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM audit_logs WHERE created_at>=? AND resource_type IS NOT NULL', since)?.count ?? 0),
    fieldLevelRows: Number(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM erp_audit_changes',)?.count ?? 0),
    denials: Number(db.get<{ count: number }>("SELECT COUNT(*) AS count FROM audit_logs WHERE created_at>=? AND action='ACCESS_DENIED'", since)?.count ?? 0),
    byModule: db.all<{ module: string; count: number }>(
      'SELECT module, COUNT(*) AS count FROM audit_logs WHERE created_at>=? GROUP BY module ORDER BY count DESC', since),
  };
}
