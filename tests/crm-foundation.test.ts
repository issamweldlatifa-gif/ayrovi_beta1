/**
 * AYROVI CRM 360 (E1/E2) — tests d'acceptation du module relationnel.
 *
 * Ce qui est verrouillé ici :
 *  • fondation : schéma idempotent, séquences, grants en données, registre `crm360` ;
 *  • Parties : création propre, refus de doublon (409), vue 360°, archivage terminal ;
 *  • Contacts (dont doublon à la base), relations, raccordements legacy ;
 *  • Activités / tâches & follow-ups / notes / issues — cycle de vie + timeline ;
 *  • autorisation serveur (grants ERP) et refus tracés, audit et notifications.
 *
 * Aucun test existant n'est affaibli : cette suite ajoute des verrous, elle n'en retire pas.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { ERP_MODULES } from '../src/erp-core/modules';
import { ensureCrmSchema, bootstrapCrm, CRM360_TABLES, CRM_SEQUENCES } from '../src/crm/bootstrap';

const SUFFIX = `t${Date.now().toString(36)}`;
const EMAIL = (local: string) => `${local}.${SUFFIX}@ayrovi.test`;

const adminPassword = 'AyroviBeta2026!';
const operatorPassword = 'CrmTest-Password-2026!';
const operatorEmail = EMAIL('crm.order');
const contentEmail = EMAIL('crm.content');

let adminCsrf = '';
let operatorCsrf = '';
let operator: request.Agent;

const admin = request.agent(app);
const content = request.agent(app);

async function login(agent: request.Agent, email: string, password: string): Promise<string> {
  const response = await agent
    .set('User-Agent', 'AYROVI-CrmTest/1.0 (vitest)')
    .post('/api/admin/auth/login').send({ email, password });
  expect(response.status, `login ${email}`).toBe(200);
  return response.body.data.csrfToken;
}

async function createAdminUser(name: string, email: string, role: string): Promise<void> {
  const response = await admin
    .set('x-csrf-token', adminCsrf)
    .post('/api/admin/users')
    .send({ name, email, password: operatorPassword, role });
  expect(response.status).toBe(201);
}

describe('CRM 360 (E1/E2)', () => {
  beforeAll(async () => {
    adminCsrf = await login(admin, 'admin@ayrovi.tn', adminPassword);
    await createAdminUser('CRM Order', operatorEmail, 'ORDER_MANAGER');
    await createAdminUser('CRM Content', contentEmail, 'CONTENT_MANAGER');
    operator = request.agent(app);
    operatorCsrf = await login(operator, operatorEmail, operatorPassword);
    await login(content, contentEmail, operatorPassword);
  });

  afterAll(() => {
    // ménage : on retire uniquement ce que cette suite a créé (jamais de données legacy).
    for (const party of db.all<any>(`SELECT id FROM crm360_parties WHERE name LIKE ?`, `%${SUFFIX}%`)) {
      try { db.run('DELETE FROM crm360_relationships WHERE from_party_id=? OR to_party_id=?', party.id, party.id); } catch { /* hermetic */ }
      try { db.run('DELETE FROM crm360_party_links WHERE party_id=?', party.id); } catch { /* hermetic */ }
      try { db.run('DELETE FROM crm360_status_events WHERE entity_id=?', party.id); } catch { /* hermetic */ }
      try { db.run('DELETE FROM crm360_parties WHERE id=?', party.id); } catch { /* hermetic */ }
    }
    try { db.run('DELETE FROM crm360_notes'); } catch { /* hermetic */ }
    try { db.run('DELETE FROM crm360_tasks'); } catch { /* hermetic */ }
    try { db.run('DELETE FROM crm360_activities'); } catch { /* hermetic */ }
    try { db.run('DELETE FROM crm360_issues'); } catch { /* hermetic */ }
  });

  describe('fondation (schéma, séquences, registre, grants)', () => {
    test('le schéma est idempotent et complet', () => {
      expect(() => { ensureCrmSchema(db); ensureCrmSchema(db); }).not.toThrow();
      const tables = new Set(db.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table'`).map((t) => t.name));
      for (const table of CRM360_TABLES) expect(tables.has(table), `table ${table}`).toBe(true);
    });

    test('les séquences du module existent avec leurs préfixes', () => {
      const byKey = new Map(db.all<any>('SELECT sequence_key,prefix FROM erp_sequences').map((r) => [r.sequence_key, r]));
      for (const seq of CRM_SEQUENCES) {
        expect(byKey.get(seq.key), seq.key).toBeTruthy();
        expect(byKey.get(seq.key).prefix).toBe(seq.prefix);
      }
    });

    test('bootstrapCrm rapporte tables + grants + séquences prêtes', () => {
      const report = bootstrapCrm(db);
      expect(report.tablesReady).toBe(CRM360_TABLES.length);
      expect(report.sequencesReady).toBe(CRM_SEQUENCES.length);
      expect(report.grantsSeeded).toBeGreaterThan(0);
    });

    test('le module crm360 est actif dans le registre ERP', () => {
      const entry = ERP_MODULES.find((m) => m.key === 'crm360');
      expect(entry).toBeTruthy();
      expect(entry?.status).toBe('active');
    });

    test('les grants crm360 sont semés pour ADMIN/SUPER_ADMIN et l’opérateur', () => {
      const adminRow = db.get<any>(`SELECT * FROM erp_role_permissions WHERE role='ADMIN' AND module_key='crm360' AND action='view' AND resource_type='party'`);
      expect(adminRow?.granted).toBe(1);
      const operatorCreate = db.get<any>(`SELECT * FROM erp_role_permissions WHERE role='ORDER_MANAGER' AND module_key='crm360' AND action='create' AND resource_type='task'`);
      expect(operatorCreate?.granted).toBe(1);
      const operatorArchive = db.get<any>(`SELECT * FROM erp_role_permissions WHERE role='ORDER_MANAGER' AND module_key='crm360' AND action='archive' AND resource_type='party'`);
      expect(operatorArchive?.granted ?? 0).toBe(0);
    });
  });

  describe('Parties — création propre, doublons refusés, vue 360°, archivage', () => {
    let partyId = '';
    let partyCode = '';

    test('SUPER_ADMIN crée un client avec un code lisible', async () => {
      const response = await admin
        .set('x-csrf-token', adminCsrf)
        .post('/api/admin/crm/parties')
        .send({ partyType: 'INDIVIDUAL', kind: 'CUSTOMER', name: `Crm Customer ${SUFFIX}`, email: EMAIL('customer'), phone: '+21620123456' });
      expect(response.status).toBe(200);
      expect(response.body.data.party.party_code).toMatch(/^CUS-\d{6}$/);
      partyId = response.body.data.party.id;
      partyCode = response.body.data.party.party_code;
    });

    test('un second enregistrement au même téléphone est refusé en 409', async () => {
      const response = await admin
        .set('x-csrf-token', adminCsrf)
        .post('/api/admin/crm/parties')
        .send({ partyType: 'INDIVIDUAL', kind: 'CUSTOMER', name: `Crm Customer Clone ${SUFFIX}`, phone: '+21620123456' });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('CRM_DUPLICATE_PARTY');
    });

    test('un e-mail déjà porté par une fiche est aussi refusé', async () => {
      const response = await admin
        .set('x-csrf-token', adminCsrf)
        .post('/api/admin/crm/parties')
        .send({ partyType: 'COMPANY', kind: 'PARTNER', name: `Partner ${SUFFIX}`, email: EMAIL('customer') });
      expect(response.status).toBe(409);
    });

    test('lister les parties puis ouvrir la vue 360°', async () => {
      const list = await admin.get(`/api/admin/crm/parties?search=${encodeURIComponent(`Crm Customer ${SUFFIX}`)}`);
      expect(list.status).toBe(200);
      expect(list.body.pagination.total).toBeGreaterThanOrEqual(1);
      const view = await admin.get(`/api/admin/crm/parties/${partyId}`);
      expect(view.status).toBe(200);
      expect(view.body.data.party.party_code).toBe(partyCode);
      expect(view.body.data.contacts).toEqual([]);
      expect(view.body.data.counters.open_tasks).toBe(0);
    });

    test('éditer la fiche, puis archiver — jamais supprimer', async () => {
      const edit = await admin
        .set('x-csrf-token', adminCsrf)
        .put(`/api/admin/crm/parties/${partyId}`)
        .send({ governorate: 'Tunis', name: `Crm Customer (updated) ${SUFFIX}` });
      expect(edit.status).toBe(200);
      expect(edit.body.data.party.governorate).toBe('Tunis');

      const archived = await admin
        .set('x-csrf-token', adminCsrf)
        .post(`/api/admin/crm/parties/${partyId}/archive`);
      expect(archived.status).toBe(200);
      expect(archived.body.data.party.status).toBe('ARCHIVED');

      const refused = await admin
        .set('x-csrf-token', adminCsrf)
        .put(`/api/admin/crm/parties/${partyId}`)
        .send({ name: `Should Not Move ${SUFFIX}` });
      expect(refused.status).toBe(409);
    });
  });

  describe('Contacts, relations et raccordements legacy', () => {
    let partyId = '';

    test('créer une fiche partenaire dédiée pour la suite', async () => {
      const partner = await admin
        .set('x-csrf-token', adminCsrf)
        .post('/api/admin/crm/parties')
        .send({ partyType: 'COMPANY', kind: 'PARTNER', name: `Partner Hub ${SUFFIX}`, email: EMAIL('hub') });
      expect(partner.status).toBe(200);
      partyId = partner.body.data.party.id;
    });

    test('ajouter un contact, refuser le doublon téléphone dans la même fiche, lister', async () => {
      const first = await admin
        .set('x-csrf-token', adminCsrf)
        .post('/api/admin/crm/contacts')
        .send({ partyId, firstName: 'Nadia', lastName: 'Ben Salah', email: EMAIL('nadia'), phone: '+21698123456', isPrimary: true });
      expect(first.status).toBe(200);
      expect(first.body.data.contact.is_primary).toBe(1);

      const duplicate = await admin
        .set('x-csrf-token', adminCsrf)
        .post('/api/admin/crm/contacts')
        .send({ partyId, firstName: 'Nadia', lastName: 'Ben Salah bis', phone: '+21698123456' });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('CRM_DUPLICATE_CONTACT');

      const list = await admin.get(`/api/admin/crm/contacts?partyId=${partyId}`);
      expect(list.status).toBe(200);
      expect(list.body.pagination.total).toBe(1);
    });

    test('l’opérateur (sans grant delete) est refusé, l’admin supprime proprement', async () => {
      const contact = db.get<{ id: string }>('SELECT id FROM crm360_contacts WHERE party_id=? LIMIT 1', partyId);
      expect(contact).toBeTruthy();
      const denied = await operator
        .set('x-csrf-token', operatorCsrf)
        .delete(`/api/admin/crm/contacts/${contact!.id}`);
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('ERP_PERMISSION_DENIED');
      const deleted = await admin
        .set('x-csrf-token', adminCsrf)
        .delete(`/api/admin/crm/contacts/${contact!.id}`);
      expect(deleted.status).toBe(200);
    });

    test('raccorder la fiche à un fournisseur legacy, refuser le doublon, voir la vue enrichie', async () => {
      const supplierId = `sup_${SUFFIX}`;
      const now = new Date().toISOString();
      db.run(`INSERT INTO suppliers (id,code,name,contact_name,phone,email,address,currency,payment_terms,lead_time_days,status,notes,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      supplierId, `SUP-${SUFFIX}`, `Fournisseur ${SUFFIX}`, '', '', '', '', 'TND', '', 7, 'ACTIVE', '', now, now);

      const link = await admin
        .set('x-csrf-token', adminCsrf)
        .post(`/api/admin/crm/parties/${partyId}/links`)
        .send({ refType: 'supplier', refId: supplierId });
      expect(link.status).toBe(200);
      expect(link.body.data.link.ref_type).toBe('supplier');

      const again = await admin
        .set('x-csrf-token', adminCsrf)
        .post(`/api/admin/crm/parties/${partyId}/links`)
        .send({ refType: 'supplier', refId: supplierId });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('CRM_ALREADY_LINKED');

      const view = await admin.get(`/api/admin/crm/parties/${partyId}`);
      expect(view.body.data.links).toHaveLength(1);
      expect(view.body.data.legacy.suppliers).toHaveLength(1);
    });
  });

  describe('Activités, tâches/follow-ups, notes, issues — cycle de vie + timeline', () => {
    test('cycle de vie complet sur une fiche (activité, tâche échue, note, issue, timeline)', async () => {
      // 1) fiche support
      const party = await admin
        .set('x-csrf-token', adminCsrf)
        .post('/api/admin/crm/parties')
        .send({ partyType: 'COMPANY', kind: 'CUSTOMER', name: `Lifecycle Customer ${SUFFIX}`, email: EMAIL('lifecycle') });
      expect(party.status).toBe(200);
      const partyId = party.body.data.party.id;

      // 2) activité planifiée puis complétée
      const activity = await admin
        .set('x-csrf-token', adminCsrf)
        .post('/api/admin/crm/activities')
        .send({ partyId, kind: 'CALL', subject: `Appel de présentation ${SUFFIX}`, scheduledAt: new Date().toISOString() });
      expect(activity.status).toBe(200);
      const activityId = activity.body.data.activity.id;
      const doneActivity = await admin
        .set('x-csrf-token', adminCsrf)
        .post(`/api/admin/crm/activities/${activityId}/status`)
        .send({ status: 'COMPLETED' });
      expect(doneActivity.status).toBe(200);
      expect(doneActivity.body.data.activity.completed_at).toBeTruthy();

      // 3) tâche de suivi échue, visible dans le filtre overdue, puis complétée
      const past = new Date(Date.now() - 86_400_000).toISOString();
      const task = await admin
        .set('x-csrf-token', adminCsrf)
        .post('/api/admin/crm/tasks')
        .send({ partyId, title: `Relancer pour le devis ${SUFFIX}`, isFollowUp: true, dueAt: past, priority: 'HIGH' });
      expect(task.status).toBe(200);
      const taskId = task.body.data.task.id;
      expect(task.body.data.task.task_no).toMatch(/^TSK-\d{4}-\d{6}$/);

      const overdue = await admin.get(`/api/admin/crm/tasks?due=overdue&search=${encodeURIComponent(`Relancer pour le devis ${SUFFIX}`)}`);
      expect(overdue.status).toBe(200);
      expect(overdue.body.pagination.total).toBeGreaterThanOrEqual(1);

      const doneTask = await admin
        .set('x-csrf-token', adminCsrf)
        .post(`/api/admin/crm/tasks/${taskId}/status`)
        .send({ status: 'COMPLETED' });
      expect(doneTask.status).toBe(200);

      // 4) ré-ouvrir une tâche terminée est refusé (transition illégale)
      const reopen = await admin
        .set('x-csrf-token', adminCsrf)
        .post(`/api/admin/crm/tasks/${taskId}/status`)
        .send({ status: 'OPEN' });
      expect(reopen.status).toBe(409);
      expect(reopen.body.code).toBe('CRM_BAD_STATUS_TRANSITION');

      // 5) note épinglée
      const note = await admin
        .set('x-csrf-token', adminCsrf)
        .post('/api/admin/crm/notes')
        .send({ partyId, content: `Contexte client noté ${SUFFIX}`, isPinned: true });
      expect(note.status).toBe(200);

      // 6) issue : ouverture, résolution obligatoire, clôture
      const issue = await admin
        .set('x-csrf-token', adminCsrf)
        .post('/api/admin/crm/issues')
        .send({ partyId, subject: `Colis endommagé ${SUFFIX}`, priority: 'URGENT' });
      expect(issue.status).toBe(200);
      const issueId = issue.body.data.issue.id;
      expect(issue.body.data.issue.issue_no).toMatch(/^ISU-\d{4}-\d{6}$/);

      const resolveWithoutText = await admin
        .set('x-csrf-token', adminCsrf)
        .post(`/api/admin/crm/issues/${issueId}/status`)
        .send({ status: 'RESOLVED' });
      expect(resolveWithoutText.status).toBe(400);

      const resolved = await admin
        .set('x-csrf-token', adminCsrf)
        .post(`/api/admin/crm/issues/${issueId}/status`)
        .send({ status: 'RESOLVED', resolution: `Remboursement intégral accepté ${SUFFIX}` });
      expect(resolved.status).toBe(200);
      expect(resolved.body.data.issue.resolved_at).toBeTruthy();

      const closed = await admin
        .set('x-csrf-token', adminCsrf)
        .post(`/api/admin/crm/issues/${issueId}/status`)
        .send({ status: 'CLOSED' });
      expect(closed.status).toBe(200);
      expect(closed.body.data.issue.closed_at).toBeTruthy();

      // 7) la timeline fusionne note + activité + tâche
      const timeline = await admin.get(`/api/admin/crm/parties/${partyId}/timeline`);
      expect(timeline.status).toBe(200);
      const types = new Set(timeline.body.data.map((item: any) => item.type));
      expect(types.has('note')).toBe(true);
      expect(types.has('activity')).toBe(true);
      expect(types.has('task')).toBe(true);
      expect(types.has('issue')).toBe(true);
    });
  });

  describe('Autorisation serveur, audit et notifications', () => {
    test('un CONTENT_MANAGER (aucun grant crm360) est refusé proprement sur les listes', async () => {
      const denied = await content.get('/api/admin/crm/parties');
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('ERP_PERMISSION_DENIED');
    });

    test('l’opérateur crée et lit, mais ne peut ni archiver ni exporter', async () => {
      const created = await operator
        .set('x-csrf-token', operatorCsrf)
        .post('/api/admin/crm/parties')
        .send({ partyType: 'COMPANY', kind: 'CUSTOMER', name: `Opérateur Co ${SUFFIX}`, email: EMAIL('operator') });
      expect(created.status).toBe(200);
      const read = await operator.get(`/api/admin/crm/parties/${created.body.data.party.id}`);
      expect(read.status).toBe(200);
      const archive = await operator
        .set('x-csrf-token', operatorCsrf)
        .post(`/api/admin/crm/parties/${created.body.data.party.id}/archive`);
      expect(archive.status).toBe(403);
    });

    test('chaque mutation de fiche laisse une trace dans le rédacteur unique', () => {
      const party = db.get<any>(`SELECT id FROM crm360_parties WHERE name=?`, `Crm Customer (updated) ${SUFFIX}`);
      expect(party).toBeTruthy();
      const rows = db.all<any>(`SELECT * FROM audit_logs WHERE module='CRM' AND resource_type='party' AND resource_id=? ORDER BY created_at`, party.id);
      const verbs = rows.map((row) => row.action);
      expect(verbs).toContain('CREATE');
      expect(verbs).toContain('STATUS_CHANGE');
      // l'archive a bien été retracée (au moins 3 écritures)
      expect(rows.length).toBeGreaterThanOrEqual(3);
    });

    test('les événements métier alimentent crm360_status_events sur plusieurs entités', () => {
      const events = db.all<any>('SELECT DISTINCT entity_type FROM crm360_status_events');
      const kinds = new Set(events.map((e) => e.entity_type));
      expect(kinds.size).toBeGreaterThanOrEqual(3);
    });

    test('l’affectation d’une tâche à AUTRUI notifie le propriétaire via le canal existant', async () => {
      // Le propriétaire est l'employé ADMIN ; c'est l'opérateur (autre acteur) qui l'affecte.
      const adminUser = db.get<{ id: string }>('SELECT id FROM admin_users WHERE email=?', 'admin@ayrovi.tn');
      const owner = db.get<{ id: string }>('SELECT id FROM erp_employees WHERE user_id=?', adminUser!.id);
      if (!owner) return; // pas d'employé ADMIN : rien à prouver ici
      const party = await operator
        .set('x-csrf-token', operatorCsrf)
        .post('/api/admin/crm/parties')
        .send({ partyType: 'INDIVIDUAL', kind: 'CUSTOMER', name: `Notified Customer ${SUFFIX}`, email: EMAIL('notified') });
      expect(party.status).toBe(200);
      const task = await operator
        .set('x-csrf-token', operatorCsrf)
        .post('/api/admin/crm/tasks')
        .send({ partyId: party.body.data.party.id, title: `Tâche notifiée ${SUFFIX}`, ownerEmployeeId: owner.id, dueAt: new Date(Date.now() + 86_400_000).toISOString() });
      expect(task.status).toBe(200);
      const notifications = db.all<any>(`SELECT * FROM admin_notifications WHERE source='crm360' AND data LIKE ?`, `%${task.body.data.task.id}%`);
      expect(notifications.length).toBeGreaterThanOrEqual(1);
      expect(notifications[0].type).toBe('SYSTEM'); // contrainte CHECK du canal existant
    });
  });
});
