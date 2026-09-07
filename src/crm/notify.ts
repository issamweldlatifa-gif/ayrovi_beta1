/**
 * AYROVI CRM 360 (E2) — notifications métier, SANS second canal.
 *
 * Une affectation (tâche ou issue) notifie le propriétaire via le canal existant :
 * `notifyAdminUser` (bell in-app) + `queueDelivery` (outbox). Rien n'est inventé : on
 * rejoint l'identité employé → son compte de connexion (`erp_employees.user_id`), et un
 * employé sans compte ne casse rien (la livraison est journalisée à l'intention).
 */
import type { QatafoDatabase } from '../db/database';
import { notifyAdminUser, queueDelivery } from '../erp-core/notifications';

export interface CrmNotifyInput {
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  data?: Record<string, unknown>;
}

/** Notifie le propriétaire interne (employé) d'une ressource CRM. Ne lève jamais. */
export function notifyCrmOwner(
  db: QatafoDatabase,
  employeeId: string | null | undefined,
  input: CrmNotifyInput,
): void {
  if (!employeeId) return;
  try {
    const employee = db.get<{ user_id: string | null; first_name: string; last_name: string }>(
      'SELECT user_id,first_name,last_name FROM erp_employees WHERE id=?', String(employeeId));
    if (!employee) return;
    const adminUserId = employee.user_id;
    // Le type du canal in-app est contraint (CHECK sur admin_notifications.type) ; le type
    // métier précis (ex. CRM_TASK_ASSIGNED) vit dans data.subtype, jamais dans la colonne.
    const data = { ...(input.data ?? {}), subtype: input.type, employeeId: String(employeeId) };
    if (adminUserId) {
      notifyAdminUser(db, adminUserId, { type: 'SYSTEM', title: input.title, message: input.message, actionUrl: input.actionUrl, data, source: 'crm360' });
    }
    queueDelivery(db, {
      recipientType: 'employee', recipientId: String(employeeId),
      channel: 'in-app', type: input.type, title: input.title, message: input.message,
      data,
    });
  } catch (error: any) {
    // Une notification ne doit jamais faire échouer l'opération métier.
    console.warn('[crm360] notification échouée:', error?.message || error);
  }
}
