/**
 * AYROVI Inventory (P2.2) — schéma + amorçage.
 *
 * Règles que ce fichier respecte (leçons déjà payées en P1/P2.1) :
 *  • additif uniquement : `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
 *  Aucune table existante n'est renommée, allégée ou réécrite — et surtout `products`
 *  ne reçoit AUCUNE colonne de quantité : la fiche produit n'est pas l'état du stock ;
 *  • le DDL multi-instructions passe par `db.runSchema()` (`db.run()` = une seule
 *  instruction, c'est exactement le piège qui a créé une seule table en P1) ;
 *  • idempotent : base fraîche, base existante et redémarrage répétitif aboutissent à la
 *  même forme (vérifié dans tests/inventory-foundation.test.ts) ;
 *  • l'identité, la numérotation, les permissions et l'audit viennent d'ERP Core
 *  (`erp_sequences`, `erp_role_permissions`, `writeAuditEvent`) — jamais d'un second
 *  système local au module.
 *
 * Les quantités vivent dans `inventory_stock_items` ; les mouvements dans
 * `inventory_stock_movements`, journal append-only où une erreur se corrige par un
 * mouvement de plus, jamais par un UPDATE.
 */
import type { QatafoDatabase } from '../db/database';
import { ensureSequencesSchema } from '../erp-core/sequences';
import { MOVEMENT_DIRECTIONS, MOVEMENT_REASONS, STOCKTAKE_STATUSES } from './types';
import { seedInventoryPermissions } from './permissions';

/** Numérotation interne du module, dans la table partagée (pas de générateur local). */
export const INVENTORY_SEQUENCES = [
  { key: 'stocktake_code', prefix: 'STK', padding: 5, yearScoped: 1, description: 'Référence d’inventaire physique citable' },
] as const;

function quoteList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(',');
}

export const INVENTORY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS inventory_stock_items (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES catalogue_variants(id) ON DELETE SET NULL,
  location TEXT NOT NULL DEFAULT 'MAIN',
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reorder_point INTEGER NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  last_movement_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
);
-- Une ligne par (produit, variante, emplacement). La variante est optionnelle, donc
-- l'unicité passe par un index d'expression : en SQL, deux NULL ne sont jamais égaux,
-- et un UNIQUE (…, variant_id, …) aurait laissé créer deux lignes « sans variante ».
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_item_identity
  ON inventory_stock_items(product_id, COALESCE(variant_id, ''), location COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_inventory_item_location ON inventory_stock_items(location, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_inventory_item_product ON inventory_stock_items(product_id, status);
CREATE TABLE IF NOT EXISTS inventory_stocktakes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  location TEXT NOT NULL DEFAULT 'MAIN',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (${quoteList(STOCKTAKE_STATUSES)})),
  note TEXT NOT NULL DEFAULT '',
  started_at TEXT,
  submitted_at TEXT,
  decided_at TEXT,
  created_by TEXT,
  decided_by TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_stocktake_status ON inventory_stocktakes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_stocktake_location ON inventory_stocktakes(location, status);
CREATE TABLE IF NOT EXISTS inventory_stock_movements (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES inventory_stock_items(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES catalogue_variants(id) ON DELETE SET NULL,
  location TEXT NOT NULL DEFAULT 'MAIN',
  direction TEXT NOT NULL CHECK (direction IN (${quoteList(MOVEMENT_DIRECTIONS)})),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  signed_quantity INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (${quoteList(MOVEMENT_REASONS)})),
  note TEXT NOT NULL DEFAULT '',
  reference_type TEXT,
  reference_id TEXT,
  stocktake_id TEXT REFERENCES inventory_stocktakes(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  performed_by TEXT,
  performed_by_employee_id TEXT,
  created_at TEXT NOT NULL
);
-- Un double-clic ne doit pas créer deux réceptions : la clé d'idempotence est unique
-- quand elle est fournie (les NULL restent multiples, comme pour les mouvements libres).
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movement_idempotency
  ON inventory_stock_movements(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movement_item ON inventory_stock_movements(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_product ON inventory_stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_stocktake ON inventory_stock_movements(stocktake_id);
CREATE TABLE IF NOT EXISTS inventory_stocktake_lines (
  id TEXT PRIMARY KEY,
  stocktake_id TEXT NOT NULL REFERENCES inventory_stocktakes(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES inventory_stock_items(id) ON DELETE RESTRICT,
  expected_quantity INTEGER NOT NULL,
  counted_quantity INTEGER CHECK (counted_quantity IS NULL OR counted_quantity >= 0),
  variance INTEGER NOT NULL DEFAULT 0,
  comment TEXT NOT NULL DEFAULT '',
  counted_at TEXT,
  counted_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (stocktake_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_stocktake_line_parent ON inventory_stocktake_lines(stocktake_id, variance);
`;

/**
 * DDL idempotent + lignes de numérotation. Appelé par le constructeur de base, par les
 * tests et par le routeur au premier passage : qui que ce soit qui tienne la base, il
 * obtient la même forme.
 */
export function ensureInventorySchema(db: QatafoDatabase): void {
  // Ordre de création : les parents (`inventory_stocktakes`) avant ceux qui les référencent
  // (`inventory_stock_movements.stocktake_id`), pour qu'une base fraîche n'ait jamais à
  // résoudre une clé étrangère vers une table pas encore créée.
  db.runSchema(INVENTORY_SCHEMA_SQL);
  ensureSequencesSchema(db);
  const now = new Date().toISOString();
  for (const sequence of INVENTORY_SEQUENCES) {
    db.run(`INSERT OR IGNORE INTO erp_sequences (sequence_key,prefix,year_scoped,next_value,padding,description,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`, sequence.key, sequence.prefix, sequence.yearScoped, 1, sequence.padding, sequence.description, now, now);
  }
}

export interface InventoryBootReport {
  tablesReady: number;
  grantsSeeded: number;
  sequencesReady: number;
  movementReasons: number;
}

/** Les permissions sont des données ; l'amorçage ne fabrique jamais de contenu de stock. */
export function bootstrapInventory(db: QatafoDatabase): InventoryBootReport {
  ensureInventorySchema(db);
  const { seeded } = seedInventoryPermissions(db);
  const tablesReady = db.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN
      ('inventory_stock_items','inventory_stock_movements','inventory_stocktakes','inventory_stocktake_lines')`,
  ).length;
  const sequencesReady = db.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM erp_sequences WHERE sequence_key='stocktake_code'`,
  )[0]?.n ?? 0;
  return {
    tablesReady: Number(tablesReady),
    grantsSeeded: Number(seeded),
    sequencesReady: Number(sequencesReady),
    movementReasons: MOVEMENT_REASONS.length,
  };
}
