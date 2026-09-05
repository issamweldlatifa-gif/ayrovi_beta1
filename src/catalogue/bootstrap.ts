/**
 * AYROVI Catalogue (P2.1) — schema + bootstrap.
 *
 * Database rules this file obeys (lessons already paid for in P1):
 *   • additive only: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
 *     `ALTER TABLE … ADD COLUMN` on a column that is missing. Nothing is renamed,
 *     dropped or rewritten — the existing `products`/`brands` rows and every consumer
 *     of them (storefront, cart, promotions, AI search, order_items) keep working;
 *   • multi-statement DDL goes through `db.runSchema()` (`db.run()` is
 *     `prepare().run()`, i.e. ONE statement only — that silently created a single table
 *     in P1 and is exactly what this phase must not reintroduce);
 *   • idempotent: a fresh database, an existing database and a repeated boot all end in
 *     the same shape (asserted in tests/catalogue-foundation.test.ts);
 *   • ERP Core is reused, never duplicated: numbering from `erp_sequences`, grants from
 *     `erp_role_permissions`, audit from `writeAuditEvent`, events derived by that writer.
 *
 * `products` gains (all NULLable, so no existing row is rewritten):
 *   product_code (PRD-nnnnnn, unique), slug (unique), category_id (FK), product_type,
 *   created_by / updated_by (admin_users ids, for audit attribution).
 * A variant — not the product — carries the SKU, because a product is not the unit.
 */
import type { QatafoDatabase } from '../db/database';
import { ensureSequencesSchema } from '../erp-core/sequences';
import { seedCataloguePermissions } from './permissions';

/** Catalogue numbering, inside the shared sequence table (no second generator). */
export const CATALOGUE_SEQUENCES = [
  { key: 'product_code', prefix: 'PRD', padding: 6, yearScoped: 0, description: 'Code produit lisible, référencé par les autres modules' },
  { key: 'variant_sku', prefix: 'SKU', padding: 6, yearScoped: 0, description: 'SKU généré quand le catalogueur n’en impose pas un' },
] as const;

