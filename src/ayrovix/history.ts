import type { QatafoDatabase } from '../db/database';

export type AyrovixHistoryKind = 'image' | 'url' | 'qr' | 'barcode' | 'code';
export type AyrovixHistoryVerificationStatus = 'VERIFIED' | 'PENDING_MANUAL';

export interface AyrovixHistoryInput {
  eventId: string;
  accountId: string | null | undefined;
  kind: AyrovixHistoryKind;
  inputValue?: string | null;
  queryLabel?: string | null;
  title: string;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  source?: string | null;
  price?: number | null;
  currency?: string | null;
  verificationStatus?: AyrovixHistoryVerificationStatus | null;
  resultsCount: number;
}

export interface AyrovixHistoryItem {
  id: string;
  kind: AyrovixHistoryKind;
  inputValue: string;
  queryLabel: string;
  title: string;
  imageUrl: string;
  sourceUrl: string;
  source: string;
  price: number | null;
  currency: string | null;
  verificationStatus: AyrovixHistoryVerificationStatus;
  resultsCount: number;
  createdAt: string;
}

const ensured = new WeakSet<object>();

function clean(value: unknown, limit: number): string {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function ensureAyrovixHistoryTable(db: QatafoDatabase): void {
  if (ensured.has(db as object)) return;
  db.run(`CREATE TABLE IF NOT EXISTS ayrovix_search_history (
    event_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('image','url','qr','barcode','code')),
    input_value TEXT NOT NULL DEFAULT '',
    query_label TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    price REAL,
    currency TEXT,
    verification_status TEXT NOT NULL DEFAULT 'PENDING_MANUAL' CHECK(verification_status IN ('VERIFIED','PENDING_MANUAL')),
    results_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_ayrovix_history_account_created ON ayrovix_search_history(account_id,created_at DESC)');
  ensured.add(db as object);
}

/** Authenticated history only. Guest history stays in the browser and never becomes server-side tracking. */
export function recordAyrovixHistory(db: QatafoDatabase, input: AyrovixHistoryInput): void {
  if (!input.accountId || !/^ayx_[a-zA-Z0-9-]{10,64}$/.test(input.eventId)) return;
  ensureAyrovixHistoryTable(db);
  const price = Number(input.price);
  const normalizedPrice = Number.isFinite(price) && price > 0 && price < 1_000_000 ? Math.round(price * 100) / 100 : null;
  const currency = /^[A-Z]{3}$/.test(String(input.currency || '').toUpperCase()) ? String(input.currency).toUpperCase() : null;
  db.run(`INSERT OR REPLACE INTO ayrovix_search_history
    (event_id,account_id,kind,input_value,query_label,title,image_url,source_url,source,price,currency,verification_status,results_count,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  input.eventId, input.accountId, input.kind, clean(input.inputValue, 4096), clean(input.queryLabel, 240),
  clean(input.title, 500) || 'Recherche AYROVIX', clean(input.imageUrl, 4096), clean(input.sourceUrl, 4096), clean(input.source, 120),
  normalizedPrice, currency, input.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING_MANUAL',
  Math.max(0, Math.min(1000, Number(input.resultsCount) || 0)), new Date().toISOString());
  db.run(`DELETE FROM ayrovix_search_history WHERE account_id=? AND event_id NOT IN (
    SELECT event_id FROM ayrovix_search_history WHERE account_id=? ORDER BY created_at DESC LIMIT 100
  )`, input.accountId, input.accountId);
}

export function listAyrovixHistory(db: QatafoDatabase, accountId: string, limit = 30): AyrovixHistoryItem[] {
  ensureAyrovixHistoryTable(db);
  return db.all<any>(`SELECT * FROM ayrovix_search_history WHERE account_id=? ORDER BY created_at DESC LIMIT ?`,
    accountId, Math.max(1, Math.min(50, limit))).map((row) => ({
    id: String(row.event_id),
    kind: row.kind as AyrovixHistoryKind,
    inputValue: String(row.input_value || ''),
    queryLabel: String(row.query_label || ''),
    title: String(row.title || 'Recherche AYROVIX'),
    imageUrl: String(row.image_url || ''),
    sourceUrl: String(row.source_url || ''),
    source: String(row.source || ''),
    price: row.price == null ? null : Number(row.price),
    currency: row.currency || null,
    verificationStatus: row.verification_status === 'VERIFIED' ? 'VERIFIED' : 'PENDING_MANUAL',
    resultsCount: Number(row.results_count || 0),
    createdAt: String(row.created_at),
  }));
}
