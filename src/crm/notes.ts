/**
 * AYROVI CRM 360 (E2) — notes structurées.
 *
 * Une note est rattachée à une fiche (obligatoire pour rester dans le CRM), avec un
 * auteur, une date et éventuellement un contact/activité/tâche en contexte. Pas de
 * second système de notes : la timeline les montre ; l'audit conserve l'historique des
 * éditions via le rédacteur unique.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { CRM_LIMITS, CRM_ERRORS } from './types';
import type { CrmActor } from './audit';
import { recordCrmMutation } from './audit';
import { cleanMultiline, cleanText, isValidId, parseFlag, parsePageSize, parsePositiveInt } from './validation';
import type { Outcome } from './parties';

export function getNote(db: QatafoDatabase, id: string) {
  return db.get<any>(`SELECT n.*, a.name AS author_name, p.name AS party_name, p.party_code
    FROM crm360_notes n
    LEFT JOIN admin_users a ON a.id=n.created_by
    LEFT JOIN crm360_parties p ON p.id=n.party_id
    WHERE n.id=?`, id);
}

export function listNotes(db: QatafoDatabase, query: { partyId?: unknown; page?: unknown; pageSize?: unknown; pinned?: unknown }) {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = parsePageSize(query.pageSize, 25);
  const where: string[] = [];
  const params: unknown[] = [];
  const partyId = cleanText(query.partyId, 160);
  if (isValidId(partyId)) { where.push('n.party_id=?'); params.push(partyId); }
  if (parseFlag(query.pinned) === 1) where.push('n.is_pinned=1');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM crm360_notes n ${clause}`, ...params)?.count ?? 0);
  const items = db.all<any>(`SELECT n.*, a.name AS author_name
    FROM crm360_notes n LEFT JOIN admin_users a ON a.id=n.created_by
    ${clause} ORDER BY n.is_pinned DESC, n.updated_at DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}

export function createNote(db: QatafoDatabase, actor: CrmActor, context: unknown, raw: Record<string, unknown>): Outcome<{ note: any }> {
  const partyId = cleanText(raw.partyId, 160);
  if (!isValidId(partyId)) return { ok: false, code: CRM_ERRORS.PARTY_NOT_FOUND, message: 'Une note doit être rattachée à une fiche.' };
  if (!db.get<{ id: string }>('SELECT id FROM crm360_parties WHERE id=?', partyId)) {
    return { ok: false, code: CRM_ERRORS.PARTY_NOT_FOUND, message: 'Fiche relationnelle introuvable.' };
  }
  const content = cleanMultiline(raw.content, CRM_LIMITS.CONTENT_MAX);
  if (!content) return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Le contenu de la note est requis.' };
  const id = `note_${randomUUID()}`;
  const now = new Date().toISOString();
  const contactId = isValidId(String(raw.contactId ?? '')) ? String(raw.contactId) : null;
  const activityId = isValidId(String(raw.activityId ?? '')) ? String(raw.activityId) : null;
  const taskId = isValidId(String(raw.taskId ?? '')) ? String(raw.taskId) : null;
  db.transaction(() => {
    db.run(`INSERT INTO crm360_notes (id,party_id,contact_id,activity_id,task_id,content,is_pinned,created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    id, partyId, contactId, activityId, taskId, content, parseFlag(raw.isPinned), actor.id ?? null, actor.id ?? null, now, now);
    recordCrmMutation(db, {
      actor, action: 'CREATE', resourceType: 'note', resourceId: id,
      after: { party_id: partyId, is_pinned: parseFlag(raw.isPinned) }, context: context as never,
      statusEvent: { entityType: 'party', entityId: partyId, verb: 'NOTE', note: content.slice(0, 200), actorEmployeeId: actor.id, at: now },
    });
  });
  return { ok: true, value: { note: getNote(db, id) } };
}

export function updateNote(db: QatafoDatabase, actor: CrmActor, context: unknown, id: string, raw: Record<string, unknown>): Outcome<{ note: any }> {
  const existing = getNote(db, id);
  if (!existing) return { ok: false, code: CRM_ERRORS.NOTE_NOT_FOUND, message: 'Note introuvable.' };
  const content = raw.content !== undefined ? cleanMultiline(raw.content, CRM_LIMITS.CONTENT_MAX) : existing.content;
  if (!content) return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Le contenu de la note ne peut pas être vide.' };
  const before = { content: existing.content, is_pinned: existing.is_pinned };
  const now = new Date().toISOString();
  db.transaction(() => {
    db.run(`UPDATE crm360_notes SET content=?,is_pinned=?,updated_by=?,updated_at=? WHERE id=?`,
      content, raw.isPinned !== undefined ? parseFlag(raw.isPinned) : existing.is_pinned, actor.id ?? null, now, id);
    recordCrmMutation(db, {
      actor, action: 'UPDATE', resourceType: 'note', resourceId: id,
      before, after: { content, is_pinned: raw.isPinned !== undefined ? parseFlag(raw.isPinned) : existing.is_pinned },
      context: context as never,
    });
  });
  return { ok: true, value: { note: getNote(db, id) } };
}

export function deleteNote(db: QatafoDatabase, actor: CrmActor, context: unknown, id: string): Outcome<{ deleted: true }> {
  const existing = getNote(db, id);
  if (!existing) return { ok: false, code: CRM_ERRORS.NOTE_NOT_FOUND, message: 'Note introuvable.' };
  db.transaction(() => {
    db.run('DELETE FROM crm360_notes WHERE id=?', id);
    recordCrmMutation(db, {
      actor, action: 'DELETE', resourceType: 'note', resourceId: id,
      before: { id: existing.id, party_id: existing.party_id }, after: null, context: context as never,
      statusEvent: { entityType: 'party', entityId: existing.party_id, verb: 'NOTE_DELETED', note: 'Note supprimée', actorEmployeeId: actor.id },
    });
  });
  return { ok: true, value: { deleted: true } };
}
