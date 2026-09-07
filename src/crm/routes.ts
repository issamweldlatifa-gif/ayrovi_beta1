/**
 * AYROVI CRM 360 (E1/E2) — API du back-office.
 *
 * Monté sous `/api/admin/crm` par le routeur admin : hérite du cookie de session et
 * compose les deux gardes existantes — `requireAdmin(db)` (session + CSRF sur les
 * écritures) puis le moteur de permissions ERP `crm360:<action>` sur la ressource
 * (refus tracé). Chaque mutation passe par `recordCrmMutation` (audit unique + événement
 * de timeline) et les listes parlent le dialecte du framework (`{success,data,pagination}`).
 */
import { Router, type Request, type Response } from 'express';
import type { QatafoDatabase } from '../db/database';
import type { AdminIdentity } from '../admin/auth';
import { requireAdmin } from '../admin/auth';
import { bootstrapCrm } from './bootstrap';
import { canCrm, requireCrm } from './permissions';
import { crmContext } from './audit';
import { httpStatusFor } from './validation';
import {
  ACTIVITY_KINDS, ACTIVITY_STATUSES, COMM_CHANNELS, COMM_DIRECTIONS, CONTACT_STATUSES,
  ISSUE_PRIORITIES, ISSUE_STATUSES, PARTY_KINDS, PARTY_TYPES, PARTY_SOURCES, PARTY_STATUSES,
  RELATIONSHIP_TYPES, TASK_PRIORITIES, TASK_STATUSES, CRM_ACTIONS, CRM_RESOURCES,
} from './types';
import type { Outcome } from './parties';
import {
  addRelationship, archiveParty, cleanPartyPayload, createContact, createParty, deleteContact, duplicateCandidates,
  getParty360, linkParty, listContacts, listParties, listRelationships, removeRelationship,
  unlinkParty, updateContact, updateParty,
} from './parties';
import { createActivity, getActivity, listActivities, setActivityStatus, updateActivity } from './activities';
import { createTask, getTask, listTasks, transitionTask, updateTask, nextActionForParty } from './tasks';
import { createNote, deleteNote, listNotes, updateNote } from './notes';
import {
  createIssue, getIssue, listCommunications, listIssues, recordCommunication, transitionIssue, updateIssue,
} from './issues';
import { crmDashboard } from './dashboard';
import { crmRecentActivity, partyTimeline } from './timeline';

type CrmRequest = Request & {
  admin?: AdminIdentity;
  erpEmployee?: { id: string; firstName?: string | null; lastName?: string | null; employeeCode?: string | null } | null;
};

function answer(res: Response, result: Outcome) {
  if (result.ok) return res.json({ success: true, data: result.value ?? null });
  const failure = result as { code?: string; message?: string; details?: Array<{ field: string; reason: string }> };
  const code = failure.code || 'CRM_VALIDATION';
  const status = httpStatusFor(code);
  return res.status(status).json({
    success: false,
    code,
    error: failure.message || 'Requête refusée par le module relationnel.',
    ...(failure.details?.length ? { details: failure.details } : {}),
  });
}

function listResponse(res: Response, result: { items: any[]; total: number; page: number; pageSize: number }) {
  return res.json({
    success: true,
    data: result.items,
    pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)) },
  });
}

