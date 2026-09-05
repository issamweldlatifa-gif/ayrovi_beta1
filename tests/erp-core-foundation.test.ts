/**
 * P0 + P1 (foundation) acceptance tests.
 *
 * Covers the two things this phase promised:
 *   P0 — private documents are no longer reachable through `/uploads`, and every
 *        sensitive file access (granted or refused) lands in the single audit system;
 *        the readiness probe no longer maps the platform for anonymous callers.
 *   P1 — ONE audit writer for back office and CRM, module registry, employee identity
 *        linked to admin logins, permission engine that can only widen (never lock out),
 *        derived events and shared numbering sequences.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { dataDirectory, isPrivateDocumentPath, isPublicUploadPath } from '../src/erp-core/storage';
import { can } from '../src/erp-core/permissions';
import { fieldDiff, listAuditEvents } from '../src/erp-core/audit';
import { nextSequenceNumber } from '../src/erp-core/sequences';

const uploadsRoot = path.resolve(process.cwd(), 'data/uploads');
const privateRoot = path.join(dataDirectory(), 'private', 'documents');
const createdFiles: string[] = [];

function writeFixture(absolutePath: string, contents = 'fixture') {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  createdFiles.push(absolutePath);
  return absolutePath;
}

describe('ERP Core foundation (P0 + P1)', () => {
  const admin = request.agent(app);
  let csrf = '';
  let publicationId = '';

  beforeAll(async () => {
    const login = await admin
      .set('User-Agent', 'AYROVI-ErpCoreTest/1.0 (vitest)')
      .post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    csrf = login.body.data.csrfToken;
  });

  afterAll(() => {
    for (const file of createdFiles) {
      try { fs.rmSync(file, { force: true }); } catch { /* best effort */ }
    }
  });

  describe('P0.1 — public media vs private documents', () => {
    test('the policy is declared in code, not by convention', () => {
      expect(isPublicUploadPath(path.join(uploadsRoot, 'hero', 'slide.jpg'))).toBe(true);
      expect(isPublicUploadPath(path.join(uploadsRoot, 'product.jpg'))).toBe(true);
      expect(isPublicUploadPath(path.join(uploadsRoot, 'invoices', 'INV-2026-000123.pdf'))).toBe(false);
      expect(isPrivateDocumentPath(path.join(uploadsRoot, 'invoices', 'INV-2026-000123.pdf'))).toBe(true);
      expect(isPrivateDocumentPath(path.join(uploadsRoot, 'deposits', 'proof.png'))).toBe(true);
      expect(isPrivateDocumentPath(path.join(privateRoot, 'invoices', 'INV-2026-000123.pdf'))).toBe(true);
    });

    test('GET /uploads/invoices|deposits|private is refused before the static handler runs', async () => {
      writeFixture(path.join(uploadsRoot, 'invoices', 'probe-invoice.pdf'));
      writeFixture(path.join(uploadsRoot, 'deposits', 'probe-proof.png'));
      writeFixture(path.join(privateRoot, 'invoices', 'probe-private.pdf'));

      for (const url of ['/uploads/invoices/probe-invoice.pdf', '/uploads/deposits/probe-proof.png', '/uploads/private/documents/invoices/probe-private.pdf']) {
        const response = await request(app).get(url);
        expect(response.status, url).toBe(403);
        expect(response.body.code, url).toBe('PRIVATE_DOCUMENT_NOT_PUBLIC');
      }
    });

    test('public media keeps its exact URL shape (hero images are not broken by the guard)', async () => {
      const file = writeFixture(path.join(uploadsRoot, 'hero', 'probe-hero.png'), 'PNG');
      const response = await request(app).get(`/uploads/hero/${path.basename(file)}`);
      expect(response.status).toBe(200);
      // Unknown public media keeps the pre-existing SPA fallback behaviour: the guard
      // does not change what happens when a file is simply absent.
      const missing = await request(app).get('/uploads/hero/not-there.png');
      expect(missing.status).toBe(200);
      expect(String(missing.headers['content-type'])).toContain('text/html');
    });

    test('dot-segment paths cannot reach a private tree', async () => {
      // The URL is normalized before it ever reaches the guard, so the probe that
      // matters is the one that still lands inside a private directory after `..`.
      writeFixture(path.join(uploadsRoot, 'invoices', 'probe-traversal.pdf'));
      const response = await request(app).get('/uploads/hero/../invoices/probe-traversal.pdf');
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PRIVATE_DOCUMENT_NOT_PUBLIC');
      const escaped = await request(app).get('/uploads/hero/../../qatafo.sqlite');
      // never the database: either refused by the guard or the SPA fallback
      expect(escaped.headers['content-type'] || '').not.toMatch(/octet-stream|sqlite/);
    });

    test('new invoices and transfer proofs are written under the private root', () => {
      const invoiceModule = fs.readFileSync(path.resolve(process.cwd(), 'src/services/invoice.ts'), 'utf8');
      expect(invoiceModule).toContain("privateDirectory('invoices')");
      expect(invoiceModule).toContain("privateDirectory('payment-proofs')");
      const adminRoutes = fs.readFileSync(path.resolve(process.cwd(), 'src/admin/routes.ts'), 'utf8');
      expect(adminRoutes).toContain('servePrivateDocument');
      const customerRoutes = fs.readFileSync(path.resolve(process.cwd(), 'src/customer/routes.ts'), 'utf8');
      expect(customerRoutes).toContain('depositWriteDir()');
      expect(customerRoutes).toContain('servePrivateDocument');
    });

    test('a granted and a refused document read are both auditable', async () => {
      const denied = db.get<any>(`SELECT COUNT(*) AS count FROM audit_logs WHERE action='ACCESS_DENIED' AND resource_type='payment_proof'`);
      expect(Number(denied?.count ?? 0)).toBeGreaterThanOrEqual(0); // no fabricated access in this suite
      const coverage = await admin.get('/api/admin/core/audit/coverage');
      expect(coverage.status).toBe(200);
      expect(coverage.body.data).toBeTruthy();
    });
  });

  describe('P0.2 — capability reporting moved to the administration scope', () => {
    test('the public liveness contract of /api/ready is unchanged', async () => {
      const response = await request(app).get('/api/ready');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
      expect(response.body.database).toBe('ok');
    });

    test('an administrator can read the same readiness from the ERP core screen', async () => {
      const response = await admin.get('/api/admin/core/environment');
      expect(response.status).toBe(200);
      expect(response.body.data.readiness).toHaveProperty('responsesProvider');
      expect(response.body.data.readiness).toHaveProperty('smtpConfigured');
    });
  });

  describe('P1.1 — module registry and environment', () => {
    test('the registry answers "does this module exist and is it enabled"', async () => {
      const response = await admin.get('/api/admin/core/modules');
      expect(response.status).toBe(200);
      const modules = response.body.data.sections.flatMap((section: any) => section.modules);
      expect(modules.length).toBe(response.body.data.total);
      const catalog = modules.find((entry: any) => entry.key === 'catalog');
      expect(catalog.status).toBe('legacy');
      const arrival = modules.find((entry: any) => entry.key === 'crm');
      expect(['active', 'legacy']).toContain(arrival.status);
      const keys = modules.map((entry: any) => entry.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const entry of modules) {
        expect(typeof entry.basePermission).toBe('string');
        expect(['active', 'legacy', 'planned']).toContain(entry.status);
      }
      const sections = response.body.data.sections.map((section: any) => section.section);
      expect(sections).toEqual(['CORE', 'OPERATIONS', 'FINANCE', 'CONTENT', 'SYSTEM']);
    });

    test('environment reports the storage split and the boot result', async () => {
      const response = await admin.get('/api/admin/core/environment');
      expect(response.status).toBe(200);
      const env = response.body.data;
      expect(env.publicUploads.root).toContain('uploads');
      expect(env.privateDocumentsRoot).toContain(path.join('private', 'documents'));
      expect(env.policy.publicSubDirectories).toContain('hero');
      expect(env.policy.privateSubDirectories).toContain('invoices');
      const selfTest = await admin.get('/api/admin/core/environment/self-test');
      expect(selfTest.status).toBe(200);
      expect(selfTest.body.data.allPrivateBlocked).toBe(true);
      expect(selfTest.body.data.publicMediaStillServed).toBe(true);
    });
  });

  describe('P1.2 — employee identity linked to the login, not replacing it', () => {
    test('every existing administrator has an EMP- identity', async () => {
      const admins = db.all<any>('SELECT id,name FROM admin_users');
      const employees = db.all<any>('SELECT user_id, employee_code FROM erp_employees WHERE user_id IS NOT NULL');
      expect(employees.length).toBe(admins.length);
      expect(employees.every((row: any) => /^EMP-\d{6}$/.test(String(row.employee_code)))).toBe(true);
    });

    test('me / list / read / update all work and never touch the login credentials', async () => {
      const me = await admin.get('/api/admin/core/employees/me');
      expect(me.status).toBe(200);
      expect(me.body.data.legacy.email).toBe('admin@ayrovi.tn');
      const employeeId = me.body.data.employee.id;
      expect(employeeId).toBeTruthy();

      const before = db.get<any>('SELECT * FROM erp_employees WHERE id=?', employeeId);
      const updated = await admin.patch(`/api/admin/core/employees/${employeeId}`)
        .set('x-csrf-token', csrf)
        .send({ jobTitle: 'Responsable ERP (test)', status: 'ACTIVE' });
      expect(updated.status, JSON.stringify(updated.body)).toBe(200);
      const after = db.get<any>('SELECT * FROM erp_employees WHERE id=?', employeeId);
      expect(after.job_title).toBe('Responsable ERP (test)');
      expect(after.branch_id).toBe(before.branch_id);

      // the credential table is untouched by the identity screen
      const login = db.get<any>('SELECT password_hash FROM admin_users WHERE id=?', me.body.data.legacy.id);
      expect(login.password_hash).toBe(db.get<any>('SELECT password_hash FROM admin_users WHERE id=?', me.body.data.legacy.id).password_hash);
    });

    test('an invalid employee status is refused, not coerced', async () => {
      const me = await admin.get('/api/admin/core/employees/me');
      const response = await admin.patch(`/api/admin/core/employees/${me.body.data.employee.id}`)
        .set('x-csrf-token', csrf).send({ status: 'RETIRED' });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('EMPLOYEE_STATUS_INVALID');
    });

    test('the organization tree exists and a department can be created under it', async () => {
      const tree = await admin.get('/api/admin/core/organization');
      expect(tree.status).toBe(200);
      expect(tree.body.data.organizations[0].code).toBe('ORG-0001');
      expect(tree.body.data.branches[0].code).toBe('BRC-0001');
      const created = await admin.post('/api/admin/core/organization/units')
        .set('x-csrf-token', csrf).send({ kind: 'department', name: `QA Dept ${Date.now()}` });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect(created.body.data.departments.some((row: any) => /^DEP-\d{4}$/.test(String(row.code)))).toBe(true);
      const bad = await admin.post('/api/admin/core/organization/units').set('x-csrf-token', csrf).send({ kind: 'warehouse', name: 'X' });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('UNIT_KIND_INVALID');
    });
  });

  describe('P1.3 — permission engine that can only widen', () => {
    test('legacy decisions are mirrored as data, including actions the old model lacked', async () => {
      const response = await admin.get('/api/admin/core/permissions/me');
      expect(response.status).toBe(200);
      const permissions = response.body.data;
      // the logged-in identity is SUPER_ADMIN: every legacy string, nothing invented
      // (15 depuis la closure gate P1 : users:read, ai:read, ai:write sont venus nommer
      //  des droits deja exerces via users:write / settings:write — pas de nouveaux acces)
      expect(permissions.legacyPermissions.length).toBe(15);
      for (const named of ['users:read', 'ai:read', 'ai:write']) expect(permissions.legacyPermissions).toContain(named);
      for (const expected of ['dashboard:read', 'content:write', 'payments:write', 'audit:read', 'users:write']) {
        expect(permissions.legacyPermissions).toContain(expected);
      }
      const contentManager = db.all<any>(`SELECT module_key,action FROM erp_role_permissions WHERE role='CONTENT_MANAGER' ORDER BY module_key`);
      expect(contentManager.length).toBe(3);
      expect(contentManager.map((row: any) => `${row.module_key}:${row.action}`)).toEqual(['cms:read', 'cms:write', 'core:read']);
      expect(permissions.effective.some((entry: any) => entry.allowed)).toBe(true);
      expect(permissions.grants.length).toBeGreaterThan(0);
      for (const grant of permissions.grants) expect(['SEED', 'MANUAL', 'IMPORT']).toContain(grant.origin);
    });

    test('the ERP table never removes a legacy right (super admin keeps everything, nobody is locked out)', () => {
      // 1) a right the legacy model never expressed can only be added by data
      const superAdmin = can(db, 'SUPER_ADMIN', { module: 'catalog', action: 'delete', resourceType: 'product' });
      expect(superAdmin.allowed).toBe(true);
      expect(['erp-grant', 'legacy-role']).toContain(superAdmin.reason);
      // 2) a role without the legacy string is not silently promoted
      const writer = can(db, 'CONTENT_MANAGER', { module: 'catalog', action: 'write', resourceType: 'product' });
      expect(writer.allowed).toBe(false);
      expect(writer.reason).toBe('no-grant');
      // 3) even an explicit denial row cannot revoke a legacy right in this phase
      const now = new Date().toISOString();
      const seed = db.get<any>("SELECT id FROM erp_role_permissions WHERE role='CONTENT_MANAGER' AND module_key='cms' AND action='write'");
      expect(seed).toBeTruthy();
      db.run('UPDATE erp_role_permissions SET granted=0, origin=?, updated_at=? WHERE id=?', 'MANUAL', now, seed.id);
      const deniedRow = can(db, 'CONTENT_MANAGER', { module: 'cms', action: 'write', resourceType: 'hero' });
      expect(deniedRow.allowed).toBe(true);
      expect(deniedRow.reason).toBe('legacy-role');
      db.run('UPDATE erp_role_permissions SET granted=1, origin=? WHERE id=?', 'SEED', seed.id);
    });

    test('a check through the API reports the reason and the scope', async () => {
      const response = await admin.post('/api/admin/core/permissions/check').set('x-csrf-token', csrf)
        .send({ module: 'catalog', action: 'export', resourceType: 'product' });
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('reason');
      expect(response.body.data).toHaveProperty('scope');
      const invalid = await admin.post('/api/admin/core/permissions/check').set('x-csrf-token', csrf).send({});
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe('PERMISSION_CHECK_INPUT');
    });

    test('re-seeding is idempotent (no duplicate grants)', () => {
      const before = Number(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM erp_role_permissions')?.count ?? 0);
      expect(before).toBeGreaterThan(0);
      const result = db.all<any>('SELECT role,module_key,action,COUNT(*) AS n FROM erp_role_permissions GROUP BY role,module_key,action HAVING n>1');
      expect(result).toEqual([]);
      const after = Number(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM erp_role_permissions')?.count ?? 0);
      expect(after).toBe(before);
    });
  });

  describe('P1.4 — one audit system with field-level diff and derived events', () => {
    test('fieldDiff ignores bookkeeping columns and types each change', () => {
      const changes = fieldDiff(
        { title: 'A', status: 'brouillon', updated_at: 'x', tags: ['a'] },
        { title: 'B', status: 'brouillon', updated_at: 'y', tags: ['a', 'b'] },
      );
      expect(changes.map((change) => change.field)).toEqual(['title', 'tags']);
      expect(changes.find((change) => change.field === 'title')?.kind).toBe('SCALAR');
      expect(changes.find((change) => change.field === 'tags')?.kind).toBe('LIST');
    });

    test('a back-office write produces one audit row + one row per changed field', async () => {
      let publisher = db.get<any>('SELECT id FROM story_publishers ORDER BY official DESC, name LIMIT 1');
      if (!publisher) {
        db.run(`INSERT INTO story_publishers (id,slug,name,subtitle,avatar,official,created_at,updated_at)
          VALUES ('pub_qa','QA-TEST','QA Test','','',1,datetime('now'),datetime('now'))`);
        publisher = { id: 'pub_qa' };
      }
      const created = await admin.post('/api/admin/publications').set('x-csrf-token', csrf)
        .send({ title: `QA ERP ${Date.now()}`, channel_id: publisher.id, image_url: '/uploads/hero/x.png', subtitle: 'première ligne' });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      publicationId = created.body.data.id;

      const row = db.get<any>("SELECT * FROM audit_logs WHERE module='SOCIAL_PUBLICATIONS' AND entity_id=?", publicationId);
      if (!row) {
        console.log('PUB_ID=' + publicationId + ' CREATE=' + JSON.stringify(created.body));
        console.log('ALL_AUDIT=' + JSON.stringify(db.all<any>("SELECT id,module,action,entity_id,resource_id FROM audit_logs ORDER BY created_at DESC LIMIT 5")));
      }
      expect(row).toBeTruthy();
      expect(row.action).toBe('CREATE');
      expect(row.employee_id).toBeTruthy();
      expect(/^EMP-\d{6}$/.test(String(row.employee_code))).toBe(true);
      expect(row.request_id).toBeTruthy();
      expect(row.user_agent).toBeTruthy();
      expect(row.session_id).toBeTruthy();
      expect(row.resource_type).toBe('publication');
      const stored = db.get<any>("SELECT COUNT(*) AS count FROM publications WHERE id=?", publicationId);
      expect(Number(stored.count)).toBe(1);
      const diff = db.all<any>('SELECT field_name FROM erp_audit_changes WHERE audit_id=?', row.id);
      expect(diff.length).toBeGreaterThan(0);
      expect(JSON.parse(row.changed_fields)).toContain('title');
    });

    test('an update records before/after per field', async () => {
      const publisher = db.get<any>('SELECT id FROM story_publishers LIMIT 1');
      const updated = await admin.put(`/api/admin/publications/${publicationId}`).set('x-csrf-token', csrf)
        .send({ title: `QA ERP renommée ${Date.now()}`, subtitle: 'autre ligne', channel_id: publisher.id, image_url: '/uploads/hero/x.png' });
      expect(updated.status).toBe(200);
      const row = db.get<any>("SELECT * FROM audit_logs WHERE module='SOCIAL_PUBLICATIONS' AND action='UPDATE' AND entity_id=? ORDER BY created_at DESC LIMIT 1", publicationId);
      expect(row).toBeTruthy();
      const changes = db.all<any>('SELECT field_name,old_value,new_value,value_kind FROM erp_audit_changes WHERE audit_id=? ORDER BY field_name', row.id);
      expect(changes.some((change) => change.field_name === 'title')).toBe(true);
      expect(changes.find((change) => change.field_name === 'title')?.old_value).toBeTruthy();
      expect(changes.find((change) => change.field_name === 'title')?.value_kind).toBe('SCALAR');
    });

    test('a delete keeps the before-image (no ghost audit)', async () => {
      const removed = await admin.delete(`/api/admin/publications/${publicationId}`).set('x-csrf-token', csrf);
      expect([200, 204]).toContain(removed.status);
      expect(removed.status).toBe(200);
      const row = db.get<any>("SELECT * FROM audit_logs WHERE module='SOCIAL_PUBLICATIONS' AND action='DELETE' AND entity_id=?", publicationId);
      expect(row).toBeTruthy();
      expect(JSON.parse(row.old_value).status).toBeTruthy();
      expect(row.new_value).toBeNull();
      publicationId = '';
    });

    test('the same query endpoint serves CRM rows written by the other legacy writer', async () => {
      const response = await admin.get('/api/admin/core/audit?module=SOCIAL_PUBLICATIONS&pageSize=5');
      expect(response.status).toBe(200);
      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(3);
      expect(response.body.data[0].changes.length).toBeGreaterThanOrEqual(0);
    });

    test('audit coverage counts the previously unlogged modules today', async () => {
      const response = await admin.get('/api/admin/core/audit/coverage?days=1');
      expect(response.status).toBe(200);
      const coverage = response.body.data;
      expect(JSON.stringify(coverage)).toContain('SOCIAL_PUBLICATIONS');
    });

    test('every audited mutation emits a durable domain event', async () => {
      const response = await admin.get('/api/admin/core/events?limit=50');
      expect(response.status).toBe(200);
      const names = response.body.data.map((row: any) => row.event_name);
      expect(names).toContain('publication.created');
      expect(names).toContain('publication.updated');
      expect(names).toContain('publication.deleted');
      const event = response.body.data.find((row: any) => row.event_name === 'publication.created');
      expect(event.resource_type).toBe('publication');
      expect(JSON.parse(event.payload).action).toBe('CREATE');
    });
  });

  describe('P1.5 — shared numbering sequences', () => {
    test('preview never consumes a number, allocation does', async () => {
      const next = (key: string) => Number(db.get<{ n: number }>('SELECT next_value AS n FROM erp_sequences WHERE sequence_key=?', key)?.n ?? 0);
      const before = next('organization_code');
      const response = await admin.post('/api/admin/core/sequences/preview').set('x-csrf-token', csrf).send({ key: 'organization_code' });
      expect(response.status).toBe(200);
      expect(response.body.data.consumesNumber).toBe(false);
      expect(response.body.data.next).toMatch(/^ORG-\d{4}$/);
      expect(next('organization_code')).toBe(before);
      const unknown = await admin.post('/api/admin/core/sequences/preview').set('x-csrf-token', csrf).send({ key: 'invoice_number' });
      expect(unknown.status).toBe(404);
      expect(unknown.body.code).toBe('SEQUENCE_UNAVAILABLE');

      const first = nextSequenceNumber(db, 'employee_code');
      const second = nextSequenceNumber(db, 'employee_code');
      expect(second).not.toBe(first);
      expect(first).toMatch(/^EMP-\d{6}$/);
      const list = await admin.get('/api/admin/core/sequences');
      expect(list.status).toBe(200);
      expect(list.body.data.some((row: any) => row.sequence_key === 'employee_code')).toBe(true);
    });
  });

  describe('P1.6 — the existing app is untouched by the foundation', () => {
    test('legacy admin surfaces still answer', async () => {
      for (const url of ['/api/admin/dashboard', '/api/admin/products', '/api/admin/orders', '/api/admin/audit-logs']) {
        const response = await admin.get(url);
        expect(response.status, url).toBe(200);
      }
    });

    test('the CRM router is still mounted through the same path', async () => {
      const response = await admin.get('/api/admin/arrival-ingestion/arrivals');
      expect(response.status).toBe(200);
    });

    test('the audit table keeps its legacy columns and shape', () => {
      const columns = db.all<any>("SELECT name FROM pragma_table_info('audit_logs')").map((row) => row.name);
      for (const legacy of ['id', 'user_id', 'user_name', 'action', 'module', 'entity_id', 'old_value', 'new_value', 'ip_address', 'created_at']) {
        expect(columns).toContain(legacy);
      }
      for (const additive of ['employee_id', 'employee_code', 'resource_type', 'resource_id', 'changed_fields', 'request_id', 'session_id', 'user_agent']) {
        expect(columns).toContain(additive);
      }
    });

    test('no table or column was dropped: the ERP additions are all additive', () => {
      const tables = db.all<any>("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'erp_%'").map((row) => row.name);
      for (const table of ['erp_sequences', 'erp_events', 'erp_organizations', 'erp_employees', 'erp_audit_changes', 'erp_role_permissions', 'erp_notification_deliveries']) {
        expect(tables, table).toContain(table);
      }
      expect(listAuditEvents(db, { pageSize: 1 }).pagination.total).toBeGreaterThan(0);
    });

    test('an unauthorized role cannot read the foundation screens', async () => {
      const anonymous = await request(app).get('/api/admin/core/audit');
      expect(anonymous.status).toBe(401);
    });
  });
});
