/**
 * AYROVI CRM 360 (E2) — activités relationnelles.
 *
 * Une activité est une interaction datée avec un party/contact (appel, rendez-vous,
 * e-mail, message, visite, suivi, interne, autre). Elle apparaît dans la timeline de la
 * fiche et peut reculer/avancer la « dernière interaction » de la fiche.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { CRM_LIMITS, CRM_ERRORS, ACTIVITY_KINDS } from './types';
import type { CrmActor } from './audit';
import { recordCrmMutation } from './audit';
import {
  cleanMultiline, cleanText, isValidEnum, isValidId, parseDateOrNull, parsePageSize, parsePositiveInt,
} from './validation';
import type { Outcome } from './parties';

const ACTIVITY_EDIT_STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'] as const;

interface ActivityInput {
  partyId?: string | null;
  contactId?: string | null;
  kind?: string;
  subject?: string;
  description?: string;
  ownerEmployeeId?: string | null;
  priority?: string;
  scheduledAt?: string | null;
  dueAt?: string | null;
}

function validateActivity(raw: Record<string, unknown>): { input: ActivityInput; issues: Array<{ field: string; reason: string }> } {
  const issues: Array<{ field: string; reason: string }> = [];
  const kind = String(raw.kind ?? 'OTHER').toUpperCase();
  if (!isValidEnum(kind, ACTIVITY_KINDS)) issues.push({ field: 'kind', reason: 'Type d’activité invalide.' });
  const subject = cleanText(raw.subject, CRM_LIMITS.SUBJECT_MAX);
  if (!subject) issues.push({ field: 'subject', reason: 'Objet requis.' });
  const partyId = raw.partyId ? cleanText(raw.partyId, 160) : null;
  const contactId = raw.contactId ? cleanText(raw.contactId, 160) : null;
  if (partyId && !isValidId(partyId)) issues.push({ field: 'partyId', reason: 'Fiche invalide.' });
  if (contactId && !isValidId(contactId)) issues.push({ field: 'contactId', reason: 'Contact invalide.' });
  const owner = raw.ownerEmployeeId ? cleanText(raw.ownerEmployeeId, 160) : null;
  if (owner && !isValidId(owner)) issues.push({ field: 'ownerEmployeeId', reason: 'Propriétaire invalide.' });
  const priority = String(raw.priority ?? 'NORMAL').toUpperCase();
  if (!isValidEnum(priority, ['LOW', 'NORMAL', 'HIGH'])) issues.push({ field: 'priority', reason: 'Priorité invalide.' });
  return {
    input: {
      partyId: isValidId(partyId ?? '') ? partyId : null,
      contactId: isValidId(contactId ?? '') ? contactId : null,
      kind: isValidEnum(kind, ACTIVITY_KINDS) ? kind : 'OTHER',
      subject, description: cleanMultiline(raw.description, CRM_LIMITS.DESCRIPTION_MAX),
      ownerEmployeeId: isValidId(owner ?? '') ? owner : null,
      priority: isValidEnum(priority, ['LOW', 'NORMAL', 'HIGH']) ? priority : 'NORMAL',
      scheduledAt: parseDateOrNull(raw.scheduledAt),
      dueAt: parseDateOrNull(raw.dueAt),
    },
    issues,
  };
}

export function getActivity(db: QatafoDatabase, id: string) {
  return db.get<any>(`SELECT a.*, p.name AS party_name, p.party_code, e.first_name||' '||e.last_name AS owner_name
    FROM crm360_activities a
    LEFT JOIN crm360_parties p ON p.id=a.party_id
    LEFT JOIN erp_employees e ON e.id=a.owner_employee_id
    WHERE a.id=?`, id);
}

export function listActivities(db: QatafoDatabase, query: {
  page?: unknown; pageSize?: unknown; partyId?: unknown; ownerId?: unknown; kind?: unknown; status?: unknown; search?: unknown;
}) {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = parsePageSize(query.pageSize, 25);
  const where: string[] = [];
  const params: unknown[] = [];
  const push = (clause: string, value: unknown) => { where.push(clause); params.push(value); };
  const partyId = cleanText(query.partyId, 160);
  if (isValidId(partyId)) push('a.party_id = ?', partyId);
  const ownerId = cleanText(query.ownerId, 160);
  if (isValidId(ownerId)) push('a.owner_employee_id = ?', ownerId);
  const kind = cleanText(query.kind, 40).toUpperCase();
  if (isValidEnum(kind, ACTIVITY_KINDS)) push('a.kind = ?', kind);
  const status = cleanText(query.status, 40).toUpperCase();
  if (status && ['OPEN', 'COMPLETED', 'CANCELLED'].includes(status)) push('a.status = ?', status);
  const search = cleanText(query.search, 120);
  if (search) { push('(a.subject LIKE ? OR a.description LIKE ?)', `%${search}%`); params.push(`%${search}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM crm360_activities a ${clause}`, ...params)?.count ?? 0);
  const items = db.all<any>(`SELECT a.*, p.name AS party_name, p.party_code, e.first_name||' '||e.last_name AS owner_name
    FROM crm360_activities a
    LEFT JOIN crm360_parties p ON p.id=a.party_id
    LEFT JOIN erp_employees e ON e.id=a.owner_employee_id
    ${clause} ORDER BY COALESCE(a.scheduled_at,a.created_at) DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}

/** Met à jour last_contacted_at / next_follow_up_at de la fiche (dates pilotées par les faits). */
function touchParty(db: QatafoDatabase, partyId: string | null, now: string, completed = false, nextDue: string | null = null) {
  if (!partyId) return;
  const party = db.get<{ last_contacted_at: string | null; next_follow_up_at: string | null }>(
    'SELECT last_contacted_at,next_follow_up_at FROM crm360_parties WHERE id=?', partyId);
  if (!party) return;
  const updates: string[] = [];
  const params: unknown[] = [];
  if (completed && (!party.last_contacted_at || party.last_contacted_at < now)) {
    updates.push('last_contacted_at = ?'); params.push(now);
  }
  if (nextDue && (!party.next_follow_up_at || party.next_follow_up_at > nextDue)) {
    updates.push('next_follow_up_at = ?'); params.push(nextDue);
  }
  if (updates.length) {
    updates.push('updated_at = ?'); params.push(now, partyId);
    db.run(`UPDATE crm360_parties SET ${updates.join(',')} WHERE id=?`, ...params);
  }
}

