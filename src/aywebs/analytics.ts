import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { funnelVisitorKey } from '../analytics/funnel';

export const AYWEBS_EVENTS = [
  'aywebs_open',
  'store_selected',
  'product_page_detected',
  'capture_started',
  'capture_succeeded',
  'capture_failed',
  'add_to_cart_clicked',
  'add_to_cart_succeeded',
] as const;

export type AyWebsEvent = (typeof AYWEBS_EVENTS)[number];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS aywebs_events (
    id TEXT PRIMARY KEY,
    event TEXT NOT NULL,
    store TEXT,
    capture_id TEXT,
    code TEXT,
    visitor_key TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_aywebs_event_created ON aywebs_events(event, created_at);
  CREATE INDEX IF NOT EXISTS idx_aywebs_capture ON aywebs_events(capture_id, created_at);
`;

const initialized = new WeakSet<object>();

function ensureAyWebsAnalyticsSchema(db: QatafoDatabase): void {
  if (initialized.has(db)) return;
  db.runSchema(SCHEMA);
  initialized.add(db);
}

const bounded = (value: unknown, length: number) => {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return text ? text.slice(0, length) : null;
};

/** Best-effort, PII-free instrumentation. Analytics can never block shopping. */
export function recordAyWebsEvent(
  db: QatafoDatabase,
  event: AyWebsEvent,
  input: { store?: unknown; captureId?: unknown; code?: unknown; sessionId?: unknown } = {},
): void {
  try {
    ensureAyWebsAnalyticsSchema(db);
    db.run(
      `INSERT INTO aywebs_events (id,event,store,capture_id,code,visitor_key,created_at) VALUES (?,?,?,?,?,?,?)`,
      `aywe_${randomUUID()}`,
      event,
      bounded(input.store, 40),
      bounded(input.captureId, 80),
      bounded(input.code, 80),
      funnelVisitorKey(input.sessionId),
      new Date().toISOString(),
    );
  } catch (error) {
    console.warn('[AyWebs Analytics]', error instanceof Error ? error.message : 'failed');
  }
}

export interface AyWebsAnalyticsSummary {
  days: number;
  counts: Record<AyWebsEvent, number>;
  captureSuccessRate: number | null;
  captureToCartRate: number | null;
  stores: Array<{ store: string; captures: number; succeeded: number; failed: number; successRate: number | null }>;
  failures: Array<{ code: string; count: number }>;
}

const percent = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : null;

/** Aggregated operations view; raw visitor identifiers are never returned. */
export function ayWebsAnalyticsSummary(db: QatafoDatabase, requestedDays = 30): AyWebsAnalyticsSummary {
  ensureAyWebsAnalyticsSchema(db);
  const days = Math.min(365, Math.max(1, Math.round(Number(requestedDays) || 30)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const eventRows = db.all<{ event: AyWebsEvent; count: number }>(
    'SELECT event, COUNT(*) AS count FROM aywebs_events WHERE created_at>=? GROUP BY event',
    since,
  );
  const counts = Object.fromEntries(AYWEBS_EVENTS.map((event) => [event, 0])) as Record<AyWebsEvent, number>;
  for (const row of eventRows) {
    if (AYWEBS_EVENTS.includes(row.event)) counts[row.event] = Number(row.count) || 0;
  }
  const stores = db.all<{ store: string; captures: number; succeeded: number; failed: number }>(
    `SELECT COALESCE(store,'unknown') AS store,
       SUM(CASE WHEN event='capture_started' THEN 1 ELSE 0 END) AS captures,
       SUM(CASE WHEN event='capture_succeeded' THEN 1 ELSE 0 END) AS succeeded,
       SUM(CASE WHEN event='capture_failed' THEN 1 ELSE 0 END) AS failed
     FROM aywebs_events
     WHERE created_at>=? AND event IN ('capture_started','capture_succeeded','capture_failed')
     GROUP BY COALESCE(store,'unknown')
     ORDER BY captures DESC, store ASC`,
    since,
  ).map((row) => ({
    store: row.store,
    captures: Number(row.captures) || 0,
    succeeded: Number(row.succeeded) || 0,
    failed: Number(row.failed) || 0,
    successRate: percent(Number(row.succeeded) || 0, (Number(row.succeeded) || 0) + (Number(row.failed) || 0)),
  }));
  const failures = db.all<{ code: string; count: number }>(
    `SELECT COALESCE(code,'UNKNOWN') AS code, COUNT(*) AS count
     FROM aywebs_events WHERE created_at>=? AND event='capture_failed'
     GROUP BY COALESCE(code,'UNKNOWN') ORDER BY count DESC, code ASC LIMIT 8`,
    since,
  ).map((row) => ({ code: row.code, count: Number(row.count) || 0 }));
  const decidedCaptures = counts.capture_succeeded + counts.capture_failed;
  return {
    days,
    counts,
    captureSuccessRate: percent(counts.capture_succeeded, decidedCaptures),
    captureToCartRate: percent(counts.add_to_cart_succeeded, counts.capture_succeeded),
    stores,
    failures,
  };
}
