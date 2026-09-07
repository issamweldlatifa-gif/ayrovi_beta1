/**
 * AYROVI CRM 360 (E2) — timeline 360°.
 *
 * Une seule fenêtre chronologique par fiche : événements d'état de la fiche,
 * activités, tâches (échéances), issues (résolutions/clôtures), notes, communications,
 * et commandes legacy liées (via les raccordements). Les sources restent la vérité de
 * chaque événement ; la timeline est une lecture qui les fusionne, elle n'écrit rien.
 */
import type { QatafoDatabase } from '../db/database';
import { parsePageSize, parsePositiveInt } from './validation';

interface TimelineItem {
  type: 'party' | 'contact' | 'activity' | 'task' | 'issue' | 'note' | 'communication' | 'order' | 'link';
  id: string;
  at: string;
  verb: string;
  title: string;
  summary?: string;
  actor?: string | null;
  meta?: Record<string, unknown>;
}

export function partyTimeline(db: QatafoDatabase, partyId: string, query: { page?: unknown; pageSize?: unknown }) {
  const items: TimelineItem[] = [];

  // 1) Événements d'état de la fiche elle-même (création, archivage, changements de statut).
  const partyEvents = db.all<any>(`SELECT se.*, a.name AS actor_name
    FROM crm360_status_events se LEFT JOIN admin_users a ON a.id=se.actor_employee_id
    WHERE se.entity_type='party' AND se.entity_id=? ORDER BY se.created_at DESC LIMIT 300`, partyId);
  for (const event of partyEvents) {
    items.push({
      type: 'party', id: event.id, at: event.created_at, verb: String(event.verb),
      title: titleForVerb(event.verb, 'Fiche', event.to_value),
      summary: event.note || undefined, actor: event.actor_name,
      meta: { from: event.from_value, to: event.to_value },
    });
  }

  // 2) Commandes legacy liées (via les raccordements customers / customer_accounts).
  const links = db.all<{ id: string; ref_type: string; ref_id: string }>(
    'SELECT id,ref_type,ref_id FROM crm360_party_links WHERE party_id=?', partyId);
  const customerIds = links.filter((l) => l.ref_type === 'customer').map((l) => l.ref_id);
  const accountIds = links.filter((l) => l.ref_type === 'customer_account').map((l) => l.ref_id);
  if (customerIds.length || accountIds.length) {
    const ph = (count: number) => Array(Math.max(1, count)).fill('?').join(',');
    const orders = db.all<any>(`SELECT o.id,o.order_number,o.status,o.total_tnd,o.created_at
      FROM orders o
      WHERE o.customer_id IN (${ph(customerIds.length)}) OR o.account_id IN (${ph(accountIds.length)})
      ORDER BY o.created_at DESC LIMIT 500`, ...customerIds, ...accountIds);
    for (const order of orders) {
      items.push({
        type: 'order', id: order.id, at: order.created_at, verb: 'ORDER',
        title: `Commande ${order.order_number}`, summary: `Statut ${order.status}`, actor: null,
        meta: { status: order.status, total_tnd: Number(order.total_tnd || 0) },
      });
    }
  }

  // 3) Événements du module liés à la fiche OU à l'un de ses contacts.
  const activityRows = db.all<any>(`SELECT a.*, u.name AS creator_name FROM crm360_activities a
    LEFT JOIN admin_users u ON u.id=a.created_by WHERE a.party_id=? ORDER BY COALESCE(a.scheduled_at,a.created_at) DESC LIMIT 300`, partyId);
  const taskRows = db.all<any>(`SELECT t.*, u.name AS creator_name FROM crm360_tasks t
    LEFT JOIN admin_users u ON u.id=t.created_by WHERE t.party_id=? ORDER BY t.created_at DESC LIMIT 300`, partyId);
  const issueRows = db.all<any>(`SELECT i.*, u.name AS creator_name FROM crm360_issues i
    LEFT JOIN admin_users u ON u.id=i.created_by WHERE i.party_id=? ORDER BY i.opened_at DESC LIMIT 300`, partyId);
  const noteRows = db.all<any>(`SELECT n.*, u.name AS creator_name FROM crm360_notes n
    LEFT JOIN admin_users u ON u.id=n.created_by WHERE n.party_id=? ORDER BY n.created_at DESC LIMIT 300`, partyId);
  const commRows = db.all<any>(`SELECT c.*, u.name AS creator_name FROM crm360_communications c
    LEFT JOIN admin_users u ON u.id=c.created_by WHERE c.party_id=? ORDER BY COALESCE(c.sent_at,c.created_at) DESC LIMIT 300`, partyId);

  for (const activity of activityRows) {
    items.push({
      type: 'activity', id: activity.id, at: activity.completed_at ?? activity.scheduled_at ?? activity.created_at,
      verb: String(activity.kind), title: activity.subject, summary: activity.description || undefined,
      actor: activity.creator_name, meta: { status: activity.status, kind: activity.kind },
    });
  }
  for (const task of taskRows) {
    items.push({
      type: 'task', id: task.id, at: task.created_at, verb: task.status === 'COMPLETED' ? 'COMPLETED' : 'TASK',
      title: task.title, summary: task.is_follow_up ? 'Suivi' : undefined, actor: task.creator_name,
      meta: { status: task.status, due_at: task.due_at, task_no: task.task_no },
    });
  }
  for (const issue of issueRows) {
    items.push({
      type: 'issue', id: issue.id, at: issue.opened_at, verb: issue.status === 'RESOLVED' ? 'RESOLVED' : issue.status === 'CLOSED' ? 'CLOSED' : 'ISSUE',
      title: `${issue.issue_no} — ${issue.subject}`, summary: issue.status === 'RESOLVED' || issue.status === 'CLOSED' ? issue.resolution || undefined : undefined,
      actor: issue.creator_name, meta: { status: issue.status, priority: issue.priority },
    });
  }
  for (const note of noteRows) {
    items.push({
      type: 'note', id: note.id, at: note.updated_at, verb: 'NOTE',
      title: 'Note', summary: note.content, actor: note.creator_name, meta: { pinned: Boolean(note.is_pinned) },
    });
  }
  for (const comm of commRows) {
    items.push({
      type: 'communication', id: comm.id, at: comm.sent_at ?? comm.created_at, verb: 'COMMUNICATION',
      title: `[${comm.direction}] ${comm.channel} — ${comm.subject || 'Sans objet'}`, summary: comm.body || undefined,
      actor: comm.creator_name, meta: { channel: comm.channel, direction: comm.direction },
    });
  }

  items.sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0));
  const page = parsePositiveInt(query.page, 1);
  const pageSize = parsePageSize(query.pageSize, 50);
  const total = items.length;
  const slice = items.slice((page - 1) * pageSize, page * pageSize);
  return { items: slice, total, page, pageSize };
}