export function createActivity(
  db: QatafoDatabase, actor: CrmActor, context: unknown, raw: Record<string, unknown>,
): Outcome<{ activity: any }> {
  const { input, issues } = validateActivity(raw);
  if (issues.length) return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Activité invalide.', details: issues };
  if (input.partyId && !db.get<{ id: string }>('SELECT id FROM crm360_parties WHERE id=?', input.partyId)) {
    return { ok: false, code: CRM_ERRORS.PARTY_NOT_FOUND, message: 'Fiche relationnelle introuvable.' };
  }
  if (input.contactId && !db.get<{ id: string }>('SELECT id FROM crm360_contacts WHERE id=?', input.contactId)) {
    return { ok: false, code: CRM_ERRORS.CONTACT_NOT_FOUND, message: 'Contact introuvable.' };
  }
  if (input.ownerEmployeeId && !db.get<{ id: string }>('SELECT id FROM erp_employees WHERE id=?', input.ownerEmployeeId)) {
    return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Propriétaire interne inconnu.' };
  }
  const id = `act_${randomUUID()}`;
  const now = new Date().toISOString();
  db.transaction(() => {
    db.run(`INSERT INTO crm360_activities
      (id,party_id,contact_id,kind,subject,description,status,priority,owner_employee_id,scheduled_at,due_at,created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?, 'OPEN', ?,?,?,?,?,?,?,?)`,
    id, input.partyId, input.contactId, input.kind, input.subject, input.description ?? '',
    input.priority ?? 'NORMAL', input.ownerEmployeeId, input.scheduledAt, input.dueAt, actor.id ?? null, actor.id ?? null, now, now);
    touchParty(db, input.partyId, now, false, input.dueAt);
    recordCrmMutation(db, {
      actor, action: 'CREATE', resourceType: 'activity', resourceId: id,
      after: { party_id: input.partyId, kind: input.kind, subject: input.subject },
      context: context as never,
      statusEvent: { entityType: 'activity', entityId: id, verb: 'CREATED', toValue: 'OPEN', actorEmployeeId: actor.id, at: now },
    });
  });
  return { ok: true, value: { activity: getActivity(db, id) } };
}

