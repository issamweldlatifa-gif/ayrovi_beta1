import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { OCEREX_EVENTS, type OcerexEventName } from './types';

let ensured = false;

export function ensureOcerexAnalytics(db: QatafoDatabase): void {
  if (ensured) return;
  db.run(`CREATE TABLE IF NOT EXISTS ocerex_events (
    id TEXT PRIMARY KEY,
    event TEXT NOT NULL,
    session_id TEXT,
    extraction_type TEXT,
    confidence_level TEXT,
    created_at TEXT NOT NULL
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_ocerex_events_created ON ocerex_events(created_at)');
  ensured = true;
}

export function resetOcerexAnalyticsForTests(): void {
  ensured = false;
}

export function isOcerexEvent(value: unknown): value is OcerexEventName {
  return typeof value === 'string' && (OCEREX_EVENTS as readonly string[]).includes(value);
}

/** Product analytics only. Never an image, a screenshot transcript, or a raw URL. */
export function recordOcerexEvent(
  db: QatafoDatabase,
  event: OcerexEventName,
  input: { sessionId?: string | null; extractionType?: string | null; confidenceLevel?: string | null } = {},
): void {
  try {
    ensureOcerexAnalytics(db);
    db.run(
      'INSERT INTO ocerex_events (id,event,session_id,extraction_type,confidence_level,created_at) VALUES (?,?,?,?,?,?)',
      `ocxevt_${randomUUID()}`,
      event,
      (input.sessionId || '').slice(0, 160) || null,
      (input.extractionType || '').slice(0, 16) || null,
      (input.confidenceLevel || '').slice(0, 16) || null,
      new Date().toISOString(),
    );
  } catch (error) {
    console.warn('[OCEREX analytics]', error instanceof Error ? error.message : 'failed');
  }
}