export function crmRecentActivity(db: QatafoDatabase, limit = 30) {
  const cap = Math.max(1, Math.min(100, Number(limit) || 30));
  const rows = db.all<any>(`SELECT 'task' AS type, t.id, t.created_at AS at, 'TASK' AS verb, t.title AS title,
      COALESCE(t.status,'') AS detail, p.name AS party_name, p.id AS party_id, e.first_name||' '||e.last_name AS owner
    FROM crm360_tasks t
    LEFT JOIN crm360_parties p ON p.id=t.party_id
    LEFT JOIN erp_employees e ON e.id=t.owner_employee_id
    UNION ALL
    SELECT 'issue', i.id, i.opened_at, 'ISSUE', i.subject, i.status, p.name, p.id,
      e.first_name||' '||e.last_name
    FROM crm360_issues i
    LEFT JOIN crm360_parties p ON p.id=i.party_id
    LEFT JOIN erp_employees e ON e.id=i.owner_employee_id
    UNION ALL
    SELECT 'activity', a.id, COALESCE(a.scheduled_at,a.created_at), a.kind, a.subject, a.status, p.name, p.id,
      e.first_name||' '||e.last_name
    FROM crm360_activities a
    LEFT JOIN crm360_parties p ON p.id=a.party_id
    LEFT JOIN erp_employees e ON e.id=a.owner_employee_id
    ORDER BY at DESC LIMIT ?`, cap);
  return rows;
}

function titleForVerb(verb: string, entityLabel: string, toValue?: string | null): string {
  switch (verb) {
    case 'CREATED': return `${entityLabel} créée`;
    case 'ARCHIVED': return `${entityLabel} archivée`;
    case 'STATUS_CHANGED': return `${entityLabel} : statut ${toValue ?? ''}`;
    case 'LINKED': return `Identité raccordée (${toValue ?? ''})`;
    case 'RELATIONSHIP': return `Relation ajoutée (${toValue ?? ''})`;
    case 'COMMUNICATION': return `Communication ${toValue ?? ''}`;
    case 'DELETED': return `${entityLabel} supprimée`;
    default: return verb;
  }
}