export function updateActivity(
  db: QatafoDatabase, actor: CrmActor, context: unknown, id: string, raw: Record<string, unknown>,
): Outcome<{ activity: any }> {
  const existing = getActivity(db, id);
  if (!existing) return { ok: false, code: CRM_ERRORS.ACTIVITY_NOT_FOUND, message: 'Activité introuvable.' };
  if (existing.status === 'COMPLETED') {
    return { ok: false, code: CRM_ERRORS.IMMUTABLE, message: 'Une activité terminée est immuable : créez-en une nouvelle ou corrigez via une note.' };
  }
  const { input, issues } = validateActivity(raw);
  if (issues.length) return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Activité invalide.', details: issues };
  const before = { ...existing };
  const now = new Date().toISOString();
  db.transaction(() => {
    db.run(`UPDATE crm360_activities SET party_id=?,contact_id=?,kind=?,subject=?,description=?,priority=?,
      owner_employee_id=?,scheduled_at=?,due_at=?,updated_by=?,updated_at=? WHERE id=?`,
    input.partyId ?? existing.party_id, input.contactId ?? existing.contact_id, input.kind ?? existing.kind,
    input.subject, input.description ?? existing.description, input.priority ?? existing.priority,
    input.ownerEmployeeId ?? existing.owner_employee_id, input.scheduledAt ?? existing.scheduled_at,
    input.dueAt !== null && input.dueAt !== undefined ? input.dueAt : existing.due_at, actor.id ?? null, now, id);
    touchParty(db, input.partyId ?? existing.party_id, now, false, input.dueAt ?? existing.due_at);
    recordCrmMutation(db, {
      actor, action: 'UPDATE', resourceType: 'activity', resourceId: id,
      before, after: getActivity(db, id), context: context as never,
    });
  });
  return { ok: true, value: { activity: getActivity(db, id) } };
}

/** Complète une activité : c'est elle qui fait reculer/avancer la « dernière interaction ». */
export function setActivityStatus(
  db: QatafoDatabase, actor: CrmActor, context: unknown, id: string, nextStatus: string,
): Outcome<{ activity: any }> {
  const existing = getActivity(db, id);
  if (!existing) return { ok: false, code: CRM_ERRORS.ACTIVITY_NOT_FOUND, message: 'Activité introuvable.' };
  const status = String(nextStatus).toUpperCase();
  if (!isValidEnum(status, ACTIVITY_EDIT_STATUSES)) {
    return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Statut invalide (OPEN, COMPLETED ou CANCELLED).' };
  }
  if (existing.status === 'COMPLETED' && status !== 'COMPLETED') {
    return { ok: false, code: CRM_ERRORS.IMMUTABLE, message: 'Une activité terminée ne peut pas être rouverte.' };
  }
  if (existing.status === status) return { ok: true, value: { activity: existing } };
  const now = new Date().toISOString();
  db.transaction(() => {
    db.run(`UPDATE crm360_activities SET status=?,completed_at=?,completed_by=?,updated_by=?,updated_at=? WHERE id=?`,
      status, status === 'COMPLETED' ? now : null, status === 'COMPLETED' ? actor.id ?? null : null,
      actor.id ?? null, now, id);
    touchParty(db, existing.party_id, now, status === 'COMPLETED');
    recordCrmMutation(db, {
      actor, action: 'STATUS_CHANGE', resourceType: 'activity', resourceId: id,
      before: { status: existing.status }, after: { status, completed_at: status === 'COMPLETED' ? now : null },
      context: context as never,
      statusEvent: {
        entityType: 'activity', entityId: id, verb: status === 'COMPLETED' ? 'COMPLETED' : status === 'CANCELLED' ? 'CANCELLED' : 'STATUS_CHANGED',
        fromValue: existing.status, toValue: status, actorEmployeeId: actor.id, at: now,
      },
    });
  });
  return { ok: true, value: { activity: getActivity(db, id) } };
}
