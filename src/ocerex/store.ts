import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import type { OcerexDecision } from './types';

const TTL_MS = 24 * 60 * 60_000;
let ensured = false;

export interface OcerexExtractionRow {
  id: string;
  session_id: string;
  account_id: string | null;
  screen_type: string;
  reference_price: number | null;
  currency: string | null;
  confidence: number;
  confidence_level: string;
  price_context: string | null;
  ayrovi_price_tnd: number | null;
  pricing_version: number | null;
  source_url: string;
  product_title: string;
  platform: string;
  cart_item_id: string | null;
  order_id: string | null;
  order_item_id: string | null;
  status: string;
  code: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export function ensureOcerexStore(db: QatafoDatabase): void {
  if (ensured) return;
  db.run(`CREATE TABLE IF NOT EXISTS ocerex_extractions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    account_id TEXT,
    screen_type TEXT NOT NULL,
    reference_price REAL,
    currency TEXT,
    confidence REAL NOT NULL,
    confidence_level TEXT NOT NULL,
    price_context TEXT,
    ayrovi_price_tnd REAL,
    pricing_version INTEGER,
    source_url TEXT NOT NULL DEFAULT '',
    product_title TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT '',
    cart_item_id TEXT,
    order_id TEXT,
    order_item_id TEXT,
    status TEXT NOT NULL,
    code TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_ocerex_extractions_session ON ocerex_extractions(session_id, created_at)');
  ensured = true;
}

export function resetOcerexStoreForTests(): void {
  ensured = false;
}

function metadataFor(decision: OcerexDecision): string {
  return JSON.stringify({
    source: 'OCR',
    findings: decision.findings.slice(0, 24).map((item) => ({
      value: item.value,
      currency: item.currency,
      semanticType: item.semanticType,
      struck: item.struck,
      confidence: item.confidence,
    })),
  });
}

export function saveOcerexExtraction(
  db: QatafoDatabase,
  input: { sessionId: string; accountId?: string | null; decision: OcerexDecision },
): OcerexExtractionRow {
  ensureOcerexStore(db);
  const now = new Date().toISOString();
  const id = `ocx_${randomUUID()}`;
  db.run(`INSERT INTO ocerex_extractions (
    id,session_id,account_id,screen_type,reference_price,currency,confidence,confidence_level,price_context,
    ayrovi_price_tnd,pricing_version,source_url,product_title,platform,cart_item_id,order_id,order_item_id,
    status,code,metadata_json,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  id, input.sessionId, input.accountId || null, input.decision.type, input.decision.referencePrice, input.decision.currency,
  input.decision.confidence, input.decision.confidenceLevel, input.decision.priceContext, null, null, '',
  input.decision.productTitle || '', '', null, null, null, 'ANALYZED', input.decision.code, metadataFor(input.decision), now, now);
  return getOcerexExtraction(db, id, input.sessionId)!;
}

export function getOcerexExtraction(db: QatafoDatabase, id: string, sessionId: string): OcerexExtractionRow | null {
  ensureOcerexStore(db);
  if (!/^ocx_[0-9a-f-]{16,80}$/i.test(id)) return null;
  const row = db.get<OcerexExtractionRow>('SELECT * FROM ocerex_extractions WHERE id=? AND session_id=?', id, sessionId);
  if (!row) return null;
  if (Date.now() - Date.parse(row.created_at) > TTL_MS) return null;
  return row;
}

export function updateOcerexExtraction(
  db: QatafoDatabase,
  id: string,
  sessionId: string,
  patch: Partial<Pick<OcerexExtractionRow, 'currency' | 'ayrovi_price_tnd' | 'pricing_version' | 'source_url' | 'product_title' | 'platform' | 'cart_item_id' | 'order_id' | 'order_item_id' | 'status' | 'code' | 'account_id' | 'reference_price'>>,
): OcerexExtractionRow | null {
  const current = getOcerexExtraction(db, id, sessionId);
  if (!current) return null;
  const next = { ...current, ...patch, updated_at: new Date().toISOString() };
  db.run(`UPDATE ocerex_extractions SET account_id=?,currency=?,reference_price=?,ayrovi_price_tnd=?,pricing_version=?,source_url=?,product_title=?,platform=?,cart_item_id=?,order_id=?,order_item_id=?,status=?,code=?,updated_at=? WHERE id=? AND session_id=?`,
    next.account_id, next.currency, next.reference_price, next.ayrovi_price_tnd, next.pricing_version, next.source_url,
    next.product_title, next.platform, next.cart_item_id, next.order_id, next.order_item_id, next.status, next.code, next.updated_at, id, sessionId);
  return getOcerexExtraction(db, id, sessionId);
}

/** After the existing checkout creates the order, attach the extraction the cart line came from. */
export function attachOcerexExtractionsToOrder(db: QatafoDatabase, sessionId: string, accountId: string, orderId: string): number {
  ensureOcerexStore(db);
  const items = db.all<any>('SELECT id,source_url,original_price,currency,total_tnd,pricing_snapshot FROM order_items WHERE order_id=?', orderId);
  let linked = 0;
  for (const item of items) {
    const extraction = db.get<OcerexExtractionRow>(
      `SELECT * FROM ocerex_extractions
       WHERE order_id IS NULL AND source_url=? AND currency=? AND ABS(IFNULL(reference_price,0) - ?) < 0.02
         AND (session_id=? OR account_id=?)
       ORDER BY created_at DESC LIMIT 1`,
      item.source_url, item.currency, Number(item.original_price), sessionId, accountId,
    );
    if (!extraction) continue;
    let pricingVersion = extraction.pricing_version;
    try { pricingVersion = JSON.parse(item.pricing_snapshot || '{}').pricingVersion ?? pricingVersion; } catch { /* snapshot remains the engine copy on the order item */ }
    const now = new Date().toISOString();
    db.run(`UPDATE ocerex_extractions SET order_id=?,order_item_id=?,account_id=?,ayrovi_price_tnd=?,pricing_version=?,status='ORDERED',updated_at=? WHERE id=?`,
      orderId, item.id, accountId, Number(item.total_tnd), pricingVersion, now, extraction.id);
    db.run('UPDATE order_items SET ocerex_extraction_id=? WHERE id=?', extraction.id, item.id);
    linked += 1;
  }
  return linked;
}