export function createCrmRouter(db: QatafoDatabase): Router {
  const router = Router();

  // Amorçage à la demande : schéma + numérotation + grants, une seule fois, jamais bloquant.
  let booted = false;
  router.use((_req, _res, next) => {
    if (booted) return next();
    booted = true;
    try { bootstrapCrm(db); } catch { /* déjà assuré au démarrage */ }
    return next();
  });

  const actorFor = (req: CrmRequest) => ({
    // L'acteur d'un événement de fiche est l'EMPLOYÉ (id dans erp_employees), jamais l'uuid de session :
    // les colonnes actor_employee_id/owner/audit en dépendent. Sans employé résolu (compte système),
    // l'acteur reste traçable par son nom mais son id est null (aucune FK faussée).
    id: req.erpEmployee?.id ?? null,
    name: req.erpEmployee ? `${req.erpEmployee.firstName ?? ''} ${req.erpEmployee.lastName ?? ''}`.trim() || (req.admin?.name ?? 'Système') : (req.admin?.name ?? 'Système'),
    ipAddress: req.ip || null,
  });
  const contextFor = (req: CrmRequest) => crmContext(db, req);

  router.get('/health', (_req, res) => {
    let report: unknown;
    try { report = bootstrapCrm(db); } catch (error: any) { report = { error: String(error?.message || error) }; }
    res.json({ success: true, data: { module: 'crm360', ...(report as object) } });
  });

  /**
   * Capacités réelles du rôle appelant, décidées par le moteur de permissions (canCrm).
   * L'écran l'utilise pour rendre une action refusée inerte avant tout clic — jamais de 403
   * après coup. Aucune règle client ne prétend connaître les droits.
   */
  router.get('/meta', requireAdmin(db), (req, res) => {
    const role = (req as Request & { admin?: AdminIdentity }).admin?.role;
    const capabilities: Record<string, Record<string, boolean>> = {};
    for (const resource of CRM_RESOURCES) {
      const row: Record<string, boolean> = {};
      for (const action of CRM_ACTIONS) row[action] = canCrm(db, role, action, resource).allowed;
      capabilities[resource] = row;
    }
    res.json({
      success: true,
      data: {
        capabilities,
        statuses: {
          partyTypes: PARTY_TYPES, partyKinds: PARTY_KINDS, partyStatuses: PARTY_STATUSES, partySources: PARTY_SOURCES,
          contactStatuses: CONTACT_STATUSES, relationshipTypes: RELATIONSHIP_TYPES,
          activityKinds: ACTIVITY_KINDS, activityStatuses: ACTIVITY_STATUSES,
          taskStatuses: TASK_STATUSES, taskPriorities: TASK_PRIORITIES,
          issueStatuses: ISSUE_STATUSES, issuePriorities: ISSUE_PRIORITIES,
          commChannels: COMM_CHANNELS, commDirections: COMM_DIRECTIONS,
        },
      },
    });
  });

  /* ================= Partie 1 — Fiches (parties) ================= */

  router.get('/parties', ...requireCrm(db, 'view', 'party'), (req, res) => {
    listResponse(res, listParties(db, req.query as Record<string, unknown>));
  });

  router.get('/parties/:id', ...requireCrm(db, 'view', 'party'), (req, res) => {
    answer(res, getParty360(db, String(req.params.id)));
  });

  router.post('/parties', ...requireCrm(db, 'create', 'party'), (req, res) => {
    const body = { ...(req.body ?? {}) };
    // Jamais d'écriture d'un statut ARCHIVED via la création : l'archivage a son propre verbe.
    if (body.status === 'ARCHIVED') delete body.status;
    answer(res, createParty(db, actorFor(req), contextFor(req), body));
  });

  router.put('/parties/:id', ...requireCrm(db, 'edit', 'party'), (req, res) => {
    const body = { ...(req.body ?? {}) };
    if (body.status === 'ARCHIVED') delete body.status;
    answer(res, updateParty(db, actorFor(req), contextFor(req), String(req.params.id), body));
  });

  router.post('/parties/:id/archive', ...requireCrm(db, 'archive', 'party'), (req, res) => {
    answer(res, archiveParty(db, actorFor(req), contextFor(req), String(req.params.id)));
  });

  router.get('/parties/:id/next-action', ...requireCrm(db, 'view', 'party'), (req, res) => {
    const partyId = String(req.params.id);
    if (!db.get<{ id: string }>('SELECT id FROM crm360_parties WHERE id=?', partyId)) {
      return res.status(404).json({ success: false, code: 'CRM_PARTY_NOT_FOUND', error: 'Fiche relationnelle introuvable.' });
    }
    res.json({ success: true, data: nextActionForParty(db, partyId) });
  });

  router.get('/parties/:id/timeline', ...requireCrm(db, 'view', 'timeline'), (req, res) => {
    const partyId = String(req.params.id);
    if (!db.get<{ id: string }>('SELECT id FROM crm360_parties WHERE id=?', partyId)) {
      return res.status(404).json({ success: false, code: 'CRM_PARTY_NOT_FOUND', error: 'Fiche relationnelle introuvable.' });
    }
    const timeline = partyTimeline(db, partyId, req.query as { page?: unknown; pageSize?: unknown });
    res.json({ success: true, data: timeline.items, pagination: { page: timeline.page, pageSize: timeline.pageSize, total: timeline.total, totalPages: Math.max(1, Math.ceil(timeline.total / timeline.pageSize)) } });
  });

  router.get('/parties/:id/relationships', ...requireCrm(db, 'view', 'party'), (req, res) => {
    const partyId = String(req.params.id);
    if (!db.get<{ id: string }>('SELECT id FROM crm360_parties WHERE id=?', partyId)) {
      return res.status(404).json({ success: false, code: 'CRM_PARTY_NOT_FOUND', error: 'Fiche relationnelle introuvable.' });
    }
    res.json({ success: true, data: listRelationships(db, partyId) });
  });

  router.post('/parties/:id/relationships', ...requireCrm(db, 'edit', 'party'), (req, res) => {
    answer(res, addRelationship(db, actorFor(req), contextFor(req), { ...(req.body ?? {}), fromPartyId: String(req.params.id) }));
  });

  router.delete('/relationships/:id', ...requireCrm(db, 'edit', 'party'), (req, res) => {
    answer(res, removeRelationship(db, actorFor(req), contextFor(req), String(req.params.id)));
  });

  /* ================= Raccordements (liens legacy) ================= */

  router.post('/parties/:id/links', ...requireCrm(db, 'edit', 'party'), (req, res) => {
    answer(res, linkParty(db, actorFor(req), contextFor(req), {
      partyId: String(req.params.id), refType: String(req.body?.refType ?? ''), refId: String(req.body?.refId ?? ''), note: req.body?.note,
    }));
  });

  router.delete('/links/:id', ...requireCrm(db, 'edit', 'party'), (req, res) => {
    answer(res, unlinkParty(db, actorFor(req), contextFor(req), String(req.params.id)));
  });

  /* ================= Contacts ================= */

  router.get('/contacts', ...requireCrm(db, 'view', 'contact'), (req, res) => {
    listResponse(res, listContacts(db, req.query as Record<string, unknown>));
  });

  router.post('/contacts', ...requireCrm(db, 'create', 'contact'), (req, res) => {
    answer(res, createContact(db, actorFor(req), contextFor(req), { ...(req.body ?? {}) }));
  });

  router.put('/contacts/:id', ...requireCrm(db, 'edit', 'contact'), (req, res) => {
    answer(res, updateContact(db, actorFor(req), contextFor(req), String(req.params.id), { ...(req.body ?? {}) }));
  });

  router.delete('/contacts/:id', ...requireCrm(db, 'delete', 'contact'), (req, res) => {
    answer(res, deleteContact(db, actorFor(req), contextFor(req), String(req.params.id)));
  });

  /* ================= Activités ================= */

  router.get('/activities', ...requireCrm(db, 'view', 'activity'), (req, res) => {
    listResponse(res, listActivities(db, req.query as Record<string, unknown>));
  });

  router.post('/activities', ...requireCrm(db, 'create', 'activity'), (req, res) => {
    answer(res, createActivity(db, actorFor(req), contextFor(req), { ...(req.body ?? {}) }));
  });

  router.put('/activities/:id', ...requireCrm(db, 'edit', 'activity'), (req, res) => {
    answer(res, updateActivity(db, actorFor(req), contextFor(req), String(req.params.id), { ...(req.body ?? {}) }));
  });

  router.post('/activities/:id/status', ...requireCrm(db, 'edit', 'activity'), (req, res) => {
    answer(res, setActivityStatus(db, actorFor(req), contextFor(req), String(req.params.id), String(req.body?.status ?? '')));
  });

  /* ================= Tâches & follow-ups ================= */

  router.get('/tasks', ...requireCrm(db, 'view', 'task'), (req, res) => {
    listResponse(res, listTasks(db, req.query as Record<string, unknown>));
  });

  router.post('/tasks', ...requireCrm(db, 'create', 'task'), (req, res) => {
    answer(res, createTask(db, actorFor(req), contextFor(req), { ...(req.body ?? {}) }));
  });

  router.put('/tasks/:id', ...requireCrm(db, 'edit', 'task'), (req, res) => {
    answer(res, updateTask(db, actorFor(req), contextFor(req), String(req.params.id), { ...(req.body ?? {}) }));
  });

  router.post('/tasks/:id/status', ...requireCrm(db, 'edit', 'task'), (req, res) => {
    answer(res, transitionTask(db, actorFor(req), contextFor(req), String(req.params.id), String(req.body?.status ?? ''), String(req.body?.reason ?? '').slice(0, 500)));
  });

  /* ================= Notes ================= */

  router.get('/notes', ...requireCrm(db, 'view', 'note'), (req, res) => {
    listResponse(res, listNotes(db, req.query as Record<string, unknown>));
  });

  router.post('/notes', ...requireCrm(db, 'create', 'note'), (req, res) => {
    answer(res, createNote(db, actorFor(req), contextFor(req), { ...(req.body ?? {}) }));
  });

  router.put('/notes/:id', ...requireCrm(db, 'edit', 'note'), (req, res) => {
    answer(res, updateNote(db, actorFor(req), contextFor(req), String(req.params.id), { ...(req.body ?? {}) }));
  });

  router.delete('/notes/:id', ...requireCrm(db, 'delete', 'note'), (req, res) => {
    answer(res, deleteNote(db, actorFor(req), contextFor(req), String(req.params.id)));
  });

  /* ================= Issues / support ================= */

  router.get('/issues', ...requireCrm(db, 'view', 'issue'), (req, res) => {
    listResponse(res, listIssues(db, req.query as Record<string, unknown>));
  });

  router.post('/issues', ...requireCrm(db, 'create', 'issue'), (req, res) => {
    answer(res, createIssue(db, actorFor(req), contextFor(req), { ...(req.body ?? {}) }));
  });

  router.put('/issues/:id', ...requireCrm(db, 'edit', 'issue'), (req, res) => {
    answer(res, updateIssue(db, actorFor(req), contextFor(req), String(req.params.id), { ...(req.body ?? {}) }));
  });

  router.post('/issues/:id/status', ...requireCrm(db, 'edit', 'issue'), (req, res) => {
    answer(res, transitionIssue(db, actorFor(req), contextFor(req), String(req.params.id), String(req.body?.status ?? ''), {
      resolution: String(req.body?.resolution ?? ''), reason: String(req.body?.reason ?? ''),
    }));
  });

  router.get('/issues/:id', ...requireCrm(db, 'view', 'issue'), (req, res) => {
    const issue = getIssue(db, String(req.params.id));
    if (!issue) return res.status(404).json({ success: false, code: 'CRM_ISSUE_NOT_FOUND', error: 'Dossier introuvable.' });
    res.json({ success: true, data: issue });
  });

  /* ================= Communications ================= */

  router.get('/communications', ...requireCrm(db, 'view', 'communication'), (req, res) => {
    listResponse(res, listCommunications(db, req.query as Record<string, unknown>));
  });

  router.post('/communications', ...requireCrm(db, 'create', 'communication'), (req, res) => {
    answer(res, recordCommunication(db, actorFor(req), contextFor(req), { ...(req.body ?? {}) }));
  });

  /* ================= Recherche de doublons & tableau de bord ================= */

  router.post('/parties/duplicates', ...requireCrm(db, 'view', 'party'), (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ success: false, code: 'CRM_VALIDATION', error: 'Un nom est requis pour rechercher un doublon.' });
    const { payload } = cleanPartyPayload({ ...(req.body ?? {}), name }, false);
    res.json({ success: true, data: duplicateCandidates(db, payload) });
  });

  router.get('/dashboard', ...requireCrm(db, 'view', 'dashboard'), (_req, res) => {
    const metrics = crmDashboard(db);
    res.json({ success: true, data: { metrics, recent: crmRecentActivity(db, 15) } });
  });

  return router;
}
