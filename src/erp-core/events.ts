/**
 * AYROVI ERP Core — Central event foundation (P1).
 *
 * No queue, no broker: an in-process typed bus plus a durable `erp_events`
 * record so that "what happened" is queryable before any consumer exists.
 * Consumers are registered at boot; the audit writer feeds domain events from
 * audited mutations so order/payment/content changes are observable today.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';

export const ERP_EVENTS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS erp_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  module_key TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  origin TEXT NOT NULL DEFAULT 'audit',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_erp_events_name ON erp_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_events_resource ON erp_events(resource_type, resource_id, created_at DESC);`;

export interface ErpEvent {
  name: string;
  module: string;
  resourceType?: string | null;
  resourceId?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

type EventHandler = (event: ErpEvent) => void;

const handlers = new Map<string, Set<EventHandler>>();
const wildcardHandlers = new Set<EventHandler>();

export function onErpEvent(eventName: string, handler: EventHandler): () => void {
  if (!handlers.has(eventName)) handlers.set(eventName, new Set());
  handlers.get(eventName)!.add(handler);
  return () => handlers.get(eventName)?.delete(handler);
}

export function onAnyErpEvent(handler: EventHandler): () => void {
  wildcardHandlers.add(handler);
  return () => wildcardHandlers.delete(handler);
}

/** Records the event durably, then notifies in-process handlers. Never throws. */
export function emitErpEvent(db: QatafoDatabase, event: ErpEvent): void {
  const occurredAt = event.occurredAt || new Date().toISOString();
  try {
    db.run(`INSERT INTO erp_events (id,event_name,module_key,resource_type,resource_id,payload,origin,created_at)
      VALUES (?,?,?,?,?,?,?,?)`, `evt_${randomUUID()}`, String(event.name).slice(0, 80), String(event.module).slice(0, 40),
    event.resourceType ? String(event.resourceType).slice(0, 60) : null, event.resourceId ? String(event.resourceId).slice(0, 80) : null,
    JSON.stringify(event.payload ?? {}).slice(0, 20_000), 'audit', occurredAt);
  } catch { /* an event must never break a business transaction */ }
  for (const handler of handlers.get(event.name) ?? []) {
    try { handler({ ...event, occurredAt }); } catch { /* consumer isolation */ }
  }
  for (const handler of wildcardHandlers) {
    try { handler({ ...event, occurredAt }); } catch { /* consumer isolation */ }
  }
}

let eventsSchemaReady = new WeakSet<object>();

/** Idempotent: emitErpEvent stays safe even if called before bootstrap. */
export function ensureEventsSchemaIfMissing(db: QatafoDatabase): void {
  if (eventsSchemaReady.has(db)) return;
  db.runSchema(ERP_EVENTS_TABLE_SQL);
  eventsSchemaReady.add(db);
}

export function listErpEvents(db: QatafoDatabase, limit = 50, moduleName?: string) {
  const cap = Math.max(1, Math.min(200, Number(limit) || 50));
  if (moduleName) {
    return db.all<any>('SELECT * FROM erp_events WHERE module_key=? ORDER BY created_at DESC LIMIT ?', moduleName, cap);
  }
  return db.all<any>('SELECT * FROM erp_events ORDER BY created_at DESC LIMIT ?', cap);
}
