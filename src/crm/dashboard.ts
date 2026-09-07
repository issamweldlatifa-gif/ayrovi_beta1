/**
 * AYROVI CRM 360 (E2) — tableau de bord relationnel.
 *
 * Toutes les valeurs sont calculées depuis les vraies tables du module (et des tables
 * legacy via les raccordements quand pertinent). Aucune donnée de démonstration n'est
 * fabriquée : une base vide affiche zéro, jamais un faux « actif ».
 */
import type { QatafoDatabase } from '../db/database';

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export function crmDashboard(db: QatafoDatabase) {
  const now = new Date().toISOString();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const parties = db.get<any>(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new30d,
      SUM(CASE WHEN kind='CUSTOMER' THEN 1 ELSE 0 END) AS customers,
      SUM(CASE WHEN kind='CUSTOMER' AND status='ACTIVE' THEN 1 ELSE 0 END) AS customers_active,
      SUM(CASE WHEN kind='CUSTOMER' AND created_at >= ? THEN 1 ELSE 0 END) AS customers_new30d,
      SUM(CASE WHEN kind='PARTNER' THEN 1 ELSE 0 END) AS partners,
      SUM(CASE WHEN kind='PARTNER' AND status='ACTIVE' THEN 1 ELSE 0 END) AS partners_active,
      SUM(CASE WHEN kind='SUPPLIER' THEN 1 ELSE 0 END) AS suppliers,
      SUM(CASE WHEN kind='SUPPLIER' AND status='ACTIVE' THEN 1 ELSE 0 END) AS suppliers_active,
      SUM(CASE WHEN kind='PROSPECT' THEN 1 ELSE 0 END) AS prospects,
      SUM(CASE WHEN status='ARCHIVED' THEN 1 ELSE 0 END) AS archived
    FROM crm360_parties`, isoDaysAgo(30), isoDaysAgo(30));
  const contacts = Number(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM crm360_contacts WHERE status=\'ACTIVE\'')?.n ?? 0);

  const activities = db.get<any>(`SELECT
      SUM(CASE WHEN status='OPEN' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN status='COMPLETED' AND completed_at >= ? THEN 1 ELSE 0 END) AS completed30d
    FROM crm360_activities`, isoDaysAgo(30));

  const tasks = db.get<any>(`SELECT
      SUM(CASE WHEN status IN ('OPEN','IN_PROGRESS','WAITING') THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN status IN ('OPEN','IN_PROGRESS','WAITING') AND due_at IS NOT NULL AND due_at < ? THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN status IN ('OPEN','IN_PROGRESS','WAITING') AND due_at >= ? AND due_at <= ? THEN 1 ELSE 0 END) AS due_today,
      SUM(CASE WHEN status IN ('OPEN','IN_PROGRESS','WAITING') AND (due_at IS NULL OR due_at >= ?) THEN 1 ELSE 0 END) AS upcoming,
      SUM(CASE WHEN is_follow_up=1 AND status IN ('OPEN','IN_PROGRESS','WAITING') THEN 1 ELSE 0 END) AS follow_ups,
      SUM(CASE WHEN status='COMPLETED' AND completed_at >= ? THEN 1 ELSE 0 END) AS completed30d
    FROM crm360_tasks`, now, todayStart.toISOString(), todayEnd.toISOString(), now, isoDaysAgo(30));

  const issues = db.get<any>(`SELECT
      SUM(CASE WHEN status='OPEN' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN status='IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status='WAITING' THEN 1 ELSE 0 END) AS waiting,
      SUM(CASE WHEN status='RESOLVED' AND resolved_at >= ? THEN 1 ELSE 0 END) AS resolved30d,
      COUNT(*) AS total
    FROM crm360_issues`, isoDaysAgo(30));

  const recentlyActive = Number(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM crm360_parties
    WHERE status!='ARCHIVED' AND (last_contacted_at >= ? OR updated_at >= ?)`, isoDaysAgo(14), isoDaysAgo(14))?.n ?? 0);

  const ownerNextActions = db.all<any>(`SELECT e.id AS employee_id, e.first_name||' '||e.last_name AS owner_name,
      COUNT(t.id) AS open_tasks,
      SUM(CASE WHEN t.due_at IS NOT NULL AND t.due_at < ? THEN 1 ELSE 0 END) AS overdue_tasks,
      SUM(CASE WHEN t.is_follow_up=1 THEN 1 ELSE 0 END) AS follow_ups,
      (SELECT COUNT(*) FROM crm360_issues i WHERE i.owner_employee_id=e.id AND i.status IN ('OPEN','IN_PROGRESS','WAITING')) AS open_issues
    FROM erp_employees e
    LEFT JOIN crm360_tasks t ON t.owner_employee_id=e.id AND t.status IN ('OPEN','IN_PROGRESS','WAITING')
    WHERE e.status='ACTIVE'
    GROUP BY e.id, e.first_name, e.last_name
    HAVING (COUNT(t.id) > 0 OR (SELECT COUNT(*) FROM crm360_issues i WHERE i.owner_employee_id=e.id AND i.status IN ('OPEN','IN_PROGRESS','WAITING')) > 0)
    ORDER BY overdue_tasks DESC NULLS LAST, open_tasks DESC LIMIT 20`, now);

  return {
    parties: {
      total: Number(parties?.total ?? 0), active: Number(parties?.active ?? 0), new30d: Number(parties?.new30d ?? 0),
      customers: Number(parties?.customers ?? 0), customersActive: Number(parties?.customers_active ?? 0), customersNew30d: Number(parties?.customers_new30d ?? 0),
      partners: Number(parties?.partners ?? 0), partnersActive: Number(parties?.partners_active ?? 0),
      suppliers: Number(parties?.suppliers ?? 0), suppliersActive: Number(parties?.suppliers_active ?? 0),
      prospects: Number(parties?.prospects ?? 0), archived: Number(parties?.archived ?? 0),
    },
    contacts,
    activities: { open: Number(activities?.open ?? 0), completed30d: Number(activities?.completed30d ?? 0) },
    tasks: {
      open: Number(tasks?.open ?? 0), overdue: Number(tasks?.overdue ?? 0), dueToday: Number(tasks?.due_today ?? 0),
      upcoming: Number(tasks?.upcoming ?? 0), followUps: Number(tasks?.follow_ups ?? 0), completed30d: Number(tasks?.completed30d ?? 0),
    },
    issues: {
      open: Number(issues?.open ?? 0), inProgress: Number(issues?.in_progress ?? 0), waiting: Number(issues?.waiting ?? 0),
      resolved30d: Number(issues?.resolved30d ?? 0), total: Number(issues?.total ?? 0),
    },
    recentlyActive,
    ownerNextActions,
    generatedAt: now,
  };
}
