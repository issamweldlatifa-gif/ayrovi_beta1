/**
 * AYROVI ERP Core — Employee & organization identity (P1).
 *
 * Audit finding that this file answers: `admin_users` is a LOGIN ACCOUNT
 * (email, password_hash, role, active) and `employee`/`department`/`branch`
 * appear nowhere in the codebase, while the ERP needs a human identity with a
 * readable code that can be cited in audit, approvals and documents.
 *
 * Rule Zero respected here:
 *   • admin_users is untouched and keeps the whole authentication job;
 *   • erp_employees.user_id is a 1:1 link to it, backfilled at boot so every
 *     existing administrator account immediately has an employee identity;
 *   • no table is renamed, no login path is modified.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { ensureSequencesSchema, nextSequenceNumber } from './sequences';
import { emitErpEvent } from './events';

export const IDENTITY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS erp_organizations (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    legal_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS erp_branches (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES erp_organizations(id) ON DELETE RESTRICT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_erp_branches_org ON erp_branches(organization_id, status);
  CREATE TABLE IF NOT EXISTS erp_departments (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES erp_organizations(id) ON DELETE RESTRICT,
    branch_id TEXT REFERENCES erp_branches(id) ON DELETE SET NULL,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_erp_departments_branch ON erp_departments(branch_id, status);
  CREATE TABLE IF NOT EXISTS erp_teams (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES erp_organizations(id) ON DELETE RESTRICT,
    department_id TEXT REFERENCES erp_departments(id) ON DELETE SET NULL,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_erp_teams_department ON erp_teams(department_id, status);
  CREATE TABLE IF NOT EXISTS erp_employees (
    id TEXT PRIMARY KEY,
    employee_code TEXT NOT NULL UNIQUE,
    user_id TEXT UNIQUE REFERENCES admin_users(id) ON DELETE SET NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    job_title TEXT NOT NULL DEFAULT '',
    organization_id TEXT REFERENCES erp_organizations(id) ON DELETE SET NULL,
    branch_id TEXT REFERENCES erp_branches(id) ON DELETE SET NULL,
    department_id TEXT REFERENCES erp_departments(id) ON DELETE SET NULL,
    team_id TEXT REFERENCES erp_teams(id) ON DELETE SET NULL,
    manager_employee_id TEXT REFERENCES erp_employees(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ON_LEAVE','SUSPENDED','TERMINATED')),
    joined_at TEXT,
    left_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_erp_employees_user ON erp_employees(user_id);
  CREATE INDEX IF NOT EXISTS idx_erp_employees_branch ON erp_employees(branch_id, status);
  CREATE INDEX IF NOT EXISTS idx_erp_employees_department ON erp_employees(department_id, status);
`;

export interface EmployeeRecord {
  id: string;
  employeeCode: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string;
  status: string;
  organizationId: string | null;
  organizationName: string | null;
  branchId: string | null;
  branchName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  teamId: string | null;
  teamName: string | null;
  managerEmployeeId: string | null;
  joinedAt: string | null;
  leftAt: string | null;
  email: string | null;
  role: string | null;
  createdAt: string;
  updatedAt: string;
}

const SELECT_EMPLOYEE = `SELECT e.*,o.name AS organization_name,b.name AS branch_name,d.name AS department_name,
  t.name AS team_name,u.email AS user_email,u.role AS user_role
  FROM erp_employees e
  LEFT JOIN erp_organizations o ON o.id=e.organization_id
  LEFT JOIN erp_branches b ON b.id=e.branch_id
  LEFT JOIN erp_departments d ON d.id=e.department_id
  LEFT JOIN erp_teams t ON t.id=e.team_id
  LEFT JOIN admin_users u ON u.id=e.user_id`;

function mapEmployee(row: any): EmployeeRecord {
  const first = String(row?.first_name ?? '');
  const last = String(row?.last_name ?? '');
  return {
    id: String(row.id),
    employeeCode: String(row.employee_code),
    userId: row.user_id ? String(row.user_id) : null,
    firstName: first,
    lastName: last,
    fullName: `${first} ${last}`.trim(),
    jobTitle: String(row.job_title ?? ''),
    status: String(row.status ?? 'ACTIVE'),
    organizationId: row.organization_id ? String(row.organization_id) : null,
    organizationName: row.organization_name ? String(row.organization_name) : null,
    branchId: row.branch_id ? String(row.branch_id) : null,
    branchName: row.branch_name ? String(row.branch_name) : null,
    departmentId: row.department_id ? String(row.department_id) : null,
    departmentName: row.department_name ? String(row.department_name) : null,
    teamId: row.team_id ? String(row.team_id) : null,
    teamName: row.team_name ? String(row.team_name) : null,
    managerEmployeeId: row.manager_employee_id ? String(row.manager_employee_id) : null,
    joinedAt: row.joined_at ? String(row.joined_at) : null,
    leftAt: row.left_at ? String(row.left_at) : null,
    email: row.user_email ? String(row.user_email) : null,
    role: row.user_role ? String(row.user_role) : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function clean(value: unknown, max = 120): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function ensureIdentitySchema(db: QatafoDatabase): void {
  ensureSequencesSchema(db);
  db.runSchema(IDENTITY_SCHEMA_SQL);
  const now = new Date().toISOString();
  const organizations = Number(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM erp_organizations')?.count ?? 0);
  if (!organizations) {
    const organizationId = `org_${randomUUID()}`;
    db.run(`INSERT INTO erp_organizations (id,code,name,legal_name,status,created_at,updated_at) VALUES (?,?,?,'AYROVI','ACTIVE',?,?)`,
      organizationId, 'ORG-0001', 'AYROVI', now, now);
    const branchId = `brn_${randomUUID()}`;
    db.run(`INSERT INTO erp_branches (id,organization_id,code,name,city,address,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'ACTIVE',?,?)`, branchId, organizationId, 'BRC-0001', 'Siège — Tunis', 'Tunis', '', now, now);
  }
}

/**
 * Gives every admin_users account an employee identity (idempotent, runs at boot).
 * Names are split on the first space of the existing free-text `name` column so
 * nothing new has to be typed on day one.
 */
