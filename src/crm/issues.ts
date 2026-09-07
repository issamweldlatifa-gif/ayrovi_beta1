/**
 * AYROVI CRM 360 (E2) — dossiers support/issues et communications.
 *
 * Issue : un dossier (support ou interne) rattaché à une fiche/contact, avec une
 * référence lisible (ISU-…), un cycle de vie configurable (OPEN → IN_PROGRESS →
 * WAITING → RESOLVED → CLOSED, ré-ouverture possible), une résolution et un propriétaire.
 * Une affectation notifie le propriétaire. Les issues apparaissent dans la timeline.
 *
 * Communication : un enregistrement d'interaction externe (e-mail/téléphone/SMS/
 * WhatsApp…) lié à la fiche — le CRM reste la source de vérité de l'historique, les
 * intégrations futures ne font qu'écrire ici.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { nextSequenceNumber } from '../erp-core/sequences';
import { CRM_LIMITS, CRM_ERRORS, COMM_CHANNELS, COMM_DIRECTIONS, ISSUE_ACTIVE_STATUSES, type IssueStatus } from './types';
import type { CrmActor } from './audit';
import { recordCrmMutation } from './audit';
import { notifyCrmOwner } from './notify';
import {
  cleanMultiline, cleanText, isValidEnum, isValidId, parseDateOrNull, parsePageSize, parsePositiveInt,
} from './validation';
import type { Outcome } from './parties';

const ISSUE_ALL_STATUSES: readonly IssueStatus[] = [...ISSUE_ACTIVE_STATUSES, 'RESOLVED', 'CLOSED'];

/** Transitions autorisées d'un dossier support. */
const ISSUE_TRANSITIONS: Record<string, readonly IssueStatus[]> = {
  OPEN: ['IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['OPEN', 'WAITING', 'RESOLVED', 'CLOSED'],
  WAITING: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['OPEN', 'CLOSED'],
  CLOSED: [],
};

function validateIssue(raw: Record<string, unknown>) {
  const issues: Array<{ field: string; reason: string }> = [];
  const subject = cleanText(raw.subject, CRM_LIMITS.SUBJECT_MAX);
  if (!subject) issues.push({ field: 'subject', reason: 'Objet du dossier requis.' });
  const priority = String(raw.priority ?? 'NORMAL').toUpperCase();
  if (!isValidEnum(priority, ['LOW', 'NORMAL', 'HIGH', 'URGENT'])) issues.push({ field: 'priority', reason: 'Priorité invalide.' });
  const category = cleanText(raw.category, 60);
  return {
    input: {
      partyId: isValidId(String(raw.partyId ?? '')) ? String(raw.partyId) : null,
      contactId: isValidId(String(raw.contactId ?? '')) ? String(raw.contactId) : null,
      subject,
      description: cleanMultiline(raw.description, CRM_LIMITS.DESCRIPTION_MAX),
      category: category || 'GENERAL',
      priority: isValidEnum(priority, ['LOW', 'NORMAL', 'HIGH', 'URGENT']) ? priority : 'NORMAL',
      ownerEmployeeId: isValidId(String(raw.ownerEmployeeId ?? '')) ? String(raw.ownerEmployeeId) : null,
    },
    issues,
  };
}

export function getIssue(db: QatafoDatabase, id: string) {
  return db.get<any>(`SELECT i.*, p.name AS party_name, p.party_code, e.first_name||' '||e.last_name AS owner_name
    FROM crm360_issues i
    LEFT JOIN crm360_parties p ON p.id=i.party_id
    LEFT JOIN erp_employees e ON e.id=i.owner_employee_id
    WHERE i.id=?`, id);
}

export function listIssues(db: QatafoDatabase, query: {
  page?: unknown; pageSize?: unknown; partyId?: unknown; ownerId?: unknown; status?: unknown; priority?: unknown; search?: unknown;
}) {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = parsePageSize(query.pageSize, 25);
  const where: string[] = [];
  const params: unknown[] = [];
  const partyId = cleanText(query.partyId, 160);
  if (isValidId(partyId)) { where.push('i.party_id = ?'); params.push(partyId); }
  const ownerId = cleanText(query.ownerId, 160);
  if (isValidId(ownerId)) { where.push('i.owner_employee_id = ?'); params.push(ownerId); }
  const status = cleanText(query.status, 40).toUpperCase();
  if (status && ISSUE_ALL_STATUSES.includes(status as IssueStatus)) { where.push('i.status = ?'); params.push(status); }
  const priority = cleanText(query.priority, 30).toUpperCase();
  if (isValidEnum(priority, ['LOW', 'NORMAL', 'HIGH', 'URGENT'])) { where.push('i.priority = ?'); params.push(priority); }
  const search = cleanText(query.search, 120);
  if (search) { where.push('(i.subject LIKE ? OR i.issue_no LIKE ? OR i.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM crm360_issues i ${clause}`, ...params)?.count ?? 0);
  const items = db.all<any>(`SELECT i.*, p.name AS party_name, p.party_code, e.first_name||' '||e.last_name AS owner_name
    FROM crm360_issues i
    LEFT JOIN crm360_parties p ON p.id=i.party_id
    LEFT JOIN erp_employees e ON e.id=i.owner_employee_id
    ${clause} ORDER BY i.opened_at DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}

export function createIssue(
  db: QatafoDatabase, actor: CrmActor, context: unknown, raw: Record<string, unknown>,
): Outcome<{ issue: any; notified: boolean }> {
  const { input, issues } = validateIssue(raw);
  if (issues.length) return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Dossier invalide.', details: issues };
  if (input.partyId && !db.get<{ id: string }>('SELECT id FROM crm360_parties WHERE id=?', input.partyId)) {
    return { ok: false, code: CRM_ERRORS.PARTY_NOT_FOUND, message: 'Fiche relationnelle introuvable.' };
  }
  if (input.ownerEmployeeId && !db.get<{ id: string }>('SELECT id FROM erp_employees WHERE id=?', input.ownerEmployeeId)) {
    return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Propriétaire interne inconnu.' };
  }
  const id = `issue_${randomUUID()}`;
  const now = new Date().toISOString();
  const issueNo = nextSequenceNumber(db, 'crm_issue_no');
  db.transaction(() => {
    db.run(`INSERT INTO crm360_issues
      (id,issue_no,party_id,contact_id,subject,description,category,priority,status,owner_employee_id,opened_at,created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?, 'OPEN',?,?,?,?,?,?)`,
    id, issueNo, input.partyId, input.contactId, input.subject, input.description ?? '', input.category,
    input.priority, input.ownerEmployeeId, now, actor.id ?? null, actor.id ?? null, now, now);
    recordCrmMutation(db, {
      actor, action: 'CREATE', resourceType: 'issue', resourceId: id,
      after: { issue_no: issueNo, party_id: input.partyId, subject: input.subject, priority: input.priority, category: input.category },
      context: context as never,
      statusEvent: { entityType: 'issue', entityId: id, verb: 'CREATED', toValue: 'OPEN', actorEmployeeId: actor.id, at: now },
    });
  });
  let notified = false;
  if (input.ownerEmployeeId && input.ownerEmployeeId !== actor.id) {
    notifyCrmOwner(db, input.ownerEmployeeId, {
      type: 'CRM_ISSUE_ASSIGNED', title: 'Dossier assigné', message: `${issueNo} — ${input.subject}`, actionUrl: '/admin?section=crm-issues',
      data: { issueId: id, issueNo, partyId: input.partyId, priority: input.priority },
    });
    notified = true;
  }
  return { ok: true, value: { issue: getIssue(db, id), notified } };
}

export function updateIssue(
  db: QatafoDatabase, actor: CrmActor, context: unknown, id: string, raw: Record<string, unknown>,
): Outcome<{ issue: any; notified: boolean }> {
  const existing = getIssue(db, id);
  if (!existing) return { ok: false, code: CRM_ERRORS.ISSUE_NOT_FOUND, message: 'Dossier introuvable.' };
  if (existing.status === 'CLOSED') {
    return { ok: false, code: CRM_ERRORS.IMMUTABLE, message: 'Un dossier clôturé ne se modifie pas : rouvrez-le d’abord.' };
  }
  const { input, issues } = validateIssue(raw);
  if (issues.length) return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Dossier invalide.', details: issues };
  const before = { ...existing };
  const now = new Date().toISOString();
  const ownerChanged = input.ownerEmployeeId !== null && input.ownerEmployeeId !== existing.owner_employee_id;
  const nextOwner = input.ownerEmployeeId === null ? existing.owner_employee_id : (input.ownerEmployeeId || existing.owner_employee_id);
  db.transaction(() => {
    db.run(`UPDATE crm360_issues SET party_id=?,contact_id=?,subject=?,description=?,category=?,priority=?,
      owner_employee_id=?,updated_by=?,updated_at=? WHERE id=?`,
    input.partyId ?? existing.party_id, input.contactId ?? existing.contact_id, input.subject,
    input.description ?? existing.description, input.category ?? existing.category, input.priority ?? existing.priority,
    nextOwner, actor.id ?? null, now, id);
    recordCrmMutation(db, {
      actor, action: 'UPDATE', resourceType: 'issue', resourceId: id,
      before, after: getIssue(db, id), context: context as never,
    });
  });
  let notified = false;
  if (ownerChanged && nextOwner && nextOwner !== actor.id) {
    notifyCrmOwner(db, nextOwner, {
      type: 'CRM_ISSUE_ASSIGNED', title: 'Dossier assigné', message: `${existing.issue_no} — ${existing.subject}`,
      actionUrl: '/admin?section=crm-issues', data: { issueId: id, issueNo: existing.issue_no },
    });
    notified = true;
  }
  return { ok: true, value: { issue: getIssue(db, id), notified } };
}

/** Changer le statut d'un dossier. `resolution`/`reason` sont facultatives selon l'état. */
export function transitionIssue(
  db: QatafoDatabase, actor: CrmActor, context: unknown, id: string,
  nextStatus: string, options: { resolution?: string; reason?: string } = {},
): Outcome<{ issue: any }> {
  const existing = getIssue(db, id);
  if (!existing) return { ok: false, code: CRM_ERRORS.ISSUE_NOT_FOUND, message: 'Dossier introuvable.' };
  const status = String(nextStatus).toUpperCase() as IssueStatus;
  if (!isValidEnum(status, ISSUE_ALL_STATUSES)) {
    return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Statut de dossier inconnu.' };
  }
  const allowed = ISSUE_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(status)) {
    return { ok: false, code: CRM_ERRORS.BAD_TRANSITION, message: `Transition ${existing.status} → ${status} impossible.` };
  }
  if (status === 'RESOLVED' && !cleanText(options.resolution, CRM_LIMITS.DESCRIPTION_MAX)) {
    return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'La résolution doit être décrite avant de résoudre le dossier.' };
  }
  const now = new Date().toISOString();
  const resolution = status === 'RESOLVED' ? cleanMultiline(options.resolution, CRM_LIMITS.DESCRIPTION_MAX) : existing.resolution;
  db.transaction(() => {
    db.run(`UPDATE crm360_issues SET status=?,resolution=?,resolved_at=?,closed_at=?,updated_by=?,updated_at=? WHERE id=?`,
      status, resolution, status === 'RESOLVED' ? now : status === 'OPEN' ? null : existing.resolved_at,
      status === 'CLOSED' ? now : status === 'OPEN' ? null : existing.closed_at, actor.id ?? null, now, id);
    recordCrmMutation(db, {
      actor, action: 'STATUS_CHANGE', resourceType: 'issue', resourceId: id,
      before: { status: existing.status }, after: { status, resolution, reason: cleanText(options.reason, 500) || undefined },
      context: context as never,
      statusEvent: {
        entityType: 'issue', entityId: id,
        verb: status === 'RESOLVED' ? 'RESOLVED' : status === 'CLOSED' ? 'CLOSED' : 'STATUS_CHANGED',
        fromValue: existing.status, toValue: status, note: options.reason ?? undefined, actorEmployeeId: actor.id, at: now,
      },
    });
  });
  return { ok: true, value: { issue: getIssue(db, id) } };
}

/* ------------------------------------------------------------------ */
/* Communications                                                       */
/* ------------------------------------------------------------------ */

export function recordCommunication(
  db: QatafoDatabase, actor: CrmActor, context: unknown, raw: Record<string, unknown>,
): Outcome<{ communication: any }> {
  const issues: Array<{ field: string; reason: string }> = [];
  const channel = String(raw.channel ?? 'OTHER').toUpperCase();
  const direction = String(raw.direction ?? 'OUTBOUND').toUpperCase();
  if (!isValidEnum(channel, COMM_CHANNELS)) issues.push({ field: 'channel', reason: 'Canal inconnu.' });
  if (!isValidEnum(direction, COMM_DIRECTIONS)) issues.push({ field: 'direction', reason: 'Sens inconnu.' });
  const partyId = isValidId(String(raw.partyId ?? '')) ? String(raw.partyId) : null;
  const contactId = isValidId(String(raw.contactId ?? '')) ? String(raw.contactId) : null;
  const subject = cleanText(raw.subject, CRM_LIMITS.SUBJECT_MAX);
  if (!subject && !cleanText(raw.body, 200)) issues.push({ field: 'subject', reason: 'Objet ou corps requis.' });
  if (issues.length) return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Communication invalide.', details: issues };
  if (partyId && !db.get<{ id: string }>('SELECT id FROM crm360_parties WHERE id=?', partyId)) {
    return { ok: false, code: CRM_ERRORS.PARTY_NOT_FOUND, message: 'Fiche relationnelle introuvable.' };
  }
  const id = `comm_${randomUUID()}`;
  const now = new Date().toISOString();
  db.run(`INSERT INTO crm360_communications
    (id,party_id,contact_id,direction,channel,subject,body,external_id,sent_at,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  id, partyId, contactId, direction, channel, subject, cleanMultiline(raw.body, CRM_LIMITS.DESCRIPTION_MAX),
  cleanText(raw.externalId, CRM_LIMITS.CODE_MAX), parseDateOrNull(raw.sentAt) ?? now, actor.id ?? null, now);
  recordCrmMutation(db, {
    actor, action: 'CREATE', resourceType: 'communication', resourceId: id,
    after: { party_id: partyId, channel, direction, subject }, context: context as never,
    statusEvent: partyId
      ? { entityType: 'party', entityId: partyId, verb: 'COMMUNICATION', toValue: `${direction}:${channel}`, note: subject, actorEmployeeId: actor.id, at: now }
      : undefined,
  });
  return { ok: true, value: { communication: db.get<any>('SELECT * FROM crm360_communications WHERE id=?', id) } };
}

export function listCommunications(db: QatafoDatabase, query: { partyId?: unknown; page?: unknown; pageSize?: unknown; channel?: unknown }) {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = parsePageSize(query.pageSize, 25);
  const where: string[] = [];
  const params: unknown[] = [];
  const partyId = cleanText(query.partyId, 160);
  if (isValidId(partyId)) { where.push('c.party_id = ?'); params.push(partyId); }
  const channel = cleanText(query.channel, 30).toUpperCase();
  if (isValidEnum(channel, COMM_CHANNELS)) { where.push('c.channel = ?'); params.push(channel); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM crm360_communications c ${clause}`, ...params)?.count ?? 0);
  const items = db.all<any>(`SELECT c.*, p.name AS party_name, p.party_code
    FROM crm360_communications c LEFT JOIN crm360_parties p ON p.id=c.party_id
    ${clause} ORDER BY COALESCE(c.sent_at,c.created_at) DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}
