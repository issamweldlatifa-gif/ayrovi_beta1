import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import type { AyrovixChannel } from './types';

/**
 * AYROVIX · journal d'usage minimaliste (analytics produit, pas de données personnelles).
 * Sert :
 *  1) à la carte « AYROVIX » du tableau Rapports admin,
 *  2) au taux de succès (identifications qui ont produit au moins un candidat).
 * Jamais : image, contenu, IP ni données personnelles.
 */

let ensured = false;

export function ensureAyrovixEventsTable(db: QatafoDatabase): void {
  if (ensured) return;
  db.run(`CREATE TABLE IF NOT EXISTS ayrovix_events (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL CHECK(channel IN ('image','url','qr')),
    brand TEXT,
    query TEXT,
    candidates_count INTEGER NOT NULL DEFAULT 0,
    chosen INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_ayrovix_events_created ON ayrovix_events(created_at)');
  ensured = true;
}

export function recordAyrovixEvent(
  db: QatafoDatabase,
  input: { channel: AyrovixChannel; brand?: string | null; query?: string | null; candidatesCount: number; chosen?: boolean },
): string {
  ensureAyrovixEventsTable(db);
  const id = `ayx_${randomUUID()}`;
  db.run(
    'INSERT INTO ayrovix_events (id,channel,brand,query,candidates_count,chosen,created_at) VALUES (?,?,?,?,?,?,?)',
    id,
    input.channel,
    (input.brand || '').slice(0, 80) || null,
    (input.query || '').slice(0, 200) || null,
    Math.max(0, input.candidatesCount | 0),
    input.chosen ? 1 : 0,
    new Date().toISOString(),
  );
  return id;
}

export function markAyrovixChosen(db: QatafoDatabase, eventId: string): void {
  if (!/^ayx_[a-zA-Z0-9-]{10,64}$/.test(eventId)) return;
  ensureAyrovixEventsTable(db);
  db.run('UPDATE ayrovix_events SET chosen=1 WHERE id=?', eventId);
}

export interface AyrovixStats {
  last7d: { total: number; image: number; url: number; qr: number; withCandidates: number; chosen: number; matchRate: number };
  topBrands: Array<{ brand: string; count: number }>;
  topQueries: Array<{ query: string; count: number }>;
}

export function getAyrovixStats(db: QatafoDatabase): AyrovixStats {
  ensureAyrovixEventsTable(db);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const totals = db.get<any>(
    `SELECT COUNT(*) total,
            SUM(CASE WHEN channel='image' THEN 1 ELSE 0 END) image,
            SUM(CASE WHEN channel='url' THEN 1 ELSE 0 END) url,
            SUM(CASE WHEN channel='qr' THEN 1 ELSE 0 END) qr,
            SUM(CASE WHEN candidates_count>0 THEN 1 ELSE 0 END) withCandidates,
            SUM(chosen) chosen
     FROM ayrovix_events WHERE created_at>=?`, since,
  ) || {};
  const total = Number(totals.total || 0);
  return {
    last7d: {
      total,
      image: Number(totals.image || 0),
      url: Number(totals.url || 0),
      qr: Number(totals.qr || 0),
      withCandidates: Number(totals.withCandidates || 0),
      chosen: Number(totals.chosen || 0),
      matchRate: total ? Math.round((Number(totals.withCandidates || 0) / total) * 100) : 0,
    },
    topBrands: db.all<any>(
      `SELECT brand, COUNT(*) count FROM ayrovix_events
       WHERE brand IS NOT NULL AND created_at>=? GROUP BY brand ORDER BY count DESC LIMIT 5`, since,
    ),
    topQueries: db.all<any>(
      `SELECT query, COUNT(*) count FROM ayrovix_events
       WHERE query IS NOT NULL AND created_at>=? GROUP BY query ORDER BY count DESC LIMIT 5`, since,
    ),
  };
}