export function backfillEmployeesFromAdminUsers(db: QatafoDatabase): { created: number } {
  ensureIdentitySchema(db);
  const defaults = db.get<{ org: string | null; branch: string | null }>(
    'SELECT (SELECT id FROM erp_organizations ORDER BY created_at LIMIT 1) AS org, (SELECT id FROM erp_branches ORDER BY created_at LIMIT 1) AS branch',
  );
  const missing = db.all<{ id: string; name: string; created_at: string }>(
    `SELECT u.id,u.name,u.created_at FROM admin_users u
     WHERE NOT EXISTS (SELECT 1 FROM erp_employees e WHERE e.user_id=u.id)`,
  );
  let created = 0;
  for (const user of missing) {
    const [first, ...rest] = clean(user.name, 160).split(' ');
    const now = new Date().toISOString();
    db.run(`INSERT INTO erp_employees (id,employee_code,user_id,first_name,last_name,job_title,organization_id,branch_id,
      department_id,team_id,manager_employee_id,status,joined_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,NULL,NULL,NULL,'ACTIVE',?,?,?)`,
    `emp_${randomUUID()}`, nextSequenceNumber(db, 'employee_code'), user.id, first || '', rest.join(' '),
      '', defaults?.org ?? null, defaults?.branch ?? null, user.created_at || now, now, now);
    created += 1;
  }
  return { created };
}

export function resolveEmployee(db: QatafoDatabase, userId: string | null | undefined): EmployeeRecord | null {
  if (!userId) return null;
  const row = db.get<any>(`${SELECT_EMPLOYEE} WHERE e.user_id=? ORDER BY e.updated_at DESC LIMIT 1`, String(userId));
  return row ? mapEmployee(row) : null;
}

export function getEmployee(db: QatafoDatabase, id: string): EmployeeRecord | null {
  const row = db.get<any>(`${SELECT_EMPLOYEE} WHERE e.id=?`, id);
  return row ? mapEmployee(row) : null;
}

/** Label used in audit rows: "Prénom Nom (EMP-000001)", fallback for system actors. */
export type EmployeeLabelSource = { fullName?: string | null; email?: string | null; employeeCode?: string | null };

export function employeeLabel(employee: EmployeeLabelSource | null): string {
  if (!employee) return 'Système';
  return `${employee.fullName || employee.email || 'Employé'} (${employee.employeeCode || '—'})`.slice(0, 160);
}

export interface EmployeeListFilters {
  search?: string;
  status?: string;
  branchId?: string;
  departmentId?: string;
  page?: number;
  pageSize?: number;
}

