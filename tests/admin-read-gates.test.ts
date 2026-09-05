/**
 * P1 closure gate — read gates that used to demand write rights.
 *
 * Two findings from the audit were left open on purpose in P0/P1 because fixing them
 * touches an authorization decision, not a plumbing detail:
 *   1. `GET /api/admin/users` was gated by `users:write` — a consultation required the
 *      right to manage accounts, so a "read the team, never touch it" role could not
 *      exist;
 *   2. the `ai-knowledge` resource was gated by `settings:write` — the assistant's
 *      knowledge base is not a setting, and the write/read distinction collapsed.
 *
 * This file pins the fixed behaviour and, more importantly, the invariant that made the
 * fix safe: for every existing role the set of accounts that can perform an action is
 * identical to the pre-fix set. Read and write became separately *nameable*; nobody was
 * promoted and nobody was locked out.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app, db } from '../src/server';
import { ALL_ADMIN_PERMISSIONS, hasPermission } from '../src/admin/permissions';
import { can } from '../src/erp-core/permissions';

const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'ORDER_MANAGER'] as const;
const suffix = Date.now();
const created: string[] = [];

/** Create an account with the given role and return an authenticated agent for it. */
type Session = { agent: ReturnType<typeof request.agent>; csrf: string };

async function loginAs(role: (typeof ALL_ROLES)[number], superAgent: any, superCsrf: string): Promise<Session> {
  const email = `gate-${role.toLowerCase()}-${suffix}@test.ayrovi.tn`;
  const password = 'GateSecure2026!x';
  const insert = await superAgent.post('/api/admin/users').set('x-csrf-token', superCsrf)
    .send({ name: `Gate ${role}`, email, password, role });
  expect(insert.status, JSON.stringify(insert.body)).toBe(201);
  created.push(email);
  const agent = request.agent(app);
  const login = await agent.post('/api/admin/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  return { agent, csrf: login.body.data.csrfToken };
}

describe('admin read gates (P1 closure gate)', () => {
  let superAgent: any;
  let superCsrf = '';
  let admin: Session;
  let content: Session;
  let orders: Session;

  beforeAll(async () => {
    superAgent = request.agent(app);
    const superLogin = await superAgent.post('/api/admin/auth/login')
      .send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(superLogin.status).toBe(200);
    superCsrf = superLogin.body.data.csrfToken;
    admin = await loginAs('ADMIN', superAgent, superCsrf);
    content = await loginAs('CONTENT_MANAGER', superAgent, superCsrf);
    orders = await loginAs('ORDER_MANAGER', superAgent, superCsrf);
  });

  afterAll(() => {
    // The test database is :memory:, so the accounts die with it; only the hand-made
    // grant is removed explicitly, in case a future harness points at a file DB.
    db.run("DELETE FROM erp_role_permissions WHERE id='erpperm_GATE_TEST_users_read'");
  });

  describe('users list: a read, judged as a read', () => {
    test('the endpoint no longer asks for the write permission', () => {
      const routes = fs.readFileSync(path.resolve(process.cwd(), 'src/admin/routes.ts'), 'utf8');
      expect(routes).toContain("router.get('/users', requireErpPermission(db, { module: 'users', action: 'read'");
      expect(routes).not.toContain("router.get('/users', requireAdmin(db, 'users:write')");
      // `users:read` now exists as a name, and is a strictly narrower right than users:write.
      expect(ALL_ADMIN_PERMISSIONS).toContain('users:read');
      for (const role of ALL_ROLES) {
        if (hasPermission(role as any, 'users:read')) expect(hasPermission(role as any, 'users:write'), role).toBe(true);
      }
    });

    test('super admin reads the accounts list, and gets the safe projection', async () => {
      const response = await superAgent.get('/api/admin/users');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      for (const row of response.body.data) {
        expect(Object.keys(row)).not.toContain('password_hash');
        expect(Object.keys(row)).not.toContain('csrf_token');
      }
    });

    test('a role without users:write is refused — with the ERP reason, not a generic message', async () => {
      for (const session of [content, orders, admin]) {
        const response = await session.agent.get('/api/admin/users');
        expect(response.status).toBe(403);
        expect(response.body.code).toBe('ERP_PERMISSION_DENIED');
      }
    });

    test('granting read access is a row of data, not a code change', async () => {
      const now = new Date().toISOString();
      db.run(`INSERT INTO erp_role_permissions (id,role,module_key,action,resource_type,scope,granted,origin,created_at,updated_at)
        VALUES ('erpperm_GATE_TEST_users_read','CONTENT_MANAGER','users','read','*','all',1,'MANUAL',?,?)`, now, now);
      try {
        const allowed = await content.agent.get('/api/admin/users');
        expect(allowed.status).toBe(200);
        // read stays read: managing accounts still requires the legacy write right
        const write = await content.agent.post('/api/admin/users').set('x-csrf-token', content.csrf)
          .send({ name: 'Should Fail', email: `nope-${suffix}@test.ayrovi.tn`, password: 'NopeSecure2026!', role: 'ADMIN' });
        expect(write.status).toBe(403);
      } finally {
        db.run("DELETE FROM erp_role_permissions WHERE id='erpperm_GATE_TEST_users_read'");
      }
      const revoked = await content.agent.get('/api/admin/users');
      expect(revoked.status).toBe(403);
    });

    test('a denied read is auditable, so refusals are not silent', async () => {
      const deniedBefore = Number(db.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM audit_logs WHERE action='ACCESS_DENIED' AND module='PERMISSIONS'`)?.count ?? 0);
      expect((await content.agent.get('/api/admin/users')).status).toBe(403);
      const deniedAfter = Number(db.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM audit_logs WHERE action='ACCESS_DENIED' AND module='PERMISSIONS'`)?.count ?? 0);
      expect(deniedAfter).toBeGreaterThan(deniedBefore);
      const row = db.get<any>(
        `SELECT * FROM audit_logs WHERE action='ACCESS_DENIED' AND module='PERMISSIONS' ORDER BY created_at DESC LIMIT 1`);
      expect(row.resource_type).toBe('role_permission');
      expect(String(row.new_value)).toContain('users');
      expect(String(row.new_value)).toContain('no-grant');
      expect(row.ip_address === null || typeof row.ip_address === 'string').toBe(true);
    });

    test('invariant: the set of roles able to read the list equals the set that used to be able to write it', () => {
      for (const role of ALL_ROLES) {
        const decided = can(db, role, { module: 'users', action: 'read', resourceType: 'admin_user' });
        expect(decided.allowed, role).toBe(hasPermission(role as any, 'users:write'));
      }
      // ADMIN is the case the old gate refused and the frozen RBAC expectation keeps:
      // it manages settings, not accounts. Nothing was widened behind its back.
      expect(can(db, 'ADMIN', { module: 'users', action: 'read', resourceType: 'admin_user' }).allowed).toBe(false);
      expect(hasPermission('ADMIN', 'users:read')).toBe(false);
    });
  });

  describe('ai-knowledge: not a setting', () => {
    test('read and write are declared as separate AI rights', () => {
      expect(hasPermission('ADMIN', 'ai:read')).toBe(true);
      expect(hasPermission('ADMIN', 'ai:write')).toBe(true);
      const routes = fs.readFileSync(path.resolve(process.cwd(), 'src/admin/routes.ts'), 'utf8');
      expect(routes).toContain("permission: 'ai:write', readPermission: 'ai:read'");
      expect(routes).not.toContain("resource === 'ai-knowledge' ? 'settings:write'");
    });

    test('invariant: every role keeps exactly the AI access it had via settings:write', () => {
      for (const role of ALL_ROLES) {
        expect(hasPermission(role as any, 'ai:read'), `${role} read`).toBe(hasPermission(role as any, 'settings:write'));
        expect(hasPermission(role as any, 'ai:write'), `${role} write`).toBe(hasPermission(role as any, 'settings:write'));
        // and the ERP engine agrees with the legacy answer for the same module:action
        expect(can(db, role, { module: 'ai', action: 'read', resourceType: 'ai_knowledge' }).allowed, `${role} engine read`)
          .toBe(hasPermission(role as any, 'settings:write'));
      }
    });

    test('super admin and admin read the knowledge base; a content role does not', async () => {
      const created = await superAgent.post('/api/admin/ai-knowledge').set('x-csrf-token', superCsrf)
        .send({ category: 'FAQ', question: `Policy probe ${suffix}`, answer: 'Réponse de test pour le gate de closure P1.', priority: 10, active: 1 });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const id = created.body.data.id;

      for (const session of [{ label: 'SUPER_ADMIN', agent: superAgent }, { label: 'ADMIN', agent: admin.agent }]) {
        const list = await session.agent.get('/api/admin/ai-knowledge');
        expect(list.status, session.label).toBe(200);
        expect(Array.isArray(list.body.data)).toBe(true);
        const detail = await session.agent.get(`/api/admin/ai-knowledge/${id}`);
        expect(detail.status, session.label).toBe(200);
        expect(detail.body.data.id).toBe(id);
      }

      const listDenied = await orders.agent.get('/api/admin/ai-knowledge');
      expect(listDenied.status).toBe(403);
      const forbidden = await content.agent.get('/api/admin/ai-knowledge');
      expect(forbidden.status).toBe(403);
      const forbiddenWrite = await content.agent.put(`/api/admin/ai-knowledge/${id}`).set('x-csrf-token', content.csrf)
        .send({ answer: 'tentative de modification' });
      expect(forbiddenWrite.status).toBe(403);
      const forbiddenApprove = await content.agent.post('/api/admin/ai-suggestions/approve').set('x-csrf-token', content.csrf)
        .send({ question: 'Question assez longue ?', answer: 'Réponse assez longue pour être acceptée.' });
      expect(forbiddenApprove.status).toBe(403);

      // the row was really created by the write gate, so it can be cleaned through it too
      const softOff = await superAgent.put(`/api/admin/ai-knowledge/${id}`).set('x-csrf-token', superCsrf)
        .send({ category: 'FAQ', answer: 'Réponse de test pour le gate de closure P1.', active: 0 });
      expect(softOff.status).toBe(200);
      expect(softOff.body.data.active).toBe(0);
      db.run('DELETE FROM ai_knowledge WHERE id=?', id);
    });

    test('approving a suggestion is an AI write, not a settings write', async () => {
      const response = await admin.agent.post('/api/admin/ai-suggestions/approve').set('x-csrf-token', admin.csrf)
        .send({ question: `Approuvée par le gate ${suffix}`, answer: 'Réponse approuvée par le test de closure P1.', category: 'GENERAL' });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const id = response.body.data.id;
      const audited = db.get<any>(`SELECT * FROM audit_logs WHERE action='APPROVE' AND module='AI_KNOWLEDGE' AND entity_id=?`, id);
      expect(audited).toBeTruthy();
      expect(audited.user_name).toBe(`Gate ADMIN`);
      db.run('DELETE FROM ai_knowledge WHERE id=?', id);
      db.run('DELETE FROM audit_logs WHERE action=\'APPROVE\' AND entity_id=?', id);
    });
  });

  describe('untouched gates (regression surface)', () => {
    test('users POST/PUT still require users:write', async () => {
      const blocked = await admin.agent.post('/api/admin/users').set('x-csrf-token', admin.csrf)
        .send({ name: 'Blocked', email: `blocked-${suffix}@test.ayrovi.tn`, password: 'BlockedSecure2026!', role: 'ADMIN' });
      expect(blocked.status).toBe(403);
      expect(db.get<any>('SELECT id FROM admin_users WHERE email=?', `blocked-${suffix}@test.ayrovi.tn`)).toBeFalsy();
    });

    test('a write without a CSRF token is still refused, whatever the permission model', async () => {
      const missingToken = await admin.agent.post('/api/admin/ai-suggestions/approve')
        .send({ question: 'Question assez longue ?', answer: 'Réponse assez longue pour être acceptée.' });
      expect(missingToken.status).toBe(403);
      expect(missingToken.body.error).toContain('CSRF');
    });

    test('other resources keep their previous content:read gate', async () => {
      const list = await content.agent.get('/api/admin/news');
      expect(list.status).toBe(200);
      const knowledgeIsNotContent = await content.agent.get('/api/admin/ai-knowledge');
      expect(knowledgeIsNotContent.status).toBe(403);
    });

    test('lens-lab still runs on settings:write (deliberately out of scope)', () => {
      const routes = fs.readFileSync(path.resolve(process.cwd(), 'src/admin/routes.ts'), 'utf8');
      expect(routes).toContain("router.post('/lens-lab/run', requireAdmin(db, 'settings:write')");
    });
  });
});