export const CATALOGUE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS catalogue_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id TEXT REFERENCES catalogue_categories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_catalogue_categories_parent ON catalogue_categories(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_catalogue_categories_status ON catalogue_categories(status, sort_order);

CREATE TABLE IF NOT EXISTS catalogue_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  barcode TEXT,
  size TEXT,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_catalogue_variants_product ON catalogue_variants(product_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogue_variants_sku ON catalogue_variants(sku COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS catalogue_media (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id TEXT REFERENCES catalogue_variants(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL DEFAULT 'IMAGE' CHECK (media_type IN ('IMAGE','VIDEO','DOCUMENT')),
  url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_catalogue_media_product ON catalogue_media(product_id, is_primary DESC, sort_order);
CREATE INDEX IF NOT EXISTS idx_catalogue_media_variant ON catalogue_media(variant_id, sort_order);

CREATE TABLE IF NOT EXISTS catalogue_attributes (
  id TEXT PRIMARY KEY,
  attribute_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'TEXT' CHECK (data_type IN ('TEXT','NUMBER','BOOLEAN','SELECT')),
  applies_to TEXT NOT NULL DEFAULT 'variant' CHECK (applies_to IN ('product','variant')),
  options TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalogue_attribute_values (
  id TEXT PRIMARY KEY,
  attribute_key TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id TEXT REFERENCES catalogue_variants(id) ON DELETE CASCADE,
  value_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (attribute_key, product_id, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_catalogue_attr_values_product ON catalogue_attribute_values(product_id);
`;

/** NULLable additions to `products`: no existing row is rewritten by them. */
const PRODUCT_COLUMN_ADDITIONS: Array<[string, string]> = [
  ['product_code', 'TEXT'],
  ['slug', 'TEXT'],
  ['category_id', 'TEXT'],
  ['product_type', "TEXT NOT NULL DEFAULT 'STANDARD'"],
  ['created_by', 'TEXT'],
  ['updated_by', 'TEXT'],
];

/** `brands` is already the canonical brand entity; it only lacked a URL identity. */
const BRAND_COLUMN_ADDITIONS: Array<[string, string]> = [['slug', 'TEXT']];

function hasColumn(db: QatafoDatabase, table: string, column: string): boolean {
  return db.all<{ name: string }>(`PRAGMA table_info(${table})`).some((row) => row.name === column);
}

/**
 * Idempotent DDL + numbering rows. Safe from the database constructor, from a test or
 * from the router: whoever holds the database gets the same catalogue shape, which is
 * what makes "fresh DB / existing DB / repeated init" land in the same place.
 */
export function ensureCatalogueSchema(db: QatafoDatabase): CatalogueIndexReport {
  db.runSchema(CATALOGUE_SCHEMA_SQL);
  for (const [column, ddl] of PRODUCT_COLUMN_ADDITIONS) {
    if (hasColumn(db, 'products', column)) continue;
    db.run(`ALTER TABLE products ADD COLUMN ${column} ${ddl}`);
  }
  for (const [column, ddl] of BRAND_COLUMN_ADDITIONS) {
    if (hasColumn(db, 'brands', column)) continue;
    db.run(`ALTER TABLE brands ADD COLUMN ${column} ${ddl}`);
  }
  // Unique indexes after the columns exist (SQLite would refuse them otherwise), and
  // partial (`WHERE … IS NOT NULL`) so legacy rows without a code/slug cannot collide
  // with each other before they are ever catalogued.
  db.runSchema(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_product_code_unique ON products(product_code COLLATE NOCASE) WHERE product_code IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug_unique ON products(slug COLLATE NOCASE) WHERE slug IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_slug_unique ON brands(slug COLLATE NOCASE) WHERE slug IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogue_categories_slug_unique ON catalogue_categories(slug COLLATE NOCASE);
  `);
  const indexes = rebuildSlugIndexesCaseInsensitive(db);
  ensureSequencesSchema(db);
  const now = new Date().toISOString();
  for (const sequence of CATALOGUE_SEQUENCES) {
    db.run(`INSERT OR IGNORE INTO erp_sequences (sequence_key,prefix,year_scoped,next_value,padding,description,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`, sequence.key, sequence.prefix, sequence.yearScoped, 1, sequence.padding, sequence.description, now, now);
  }
  return indexes;
}

/**
 * Slug identity is URL identity, and URLs do not care about case: `Baskets` and `baskets`
 * would be two products fighting for one address. The catalogue API only ever writes
 * lowercase slugs (slugify / explicitSlug), so this changes no user-facing behaviour — it
 * is the database refusing what another writer could still do.
 *
 * Idempotent and data-safe: an index is a lookup structure, never a row. A previously
 * created index whose definition lacks NOCASE is dropped and rebuilt over the same column;
 * nothing here reads, rewrites or removes catalogue data.
 */
const CASE_INSENSITIVE_SLUG_INDEXES: Array<[string, string]> = [
  ['idx_products_product_code_unique', 'CREATE UNIQUE INDEX idx_products_product_code_unique ON products(product_code COLLATE NOCASE) WHERE product_code IS NOT NULL'],
  ['idx_products_slug_unique', 'CREATE UNIQUE INDEX idx_products_slug_unique ON products(slug COLLATE NOCASE) WHERE slug IS NOT NULL'],
  ['idx_brands_slug_unique', 'CREATE UNIQUE INDEX idx_brands_slug_unique ON brands(slug COLLATE NOCASE) WHERE slug IS NOT NULL'],
  ['idx_catalogue_categories_slug_unique', 'CREATE UNIQUE INDEX idx_catalogue_categories_slug_unique ON catalogue_categories(slug COLLATE NOCASE)'],
];

export interface CatalogueIndexReport {
  rebuilt: number;
  warnings: string[];
}

function rebuildSlugIndexesCaseInsensitive(db: QatafoDatabase): CatalogueIndexReport {
  const report: CatalogueIndexReport = { rebuilt: 0, warnings: [] };
  for (const [name, ddl] of CASE_INSENSITIVE_SLUG_INDEXES) {
    const existing = db.get<{ sql: string }>(`SELECT sql FROM sqlite_master WHERE type='index' AND name=?`, name);
    if (!existing) continue; // absent → the CREATE above will make it
    const previous = String(existing.sql || '');
    if (/COLLATE NOCASE/i.test(previous)) continue; // already strong enough
    db.run(`DROP INDEX IF EXISTS ${name}`);
    try {
      db.run(ddl);
      report.rebuilt += 1;
    } catch (error: any) {
      // If the data itself refuses the stricter index (two rows differing only by case),
      // the previous guarantee is restored rather than left dropped, and the incident is
      // reported through /catalogue/health instead of silently weakening the constraint.
      try { db.run(previous); } catch { /* keep the warning either way */ }
      report.warnings.push(`${name}: ${String(error?.message || error).slice(0, 120)}`);
    }
  }
  return report;
}

export interface CatalogueBootReport {
  grantsSeeded: number;
  sequencesReady: number;
  slugIndexesCaseInsensitive: number;
  indexWarnings: string[];
}

/** Grants are data; a boot never fabricates catalogue content. */
export function bootstrapCatalogue(db: QatafoDatabase): CatalogueBootReport {
  const indexes = ensureCatalogueSchema(db);
  const { seeded } = seedCataloguePermissions(db);
  const sequencesReady = db.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM erp_sequences WHERE sequence_key IN ('product_code','variant_sku')`,
  )[0]?.n ?? 0;
  return {
    grantsSeeded: seeded, sequencesReady: Number(sequencesReady),
    slugIndexesCaseInsensitive: indexes.rebuilt, indexWarnings: indexes.warnings,
  };
}
