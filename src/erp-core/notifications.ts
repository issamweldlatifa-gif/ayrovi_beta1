/**
 * AYROVI ERP Core — Notification foundation (P1).
 *
 * The audit found 10 inline `INSERT INTO customer_notifications`/`admin_notifications`
 * scattered through src/db/database.ts and the routers: no channel, no delivery
 * state, no payload, and the admin side is never notified by the CRM.
 *
 * P1 does not replace those write paths (Rule Zero). It adds:
 *   • one helper both tables are written through (structured `data` payload);
 *   • `erp_notification_deliveries`: the outbound log a queue will later consume
 *     (channel, status, attempts) — nothing is auto-sent yet.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';

export const NOTIFICATION_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS erp_notification_deliveries (
    id TEXT PRIMARY KEY,
    recipient_type TEXT NOT NULL CHECK(recipient_type IN ('employee','admin_user','customer_account','email','sms')),
    recipient_id TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'in-app' CHECK(channel IN ('in-app','email','sms','webhook')),
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_erp_deliveries_status ON erp_notification_deliveries(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_erp_deliveries_recipient ON erp_notification_deliveries(recipient_type, recipient_id, created_at DESC);
`;

export function ensureNotificationSchema(db: QatafoDatabase): void {
  db.runSchema(NOTIFICATION_SCHEMA_SQL);
  // Structured payload on the two existing notification tables (additive, NULL-safe).
  for (const table of ['admin_notifications', 'customer_notifications']) {
    const columns = new Set((db.all<{ name: string }>(`PRAGMA table_info(${table})`) || []).map((column) => String(column.name)));
    if (!columns.has('data')) db.run(`ALTER TABLE ${table} ADD COLUMN data TEXT`);
    if (!columns.has('source')) db.run(`ALTER TABLE ${table} ADD COLUMN source TEXT`);
  }
}

export interface NotifyInput {
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  data?: Record<string, unknown>;
  source?: string;
}

/** In-app notification for a back-office user (admin_notifications). */
export function notifyAdminUser(db: QatafoDatabase, adminUserId: string, input: NotifyInput): string {
  const id = `notification_${randomUUID()}`;
  const now = new Date().toISOString();
  db.run(`INSERT INTO admin_notifications (id,type,title,message,action_url,created_at,data,source)
    VALUES (?,?,?,?,?,?,?,?)`, id, String(input.type).slice(0, 30) || 'GENERAL', String(input.title).slice(0, 200),
  String(input.message).slice(0, 2000), String(input.actionUrl || '').slice(0, 300), now,
  input.data ? JSON.stringify(input.data).slice(0, 4000) : null, String(input.source || 'erp-core').slice(0, 40));
  return id;
}

/** In-app notification for a customer account (customer_notifications). */
export function notifyCustomerAccount(db: QatafoDatabase, accountId: string, input: NotifyInput): string {
  const id = `notification_${randomUUID()}`;
  const now = new Date().toISOString();
  db.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at,data,source)
    VALUES (?,?,?,?,?,?,?,?,?)`, id, accountId, String(input.type).slice(0, 30) || 'GENERAL', String(input.title).slice(0, 200),
  String(input.message).slice(0, 2000), String(input.actionUrl || '').slice(0, 300), now,
  input.data ? JSON.stringify(input.data).slice(0, 4000) : null, String(input.source || 'erp-core').slice(0, 40));
  return id;
}

/**
 * Registers an outbound delivery. Consumers (email/SMS/webhook) attach in later
 * phases; until then the row documents the intent, which is what an ERP needs to
 * prove "the customer was told".
 */
export function queueDelivery(db: QatafoDatabase, input: NotifyInput & {
  recipientType: 'employee' | 'admin_user' | 'customer_account' | 'email' | 'sms';
  recipientId: string;
  channel?: 'in-app' | 'email' | 'sms' | 'webhook';
}): string {
  const id = `deliv_${randomUUID()}`;
  const now = new Date().toISOString();
  db.run(`INSERT INTO erp_notification_deliveries
    (id,recipient_type,recipient_id,channel,notification_type,title,body,status,attempts,payload,created_at,updated_at)
    VALUES (?,?,?,COALESCE(?, 'in-app'),?,?,?,?,?,?)`, id, input.recipientType, String(input.recipientId).slice(0, 160),
  input.channel ?? 'in-app', String(input.type).slice(0, 40), String(input.title).slice(0, 200), String(input.message).slice(0, 2000),
  'PENDING', 0, JSON.stringify(input.data ?? {}).slice(0, 4000), now, now);
  return id;
}

export function recentDeliveries(db: QatafoDatabase, limit = 50) {
  return db.all<any>('SELECT * FROM erp_notification_deliveries ORDER BY created_at DESC LIMIT ?',
    Math.max(1, Math.min(200, Number(limit) || 50)));
}