export function listEmployees(db: QatafoDatabase, filters: EmployeeListFilters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(filters.pageSize) || 20));
  const where: string[] = [];
  const params: (string | number)[] = [];
  const search = clean(filters.search, 120);
  if (search) {
    where.push(`(e.employee_code LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR e.job_title LIKE ? OR u.email LIKE ?)`);
    params.push(...Array.from({ length: 5 }, () => `%${search}%`));
  }
  if (['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'].includes(String(filters.status))) { where.push('e.status=?'); params.push(String(filters.status)); }
  if (clean(filters.branchId, 80)) { where.push('e.branch_id=?'); params.push(clean(filters.branchId, 80)); }
  if (clean(filters.departmentId, 80)) { where.push('e.department_id=?'); params.push(clean(filters.departmentId, 80)); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM erp_employees e LEFT JOIN admin_users u ON u.id=e.user_id ${clause}`, ...params,
  )?.count ?? 0);
  const rows = db.all<any>(`${SELECT_EMPLOYEE} ${clause} ORDER BY e.employee_code LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize);
  return { data: rows.map(mapEmployee), pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

const EDITABLE_STATUS = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'];

/** Assignment/identity changes only. Login credentials stay owned by admin_users. */
export function updateEmployee(db: QatafoDatabase, id: string, body: Record<string, unknown>) {
  const existing = db.get<any>('SELECT * FROM erp_employees WHERE id=?', id);
  if (!existing) throw new Error('EMPLOYEE_NOT_FOUND');
  const patch: Record<string, string | null> = {};
  if (typeof body.firstName === 'string') patch.first_name = clean(body.firstName, 80);
  if (typeof body.lastName === 'string') patch.last_name = clean(body.lastName, 80);
  if (typeof body.jobTitle === 'string') patch.job_title = clean(body.jobTitle, 120);
  if (typeof body.status === 'string') {
    if (!EDITABLE_STATUS.includes(body.status)) throw new Error('EMPLOYEE_STATUS_INVALID');
    patch.status = body.status;
  }
  if ('organizationId' in body) patch.organization_id = clean(body.organizationId, 80) || null;
  if ('branchId' in body) patch.branch_id = clean(body.branchId, 80) || null;
  if ('departmentId' in body) patch.department_id = clean(body.departmentId, 80) || null;
  if ('teamId' in body) patch.team_id = clean(body.teamId, 80) || null;
  if ('managerEmployeeId' in body) {
    const managerId = clean(body.managerEmployeeId, 80) || null;
    if (managerId === id) throw new Error('EMPLOYEE_MANAGER_SELF');
    patch.manager_employee_id = managerId;
  }
  if ('joinedAt' in body) patch.joined_at = clean(body.joinedAt, 40) || null;
  if (patch.status === 'TERMINATED') patch.left_at = clean(body.leftAt, 40) || new Date().toISOString();
  else if ('leftAt' in body) patch.left_at = clean(body.leftAt, 40) || null;
  if (!Object.keys(patch).length) throw new Error('EMPLOYEE_NO_CHANGES');
  const now = new Date().toISOString();
  db.run(`UPDATE erp_employees SET ${Object.keys(patch).map((field) => `${field}=?`).join(',')},updated_at=? WHERE id=?`,
    ...Object.values(patch), now, id);
  return getEmployee(db, id);
}

export function organizationTree(db: QatafoDatabase) {
  return {
    organizations: db.all<any>('SELECT id,code,name,legal_name,status FROM erp_organizations ORDER BY created_at'),
    branches: db.all<any>('SELECT id,organization_id,code,name,city,status FROM erp_branches ORDER BY created_at'),
    departments: db.all<any>('SELECT id,organization_id,branch_id,code,name,status FROM erp_departments ORDER BY created_at'),
    teams: db.all<any>('SELECT id,organization_id,department_id,code,name,status FROM erp_teams ORDER BY created_at'),
  };
}

export function createOrganizationUnit(db: QatafoDatabase, kind: 'branch' | 'department' | 'team', body: Record<string, unknown>) {
  const now = new Date().toISOString();
  const name = clean(body.name, 120);
  if (name.length < 2) throw new Error('UNIT_NAME_REQUIRED');
  const organizationId = clean(body.organizationId, 80)
    || db.get<{ id: string }>('SELECT id FROM erp_organizations ORDER BY created_at LIMIT 1')?.id;
  if (!organizationId) throw new Error('ORGANIZATION_NOT_FOUND');
  if (kind === 'branch') {
    const id = `brn_${randomUUID()}`;
    db.run(`INSERT INTO erp_branches (id,organization_id,code,name,city,address,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?, ?,?)`,
      id, organizationId, nextSequenceNumber(db, 'branch_code'), name, clean(body.city, 80), clean(body.address, 300), 'ACTIVE', now, now);
  } else if (kind === 'department') {
    const id = `dep_${randomUUID()}`;
    db.run(`INSERT INTO erp_departments (id,organization_id,branch_id,code,name,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      id, organizationId, clean(body.branchId, 80) || null, nextSequenceNumber(db, 'department_code'), name, 'ACTIVE', now, now);
  } else {
    const id = `tmb_${randomUUID()}`;
    db.run(`INSERT INTO erp_teams (id,organization_id,department_id,code,name,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      id, organizationId, clean(body.departmentId, 80) || null, nextSequenceNumber(db, 'team_code'), name, 'ACTIVE', now, now);
  }
  emitErpEvent(db, { name: 'organization.unit.created', module: 'organization', resourceType: kind, payload: { name } });
  return organizationTree(db);
}
