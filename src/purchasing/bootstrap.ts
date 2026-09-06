/**
 * AYROVI Purchasing (P2.3) — schéma + amorçage.
 *
 * Règles appliquées (mêmes leçons que P1/P2.1/P2.2, aucun raccourci) :
 *  • additif uniquement : `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.
 *  Aucune table existante n'est modifiée, et en particulier AUCUNE table du CRM
 *  (`crm_arrivals` reste telle quelle) : le lien commande ↔ arrivage est porté par mes
 *  propres colonnes, avec `ON DELETE SET NULL` pour qu'un arrivage supprimé côté CRM ne
 *  casse jamais une commande d'achat ;
 *  • DDL multi-instructions via `db.runSchema()` ;
 *  • idempotent : base fraîche, base existante et re-boot aboutissent à la même forme ;
 *  • rien de calculé n'est stocké : les totaux d'une commande et les quantités déjà reçues
 *  sont des lectures sur `goods_receipt_lines` (une seule source de vérité), jamais des
 *  colonnes que deux écritures pourraient désynchroniser ;
 *  • numérotation depuis `erp_sequences`, permissions depuis `erp_role_permissions`, audit
 *  depuis `writeAuditEvent` : le module n'installe aucun second système.
 */
import type { QatafoDatabase } from '../db/database';
import { ensureSequencesSchema } from '../erp-core/sequences';
import { PURCHASE_CURRENCIES, PO_STATUSES, RECEIPT_QUALITIES, RECEIPT_STATUSES, SUPPLIER_STATUSES } from './types';
import { seedPurchasingPermissions } from './permissions';

export const PURCHASING_SEQUENCES = [
  { key: 'supplier_code', prefix: 'SUP', padding: 4, yearScoped: 0, description: 'Identité fournisseur citable sur un bon de commande' },
  { key: 'purchase_order_number', prefix: 'PO', padding: 5, yearScoped: 1, description: 'Référence d’engagement vis-à-vis du fournisseur' },
  { key: 'goods_receipt_number', prefix: 'RCV', padding: 5, yearScoped: 1, description: 'Référence de réception rattachée aux mouvements de stock' },
] as const;

function quoteList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(',');
}

export const PURCHASING_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'TND' CHECK (currency IN (${quoteList(PURCHASE_CURRENCIES)})),
  payment_terms TEXT NOT NULL DEFAULT '',
  lead_time_days INTEGER NOT NULL DEFAULT 7 CHECK (lead_time_days BETWEEN 0 AND 3650),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (${quoteList(SUPPLIER_STATUSES)})),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
);
-- Deux fournisseurs au même nom (à la casse près) seraient deux fiches pour un seul
-- interlocuteur : l'unicité est une règle de base, pas une vérification d'écran.
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_name_unique ON suppliers(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (${quoteList(PO_STATUSES)})),
  currency TEXT NOT NULL DEFAULT 'TND' CHECK (currency IN (${quoteList(PURCHASE_CURRENCIES)})),
  exchange_rate REAL NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  note TEXT NOT NULL DEFAULT '',
  -- Lien additif vers l'arrivage CRM : aucune colonne n'a été ajoutée côté CRM.
  arrival_id TEXT REFERENCES crm_arrivals(id) ON DELETE SET NULL,
  requested_by TEXT,
  requested_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  cancelled_by TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_arrival ON purchase_orders(arrival_id);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES catalogue_variants(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0 AND quantity_ordered <= 100000),
  unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0 AND unit_cost <= 1000000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_po_line_order ON purchase_order_lines(purchase_order_id, created_at);
-- Un produit (ou produit+variante) ne se commande pas deux fois dans la même commande : sans
-- cette contrainte, la réception devrait additionner des lignes à la main — et une colonne NULL
-- dans un UNIQUE ne protège rien, d'où l'index d'expression avec COALESCE (leçon P2.1/P2.2).
CREATE UNIQUE INDEX IF NOT EXISTS idx_po_line_product_unique
  ON purchase_order_lines(purchase_order_id, product_id, COALESCE(variant_id,''));
CREATE INDEX IF NOT EXISTS idx_po_line_product ON purchase_order_lines(product_id);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  arrival_id TEXT REFERENCES crm_arrivals(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (${quoteList(RECEIPT_STATUSES)})),
  location TEXT NOT NULL DEFAULT 'MAIN',
  note TEXT NOT NULL DEFAULT '',
  received_at TEXT,
  posted_at TEXT,
  posted_by TEXT,
  discard_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_order ON goods_receipts(purchase_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_status ON goods_receipts(status, created_at DESC);

CREATE TABLE IF NOT EXISTS goods_receipt_lines (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id TEXT NOT NULL REFERENCES purchase_order_lines(id) ON DELETE RESTRICT,
  product_id TEXT REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 100000),
  quality TEXT NOT NULL DEFAULT 'GOOD' CHECK (quality IN (${quoteList(RECEIPT_QUALITIES)})),
  quality_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_receipt_line_parent ON goods_receipt_lines(receipt_id);
-- Une ligne de commande ne se réceptionne qu'une fois par qualité dans un même bon : deux lignes
-- « GOOD » pour la même ligne commande seraient deux entrées comptables pour un seul carton.
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_line_unique
  ON goods_receipt_lines(receipt_id, purchase_order_line_id, quality);
CREATE INDEX IF NOT EXISTS idx_receipt_line_po_line ON goods_receipt_lines(purchase_order_line_id);
`;

/** DDL + lignes de numérotation. Appelé par le constructeur, par les tests et par le routeur. */
export function ensurePurchasingSchema(db: QatafoDatabase): void {
  db.runSchema(PURCHASING_SCHEMA_SQL);
  ensureSequencesSchema(db);
  const now = new Date().toISOString();
  for (const sequence of PURCHASING_SEQUENCES) {
    db.run(`INSERT OR IGNORE INTO erp_sequences (sequence_key,prefix,year_scoped,next_value,padding,description,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`, sequence.key, sequence.prefix, sequence.yearScoped, 1, sequence.padding, sequence.description, now, now);
  }
}

export interface PurchasingBootReport {
  tablesReady: number;
  grantsSeeded: number;
  sequencesReady: number;
}

/** L'amorçage ne fabrique jamais de contenu métier : tables, numérotation, droits. */
export function bootstrapPurchasing(db: QatafoDatabase): PurchasingBootReport {
  ensurePurchasingSchema(db);
  const { seeded } = seedPurchasingPermissions(db);
  const tablesReady = db.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN
      ('suppliers','purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines')`,
  ).length;
  const sequencesReady = db.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM erp_sequences WHERE sequence_key IN ('supplier_code','purchase_order_number','goods_receipt_number')`,
  )[0]?.n ?? 0;
  return { tablesReady: Number(tablesReady), grantsSeeded: Number(seeded), sequencesReady: Number(sequencesReady) };
}
