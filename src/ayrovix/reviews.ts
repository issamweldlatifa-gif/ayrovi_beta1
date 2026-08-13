import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';

export type AyrovixReviewStatus = 'PENDING' | 'IN_REVIEW' | 'QUOTED' | 'REJECTED' | 'CANCELLED';

export interface CreateAyrovixReviewInput {
  sessionId: string;
  accountId?: string | null;
  eventId?: string | null;
  sourceUrl: string;
  title: string;
  imageUrl?: string;
  source?: string;
  lensPrice?: number | null;
  lensCurrency?: string | null;
  desiredSize?: string;
  desiredColor?: string;
  contact: string;
}

const ensuredDatabases = new WeakSet<QatafoDatabase>();

export function ensureAyrovixReviewRequestsTable(db: QatafoDatabase): void {
  if (ensuredDatabases.has(db)) return;
  db.run(`CREATE TABLE IF NOT EXISTS ayrovix_review_requests (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
    event_id TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','IN_REVIEW','QUOTED','REJECTED','CANCELLED')),
    source_url TEXT NOT NULL,
    title TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    lens_price REAL,
    lens_currency TEXT,
    desired_size TEXT NOT NULL DEFAULT '',
    desired_color TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL,
    quoted_price REAL,
    quoted_currency TEXT,
    verified_variant TEXT NOT NULL DEFAULT '',
    verified_url TEXT NOT NULL DEFAULT '',
    customer_message TEXT NOT NULL DEFAULT '',
    admin_note TEXT NOT NULL DEFAULT '',
    resolved_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  const columns = new Set(db.all<any>('PRAGMA table_info(ayrovix_review_requests)').map((column) => String(column.name)));
  for (const [name, definition] of [
    ['verified_variant', "TEXT NOT NULL DEFAULT ''"],
    ['verified_url', "TEXT NOT NULL DEFAULT ''"],
    ['customer_message', "TEXT NOT NULL DEFAULT ''"],
  ] as const) {
    if (!columns.has(name)) db.run(`ALTER TABLE ayrovix_review_requests ADD COLUMN ${name} ${definition}`);
  }
  db.run('CREATE INDEX IF NOT EXISTS idx_ayrovix_review_status ON ayrovix_review_requests(status, created_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_ayrovix_review_owner ON ayrovix_review_requests(session_id, created_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_ayrovix_review_account ON ayrovix_review_requests(account_id, created_at DESC)');
  ensuredDatabases.add(db);
}

export function createAyrovixReviewRequest(db: QatafoDatabase, input: CreateAyrovixReviewInput): any {
  ensureAyrovixReviewRequestsTable(db);
  const recentSince = new Date(Date.now() - 10 * 60_000).toISOString();
  const duplicate = db.get<any>(`SELECT * FROM ayrovix_review_requests
    WHERE session_id=? AND source_url=? AND status IN ('PENDING','IN_REVIEW') AND created_at>=?
    ORDER BY created_at DESC LIMIT 1`, input.sessionId, input.sourceUrl, recentSince);
  if (duplicate) return { ...duplicate, duplicate: true };

  const id = `ayx_review_${randomUUID()}`;
  const now = new Date().toISOString();
  db.run(`INSERT INTO ayrovix_review_requests (
    id,session_id,account_id,event_id,status,source_url,title,image_url,source,lens_price,lens_currency,
    desired_size,desired_color,contact,created_at,updated_at
  ) VALUES (?,?,?,?,'PENDING',?,?,?,?,?,?,?,?,?,?,?)`,
  id, input.sessionId, input.accountId || null, input.eventId || null, input.sourceUrl, input.title,
  input.imageUrl || '', input.source || '', input.lensPrice || null, input.lensCurrency || null,
  input.desiredSize || '', input.desiredColor || '', input.contact, now, now);
  db.notifyAdmins(
    'ORDER',
    'Produit Lens à vérifier',
    `${input.title.slice(0, 120)} — prix marchand et disponibilité à confirmer.`,
    `/admin?section=lens-requests&request=${encodeURIComponent(id)}`,
  );
  return db.get<any>('SELECT * FROM ayrovix_review_requests WHERE id=?', id);
}

export function getAyrovixReviewForOwner(db: QatafoDatabase, id: string, sessionId: string, accountId?: string | null): any | null {
  ensureAyrovixReviewRequestsTable(db);
  const row = accountId
    ? db.get<any>('SELECT * FROM ayrovix_review_requests WHERE id=? AND (account_id=? OR session_id=?)', id, accountId, sessionId)
    : db.get<any>('SELECT * FROM ayrovix_review_requests WHERE id=? AND session_id=?', id, sessionId);
  return row || null;
}

export interface AyrovixReviewAdminUpdate {
  status: AyrovixReviewStatus;
  quotedPrice?: number | null;
  quotedCurrency?: string | null;
  verifiedVariant?: string;
  verifiedUrl?: string;
  customerMessage?: string;
  adminNote?: string;
  adminId: string;
}

export function listAyrovixReviews(
  db: QatafoDatabase,
  options: { status?: AyrovixReviewStatus | ''; search?: string; page: number; pageSize: number },
): { rows: any[]; total: number } {
  ensureAyrovixReviewRequestsTable(db);
  const where: string[] = [];
  const params: any[] = [];
  if (options.status) {
    where.push('r.status=?');
    params.push(options.status);
  }
  if (options.search) {
    where.push('(r.id LIKE ? OR r.title LIKE ? OR r.source LIKE ? OR r.contact LIKE ?)');
    const query = `%${options.search}%`;
    params.push(query, query, query, query);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<any>(`SELECT COUNT(*) count FROM ayrovix_review_requests r ${clause}`, ...params)?.count || 0);
  const rows = db.all<any>(`SELECT r.*,a.display_name account_name,a.email account_email,a.phone account_phone,u.name resolved_by_name
    FROM ayrovix_review_requests r
    LEFT JOIN customer_accounts a ON a.id=r.account_id
    LEFT JOIN admin_users u ON u.id=r.resolved_by
    ${clause}
    ORDER BY CASE r.status WHEN 'PENDING' THEN 0 WHEN 'IN_REVIEW' THEN 1 ELSE 2 END, r.created_at DESC
    LIMIT ? OFFSET ?`, ...params, options.pageSize, (options.page - 1) * options.pageSize);
  return { rows, total };
}

export function getAyrovixReviewForAdmin(db: QatafoDatabase, id: string): any | null {
  ensureAyrovixReviewRequestsTable(db);
  return db.get<any>(`SELECT r.*,a.display_name account_name,a.email account_email,a.phone account_phone,u.name resolved_by_name
    FROM ayrovix_review_requests r
    LEFT JOIN customer_accounts a ON a.id=r.account_id
    LEFT JOIN admin_users u ON u.id=r.resolved_by
    WHERE r.id=?`, id) || null;
}

export function updateAyrovixReview(db: QatafoDatabase, id: string, input: AyrovixReviewAdminUpdate): any | null {
  ensureAyrovixReviewRequestsTable(db);
  const existing = getAyrovixReviewForAdmin(db, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const resolved = ['QUOTED', 'REJECTED', 'CANCELLED'].includes(input.status);
  db.run(`UPDATE ayrovix_review_requests SET
    status=?,quoted_price=?,quoted_currency=?,verified_variant=?,verified_url=?,customer_message=?,admin_note=?,
    resolved_by=?,resolved_at=?,updated_at=? WHERE id=?`,
  input.status, input.quotedPrice ?? null, input.quotedCurrency || null, input.verifiedVariant || '', input.verifiedUrl || '',
  input.customerMessage || '', input.adminNote || '', input.status === 'PENDING' ? null : input.adminId, resolved ? now : null, now, id);
  return getAyrovixReviewForAdmin(db, id);
}
