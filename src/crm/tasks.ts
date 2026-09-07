/**
 * AYROVI CRM 360 (E2) — tâches et follow-ups.
 *
 * Une tâche a un propriétaire (employé), une priorité, une échéance, une marque
 * « follow-up » et un cycle de vie complet. Les tâches de suivi ne disparaissent jamais
 * de la vue « prochaine action » tant qu'elles ne sont ni terminées ni annulées. Les
 * statuts `overdue` / `due_today` / `upcoming` sont calculés à la lecture (jamais une
 * colonne que deux écritures désynchroniseraient). Une affectation notifie le
 * propriétaire ; terminer une tâche recale la « prochaine action » de la fiche.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { nextSequenceNumber } from '../erp-core/sequences';
import { CRM_LIMITS, CRM_ERRORS, TASK_ACTIVE_STATUSES, type TaskStatus } from './types';
import type { CrmActor } from './audit';
import { recordCrmMutation } from './audit';
import { notifyCrmOwner } from './notify';
import {
  cleanMultiline, cleanText, isValidEnum, isValidId, parseDateOrNull, parseFlag, parsePageSize, parsePositiveInt,
} from './validation';
import type { Outcome } from './parties';

/** Transition légale entre états d'une tâche. COMPLETED et CANCELLED sont terminaux. */
const TASK_TRANSITIONS: Record<string, readonly TaskStatus[]> = {
  OPEN: ['IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['OPEN', 'WAITING', 'COMPLETED', 'CANCELLED'],
  WAITING: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

interface TaskInput {
  partyId?: string | null;
  contactId?: string | null;
  title?: string;
  description?: string;
  isFollowUp?: boolean;
  ownerEmployeeId?: string | null;
  priority?: string;
  dueAt?: string | null;
  reminderAt?: string | null;
}

function validateTask(raw: Record<string, unknown>): { input: TaskInput; issues: Array<{ field: string; reason: string }> } {
  const issues: Array<{ field: string; reason: string }> = [];
  const title = cleanText(raw.title, CRM_LIMITS.SUBJECT_MAX);
  if (!title) issues.push({ field: 'title', reason: 'Titre requis.' });
  const partyId = raw.partyId ? cleanText(raw.partyId, 160) : null;
  if (partyId && !isValidId(partyId)) issues.push({ field: 'partyId', reason: 'Fiche invalide.' });
  const owner = raw.ownerEmployeeId ? cleanText(raw.ownerEmployeeId, 160) : null;
  if (owner && !isValidId(owner)) issues.push({ field: 'ownerEmployeeId', reason: 'Propriétaire invalide.' });
  const priority = String(raw.priority ?? 'NORMAL').toUpperCase();
  if (!isValidEnum(priority, ['LOW', 'NORMAL', 'HIGH'])) issues.push({ field: 'priority', reason: 'Priorité invalide.' });
  return {
    input: {
      partyId: isValidId(partyId ?? '') ? partyId : null,
      contactId: isValidId(String(raw.contactId ?? '')) ? String(raw.contactId) : null,
      title, description: cleanMultiline(raw.description, CRM_LIMITS.DESCRIPTION_MAX),
      isFollowUp: parseFlag(raw.isFollowUp) === 1,
      ownerEmployeeId: isValidId(owner ?? '') ? owner : null,
      priority: isValidEnum(priority, ['LOW', 'NORMAL', 'HIGH']) ? priority : 'NORMAL',
      dueAt: parseDateOrNull(raw.dueAt),
      reminderAt: parseDateOrNull(raw.reminderAt),
    },
    issues,
  };
}

export function getTask(db: QatafoDatabase, id: string) {
  return db.get<any>(`SELECT t.*, p.name AS party_name, p.party_code,
      e.first_name||' '||e.last_name AS owner_name
    FROM crm360_tasks t
    LEFT JOIN crm360_parties p ON p.id=t.party_id
    LEFT JOIN erp_employees e ON e.id=t.owner_employee_id
    WHERE t.id=?`, id);
}

/** Renvoie la « prochaine action » effective d'une fiche (la plus ancienne tâche active échue/à venir). */
export function nextActionForParty(db: QatafoDatabase, partyId: string) {
  const now = new Date().toISOString();
  return db.get<any>(`SELECT t.*, e.first_name||' '||e.last_name AS owner_name,
      CASE WHEN t.due_at IS NOT NULL AND t.due_at < ? THEN 'OVERDUE' ELSE 'PENDING' END AS state
    FROM crm360_tasks t LEFT JOIN erp_employees e ON e.id=t.owner_employee_id
    WHERE t.party_id=? AND t.status IN ('OPEN','IN_PROGRESS','WAITING')
    ORDER BY (t.due_at IS NULL), t.due_at ASC, t.priority='HIGH' DESC LIMIT 1`, now, partyId);
}

function listWhereClause(_db: QatafoDatabase, query: Record<string, unknown>) {
  const where: string[] = [];
  const params: unknown[] = [];
  const partyId = cleanText(query.partyId, 160);
  if (isValidId(partyId)) { where.push('t.party_id = ?'); params.push(partyId); }
  const ownerId = cleanText(query.ownerId, 160);
  if (isValidId(ownerId)) { where.push('t.owner_employee_id = ?'); params.push(ownerId); }
  const status = cleanText(query.status, 40).toUpperCase();
  if (status && [...TASK_ACTIVE_STATUSES, 'COMPLETED', 'CANCELLED'].includes(status as TaskStatus)) {
    where.push('t.status = ?'); params.push(status);
  }
  if (parseFlag(query.isFollowUp) === 1) where.push('t.is_follow_up = 1');
  const search = cleanText(query.search, 120);
  if (search) {
    where.push('(t.title LIKE ? OR t.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const now = new Date().toISOString();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const due = cleanText(query.due, 30).toLowerCase();
  const active = "t.status IN ('OPEN','IN_PROGRESS','WAITING')";
  if (due === 'overdue') {
    where.push(`${active} AND t.due_at IS NOT NULL AND t.due_at < ?`); params.push(now);
  } else if (due === 'today') {
    where.push(`${active} AND t.due_at >= ? AND t.due_at <= ?`); params.push(todayStart.toISOString(), todayEnd.toISOString());
  } else if (due === 'upcoming') {
    where.push(`${active} AND (t.due_at IS NULL OR t.due_at >= ?)`); params.push(now);
  } else if (due === 'due') {
    where.push(`${active} AND t.due_at IS NOT NULL AND t.due_at <= ?`); params.push(todayEnd.toISOString());
  }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export function listTasks(db: QatafoDatabase, query: {
  page?: unknown; pageSize?: unknown; partyId?: unknown; ownerId?: unknown; status?: unknown;
  isFollowUp?: unknown; due?: unknown; search?: unknown;
}) {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = parsePageSize(query.pageSize, 25);
  const { where, params } = listWhereClause(db, query as Record<string, unknown>);
  const total = Number(db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM crm360_tasks t ${where}`, ...params)?.count ?? 0);
  const items = db.all<any>(`SELECT t.*, p.name AS party_name, p.party_code, e.first_name||' '||e.last_name AS owner_name
    FROM crm360_tasks t
    LEFT JOIN crm360_parties p ON p.id=t.party_id
    LEFT JOIN erp_employees e ON e.id=t.owner_employee_id
    ${where} ORDER BY (t.due_at IS NULL) ASC, t.due_at ASC, t.created_at DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}

export function createTask(
  db: QatafoDatabase, actor: CrmActor, context: unknown, raw: Record<string, unknown>,
): Outcome<{ task: any; notified: boolean }> {
  const { input, issues } = validateTask(raw);
  if (issues.length) return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Tâche invalide.', details: issues };
  if (input.partyId && !db.get<{ id: string }>('SELECT id FROM crm360_parties WHERE id=? AND status!=\'ARCHIVED\'', input.partyId)) {
    return { ok: false, code: CRM_ERRORS.PARTY_NOT_FOUND, message: 'Fiche relationnelle introuvable.' };
  }
  if (input.ownerEmployeeId && !db.get<{ id: string }>('SELECT id FROM erp_employees WHERE id=?', input.ownerEmployeeId)) {
    return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Propriétaire interne inconnu.' };
  }
  const id = `task_${randomUUID()}`;
  const now = new Date().toISOString();
  const taskNo = nextSequenceNumber(db, 'crm_task_no');
  db.transaction(() => {
    db.run(`INSERT INTO crm360_tasks
      (id,task_no,party_id,contact_id,title,description,is_follow_up,owner_employee_id,status,priority,due_at,reminder_at,created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?, 'OPEN',?,?,?,?,?,?,?)`,
    id, taskNo, input.partyId, input.contactId, input.title, input.description ?? '', input.isFollowUp ? 1 : 0,
    input.ownerEmployeeId, input.priority ?? 'NORMAL', input.dueAt, input.reminderAt, actor.id ?? null, actor.id ?? null, now, now);
    recordCrmMutation(db, {
      actor, action: 'CREATE', resourceType: 'task', resourceId: id,
      after: { task_no: taskNo, party_id: input.partyId, title: input.title, is_follow_up: input.isFollowUp ? 1 : 0, due_at: input.dueAt, owner_employee_id: input.ownerEmployeeId },
      context: context as never,
      statusEvent: { entityType: 'task', entityId: id, verb: 'CREATED', toValue: 'OPEN', note: input.isFollowUp ? 'FOLLOW_UP' : undefined, actorEmployeeId: actor.id, at: now },
    });
  });
  let notified = false;
  if (input.ownerEmployeeId && input.ownerEmployeeId !== actor.id) {
    notifyCrmOwner(db, input.ownerEmployeeId, {
      type: 'CRM_TASK_ASSIGNED', title: 'Tâche assignée', message: input.title, actionUrl: '/admin?section=crm-tasks',
      data: { taskId: id, partyId: input.partyId, dueAt: input.dueAt },
    });
    notified = true;
  }
  return { ok: true, value: { task: getTask(db, id), notified } };
}

export function updateTask(
  db: QatafoDatabase, actor: CrmActor, context: unknown, id: string, raw: Record<string, unknown>,
): Outcome<{ task: any; notified: boolean }> {
  const existing = getTask(db, id);
  if (!existing) return { ok: false, code: CRM_ERRORS.TASK_NOT_FOUND, message: 'Tâche introuvable.' };
  if (['COMPLETED', 'CANCELLED'].includes(existing.status)) {
    return { ok: false, code: CRM_ERRORS.IMMUTABLE, message: 'Une tâche terminée ou annulée ne se modifie pas.' };
  }
  const { input, issues } = validateTask(raw);
  if (issues.length) return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Tâche invalide.', details: issues };
  if (input.partyId && !db.get<{ id: string }>('SELECT id FROM crm360_parties WHERE id=?', input.partyId)) {
    return { ok: false, code: CRM_ERRORS.PARTY_NOT_FOUND, message: 'Fiche relationnelle introuvable.' };
  }
  const before = { ...existing };
  const now = new Date().toISOString();
  const ownerChanged = input.ownerEmployeeId !== null && input.ownerEmployeeId !== existing.owner_employee_id;
  const nextOwner = input.ownerEmployeeId === null ? existing.owner_employee_id : (input.ownerEmployeeId || existing.owner_employee_id);
  db.transaction(() => {
    db.run(`UPDATE crm360_tasks SET party_id=?,contact_id=?,title=?,description=?,is_follow_up=?,owner_employee_id=?,
      priority=?,due_at=?,reminder_at=?,updated_by=?,updated_at=? WHERE id=?`,
    input.partyId ?? existing.party_id, input.contactId ?? existing.contact_id, input.title,
    input.description ?? existing.description, input.isFollowUp ? 1 : existing.is_follow_up,
    nextOwner, input.priority ?? existing.priority,
    input.dueAt !== null && input.dueAt !== undefined ? input.dueAt : existing.due_at,
    input.reminderAt !== null && input.reminderAt !== undefined ? input.reminderAt : existing.reminder_at,
    actor.id ?? null, now, id);
    recordCrmMutation(db, {
      actor, action: 'UPDATE', resourceType: 'task', resourceId: id,
      before, after: getTask(db, id), context: context as never,
      statusEvent: ownerChanged ? { entityType: 'task', entityId: id, verb: 'REASSIGNED', toValue: String(nextOwner), actorEmployeeId: actor.id, at: now } : undefined,
    });
  });
  let notified = false;
  if (ownerChanged && nextOwner && nextOwner !== actor.id) {
    notifyCrmOwner(db, nextOwner, {
      type: 'CRM_TASK_ASSIGNED', title: 'Tâche assignée', message: existing.title, actionUrl: '/admin?section=crm-tasks',
      data: { taskId: id, partyId: input.partyId ?? existing.party_id },
    });
    notified = true;
  }
  return { ok: true, value: { task: getTask(db, id), notified } };
}

export function transitionTask(
  db: QatafoDatabase, actor: CrmActor, context: unknown, id: string, nextStatus: string, reason?: string,
): Outcome<{ task: any }> {
  const existing = getTask(db, id);
  if (!existing) return { ok: false, code: CRM_ERRORS.TASK_NOT_FOUND, message: 'Tâche introuvable.' };
  const status = String(nextStatus).toUpperCase() as TaskStatus;
  if (!isValidEnum(status, ['OPEN', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'])) {
    return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Statut de tâche inconnu.' };
  }
  const allowed = TASK_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(status)) {
    return { ok: false, code: CRM_ERRORS.BAD_TRANSITION, message: `Transition ${existing.status} → ${status} impossible.` };
  }
  const now = new Date().toISOString();
  db.transaction(() => {
    db.run(`UPDATE crm360_tasks SET status=?,completed_at=?,completed_by=?,updated_by=?,updated_at=? WHERE id=?`,
      status, status === 'COMPLETED' ? now : null, status === 'COMPLETED' ? actor.id ?? null : null, actor.id ?? null, now, id);
    recordCrmMutation(db, {
      actor, action: 'STATUS_CHANGE', resourceType: 'task', resourceId: id,
      before: { status: existing.status }, after: { status, completed_at: status === 'COMPLETED' ? now : null, reason: reason ?? undefined },
      context: context as never,
      statusEvent: {
        entityType: 'task', entityId: id,
        verb: status === 'COMPLETED' ? 'COMPLETED' : status === 'CANCELLED' ? 'CANCELLED' : 'STATUS_CHANGED',
        fromValue: existing.status, toValue: status, note: reason ?? undefined, actorEmployeeId: actor.id, at: now,
      },
    });
  });
  return { ok: true, value: { task: getTask(db, id) } };
}
