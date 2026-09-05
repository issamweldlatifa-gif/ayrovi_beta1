import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { randomInt, randomUUID } from 'node:crypto';
import { CartItem, AddToCartRequest } from '../types';
import { calculatePrice, DEFAULT_CUSTOMS_CATEGORIES, orderLocalDelivery, PricingRules } from '../services/pricing';
import { seedArrivalStores } from '../arrival-ingestion/storeProfiles';
import { ensureErpCoreSchema } from '../erp-core/bootstrap';
import { ensureCatalogueSchema } from '../catalogue/bootstrap';

export type PaymentMethodCode = 'PENDING_SELECTION' | 'COD' | 'D17' | 'FLOUCI' | 'CARD' | 'BANK_TRANSFER' | 'POSTE';
export type DepositStatus = 'NONE' | 'PENDING' | 'SUBMITTED' | 'PAID' | 'REJECTED';

export interface CheckoutInput {
  name: string;
  email: string;
  phone: string;
  governorate: string;
  address: string;
  paymentMethod: PaymentMethodCode;
  latitude: number | null;
  longitude: number | null;
  termsAcceptedAt: string;
  locale: 'fr-TN' | 'ar-TN';
}

function normalizeCustomerPhone(value: unknown): string {
  return String(value || '').replace(/\D/g, '')
    .replace(/^00216(?=\d{8}$)/, '')
    .replace(/^216(?=\d{8}$)/, '');
}

// مخططات الجداول المشتركة بين الإنشاء الأولي والترقيات (أعدها في مكان واحد فقط)
const ORDERS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'OTHER' CHECK(source IN ('SHEIN','AMAZON','TEMU','ALIEXPRESS','OTHER','MIXED')),
  arrival_id TEXT REFERENCES arrivals(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK(status IN ('CREATED','AWAITING_DEPOSIT','AWAITING_PAYMENT_VERIFICATION','CONFIRMED','PREPARING','SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','CANCELLED')),
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(payment_status IN ('PENDING','PENDING_VERIFICATION','PAID','PARTIALLY_PAID','FAILED','REJECTED','REFUNDED')),
  payment_method TEXT NOT NULL DEFAULT 'PENDING_SELECTION' CHECK(payment_method IN ('PENDING_SELECTION','COD','D17','FLOUCI','CARD','BANK_TRANSFER','POSTE')),
  deposit_percent REAL NOT NULL DEFAULT 20,
  deposit_amount_tnd REAL NOT NULL DEFAULT 0,
  deposit_discount_tnd REAL NOT NULL DEFAULT 0,
  deposit_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(deposit_status IN ('NONE','PENDING','SUBMITTED','PAID','REJECTED')),
  deposit_proof_path TEXT NOT NULL DEFAULT '',
  deposit_submitted_at TEXT,
  deposit_paid_at TEXT,
  deposit_reviewed_by TEXT,
  deposit_review_note TEXT NOT NULL DEFAULT '',
  tracking_code TEXT NOT NULL DEFAULT '',
  invoice_number TEXT NOT NULL DEFAULT '',
  invoice_path TEXT NOT NULL DEFAULT '',
  subtotal_tnd REAL NOT NULL,
  customs_tnd REAL NOT NULL DEFAULT 0,
  shipping_tnd REAL NOT NULL DEFAULT 0,
  service_tnd REAL NOT NULL DEFAULT 0,
  express_tnd REAL NOT NULL DEFAULT 0,
  discount_tnd REAL NOT NULL DEFAULT 0,
  total_tnd REAL NOT NULL,
  pricing_snapshot TEXT NOT NULL,
  governorate TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  contact_email TEXT NOT NULL DEFAULT '',
  delivery_latitude REAL,
  delivery_longitude REAL,
  terms_accepted_at TEXT,
  locale TEXT NOT NULL DEFAULT 'fr-TN',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

const ORDERS_INDEXES_SQL = [
  'CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status, created_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_orders_deposit ON orders(deposit_status, created_at DESC);',
];

const SETTINGS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('GENERAL','COMMERCE','DELIVERY','PAYMENT','CHANNELS','DESIGN','INTERFACE')),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'STRING' CHECK(value_type IN ('STRING','NUMBER','BOOLEAN','JSON')),
  label TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);`;

const ANNOUNCEMENT_MESSAGES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS announcement_messages (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

const HERO_VISUALS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS hero_visuals (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL DEFAULT '',
  image_width INTEGER NOT NULL DEFAULT 0,
  image_height INTEGER NOT NULL DEFAULT 0,
  mobile_image_url TEXT NOT NULL DEFAULT '',
  alt_text TEXT NOT NULL DEFAULT '',
  focal_x REAL NOT NULL DEFAULT 0.5,
  focal_y REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  start_date TEXT,
  end_date TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);`;

const PAYMENTS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  payment_number TEXT,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'PENDING_SELECTION' CHECK(method IN ('PENDING_SELECTION','COD','D17','FLOUCI','CARD','BANK_TRANSFER','POSTE')),
  status TEXT NOT NULL CHECK(status IN ('PENDING','PENDING_VERIFICATION','PAID','PARTIALLY_PAID','FAILED','REJECTED','REFUNDED')),
  amount_tnd REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TND',
  reference TEXT,
  provider TEXT NOT NULL DEFAULT '',
  gateway_payment_ref TEXT,
  confirmed_by TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

const DELIVERIES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  governorate TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PREPARING','SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','FAILED','RETURNED')),
  expected_at TEXT,
  shipped_at TEXT,
  delivered_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  carrier TEXT NOT NULL DEFAULT '',
  tracking_number TEXT NOT NULL DEFAULT '',
  tracking_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

const CUSTOMER_NOTIFICATIONS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS customer_notifications (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'GENERAL' CHECK(type IN ('GENERAL','ORDER','ACCOUNT','PROMOTION','PAYMENT','PROOF','SHIPPING','INVOICE')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL
);`;

const CUSTOMER_AUTH_IDENTITIES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS customer_auth_identities (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('PHONE','GOOGLE','FACEBOOK','APPLE')),
  provider_subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(provider, provider_subject)
);`;

const CUSTOMER_OAUTH_STATES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS customer_oauth_states (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'GOOGLE' CHECK(provider IN ('GOOGLE','FACEBOOK','APPLE')),
  cart_session_id TEXT NOT NULL DEFAULT '',
  return_to TEXT NOT NULL DEFAULT '/',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);`;

export class QatafoDatabase {
  private db: Database.Database;
  private readonly databasePath: string;
  private arrivalMultistoreMigrationRequired = false;
  private arrivalMultistoreBackupFile: string | null = null;

  constructor(dbPath?: string) {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const resolvedPath = dbPath || path.join(dataDir, 'qatafo.sqlite');
    this.databasePath = resolvedPath;
    const existingDatabase = resolvedPath !== ':memory:' && fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).size > 0;
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.backupBeforeArrivalMultistoreMigration(resolvedPath, existingDatabase);
    this.initSchema();
    this.initErpCoreSchema();
    this.initCatalogueSchema();
    this.seedCoreData();
  }

  /**
   * ERP Core foundation (module registry, single audit, identity, permissions,
   * events, notifications, sequences). Additive DDL only — every statement is
   * `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` or
   * `ALTER TABLE ... ADD COLUMN` on a missing column, so an existing database is
   * never rewritten, renamed or dropped. Required here (not only at server boot)
   * so any consumer of QatafoDatabase — including tests and background jobs —
   * finds the same schema.
   */
  /**
   * Catalogue foundation (P2.1): variants/SKU, category tree, media references, declared
   * attributes, plus the additive columns on `products`/`brands`. Same contract as the ERP
   * core block above: additive DDL only, idempotent, and a failure must never stop the
   * store from booting — it is logged and stays visible in the environment screen.
   */
  private initCatalogueSchema(): void {
    try {
      ensureCatalogueSchema(this);
    } catch (error: any) {
      console.error('[catalogue] schema initialization failed:', error?.message || error);
      console.error('[catalogue] variants, categories, media and attributes are unavailable until this is fixed');
    }
  }

  private initErpCoreSchema(): void {
    try {
      ensureErpCoreSchema(this);
    } catch (error: any) {
      // A foundation-table problem must never prevent the store from booting;
      // it is surfaced in the log and stays visible in /api/admin/core/environment.
      console.error('[erp-core] schema initialization failed:', error?.message || error);
      console.error('[erp-core] the foundation tables are incomplete — audit identity and permissions may be missing');
    }
  }

  /**
   * The multi-store migration is additive, but production rollback still needs
   * a byte-independent SQLite snapshot. VACUUM INTO runs synchronously before
   * any DDL and includes committed WAL content. If the snapshot cannot be
   * created or verified, startup fails closed and the migration is not run.
   */
  private backupBeforeArrivalMultistoreMigration(resolvedPath: string, existingDatabase: boolean): void {
    if (!existingDatabase || resolvedPath === ':memory:') return;
    const hasArrivalClients = this.db.prepare(
      "SELECT 1 present FROM sqlite_master WHERE type='table' AND name='crm_arrival_clients'",
    ).get();
    const hasClientStores = this.db.prepare(
      "SELECT 1 present FROM sqlite_master WHERE type='table' AND name='crm_arrival_client_stores'",
    ).get();
    if (!hasArrivalClients || hasClientStores) return;
    this.arrivalMultistoreMigrationRequired = true;

    const backupDirectory = path.join(path.dirname(path.resolve(resolvedPath)), 'backups');
    fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destination = path.join(backupDirectory, `pre-arrival-multistore-${timestamp}.sqlite`);
    const sqlPath = destination.replace(/'/g, "''");
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.db.exec(`VACUUM INTO '${sqlPath}'`);

    const verification = new Database(destination, { readonly: true, fileMustExist: true });
    try {
      const integrity = String(verification.pragma('integrity_check', { simple: true }) || '');
      if (integrity.toLowerCase() !== 'ok') throw new Error(`PRE_MIGRATION_BACKUP_INVALID:${integrity}`);
    } finally {
      verification.close();
    }
    fs.chmodSync(destination, 0o600);
    this.arrivalMultistoreBackupFile = path.basename(destination);
    console.info(`[database] verified pre-migration backup created: ${this.arrivalMultistoreBackupFile}`);
  }

  /**
   * A Render restart can occur after the additive table DDL is committed but
   * before the migration marker is persisted. Recover only our own pre-DDL
   * snapshots, and re-verify both integrity and legacy schema before trusting
   * one. This also makes concurrent startup converge on VERIFIED rather than
   * incorrectly recording NOT_REQUIRED.
   */
  private findVerifiedArrivalMultistoreBackup(appliedAt?: string): string | null {
    if (this.databasePath === ':memory:') return null;
    const backupDirectory = path.join(path.dirname(path.resolve(this.databasePath)), 'backups');
    if (!fs.existsSync(backupDirectory)) return null;
    const appliedAtMs = Date.parse(String(appliedAt || ''));
    const candidates = fs.readdirSync(backupDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^pre-arrival-multistore-.*\.sqlite$/.test(entry.name))
      .map((entry) => ({ name: entry.name, path: path.join(backupDirectory, entry.name) }))
      .sort((left, right) => fs.statSync(right.path).mtimeMs - fs.statSync(left.path).mtimeMs);

    const legacyClients = appliedAt
      ? this.all<any>(`SELECT id,arrival_id,customer_id,store_id,created_at FROM crm_arrival_clients
          WHERE created_at<=?`, appliedAt)
      : [];
    const legacyIdsByTable = appliedAt
      ? ['crm_arrival_sources', 'crm_extraction_jobs', 'crm_extracted_products'].map((table) => ({
        table,
        ids: this.all<any>(`SELECT id FROM ${table} WHERE created_at<=?`, appliedAt).map((row) => String(row.id)),
      }))
      : [];

    for (const candidate of candidates) {
      const stats = fs.statSync(candidate.path);
      // The snapshot is created synchronously before the marker. Allow a small
      // filesystem timestamp tolerance, but never adopt a later artifact.
      if (Number.isFinite(appliedAtMs) && stats.mtimeMs > appliedAtMs + 60_000) continue;
      let verification: Database.Database | null = null;
      try {
        verification = new Database(candidate.path, { readonly: true, fileMustExist: true });
        const integrity = String(verification.pragma('integrity_check', { simple: true }) || '');
        if (integrity.toLowerCase() !== 'ok') continue;
        const hasLegacyClients = verification.prepare(
          "SELECT 1 present FROM sqlite_master WHERE type='table' AND name='crm_arrival_clients'",
        ).get();
        const hasClientStores = verification.prepare(
          "SELECT 1 present FROM sqlite_master WHERE type='table' AND name='crm_arrival_client_stores'",
        ).get();
        if (!hasLegacyClients || hasClientStores) continue;

        const legacyClient = verification.prepare(
          'SELECT id,arrival_id,customer_id,store_id,created_at FROM crm_arrival_clients WHERE id=?',
        );
        const clientsMatch = legacyClients.every((current) => {
          const snapshot = legacyClient.get(current.id) as Record<string, unknown> | undefined;
          return snapshot
            && String(snapshot.arrival_id) === String(current.arrival_id)
            && String(snapshot.customer_id) === String(current.customer_id)
            && String(snapshot.store_id || '') === String(current.store_id || '')
            && String(snapshot.created_at) === String(current.created_at);
        });
        if (!clientsMatch) continue;

        const idsMatch = legacyIdsByTable.every(({ table, ids }) => {
          const tableExists = verification!.prepare(
            'SELECT 1 present FROM sqlite_master WHERE type=\'table\' AND name=?',
          ).get(table);
          if (!tableExists) return ids.length === 0;
          const findId = verification!.prepare(`SELECT 1 present FROM ${table} WHERE id=?`);
          return ids.every((id) => Boolean(findId.get(id)));
        });
        if (!idsMatch) continue;

        fs.chmodSync(candidate.path, 0o600);
        return candidate.name;
      } catch {
        // Ignore malformed/unrelated files; readiness remains unchanged unless
        // a snapshot passes every verification above.
      } finally {
        verification?.close();
      }
    }
    return null;
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS customer_accounts (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT '',
        email TEXT UNIQUE COLLATE NOCASE,
        phone TEXT UNIQUE,
        avatar_url TEXT NOT NULL DEFAULT '',
        email_verified_at TEXT,
        phone_verified_at TEXT,
        locale TEXT NOT NULL DEFAULT 'fr-TN',
        marketing_opt_in INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','BLOCKED','DELETED')),
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customer_accounts_phone ON customer_accounts(phone);
      CREATE INDEX IF NOT EXISTS idx_customer_accounts_email ON customer_accounts(email);

      CREATE TABLE IF NOT EXISTS cart_items (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        account_id TEXT REFERENCES customer_accounts(id) ON DELETE CASCADE,
        store TEXT NOT NULL,
        external_id TEXT,
        source_url TEXT NOT NULL,
        title TEXT NOT NULL,
        image_url TEXT,
        source_price REAL NOT NULL,
        source_currency TEXT NOT NULL,
        price_tnd REAL NOT NULL,
        variant TEXT,
        requested_size TEXT NOT NULL DEFAULT '',
        requested_color TEXT NOT NULL DEFAULT '',
        customer_note TEXT NOT NULL DEFAULT '',
        reference_url TEXT NOT NULL DEFAULT '',
        price_verification_status TEXT NOT NULL DEFAULT 'VERIFIED',
        quantity INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cart_session ON cart_items(session_id);

      CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN','ADMIN','CONTENT_MANAGER','ORDER_MANAGER')),
        active INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        csrf_token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS pricing_config (
        id TEXT PRIMARY KEY CHECK(id = 'default'),
        version INTEGER NOT NULL DEFAULT 1,
        rate_eur REAL NOT NULL,
        rate_usd REAL NOT NULL,
        rate_gbp REAL NOT NULL,
        rate_jpy REAL NOT NULL,
        customs_fee_percent REAL NOT NULL DEFAULT 0,
        shipping_fee_tnd REAL NOT NULL DEFAULT 25,
        service_fee_percent REAL NOT NULL DEFAULT 8,
        minimum_service_fee_tnd REAL NOT NULL DEFAULT 10,
        express_fee_tnd REAL NOT NULL DEFAULT 15,
        exchange_buffer_percent REAL NOT NULL DEFAULT 3,
        freight_per_kg_tnd REAL NOT NULL DEFAULT 13,
        local_delivery_tnd REAL NOT NULL DEFAULT 8,
        commission_percent REAL NOT NULL DEFAULT 10,
        minimum_commission_tnd REAL NOT NULL DEFAULT 0,
        rpd_percent REAL NOT NULL DEFAULT 3,
        rpd_minimum_tnd REAL NOT NULL DEFAULT 10,
        default_tva_rate REAL NOT NULL DEFAULT 0.19,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );
      CREATE TABLE IF NOT EXISTS customs_categories (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        keywords TEXT NOT NULL DEFAULT '[]',
        customs_rate REAL NOT NULL DEFAULT 0,
        tva_rate REAL NOT NULL DEFAULT 0.19,
        default_weight_kg REAL NOT NULL DEFAULT 0.5,
        status TEXT NOT NULL DEFAULT 'ALLOWED' CHECK(status IN ('ALLOWED','WARNING','RESTRICTED')),
        display_order INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS arrivals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('STANDARD','EXPRESS')),
        departure_at TEXT,
        expected_arrival_at TEXT NOT NULL,
        ends_at TEXT,
        description TEXT NOT NULL DEFAULT '',
        main_image TEXT NOT NULL DEFAULT '',
        secondary_images TEXT NOT NULL DEFAULT '[]',
        badge TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK(status IN ('DRAFT','SCHEDULED','ACTIVE','COMPLETED','ARCHIVED')),
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_arrivals_status_date ON arrivals(status, expected_arrival_at);

      -- Administration CRM Arrivals/Ingestion. This domain is intentionally
      -- separate from the public CMS arrivals table above.
      CREATE TABLE IF NOT EXISTS crm_schema_migrations (
        migration_key TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL,
        backup_status TEXT NOT NULL CHECK(backup_status IN ('VERIFIED','NOT_REQUIRED')),
        backup_file TEXT
      );
      CREATE TABLE IF NOT EXISTS crm_stores (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS crm_store_source_profiles (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES crm_stores(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL CHECK(source_type IN ('PDF','EMAIL','IMAGE','INVOICE')),
        strategy_key TEXT NOT NULL,
        extraction_hints TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(store_id, source_type)
      );
      CREATE TABLE IF NOT EXISTS crm_arrivals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PROCESSING','REVIEW','CONFIRMED')),
        confirmed_at TEXT,
        confirmed_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_crm_arrivals_status_date ON crm_arrivals(status, created_at DESC);
      CREATE TABLE IF NOT EXISTS crm_arrival_clients (
        id TEXT PRIMARY KEY,
        arrival_id TEXT NOT NULL REFERENCES crm_arrivals(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        store_id TEXT REFERENCES crm_stores(id) ON DELETE RESTRICT,
        display_alias TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(arrival_id, customer_id)
      );
      CREATE INDEX IF NOT EXISTS idx_crm_arrival_clients_arrival ON crm_arrival_clients(arrival_id, created_at);
      CREATE TABLE IF NOT EXISTS crm_arrival_client_stores (
        id TEXT PRIMARY KEY,
        arrival_client_id TEXT NOT NULL REFERENCES crm_arrival_clients(id) ON DELETE CASCADE,
        store_id TEXT NOT NULL REFERENCES crm_stores(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(arrival_client_id, store_id)
      );
      CREATE INDEX IF NOT EXISTS idx_crm_client_stores_client ON crm_arrival_client_stores(arrival_client_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_crm_client_stores_store ON crm_arrival_client_stores(store_id, created_at);
      CREATE TABLE IF NOT EXISTS crm_arrival_sources (
        id TEXT PRIMARY KEY,
        arrival_client_id TEXT NOT NULL REFERENCES crm_arrival_clients(id) ON DELETE CASCADE,
        arrival_client_store_id TEXT REFERENCES crm_arrival_client_stores(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL CHECK(source_type IN ('PDF','EMAIL','IMAGE','INVOICE')),
        original_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        source_hash TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        last_job_id TEXT REFERENCES crm_extraction_jobs(id) ON DELETE SET NULL,
        uploaded_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        UNIQUE(arrival_client_id, source_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_crm_sources_client_date ON crm_arrival_sources(arrival_client_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS crm_extraction_jobs (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES crm_arrival_sources(id) ON DELETE CASCADE,
        arrival_client_id TEXT NOT NULL REFERENCES crm_arrival_clients(id) ON DELETE CASCADE,
        arrival_client_store_id TEXT REFERENCES crm_arrival_client_stores(id) ON DELETE CASCADE,
        strategy_key TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('QUEUED','PROCESSING','COMPLETED','PARTIAL','FAILED')),
        progress_current INTEGER NOT NULL DEFAULT 0,
        progress_total INTEGER NOT NULL DEFAULT 0,
        products_extracted INTEGER NOT NULL DEFAULT 0,
        records_needing_review INTEGER NOT NULL DEFAULT 0,
        warning_codes TEXT NOT NULL DEFAULT '[]',
        error_code TEXT,
        error_message TEXT,
        retry_at TEXT,
        attempt INTEGER NOT NULL DEFAULT 1,
        started_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
        started_by_name TEXT NOT NULL DEFAULT 'Système',
        started_from_ip TEXT,
        started_at TEXT,
        worker_id TEXT,
        heartbeat_at TEXT,
        lease_expires_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_crm_jobs_source_date ON crm_extraction_jobs(source_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_crm_jobs_client_state ON crm_extraction_jobs(arrival_client_id, state);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_jobs_one_active_source
        ON crm_extraction_jobs(source_id) WHERE state IN ('QUEUED','PROCESSING');
      CREATE TABLE IF NOT EXISTS crm_extracted_products (
        id TEXT PRIMARY KEY,
        job_id TEXT REFERENCES crm_extraction_jobs(id) ON DELETE SET NULL,
        source_id TEXT NOT NULL REFERENCES crm_arrival_sources(id) ON DELETE CASCADE,
        arrival_client_id TEXT NOT NULL REFERENCES crm_arrival_clients(id) ON DELETE CASCADE,
        arrival_client_store_id TEXT REFERENCES crm_arrival_client_stores(id) ON DELETE CASCADE,
        arrival_id TEXT NOT NULL REFERENCES crm_arrivals(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        store_id TEXT NOT NULL REFERENCES crm_stores(id) ON DELETE RESTRICT,
        product_name TEXT,
        sku TEXT,
        reference TEXT,
        variant TEXT,
        color TEXT,
        quantity INTEGER,
        product_image_storage_key TEXT,
        source_type TEXT NOT NULL CHECK(source_type IN ('PDF','EMAIL','IMAGE','INVOICE')),
        source_reference TEXT NOT NULL,
        extraction_confidence REAL NOT NULL DEFAULT 0,
        extraction_status TEXT NOT NULL CHECK(extraction_status IN ('EXTRACTED','NEEDS_REVIEW','FAILED')),
        field_evidence TEXT NOT NULL DEFAULT '{}',
        source_specific TEXT NOT NULL DEFAULT '[]',
        raw_extracted TEXT NOT NULL DEFAULT '{}',
        review_reasons TEXT NOT NULL DEFAULT '[]',
        manual_edits TEXT NOT NULL DEFAULT '{}',
        approved_at TEXT,
        approved_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
        is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1)),
        superseded_at TEXT,
        superseded_by_job_id TEXT REFERENCES crm_extraction_jobs(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_crm_products_client_current ON crm_extracted_products(arrival_client_id, is_current, created_at);
      CREATE INDEX IF NOT EXISTS idx_crm_products_arrival_status ON crm_extracted_products(arrival_id, is_current, extraction_status);
      CREATE INDEX IF NOT EXISTS idx_crm_products_job ON crm_extracted_products(job_id);

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        image TEXT NOT NULL DEFAULT '',
        additional_images TEXT NOT NULL DEFAULT '[]',
        brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
        brand_name TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL DEFAULT '',
        source_platform TEXT NOT NULL CHECK(source_platform IN ('SHEIN','AMAZON','TEMU','ALIEXPRESS','OTHER')),
        original_price REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'EUR',
        converted_price REAL NOT NULL DEFAULT 0,
        customs_fee REAL NOT NULL DEFAULT 0,
        shipping_fee REAL NOT NULL DEFAULT 0,
        service_fee REAL NOT NULL DEFAULT 0,
        final_price REAL NOT NULL DEFAULT 0,
        express_available INTEGER NOT NULL DEFAULT 0,
        stock_status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(stock_status IN ('AVAILABLE','LIMITED','OUT_OF_STOCK')),
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','INACTIVE','ARCHIVED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

      CREATE TABLE IF NOT EXISTS product_arrivals (
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        arrival_id TEXT NOT NULL REFERENCES arrivals(id) ON DELETE CASCADE,
        PRIMARY KEY(product_id, arrival_id)
      );

      CREATE TABLE IF NOT EXISTS promotions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        image TEXT NOT NULL DEFAULT '',
        discount_type TEXT NOT NULL CHECK(discount_type IN ('PERCENTAGE','FIXED')),
        value REAL NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        promo_code TEXT,
        usage_limit INTEGER,
        usage_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('DRAFT','SCHEDULED','ACTIVE','EXPIRED','ARCHIVED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_promotions_status_dates ON promotions(status, starts_at, ends_at);

      CREATE TABLE IF NOT EXISTS promotion_arrivals (
        promotion_id TEXT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        arrival_id TEXT NOT NULL REFERENCES arrivals(id) ON DELETE CASCADE,
        PRIMARY KEY(promotion_id, arrival_id)
      );
      CREATE TABLE IF NOT EXISTS promotion_products (
        promotion_id TEXT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        PRIMARY KEY(promotion_id, product_id)
      );

      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        media_type TEXT NOT NULL DEFAULT 'IMAGE' CHECK(media_type IN ('IMAGE','VIDEO')),
        media_url TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        cta TEXT NOT NULL DEFAULT '',
        target_url TEXT NOT NULL DEFAULT '',
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        arrival_id TEXT REFERENCES arrivals(id) ON DELETE SET NULL,
        promotion_id TEXT REFERENCES promotions(id) ON DELETE SET NULL,
        publish_at TEXT NOT NULL,
        expires_at TEXT,
        priority INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('DRAFT','SCHEDULED','PUBLISHED','EXPIRED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_stories_status_order ON stories(status, priority DESC, publish_at);

      CREATE TABLE IF NOT EXISTS news_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        image TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL CHECK(category IN ('NEW_ARRIVAL','NEW_BRAND','PROMOTION','DELIVERY','AYROVI','INFORMATION','OTHER')),
        arrival_id TEXT REFERENCES arrivals(id) ON DELETE SET NULL,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        author TEXT NOT NULL DEFAULT 'Équipe AYROVI',
        published_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('DRAFT','SCHEDULED','PUBLISHED','ARCHIVED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_news_status_date ON news_items(status, published_at DESC);

      CREATE TABLE IF NOT EXISTS brands (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        logo TEXT NOT NULL DEFAULT '',
        image TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL CHECK(category IN ('FASHION','SPORT_LIFESTYLE','BEAUTY','TECH','HOME','OTHER')),
        url TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        display_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_brands_active_order ON brands(active, display_order);

      CREATE TABLE IF NOT EXISTS hero_slides (
        id TEXT PRIMARY KEY,
        image TEXT NOT NULL,
        video TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        cta TEXT NOT NULL DEFAULT '',
        target_url TEXT NOT NULL DEFAULT '',
        display_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hero_active_order ON hero_slides(active, display_order);

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        normalized_phone TEXT NOT NULL DEFAULT '',
        governorate TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        registered_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','BLOCKED')),
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customers_name_phone ON customers(name, phone);

      ${ORDERS_TABLE_SQL}
      ${ORDERS_INDEXES_SQL.filter((sql) => !sql.includes('idx_orders_deposit')).join('\n      ')}

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT,
        arrival_id TEXT,
        product_name TEXT NOT NULL,
        source_platform TEXT NOT NULL,
        source_url TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        variant TEXT,
        requested_size TEXT NOT NULL DEFAULT '',
        requested_color TEXT NOT NULL DEFAULT '',
        customer_note TEXT NOT NULL DEFAULT '',
        reference_url TEXT NOT NULL DEFAULT '',
        price_verification_status TEXT NOT NULL DEFAULT 'VERIFIED',
        quantity INTEGER NOT NULL,
        original_price REAL NOT NULL,
        currency TEXT NOT NULL,
        exchange_rate REAL NOT NULL,
        converted_price_tnd REAL NOT NULL,
        customs_tnd REAL NOT NULL DEFAULT 0,
        shipping_tnd REAL NOT NULL DEFAULT 0,
        service_tnd REAL NOT NULL DEFAULT 0,
        express_tnd REAL NOT NULL DEFAULT 0,
        discount_tnd REAL NOT NULL DEFAULT 0,
        total_tnd REAL NOT NULL,
        pricing_snapshot TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

      CREATE TABLE IF NOT EXISTS order_status_history (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        from_status TEXT,
        to_status TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        changed_by TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id, created_at);

      ${PAYMENTS_TABLE_SQL}
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, created_at DESC);

      ${DELIVERIES_TABLE_SQL}
      CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status, expected_at);

      ${CUSTOMER_AUTH_IDENTITIES_TABLE_SQL}
      CREATE INDEX IF NOT EXISTS idx_customer_identities_account ON customer_auth_identities(account_id);

      CREATE TABLE IF NOT EXISTS customer_sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
        csrf_token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        ip_address TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_customer_sessions_account ON customer_sessions(account_id);
      CREATE INDEX IF NOT EXISTS idx_customer_sessions_expiry ON customer_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS customer_otp_challenges (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'local',
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        request_ip TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customer_otp_phone_created ON customer_otp_challenges(phone, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_customer_otp_ip_created ON customer_otp_challenges(request_ip, created_at DESC);

      CREATE TABLE IF NOT EXISTS customer_oauth_states (
        id TEXT PRIMARY KEY,
        account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
        provider TEXT NOT NULL DEFAULT 'GOOGLE' CHECK(provider IN ('GOOGLE','FACEBOOK','APPLE')),
        cart_session_id TEXT NOT NULL DEFAULT '',
        return_to TEXT NOT NULL DEFAULT '/',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customer_oauth_expiry ON customer_oauth_states(expires_at);

      CREATE TABLE IF NOT EXISTS customer_addresses (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT 'Maison',
        recipient_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        governorate TEXT NOT NULL,
        city TEXT NOT NULL DEFAULT '',
        postal_code TEXT NOT NULL DEFAULT '',
        address_line TEXT NOT NULL,
        delivery_notes TEXT NOT NULL DEFAULT '',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customer_addresses_account ON customer_addresses(account_id, is_default DESC, created_at DESC);

      CREATE TABLE IF NOT EXISTS customer_favorites (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        source_url TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        image_url TEXT NOT NULL DEFAULT '',
        price_tnd REAL,
        created_at TEXT NOT NULL,
        UNIQUE(account_id, product_id),
        UNIQUE(account_id, source_url)
      );
      CREATE INDEX IF NOT EXISTS idx_customer_favorites_account ON customer_favorites(account_id, created_at DESC);

      ${CUSTOMER_NOTIFICATIONS_TABLE_SQL}
      CREATE INDEX IF NOT EXISTS idx_customer_notifications_account ON customer_notifications(account_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS admin_notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'GENERAL' CHECK(type IN ('GENERAL','DEPOSIT_REVIEW','ORDER','SYSTEM')),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        action_url TEXT NOT NULL DEFAULT '',
        read_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_notifications_date ON admin_notifications(created_at DESC);

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'OTHER' CHECK(category IN ('ADS','SHIPPING','STOCK','SERVICES','SALARIES','FEES','OTHER')),
        amount_tnd REAL NOT NULL CHECK(amount_tnd >= 0),
        expense_date TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);

      CREATE TABLE IF NOT EXISTS ai_knowledge (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL CHECK(category IN ('FAQ','PREDEFINED_RESPONSE','DELIVERY','PAYMENT','BRAND','ARRIVAL','PROMOTION','GENERAL')),
        question TEXT NOT NULL DEFAULT '',
        answer TEXT NOT NULL,
        keywords TEXT NOT NULL DEFAULT '[]',
        priority INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ai_knowledge_active ON ai_knowledge(active, category, priority DESC);

      CREATE TABLE IF NOT EXISTS assistant_feedback (
        id TEXT PRIMARY KEY,
        account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
        guest_session_hash TEXT NOT NULL DEFAULT '',
        conversation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        rating TEXT NOT NULL CHECK(rating IN ('up','down')),
        comment TEXT NOT NULL DEFAULT '',
        response_excerpt TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_feedback_created ON assistant_feedback(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_assistant_feedback_account ON assistant_feedback(account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_assistant_feedback_rating ON assistant_feedback(rating, created_at DESC);

      CREATE TABLE IF NOT EXISTS assistant_support_tickets (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
        guest_session_hash TEXT NOT NULL DEFAULT '',
        contact TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL,
        context_excerpt TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','IN_PROGRESS','RESOLVED','CLOSED')),
        priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL','HIGH')),
        assigned_to TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
        admin_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_support_status ON assistant_support_tickets(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_assistant_support_account ON assistant_support_tickets(account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_assistant_support_conversation ON assistant_support_tickets(conversation_id, created_at DESC);

      -- Canonical AYROVI tool security audit: no model arguments or provider
      -- payloads are stored here. Every proposal is classified before dispatch.
      CREATE TABLE IF NOT EXISTS assistant_tool_audit (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL DEFAULT '',
        conversation_id TEXT NOT NULL DEFAULT '',
        turn_id TEXT NOT NULL DEFAULT '',
        canonical_call_id TEXT NOT NULL DEFAULT '',
        proposal_call_hash TEXT NOT NULL DEFAULT '',
        tool_name TEXT NOT NULL,
        effect TEXT NOT NULL CHECK(effect IN ('read','compute','external-read','write','unknown')),
        execution_lane TEXT NOT NULL CHECK(execution_lane IN ('active','shadow','probe')),
        principal_type TEXT NOT NULL CHECK(principal_type IN ('customer','guest-session','invalid')),
        principal_hash TEXT NOT NULL DEFAULT '',
        authenticated INTEGER NOT NULL DEFAULT 0,
        authorized INTEGER NOT NULL DEFAULT 0,
        schema_valid INTEGER NOT NULL DEFAULT 0,
        approval_status TEXT NOT NULL CHECK(approval_status IN ('not-required','required','approved','denied')),
        idempotency_key TEXT NOT NULL DEFAULT '',
        outcome TEXT NOT NULL CHECK(outcome IN ('authorized','denied','succeeded','business-rejected','failed','replayed')),
        error_code TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_tool_audit_call ON assistant_tool_audit(canonical_call_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_assistant_tool_audit_turn ON assistant_tool_audit(turn_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_assistant_tool_audit_tool ON assistant_tool_audit(tool_name, created_at DESC);

      CREATE TABLE IF NOT EXISTS assistant_tool_idempotency (
        idempotency_key TEXT PRIMARY KEY,
        canonical_call_id TEXT NOT NULL UNIQUE,
        conversation_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','completed','failed')),
        result_json TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_tool_idempotency_turn ON assistant_tool_idempotency(turn_id, tool_name);

      CREATE TABLE IF NOT EXISTS story_publishers (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        avatar TEXT NOT NULL DEFAULT '',
        official INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS publications (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        channel_id TEXT NOT NULL REFERENCES story_publishers(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        remark TEXT NOT NULL DEFAULT '',
        publish_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'brouillon' CHECK(status IN ('brouillon','publie','archive')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reels (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        channel_id TEXT NOT NULL REFERENCES story_publishers(id) ON DELETE CASCADE,
        description TEXT NOT NULL DEFAULT '',
        video_url TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        publish_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'brouillon' CHECK(status IN ('brouillon','publie','archive')),
        views INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS story_interactions(
        id TEXT PRIMARY KEY,
        target_id TEXT NOT NULL,
        target_kind TEXT NOT NULL DEFAULT 'story' CHECK(target_kind IN ('story','post')),
        type TEXT NOT NULL CHECK(type IN ('like','comment','view','share')),
        account_id TEXT,
        guest_hash TEXT,
        text TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_story_interactions_target ON story_interactions(target_id, type);
      CREATE INDEX IF NOT EXISTS idx_story_interactions_account ON story_interactions(account_id, type);

      CREATE TABLE IF NOT EXISTS magazine_drafts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL DEFAULT '',
        batch_id TEXT NOT NULL DEFAULT '',
        content_type TEXT NOT NULL CHECK(content_type IN ('editorial','publication','story','reel')),
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        content_json TEXT NOT NULL DEFAULT '{}',
        reference_media_json TEXT NOT NULL DEFAULT '[]',
        stock_media_json TEXT NOT NULL DEFAULT '[]',
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        category TEXT NOT NULL DEFAULT 'AYROVI',
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','published','archived')),
        scheduled_at TEXT,
        target_resource TEXT,
        target_id TEXT,
        generated_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
        model TEXT NOT NULL DEFAULT '',
        prompt_excerpt TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_magazine_drafts_status ON magazine_drafts(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_magazine_drafts_batch ON magazine_drafts(batch_id, content_type);
      CREATE INDEX IF NOT EXISTS idx_magazine_drafts_product ON magazine_drafts(product_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS lens_analysis_cache (
        image_hash TEXT PRIMARY KEY,
        result_json TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lens_evaluations (
        id TEXT PRIMARY KEY,
        image_hash TEXT NOT NULL DEFAULT '',
        expected_json TEXT NOT NULL DEFAULT '{}',
        actual_json TEXT NOT NULL DEFAULT '{}',
        error_type TEXT NOT NULL DEFAULT 'NONE',
        note TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'lab',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_learning_events (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL DEFAULT '',
        owner_hash TEXT NOT NULL DEFAULT '',
        event_type TEXT NOT NULL,
        tool_names TEXT NOT NULL DEFAULT '',
        success INTEGER NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0,
        meta_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ai_learning_type ON ai_learning_events(event_type, created_at DESC);

      -- Isolated non-canonical audit sink. The schema intentionally has no
      -- prompt, response, image, provider diagnostic, or tool payload column.
      CREATE TABLE IF NOT EXISTS ai_shadow_run_records (
        record_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        phase TEXT NOT NULL CHECK(phase IN ('request','result','error','blocked')),
        execution_lane TEXT NOT NULL CHECK(execution_lane IN ('shadow','probe')),
        occurred_at TEXT NOT NULL,
        request_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL DEFAULT '',
        turn_id TEXT NOT NULL DEFAULT '',
        session_id TEXT NOT NULL DEFAULT '',
        user_id_hash TEXT NOT NULL DEFAULT '',
        workload TEXT NOT NULL,
        active_provider TEXT NOT NULL DEFAULT '',
        active_model TEXT NOT NULL DEFAULT '',
        candidate_provider TEXT NOT NULL,
        candidate_model TEXT NOT NULL,
        latency_ms INTEGER,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cached_input_tokens INTEGER,
        audio_input_tokens INTEGER,
        audio_output_tokens INTEGER,
        image_input_tokens INTEGER,
        web_search_calls INTEGER,
        cost_usd REAL,
        cost_source TEXT CHECK(cost_source IS NULL OR cost_source IN ('provider','metered','estimated')),
        comparison_status TEXT,
        comparison_schema_version TEXT,
        active_output_hash TEXT,
        candidate_output_hash TEXT,
        text_similarity REAL,
        tool_call_match INTEGER,
        schema_valid INTEGER,
        error_code TEXT,
        retryable INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_ai_shadow_run ON ai_shadow_run_records(run_id, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_ai_shadow_request ON ai_shadow_run_records(request_id, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_ai_shadow_turn ON ai_shadow_run_records(turn_id, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_ai_shadow_session ON ai_shadow_run_records(session_id, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_ai_shadow_user_day ON ai_shadow_run_records(user_id_hash, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_ai_shadow_provider_day ON ai_shadow_run_records(candidate_provider, occurred_at);

      CREATE TABLE IF NOT EXISTS lens_lab_runs (
        id TEXT PRIMARY KEY,
        image_hash TEXT NOT NULL DEFAULT '',
        question TEXT NOT NULL DEFAULT '',
        result_json TEXT NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        module TEXT NOT NULL,
        entity_id TEXT,
        old_value TEXT,
        new_value TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module, entity_id);
    `);

    this.ensureColumn('crm_arrival_clients', 'display_alias', 'TEXT');
    this.ensureColumn('crm_arrival_sources', 'arrival_client_store_id', 'TEXT REFERENCES crm_arrival_client_stores(id) ON DELETE CASCADE');
    this.ensureColumn('crm_extraction_jobs', 'arrival_client_store_id', 'TEXT REFERENCES crm_arrival_client_stores(id) ON DELETE CASCADE');
    this.ensureColumn('crm_extraction_jobs', 'worker_id', 'TEXT');
    this.ensureColumn('crm_extraction_jobs', 'heartbeat_at', 'TEXT');
    this.ensureColumn('crm_extraction_jobs', 'lease_expires_at', 'TEXT');
    this.ensureColumn('crm_extraction_jobs', 'retry_at', 'TEXT');
    this.ensureColumn('crm_extracted_products', 'arrival_client_store_id', 'TEXT REFERENCES crm_arrival_client_stores(id) ON DELETE CASCADE');
    // Operational line-item fields produced by the AI Extraction Schema and
    // carried through Normalization. Nullable at the DB level (application
    // model) — the AI schema itself stays union-free.
    this.ensureColumn('crm_extracted_products', 'size', 'TEXT');
    this.ensureColumn('crm_extracted_products', 'unit_price', 'REAL');
    this.ensureColumn('crm_extracted_products', 'currency', 'TEXT');
    this.ensureColumn('crm_extracted_products', 'product_url', 'TEXT');
    this.ensureColumn('crm_extracted_products', 'order_id', 'TEXT');
    this.ensureColumn('crm_extracted_products', 'tracking_number', 'TEXT');
    this.ensureColumn('crm_extracted_products', 'order_date', 'TEXT');
    this.ensureColumn('crm_extracted_products', 'shipment_status', 'TEXT');
    // ---- AI / manual product Category classification (Arrival CRM) ----
    // Additive only. Legacy rows keep classification_required=0, so Cards
    // created before this feature are never reopened by the new approval gate.
    // classification_source keeps the provenance: 'AI' or 'MANUAL'.
    this.ensureColumn('crm_extracted_products', 'category_code', 'TEXT');
    this.ensureColumn('crm_extracted_products', 'subcategory_code', 'TEXT');
    this.ensureColumn('crm_extracted_products', 'classification_source', 'TEXT');
    this.ensureColumn('crm_extracted_products', 'classification_confidence', 'REAL');
    this.ensureColumn('crm_extracted_products', 'classification_status', "TEXT NOT NULL DEFAULT 'UNCLASSIFIED'");
    this.ensureColumn('crm_extracted_products', 'classification_reasons', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('crm_extracted_products', 'classification_note', 'TEXT');
    this.ensureColumn('crm_extracted_products', 'classification_required', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('crm_extracted_products', 'classified_at', 'TEXT');
    this.ensureColumn('crm_extracted_products', 'classified_by', 'TEXT');
    // Warehouse dispatch tracking: one Customer Arrival Card -> one Expected
    // Arrival in the Warehouse Core via the integration API. Idempotent on the
    // arrival client (card) id; status drives READY_TO_SEND -> SENT / SEND_FAILED.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crm_warehouse_dispatches (
        id TEXT PRIMARY KEY,
        arrival_id TEXT NOT NULL REFERENCES crm_arrivals(id) ON DELETE CASCADE,
        arrival_client_id TEXT NOT NULL REFERENCES crm_arrival_clients(id) ON DELETE CASCADE,
        card_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK(status IN ('READY_TO_SEND','SENDING','SENT','SEND_FAILED')),
        warehouse_arrival_id TEXT,
        http_status INTEGER,
        error_code TEXT,
        error_message TEXT,
        idempotency_key TEXT,
        sent_at TEXT,
        sent_by TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        payload_summary TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_crm_dispatch_arrival ON crm_warehouse_dispatches(arrival_id);
      CREATE INDEX IF NOT EXISTS idx_crm_dispatch_client ON crm_warehouse_dispatches(arrival_client_id);
      CREATE INDEX IF NOT EXISTS idx_crm_dispatch_status ON crm_warehouse_dispatches(status);

      -- ---- Shipment Cards (physical shipping info) sent to the Warehouse ----
      -- Distinct from Customer Arrival Cards: a shipment holds carrier/tracking/
      -- sender/carton data; product lines stay on the customer cards.
      CREATE TABLE IF NOT EXISTS crm_shipments (
        id TEXT PRIMARY KEY,
        shipment_code TEXT NOT NULL UNIQUE,        -- SHP-2026-000145 (generated)
        arrival_id TEXT NOT NULL REFERENCES crm_arrivals(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','CONFIRMED')),
        reference TEXT,                            -- human shipment reference
        source_type TEXT NOT NULL DEFAULT 'MANUAL' CHECK(source_type IN ('MANUAL','CARRIER_API','IMPORT','OTHER')),
        source_reference TEXT,
        carrier_name TEXT, carrier_code TEXT, carrier_id TEXT, service_name TEXT,
        tracking_number TEXT, tracking_url TEXT, tracking_status TEXT,
        sender_name TEXT, sender_company TEXT, sender_country TEXT, sender_city TEXT,
        destination_country TEXT, destination_city TEXT, destination_code TEXT,
        shipped_at TEXT, estimated_arrival_at TEXT, actual_arrival_at TEXT,
        total_cartons INTEGER NOT NULL DEFAULT 0,
        total_products INTEGER NOT NULL DEFAULT 0,
        total_units INTEGER NOT NULL DEFAULT 0,
        total_weight REAL, weight_unit TEXT,
        created_by TEXT, confirmed_by TEXT, confirmed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_crm_shipments_arrival ON crm_shipments(arrival_id);
      CREATE INDEX IF NOT EXISTS idx_crm_shipments_tracking ON crm_shipments(tracking_number);

      CREATE TABLE IF NOT EXISTS crm_shipment_cartons (
        id TEXT PRIMARY KEY,
        shipment_id TEXT NOT NULL REFERENCES crm_shipments(id) ON DELETE CASCADE,
        carton_code TEXT NOT NULL UNIQUE,          -- CTN-2026-000001 (generated, QR value)
        carton_reference TEXT,
        qr_code_value TEXT,
        barcode_value TEXT,
        carton_number INTEGER NOT NULL,
        total_cartons INTEGER NOT NULL,
        weight REAL, weight_unit TEXT,
        length REAL, width REAL, height REAL, dimension_unit TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_crm_cartons_shipment ON crm_shipment_cartons(shipment_id);
      CREATE INDEX IF NOT EXISTS idx_crm_cartons_qr ON crm_shipment_cartons(qr_code_value);
      CREATE INDEX IF NOT EXISTS idx_crm_cartons_barcode ON crm_shipment_cartons(barcode_value);

      -- Transmission state for each Shipment Card sent to the Warehouse.
      CREATE TABLE IF NOT EXISTS crm_shipment_dispatches (
        id TEXT PRIMARY KEY,
        shipment_id TEXT NOT NULL REFERENCES crm_shipments(id) ON DELETE CASCADE,
        card_id TEXT NOT NULL UNIQUE,              -- == shipment id; idempotency anchor
        status TEXT NOT NULL CHECK(status IN ('READY_TO_SEND','SENDING','SENT','SEND_FAILED')),
        warehouse_shipment_id TEXT,                -- WSHP-...
        http_status INTEGER,
        error_code TEXT,
        error_message TEXT,
        idempotency_key TEXT,
        sent_at TEXT,
        sent_by TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        payload_summary TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_crm_ship_dispatch_shipment ON crm_shipment_dispatches(shipment_id);
      CREATE INDEX IF NOT EXISTS idx_crm_ship_dispatch_status ON crm_shipment_dispatches(status);

      -- ---- Category Master (official AYROVI product taxonomy) ----
      -- The single authoritative list of product categories used by the Arrival
      -- CRM AI classifier. It is NEVER hardcoded in application code: rows are
      -- imported/managed by Administration from the official AYROVI Warehouse
      -- Core taxonomy. An empty master means nothing can be classified, so
      -- lines stay in review instead of being assigned an invented category.
      CREATE TABLE IF NOT EXISTS crm_categories (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,             -- e.g. SHOES, CLOTHING, SHOES/SPORTS
        parent_code TEXT,                      -- NULL => top-level category
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        source TEXT NOT NULL DEFAULT 'MANUAL' CHECK(source IN ('MANUAL','IMPORT','WAREHOUSE_CORE')),
        display_order INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_crm_categories_parent ON crm_categories(parent_code);
      CREATE INDEX IF NOT EXISTS idx_crm_categories_active ON crm_categories(active, display_order);
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_crm_sources_client_store ON crm_arrival_sources(arrival_client_store_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_crm_jobs_client_store ON crm_extraction_jobs(arrival_client_store_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_crm_products_client_store ON crm_extracted_products(arrival_client_store_id, is_current, created_at);
      CREATE INDEX IF NOT EXISTS idx_crm_products_order ON crm_extracted_products(order_id);
      CREATE INDEX IF NOT EXISTS idx_crm_products_tracking ON crm_extracted_products(tracking_number);
    `);
    this.migrateLegacyArrivalClientStores();
    this.recordArrivalMultistoreMigration();
    seedArrivalStores(this);

    // شريط الإعلانات العلوي (Trust Ticker) — إنشاء الجدول وزرع الرسائل الافتراضية مرة واحدة
    this.db.exec(ANNOUNCEMENT_MESSAGES_TABLE_SQL);

    // نظام Hero — جدول visuals قابل للتوسع مستقبلاً (صور متعددة/موبايل)
    this.db.exec(HERO_VISUALS_TABLE_SQL);

    // AYROVIX LENS HERO — إعدادات قابلة للإدارة من الـAdmin (المحتوى فقط)
    this.db.exec(`CREATE TABLE IF NOT EXISTS lens_hero_settings (
      id TEXT PRIMARY KEY CHECK(id='global'),
      eyebrow TEXT NOT NULL DEFAULT 'LENS',
      title TEXT NOT NULL DEFAULT 'Analysez. Comparez. Achetez mieux.',
      description TEXT NOT NULL DEFAULT 'Prenez une photo ou importez une image. LENS analyse le produit, compare les prix et vous donne les meilleures options en quelques secondes.',
      cta_label TEXT NOT NULL DEFAULT 'Ouvrir LENS',
      bg_type TEXT NOT NULL DEFAULT 'COLOR' CHECK(bg_type IN ('COLOR','IMAGE')),
      bg_color TEXT NOT NULL DEFAULT '#F6F7F9',
      bg_image TEXT NOT NULL DEFAULT '',
      overlay_strength REAL NOT NULL DEFAULT 0.25,
      focal_x REAL NOT NULL DEFAULT 0.5,
      focal_y REAL NOT NULL DEFAULT 0.45,
      phone_enabled INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );`);
    if (!(this.db.prepare("SELECT COUNT(*) count FROM lens_hero_settings WHERE id='global'").get() as { count: number }).count) {
      this.run("INSERT INTO lens_hero_settings (id,updated_at) VALUES ('global',?)", new Date().toISOString());
    }

    // LENS — بقية المحتوى يُدار من الـ Dashboard (لا يوجد أي نص ثابت في الواجهة)
    this.ensureColumn('lens_hero_settings', 'cta_url', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('lens_hero_settings', 'proof_line', "TEXT NOT NULL DEFAULT 'Fiable. Rapide. Intelligent.'");
    this.ensureColumn('lens_hero_settings', 'accent_color', "TEXT NOT NULL DEFAULT '#FF7A00'");
    this.ensureColumn('lens_hero_settings', 'element_order', "TEXT NOT NULL DEFAULT 'eyebrow,title,description,cta,proof'");
    this.ensureColumn('lens_hero_settings', 'sort_order', 'INTEGER NOT NULL DEFAULT 40');
    this.ensureColumn('lens_hero_settings', 'phone_image', "TEXT NOT NULL DEFAULT '/media/hero-femme.jpg'");
    this.ensureColumn('lens_hero_settings', 'phone_status_label', "TEXT NOT NULL DEFAULT 'AYROVI LENS'");
    this.ensureColumn('lens_hero_settings', 'phone_result_label', "TEXT NOT NULL DEFAULT 'Produit identifié'");
    this.ensureColumn('lens_hero_settings', 'phone_product_name', "TEXT NOT NULL DEFAULT 'Sneakers blanches — 89,00 €'");
    this.ensureColumn('lens_hero_settings', 'phone_price_chip', "TEXT NOT NULL DEFAULT '≈ 298,900 TND'");
    this.ensureColumn('lens_hero_settings', 'phone_meta_chip', "TEXT NOT NULL DEFAULT '7 jours'");
    this.ensureColumn('lens_hero_settings', 'phone_stock_chip', "TEXT NOT NULL DEFAULT 'Disponible'");
    this.ensureColumn('lens_hero_settings', 'phone_cta_label', "TEXT NOT NULL DEFAULT 'Ajouter au panier'");

    // LENS v2 — المحتوى الموسّع (mini-features / AI card / phone merchants / steps / banner)
    // يُخزَّن JSON في عمود واحد ويُدار من الـ Dashboard؛ الواجهة تعرضه فقط (لا نص ثابت في الكود).
    this.ensureColumn('lens_hero_settings', 'sections_json', "TEXT NOT NULL DEFAULT '{}'");
    {
      const lensRow = this.db.prepare("SELECT sections_json, title FROM lens_hero_settings WHERE id='global'").get() as { sections_json: string; title: string };
      if (lensRow && (!lensRow.sections_json || lensRow.sections_json === '{}')) {
        const seed = {
          headlineHighlight: 'LENS',
          miniFeatures: [
            { icon: 'search', label: 'Analyse intelligente' },
            { icon: 'tag', label: 'Comparaison des prix' },
            { icon: 'shield', label: 'Fiable & sécurisé' },
            { icon: 'zap', label: 'Rapide & précis' },
          ],
          aiCard: {
            title: 'Propulsé par l’IA AYROVI',
            text: 'Notre intelligence artificielle identifie les produits, compare des milliers d’options et vous aide à acheter mieux, au meilleur prix.',
          },
          phone: {
            topLabel: 'AYROVI LENS',
            image: '/media/lens-sneakers.jpg',
            resultLabel: 'Produit identifié',
            productName: 'Sneakers blanches',
            price: '89,00 €',
            priceChip: '≈ 298,800 TND',
            metaChip: '7 jours',
            stockChip: 'Disponible',
            optionsLabel: 'Meilleures options trouvées',
            merchants: [
              { name: 'Nike', price: '89,00 €' },
              { name: 'Zalando', price: '95,00 €' },
              { name: 'ASOS', price: '99,00 €' },
            ],
          },
          steps: {
            title: 'Comment ça marche ?',
            items: [
              { icon: 'camera', title: 'Prenez une photo', text: 'ou importez votre image.' },
              { icon: 'search', title: 'LENS analyse', text: 'le produit en quelques secondes.' },
              { icon: 'tag', title: 'Nous comparons', text: 'des centaines de prix pour vous.' },
              { icon: 'bag', title: 'Choisissez & commandez', text: 'on s’occupe du reste.' },
            ],
          },
          banner: {
            title: 'Plus qu’un outil, votre meilleur allié shopping.',
            text: 'LENS vous fait gagner du temps, de l’argent et vous évite les mauvaises surprises.',
            ctaLabel: 'Essayer LENS',
          },
        };
        this.run("UPDATE lens_hero_settings SET sections_json=?, title=?, description=?, cta_label=? WHERE id='global'",
          JSON.stringify(seed),
          'Voyez-le.\nLENS le trouve.\nOn s’occupe du reste.',
          'Prenez une photo ou importez une image. LENS analyse le produit, compare les prix et vous trouve les meilleures options en quelques secondes.',
          'Ouvrir LENS');
      }
    }

    // HERO — المحتوى (عنوان/وصف/CTA) يُدار من الـ Dashboard، لا من الكود
    this.db.exec(`CREATE TABLE IF NOT EXISTS hero_content_settings (
      id TEXT PRIMARY KEY CHECK(id='global'),
      eyebrow TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      highlight TEXT NOT NULL DEFAULT 'AYROVI',
      description TEXT NOT NULL DEFAULT '',
      cta_label TEXT NOT NULL DEFAULT '',
      cta_url TEXT NOT NULL DEFAULT '',
      accent_color TEXT NOT NULL DEFAULT '#FE7003',
      element_order TEXT NOT NULL DEFAULT 'eyebrow,title,description,cta',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 10,
      updated_at TEXT NOT NULL
    );`);
    if (!(this.db.prepare("SELECT COUNT(*) count FROM hero_content_settings WHERE id='global'").get() as { count: number }).count) {
      this.run(`INSERT INTO hero_content_settings (id,title,description,updated_at) VALUES ('global',?,?,?)`,
        'Vous le voyez.\nAYROVI vous le livre.',
        'Mode, beauté, technologie, maison… trouvez ce que vous cherchez. AYROVI s’occupe du reste.',
        new Date().toISOString());
    }

    // ترتيب كتل الصفحة الرئيسية (transition / discovery / brands / lens) — يُدار من الـ Dashboard
    this.db.exec(`CREATE TABLE IF NOT EXISTS home_blocks (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );`);
    if (!(this.db.prepare('SELECT COUNT(*) count FROM home_blocks').get() as { count: number }).count) {
      const nowBlock = new Date().toISOString();
      const insertBlock = this.db.prepare('INSERT INTO home_blocks (id,sort_order,visible,updated_at) VALUES (?,?,1,?)');
      [['transition', 10], ['discovery', 20], ['brands', 30], ['lens', 40]].forEach(([id, order]) => insertBlock.run(id, order, nowBlock));
    }

    // AYROVI Trust Bar — العناصر والإعدادات العامة
    this.db.exec(`CREATE TABLE IF NOT EXISTS trust_bar_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'ShieldCheck',
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      title_color TEXT NOT NULL DEFAULT '',
      description_color TEXT NOT NULL DEFAULT '',
      icon_color TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS trust_bar_settings (
      id TEXT PRIMARY KEY CHECK(id='global'),
      background_color TEXT NOT NULL DEFAULT '#111217',
      title_color TEXT NOT NULL DEFAULT '#FFFFFF',
      description_color TEXT NOT NULL DEFAULT 'rgba(255,255,255,0.68)',
      accent_color TEXT NOT NULL DEFAULT '#FF7A00',
      divider_color TEXT NOT NULL DEFAULT 'rgba(255,255,255,0.15)',
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );`);
    if (!(this.db.prepare("SELECT COUNT(*) count FROM trust_bar_settings WHERE id='global'").get() as { count: number }).count) {
      this.run(`INSERT INTO trust_bar_settings (id,updated_at) VALUES ('global',?)`, new Date().toISOString());
    }
    if (!(this.db.prepare('SELECT COUNT(*) count FROM trust_bar_items').get() as { count: number }).count) {
      const seededAt = new Date().toISOString();
      const insertTrust = this.db.prepare('INSERT INTO trust_bar_items (id,title,description,icon,enabled,sort_order,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?)');
      this.db.transaction(() => {
        [
          ['Authentique', 'Produits officiels', 'ShieldCheck'],
          ['Dédouanement', 'Inclus', 'Truck'],
          ['Acompte 20%', 'Pour confirmer votre commande', 'Lock'],
          ['Livraison rapide', 'Dans les 24 jours ouvrables', 'Zap'],
        ].forEach(([title, description, icon], index) => insertTrust.run(`trust_${randomUUID()}`, title, description, icon, index + 1, seededAt, seededAt));
      })();
    }
    // COMPACT TRUST BAR: ترحيل البذر القديم إلى العناوين المختصرة وحذف العنصر الخامس
    this.db.transaction(() => {
      const remap: Array<[string, string]> = [
        ['Produits authentiques', 'Authentique'],
        ['Dédouanement inclus', 'Dédouanement'],
        ['Acompte sécurisé 20 %', 'Acompte 20%'],
        ['Livraison rapide', 'Livraison rapide'],
      ];
      for (const [oldTitle, newTitle] of remap) this.run('UPDATE trust_bar_items SET title=?,updated_at=? WHERE title=?', newTitle, new Date().toISOString(), oldTitle)
      this.run("DELETE FROM trust_bar_items WHERE title='Service client 7j/7' OR title='Service client 7j/7 '");
      const descRemap: Array<[string, string]> = [
        ['Authentique', 'Produits officiels'],
        ['Dédouanement', 'Inclus'],
        ['Acompte 20%', 'Pour confirmer votre commande'],
        ['Livraison rapide', 'Dans les 24 jours ouvrables'],
      ];
      for (const [title, nextDescription] of descRemap) this.run('UPDATE trust_bar_items SET description=?,updated_at=? WHERE title=?', nextDescription, new Date().toISOString(), title);
      this.run("UPDATE trust_bar_settings SET background_color='#000000',updated_at=? WHERE background_color='#111217'", new Date().toISOString());
    })();
    if (!(this.db.prepare('SELECT COUNT(*) count FROM announcement_messages').get() as { count: number }).count) {
      const seededAt = new Date().toISOString();
      const insertSeed = this.db.prepare('INSERT INTO announcement_messages (id,text,display_order,active,created_at,updated_at) VALUES (?,?,?,?,?,?)');
      this.db.transaction(() => {
        for (const [index, text] of [
          'Prix confirmé avant commande',
          'Dédouanement inclus',
          'Acompte sécurisé 20 %',
          'Livraison dans les 24 gouvernorats',
          'Service client 7j/7',
        ].entries()) {
          insertSeed.run(`announcement_${randomUUID()}`, text, index + 1, 1, seededAt, seededAt);
        }
      })();
    }

    // Existing installations need additive migrations because CREATE TABLE IF NOT EXISTS
    // does not add new ownership columns to cart/order tables.
    this.ensureColumn('cart_items', 'account_id', 'TEXT REFERENCES customer_accounts(id) ON DELETE CASCADE');
    this.ensureColumn('cart_items', 'requested_size', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('customers', 'normalized_phone', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('customer_otp_challenges', 'provider', "TEXT NOT NULL DEFAULT 'local'");
    this.ensureColumn('customer_accounts', 'password_hash', 'TEXT');
    this.ensureColumn('hero_visuals', 'mobile_focal_x', 'REAL NOT NULL DEFAULT 0.5');
    this.ensureColumn('hero_visuals', 'mobile_focal_y', 'REAL NOT NULL DEFAULT 0.5');
    this.ensureColumn('hero_visuals', 'overlay_mode', "TEXT NOT NULL DEFAULT 'AUTO' CHECK(overlay_mode IN ('AUTO','MANUAL'))");
    this.ensureColumn('hero_visuals', 'overlay_strength', 'REAL');
    this.ensureColumn('hero_visuals', 'analysis_json', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('hero_visuals', 'orientation_override', "TEXT NOT NULL DEFAULT 'AUTO' CHECK(orientation_override IN ('AUTO','LANDSCAPE','PORTRAIT'))");
    this.ensureColumn('customer_oauth_states', 'provider', "TEXT NOT NULL DEFAULT 'GOOGLE' CHECK(provider IN ('GOOGLE','FACEBOOK','APPLE'))");
    // ترقية القيود القديمة لتشمل دخول Apple (CHECK القديم لا يقبل 'APPLE')
    this.rebuildTableIfLegacy('customer_oauth_states', "'APPLE'", CUSTOMER_OAUTH_STATES_TABLE_SQL, [
      'CREATE INDEX IF NOT EXISTS idx_customer_oauth_expiry ON customer_oauth_states(expires_at);',
    ]);
    this.rebuildTableIfLegacy('customer_auth_identities', "'FACEBOOK'", CUSTOMER_AUTH_IDENTITIES_TABLE_SQL, [
      'CREATE INDEX IF NOT EXISTS idx_customer_identities_account ON customer_auth_identities(account_id);',
    ]);
    this.rebuildTableIfLegacy('customer_auth_identities', "'APPLE'", CUSTOMER_AUTH_IDENTITIES_TABLE_SQL, [
      'CREATE INDEX IF NOT EXISTS idx_customer_identities_account ON customer_auth_identities(account_id);',
    ]);
    const customersMissingNormalizedPhone = this.db.prepare(
      "SELECT id,phone FROM customers WHERE normalized_phone=''",
    ).all() as Array<{ id: string; phone: string }>;
    if (customersMissingNormalizedPhone.length) {
      const updateNormalizedPhone = this.db.prepare('UPDATE customers SET normalized_phone=? WHERE id=?');
      this.db.transaction(() => {
        for (const customer of customersMissingNormalizedPhone) {
          updateNormalizedPhone.run(normalizeCustomerPhone(customer.phone), customer.id);
        }
      })();
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_customers_normalized_phone ON customers(normalized_phone)');
    // Invariants DB: un même propriétaire ne peut gonfler likes/vues/partages,
    // même si plusieurs requêtes concurrentes atteignent le serveur.
    this.db.exec(`
      DELETE FROM story_interactions WHERE type IN ('like','view','share') AND account_id IS NOT NULL
        AND rowid NOT IN (SELECT MIN(rowid) FROM story_interactions WHERE type IN ('like','view','share') AND account_id IS NOT NULL GROUP BY target_id,type,account_id);
      DELETE FROM story_interactions WHERE type IN ('view','share') AND guest_hash IS NOT NULL
        AND rowid NOT IN (SELECT MIN(rowid) FROM story_interactions WHERE type IN ('view','share') AND guest_hash IS NOT NULL GROUP BY target_id,type,guest_hash);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_social_unique_account
        ON story_interactions(target_id,type,account_id) WHERE account_id IS NOT NULL AND type IN ('like','view','share');
      CREATE UNIQUE INDEX IF NOT EXISTS idx_social_unique_guest
        ON story_interactions(target_id,type,guest_hash) WHERE guest_hash IS NOT NULL AND type IN ('view','share');
    `);
    this.ensureColumn('cart_items', 'requested_color', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('cart_items', 'customer_note', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('cart_items', 'reference_url', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('cart_items', 'price_verification_status', "TEXT NOT NULL DEFAULT 'VERIFIED'");
    // دفتر الشروط Stories : قنوات الناشرين (Ayrovi Official / Style / Promos / Actus).
    this.ensureColumn('stories', 'category', "TEXT NOT NULL DEFAULT 'ARRIVAGE'");
    this.ensureColumn('stories', 'secondary_images', "TEXT NOT NULL DEFAULT '[]'");
    if ((this.db.prepare('SELECT COUNT(*) AS count FROM story_publishers').get() as any).count === 0) {
      const ins = this.db.prepare(`INSERT INTO story_publishers (id,slug,name,subtitle,avatar,official,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`);
      const nowP = new Date().toISOString();
      ins.run('pub_ayrovi', 'ARRIVAGE', 'Ayrovi', 'Official', '', 1, nowP, nowP);
      ins.run('pub_new', 'NEW', 'Nouveautés', 'Channel', '', 0, nowP, nowP);
      ins.run('pub_style', 'STYLE', 'Style', 'Channel', '', 0, nowP, nowP);
      ins.run('pub_actus', 'INFO', 'Actus', 'Channel', '', 0, nowP, nowP);
      ins.run('pub_promo', 'PROMO', 'Promos', 'Store', '', 0, nowP, nowP);
    }
    if ((this.db.prepare('SELECT COUNT(*) AS count FROM publications').get() as any).count === 0) {
      const insP = this.db.prepare(`INSERT INTO publications (id,title,subtitle,channel_id,image_url,remark,publish_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
      const nowPub = new Date().toISOString();
      insP.run('pub_post_01', 'Nouvel arrivage #08 disponible', 'La sélection mode & lifestyle de la semaine', 'pub_ayrovi', '/media/hero-femme.jpg', '', nowPub, 'publie', nowPub, nowPub);
      insP.run('pub_post_02', 'Tendances du moment', 'Les pièces préférées de la communauté', 'pub_style', '/media/hero-enfants.jpg', 'Note interne : mettre à jour chaque vendredi.', nowPub, 'publie', nowPub, nowPub);
    }
    if ((this.db.prepare('SELECT COUNT(*) AS count FROM reels').get() as any).count === 0) {
      const nowR = new Date().toISOString();
      this.db.prepare(`INSERT INTO reels (id,title,channel_id,description,video_url,duration_seconds,publish_at,status,views,likes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,0,0,?,?)`)
        .run('reel_demo_01', 'La sélection AYROVI en mouvement', 'pub_ayrovi', 'Découvrez la sélection en vidéo.', 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', 8, nowR, 'publie', nowR, nowR);
    }

    this.ensureColumn('order_items', 'requested_size', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('order_items', 'requested_color', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('order_items', 'customer_note', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('order_items', 'reference_url', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('order_items', 'price_verification_status', "TEXT NOT NULL DEFAULT 'VERIFIED'");
    this.ensureColumn('orders', 'account_id', 'TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL');
    this.ensureColumn('customer_oauth_states', 'account_id', 'TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL');
    this.migrateOrdersToAccountLifecycle();
    this.ensureColumn('orders', 'contact_email', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('orders', 'delivery_latitude', 'REAL');
    this.ensureColumn('orders', 'delivery_longitude', 'REAL');
    this.ensureColumn('orders', 'terms_accepted_at', 'TEXT');
    this.ensureColumn('orders', 'locale', "TEXT NOT NULL DEFAULT 'fr-TN'");
    this.ensureColumn('deliveries', 'latitude', 'REAL');
    this.ensureColumn('deliveries', 'longitude', 'REAL');
    this.ensureColumn('deliveries', 'shipped_at', 'TEXT');
    this.ensureColumn('deliveries', 'tracking_url', "TEXT NOT NULL DEFAULT ''");
    this.rebuildTableIfLegacy('deliveries', "'IN_TRANSIT'", DELIVERIES_TABLE_SQL, []);
    this.migratePaymentsToAccountLifecycle();
    this.ensureAccountCommerceSchema();
    this.rebuildTableIfLegacy('customer_notifications', "'INVOICE'", CUSTOMER_NOTIFICATIONS_TABLE_SQL, []);
    // ترقية جدول الإعدادات لفئات CHANNELS/DESIGN/INTERFACE (القواعد القديمة كانت ترفضها بصمت)
    this.db.exec(SETTINGS_TABLE_SQL);
    this.rebuildTableIfLegacy('settings', "'INTERFACE'", SETTINGS_TABLE_SQL, []);
    // فهرس عمود العربون — بعد الترقية (القواعد القديمة تحصل عليه داخل إعادة البناء)
    this.ensurePricingEngine();
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_orders_deposit ON orders(deposit_status, created_at DESC)');
    this.db.exec(`UPDATE settings SET setting_value='["CARD","FLOUCI","BANK_TRANSFER","POSTE"]',updated_at=datetime('now')
      WHERE setting_key='payment_methods' AND setting_value NOT LIKE '%CARD%'`);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cart_account ON cart_items(account_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_orders_account ON orders(account_id, created_at DESC);
    `);
  }

  /** Upgrade the legacy order vocabulary without losing persisted commerce data. */
  private migrateOrdersToAccountLifecycle() {
    const row = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'").get() as { sql?: string } | undefined;
    if (!row || String(row.sql || '').includes('AWAITING_DEPOSIT')) return;
    this.db.pragma('foreign_keys = OFF');
    this.db.pragma('legacy_alter_table = ON');
    try {
      this.db.transaction(() => {
        this.db.exec('DROP TABLE IF EXISTS orders_lifecycle_legacy');
        this.db.exec('ALTER TABLE orders RENAME TO orders_lifecycle_legacy');
        this.db.exec(ORDERS_TABLE_SQL);
        const oldColumns = (this.db.prepare('PRAGMA table_info(orders_lifecycle_legacy)').all() as Array<{ name: string }>).map((item) => item.name);
        const newColumns = (this.db.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>).map((item) => item.name);
        const shared = newColumns.filter((column) => oldColumns.includes(column));
        const select = shared.map((column) => {
          if (column === 'status') return `CASE status
            WHEN 'NEW' THEN 'CREATED'
            WHEN 'PAYMENT_PENDING' THEN CASE WHEN deposit_status='SUBMITTED' THEN 'AWAITING_PAYMENT_VERIFICATION' ELSE 'AWAITING_DEPOSIT' END
            WHEN 'PAID' THEN 'CONFIRMED'
            WHEN 'PURCHASING' THEN 'PREPARING'
            WHEN 'PURCHASED' THEN 'PREPARING'
            WHEN 'ARRIVED' THEN 'IN_TRANSIT'
            ELSE status END AS status`;
          if (column === 'payment_status') return `CASE payment_status WHEN 'CANCELLED' THEN 'FAILED' ELSE payment_status END AS payment_status`;
          return column;
        });
        this.db.exec(`INSERT INTO orders (${shared.join(',')}) SELECT ${select.join(',')} FROM orders_lifecycle_legacy`);
        this.db.exec('DROP TABLE orders_lifecycle_legacy');
        for (const indexSql of ORDERS_INDEXES_SQL) this.db.exec(indexSql);
      })();
    } finally {
      this.db.pragma('legacy_alter_table = OFF');
      this.db.pragma('foreign_keys = ON');
    }
    console.info('[DB] Order lifecycle upgraded to customer-account statuses.');
  }

  /** Upgrade payment constraints/statuses while preserving the one payment entity per order. */
  private migratePaymentsToAccountLifecycle() {
    const row = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='payments'").get() as { sql?: string } | undefined;
    if (!row || String(row.sql || '').includes('PENDING_VERIFICATION')) return;
    this.db.pragma('foreign_keys = OFF');
    this.db.pragma('legacy_alter_table = ON');
    try {
      this.db.transaction(() => {
        this.db.exec('DROP TABLE IF EXISTS payments_lifecycle_legacy');
        this.db.exec('ALTER TABLE payments RENAME TO payments_lifecycle_legacy');
        this.db.exec(PAYMENTS_TABLE_SQL);
        const oldColumns = (this.db.prepare('PRAGMA table_info(payments_lifecycle_legacy)').all() as Array<{ name: string }>).map((item) => item.name);
        const newColumns = (this.db.prepare('PRAGMA table_info(payments)').all() as Array<{ name: string }>).map((item) => item.name);
        const shared = newColumns.filter((column) => oldColumns.includes(column));
        const select = shared.map((column) => column === 'status'
          ? `CASE status WHEN 'CANCELLED' THEN 'FAILED' ELSE status END AS status`
          : column);
        this.db.exec(`INSERT INTO payments (${shared.join(',')}) SELECT ${select.join(',')} FROM payments_lifecycle_legacy`);
        this.db.exec('DROP TABLE payments_lifecycle_legacy');
      })();
    } finally {
      this.db.pragma('legacy_alter_table = OFF');
      this.db.pragma('foreign_keys = ON');
    }
    console.info('[DB] Payment lifecycle upgraded to canonical statuses.');
  }

  /** Separate transactions, transfer proofs and invoices; deliveries already serve as shipments. */
  private ensureAccountCommerceSchema() {
    this.ensureColumn('payments', 'payment_number', 'TEXT');
    this.ensureColumn('payments', 'currency', "TEXT NOT NULL DEFAULT 'TND'");
    this.ensureColumn('payments', 'provider', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('payments', 'gateway_payment_ref', 'TEXT');
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_number ON payments(payment_number) WHERE payment_number IS NOT NULL AND payment_number!='';
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, created_at DESC);

      CREATE TABLE IF NOT EXISTS payment_transactions (
        id TEXT PRIMARY KEY,
        transaction_number TEXT NOT NULL UNIQUE,
        payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
        provider TEXT NOT NULL,
        provider_reference TEXT,
        checkout_url TEXT NOT NULL DEFAULT '',
        amount_tnd REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'TND',
        status TEXT NOT NULL CHECK(status IN ('PENDING','PENDING_VERIFICATION','PAID','PARTIALLY_PAID','FAILED','REJECTED','REFUNDED')),
        failure_reason TEXT NOT NULL DEFAULT '',
        provider_payload TEXT NOT NULL DEFAULT '{}',
        confirmed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_transactions_account ON payment_transactions(account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_transactions_payment ON payment_transactions(payment_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_provider_ref ON payment_transactions(provider, provider_reference)
        WHERE provider_reference IS NOT NULL AND provider_reference!='';

      CREATE TABLE IF NOT EXISTS payment_proofs (
        id TEXT PRIMARY KEY,
        payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
        file_path TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        transfer_reference TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('PENDING_VERIFICATION','APPROVED','REJECTED')),
        submitted_at TEXT NOT NULL,
        reviewed_at TEXT,
        reviewed_by TEXT,
        rejection_reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_proofs_review_queue ON payment_proofs(status, submitted_at ASC);
      CREATE INDEX IF NOT EXISTS idx_proofs_order ON payment_proofs(order_id, submitted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_proofs_account ON payment_proofs(account_id, submitted_at DESC);

      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT NOT NULL UNIQUE,
        order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED','VOID')),
        file_path TEXT NOT NULL DEFAULT '',
        issued_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_invoices_account ON invoices(account_id, issued_at DESC);

      CREATE TABLE IF NOT EXISTS customer_preferences (
        account_id TEXT PRIMARY KEY REFERENCES customer_accounts(id) ON DELETE CASCADE,
        dark_mode INTEGER NOT NULL DEFAULT 0,
        order_updates INTEGER NOT NULL DEFAULT 1,
        payment_updates INTEGER NOT NULL DEFAULT 1,
        shipping_updates INTEGER NOT NULL DEFAULT 1,
        invoice_updates INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
    `);
    this.ensureColumn('payment_transactions', 'checkout_url', "TEXT NOT NULL DEFAULT ''");

    const paymentRows = this.db.prepare("SELECT id,created_at FROM payments WHERE payment_number IS NULL OR payment_number='' ORDER BY created_at").all() as Array<{ id: string; created_at: string }>;
    const updatePaymentNumber = this.db.prepare('UPDATE payments SET payment_number=? WHERE id=?');
    this.db.transaction(() => {
      for (const payment of paymentRows) updatePaymentNumber.run(this.generatePaymentNumber(), payment.id);
    })();

    const legacyInvoices = this.db.prepare("SELECT id,account_id,invoice_number,invoice_path,updated_at FROM orders WHERE invoice_number!=''").all() as any[];
    const insertInvoice = this.db.prepare(`INSERT OR IGNORE INTO invoices
      (id,invoice_number,order_id,account_id,status,file_path,issued_at,created_at,updated_at) VALUES (?,?,?,?, 'ISSUED',?,?,?,?)`);
    for (const invoice of legacyInvoices) insertInvoice.run(`invoice_${randomUUID()}`, invoice.invoice_number, invoice.id, invoice.account_id,
      invoice.invoice_path || '', invoice.updated_at, invoice.updated_at, invoice.updated_at);

      const legacyProofs = this.db.prepare("SELECT o.*,p.id payment_id,p.reference payment_reference FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.deposit_proof_path!=''").all() as any[];
    const insertProof = this.db.prepare(`INSERT INTO payment_proofs
      (id,payment_id,order_id,account_id,file_path,original_name,mime_type,size_bytes,transfer_reference,status,submitted_at,reviewed_at,reviewed_by,rejection_reason,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const proof of legacyProofs) {
      const exists = this.db.prepare('SELECT id FROM payment_proofs WHERE order_id=? AND file_path=?').get(proof.id, proof.deposit_proof_path);
      if (exists) continue;
      const status = proof.deposit_status === 'PAID' ? 'APPROVED' : proof.deposit_status === 'REJECTED' ? 'REJECTED' : 'PENDING_VERIFICATION';
      const submitted = proof.deposit_submitted_at || proof.updated_at || proof.created_at;
      let size = 0;
      try { size = fs.statSync(proof.deposit_proof_path).size; } catch {}
      insertProof.run(`proof_${randomUUID()}`, proof.payment_id, proof.id, proof.account_id, proof.deposit_proof_path,
        path.basename(proof.deposit_proof_path), 'application/octet-stream', size, proof.payment_reference || '', status, submitted,
        status === 'PENDING_VERIFICATION' ? null : proof.updated_at, proof.deposit_reviewed_by || null,
        status === 'REJECTED' ? proof.deposit_review_note || '' : '', submitted, proof.updated_at || submitted);
    }
  }

  /**
   * SQLite cannot alter CHECK constraints, so compatible tables are rebuilt in place.
   */
  private rebuildTableIfLegacy(table: string, requiredMarker: string, createSql: string, indexesSql: string[]) {
    const row = this.db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(table) as { sql?: string } | undefined;
    if (!row || String(row.sql || '').includes(requiredMarker)) return;
    const legacy = `${table}_legacy`;
    // legacy_alter_table=ON يمنع SQLite من إعادة كتابة مفاتيح FK في الجداول الأخرى
    // لتشير إلى الجدول المُعاد تسميته (ثم تتكسر عند حذفه) — خطأ معروف في وصفة rebuild.
    this.db.pragma('foreign_keys = OFF');
    this.db.pragma('legacy_alter_table = ON');
    try {
      this.db.transaction(() => {
        this.db.exec(`DROP TABLE IF EXISTS ${legacy}`);
        this.db.exec(`ALTER TABLE ${table} RENAME TO ${legacy}`);
        this.db.exec(createSql);
        const oldCols = (this.db.prepare(`PRAGMA table_info(${legacy})`).all() as Array<{ name: string }>).map((c) => c.name);
        const newCols = (this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
        const shared = newCols.filter((column) => oldCols.includes(column));
        if (shared.length) this.db.exec(`INSERT INTO ${table} (${shared.join(',')}) SELECT ${shared.join(',')} FROM ${legacy}`);
        this.db.exec(`DROP TABLE ${legacy}`);
        for (const indexSql of indexesSql) this.db.exec(indexSql);
      })();
    } finally {
      this.db.pragma('legacy_alter_table = OFF');
      this.db.pragma('foreign_keys = ON');
    }
    console.info(`[DB] تمت ترقية جدول ${table} إلى المخطط الحالي.`);
  }

  private migrateLegacyArrivalClientStores(): void {
    const legacyClients = this.all<any>(`SELECT ac.id,ac.store_id,ac.created_at,ac.updated_at
      FROM crm_arrival_clients ac
      WHERE ac.store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM crm_arrival_client_stores acs WHERE acs.arrival_client_id=ac.id AND acs.store_id=ac.store_id
      )`);
    this.transaction(() => {
      for (const client of legacyClients) {
        this.run(`INSERT INTO crm_arrival_client_stores (id,arrival_client_id,store_id,created_at,updated_at)
          VALUES (?,?,?,?,?)`, `crm_client_store_${randomUUID()}`, client.id, client.store_id,
        client.created_at || new Date().toISOString(), client.updated_at || client.created_at || new Date().toISOString());
      }
      this.run(`UPDATE crm_arrival_sources SET arrival_client_store_id=(
        SELECT acs.id FROM crm_arrival_client_stores acs
        JOIN crm_arrival_clients ac ON ac.id=acs.arrival_client_id
        WHERE acs.arrival_client_id=crm_arrival_sources.arrival_client_id AND acs.store_id=ac.store_id
        ORDER BY acs.created_at LIMIT 1
      ) WHERE arrival_client_store_id IS NULL`);
      this.run(`UPDATE crm_extraction_jobs SET arrival_client_store_id=(
        SELECT src.arrival_client_store_id FROM crm_arrival_sources src WHERE src.id=crm_extraction_jobs.source_id
      ) WHERE arrival_client_store_id IS NULL`);
      this.run(`UPDATE crm_extracted_products SET arrival_client_store_id=(
        SELECT acs.id FROM crm_arrival_client_stores acs
        WHERE acs.arrival_client_id=crm_extracted_products.arrival_client_id
          AND acs.store_id=crm_extracted_products.store_id
        ORDER BY acs.created_at LIMIT 1
      ) WHERE arrival_client_store_id IS NULL`);
    });
    const unresolved = {
      sources: Number(this.get<any>('SELECT COUNT(*) count FROM crm_arrival_sources WHERE arrival_client_store_id IS NULL')?.count || 0),
      jobs: Number(this.get<any>('SELECT COUNT(*) count FROM crm_extraction_jobs WHERE arrival_client_store_id IS NULL')?.count || 0),
      products: Number(this.get<any>('SELECT COUNT(*) count FROM crm_extracted_products WHERE arrival_client_store_id IS NULL')?.count || 0),
    };
    if (unresolved.sources || unresolved.jobs || unresolved.products) {
      throw new Error(`ARRIVAL_MULTISTORE_MIGRATION_INCOMPLETE:${JSON.stringify(unresolved)}`);
    }
  }

  private recordArrivalMultistoreMigration(): void {
    const migrationKey = 'crm_arrival_multistore_v1';
    const existing = this.get<any>(`SELECT applied_at,backup_status,backup_file FROM crm_schema_migrations
      WHERE migration_key=?`, migrationKey);
    if (existing) {
      if (existing.backup_status === 'NOT_REQUIRED' && !existing.backup_file) {
        const recovered = this.findVerifiedArrivalMultistoreBackup(existing.applied_at);
        if (recovered) {
          this.run(`UPDATE crm_schema_migrations SET backup_status='VERIFIED',backup_file=?
            WHERE migration_key=? AND backup_status='NOT_REQUIRED' AND backup_file IS NULL`, recovered, migrationKey);
          console.info(`[database] reconciled verified pre-migration backup: ${recovered}`);
        }
      }
      return;
    }

    const appliedAt = new Date().toISOString();
    const verifiedBackup = this.arrivalMultistoreBackupFile
      || this.findVerifiedArrivalMultistoreBackup(appliedAt);
    if (this.arrivalMultistoreMigrationRequired && !verifiedBackup) {
      throw new Error('ARRIVAL_MULTISTORE_PRE_MIGRATION_BACKUP_REQUIRED');
    }
    this.run(`INSERT INTO crm_schema_migrations (migration_key,applied_at,backup_status,backup_file)
      VALUES (?,?,?,?)`, migrationKey, appliedAt,
    verifiedBackup ? 'VERIFIED' : 'NOT_REQUIRED', verifiedBackup);
  }

  arrivalMultistoreMigrationReadiness(): {
    ready: boolean;
    backupStatus: 'VERIFIED' | 'NOT_REQUIRED' | 'MISSING';
    backupId: string | null;
    appliedAt: string | null;
  } {
    const migration = this.get<any>(`SELECT applied_at,backup_status,backup_file FROM crm_schema_migrations
      WHERE migration_key='crm_arrival_multistore_v1'`);
    const unresolved = Number(this.get<any>(`SELECT
      (SELECT COUNT(*) FROM crm_arrival_sources WHERE arrival_client_store_id IS NULL)
      +(SELECT COUNT(*) FROM crm_extraction_jobs WHERE arrival_client_store_id IS NULL)
      +(SELECT COUNT(*) FROM crm_extracted_products WHERE arrival_client_store_id IS NULL) count`)?.count || 0);
    return {
      ready: Boolean(migration) && unresolved === 0,
      backupStatus: migration?.backup_status === 'VERIFIED' ? 'VERIFIED'
        : migration?.backup_status === 'NOT_REQUIRED' ? 'NOT_REQUIRED' : 'MISSING',
      backupId: migration?.backup_file || null,
      appliedAt: migration?.applied_at || null,
    };
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((item) => item.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  private ensurePricingEngine() {
    this.ensureColumn('pricing_config', 'exchange_buffer_percent', 'REAL NOT NULL DEFAULT 3');
    this.ensureColumn('pricing_config', 'freight_per_kg_tnd', 'REAL NOT NULL DEFAULT 13');
    this.ensureColumn('pricing_config', 'local_delivery_tnd', 'REAL NOT NULL DEFAULT 8');
    this.ensureColumn('pricing_config', 'commission_percent', 'REAL NOT NULL DEFAULT 10');
    this.ensureColumn('pricing_config', 'minimum_commission_tnd', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('pricing_config', 'rpd_percent', 'REAL NOT NULL DEFAULT 3');
    this.ensureColumn('pricing_config', 'rpd_minimum_tnd', 'REAL NOT NULL DEFAULT 10');
    this.ensureColumn('pricing_config', 'default_tva_rate', 'REAL NOT NULL DEFAULT 0.19');
    this.db.exec(`CREATE TABLE IF NOT EXISTS customs_categories (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      keywords TEXT NOT NULL DEFAULT '[]',
      customs_rate REAL NOT NULL DEFAULT 0,
      tva_rate REAL NOT NULL DEFAULT 0.19,
      default_weight_kg REAL NOT NULL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'ALLOWED' CHECK(status IN ('ALLOWED','WARNING','RESTRICTED')),
      display_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);
    const now = new Date().toISOString();
    const insert = this.db.prepare(`INSERT OR IGNORE INTO customs_categories
      (id,label,keywords,customs_rate,tva_rate,default_weight_kg,status,display_order,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    DEFAULT_CUSTOMS_CATEGORIES.forEach((category, index) => {
      insert.run(category.id, category.label, JSON.stringify(category.keywords), category.customsRate,
        category.tvaRate, category.defaultWeightKg, category.status, index + 1, now);
    });
    this.db.exec(`UPDATE settings SET setting_value='AYROVI',updated_at='${now}'
      WHERE setting_key IN ('company_name','company_legal_name') AND setting_value='AYSONIC'`);
    this.db.exec(`UPDATE admin_users SET name='AYROVI Admin',updated_at='${now}' WHERE name='AYSONIC Admin'`);
    this.rebrandNoirOrangePalette();
  }

  /** Public chrome: 70% white / 25% black / 5% orange. Rewrites old purple/yellow/orange-wash defaults. */
  private rebrandNoirOrangePalette() {
    const now = new Date().toISOString();
    const wash = new Set(['#ffb070', '#fbbf24', '#fe7003', '#f7c948']);
    const paint = (raw: string) => {
      let next = raw
        .replace(/#673de6/gi, '#111318')
        .replace(/#5025d1/gi, '#050505')
        .replace(/#7e57ff/gi, '#3f3f46')
        .replace(/#24104f/gi, '#111318')
        .replace(/"aiLabel":"AI"/g, '"aiLabel":"SONIM"')
        .replace(/"preset":"violet"/g, '"preset":"noir"')
        .replace(/Plus Jakarta Sans/g, 'Inter');
      try {
        const parsed = JSON.parse(next);
        if (parsed?.colors) {
          const announcement = String(parsed.colors.announcementBackground || '').toLowerCase();
          if (wash.has(announcement)) {
            parsed.colors.announcementBackground = '#111318';
            parsed.colors.announcementText = '#ffffff';
          }
          const accent = String(parsed.colors.accent || '').toLowerCase();
          if (accent === '#fbbf24' || accent === '#ffb070') parsed.colors.accent = '#fe7003';
        }
        if (parsed?.icons) {
          const active = String(parsed.icons.activeColor || '').toLowerCase();
          if (active === '#ffb070' || active === '#fbbf24' || active === '#111318') parsed.icons.activeColor = '#fe7003';
        }
        if (parsed?.navigation) {
          const navBg = String(parsed.navigation.background || '').toLowerCase();
          if (navBg === '#17151f' || navBg === '#24104f') {
            parsed.navigation.background = '#ffffff';
            if (String(parsed.navigation.color || '').toLowerCase() === '#ffffff') parsed.navigation.color = '#111318';
          }
          if (String(parsed.navigation.activeBackground || '').toLowerCase() === '#111318') {
            parsed.navigation.activeBackground = '#ffffff';
          }
        }
        if (parsed?.preset === 'noir' && String(parsed.accent || '').toLowerCase() === '#ffb070') {
          parsed.accent = '#fe7003';
        }
        return JSON.stringify(parsed);
      } catch {
        return next;
      }
    };
    for (const key of ['interface_config', 'site_theme']) {
      const row = this.get<any>('SELECT id,setting_value FROM settings WHERE setting_key=?', key);
      if (!row?.setting_value) continue;
      const next = paint(String(row.setting_value));
      if (next !== row.setting_value) this.run('UPDATE settings SET setting_value=?,updated_at=? WHERE id=?', next, now, row.id);
    }
  }

  private seedCoreData() {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR IGNORE INTO pricing_config (
        id, version, rate_eur, rate_usd, rate_gbp, rate_jpy, customs_fee_percent,
        shipping_fee_tnd, service_fee_percent, minimum_service_fee_tnd, express_fee_tnd, updated_at
      ) VALUES ('default', 1, 4, 4, 4.8, 0.0265, 0, 25, 8, 10, 15, ?)
    `).run(now);

    const insertSetting = this.db.prepare(`
      INSERT OR IGNORE INTO settings (id, category, setting_key, setting_value, value_type, label, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const settings = [
      ['setting_name', 'GENERAL', 'company_name', 'AYROVI', 'STRING', 'Nom de la plateforme'],
      ['setting_email', 'GENERAL', 'company_email', 'contact@ayrovi.tn', 'STRING', 'Email'],
      ['setting_phone', 'GENERAL', 'company_phone', '+216 00 000 000', 'STRING', 'Téléphone'],
      ['setting_address', 'GENERAL', 'company_address', 'Tunis, Tunisie', 'STRING', 'Adresse'],
      ['setting_currency', 'COMMERCE', 'default_currency', 'TND', 'STRING', 'Devise'],
      ['setting_governorates', 'DELIVERY', 'governorates', JSON.stringify([
        'Ariana','Béja','Ben Arous','Bizerte','Gabès','Gafsa','Jendouba','Kairouan','Kasserine','Kébili','Le Kef','Mahdia','La Manouba','Médenine','Monastir','Nabeul','Sfax','Sidi Bouzid','Siliana','Sousse','Tataouine','Tozeur','Tunis','Zaghouan',
      ]), 'JSON', 'Gouvernorats desservis'],
      ['setting_delivery_delay', 'DELIVERY', 'delivery_delay', '5 à 8 jours ouvrés', 'STRING', 'Délai indicatif'],
      ['setting_payment_methods', 'PAYMENT', 'payment_methods', JSON.stringify(['CARD','FLOUCI','BANK_TRANSFER','POSTE']), 'JSON', 'Méthodes de paiement de l’acompte'],
      ['setting_deposit_percent', 'PAYMENT', 'deposit_percent', '20', 'NUMBER', 'Pourcentage de l’acompte de confirmation (%)'],
      ['setting_deposit_review_delay', 'PAYMENT', 'deposit_review_delay', 'Sous 1 jour ouvré après réception du justificatif', 'STRING', 'Délai indicatif de vérification de l’acompte'],
      ['setting_unavailable_refund', 'PAYMENT', 'unavailable_refund_policy', 'Acompte remboursé si AYROVI ne peut pas valider ou acheter l’article demandé', 'STRING', 'Politique si l’article ne peut pas être validé'],
      ['setting_company_legal_name', 'PAYMENT', 'company_legal_name', 'AYROVI', 'STRING', 'Nom légal de l’entreprise (reçus/factures)'],
      ['setting_bank_rib', 'PAYMENT', 'bank_rib', '', 'STRING', 'RIB pour le virement bancaire'],
      ['setting_poste_account', 'PAYMENT', 'poste_account', '', 'STRING', 'Compte courant postal (mandat poste)'],
      ['setting_flouci_number', 'PAYMENT', 'flouci_number', '', 'STRING', 'Numéro / identifiant Flouci'],
      ['setting_invoice_email', 'PAYMENT', 'invoice_email_enabled', 'true', 'BOOLEAN', 'Envoyer la facture par e-mail'],
      ['setting_card_discount_percent', 'PAYMENT', 'card_discount_percent', '5', 'NUMBER', 'Remise (%) sur l’acompte payé par carte bancaire'],
      ['setting_admin_alert_email', 'GENERAL', 'admin_alert_email', '', 'STRING', 'Email admin pour les alertes (nouvel acompte à vérifier…)'],
      ['setting_facebook_url', 'CHANNELS', 'facebook_url', '', 'STRING', 'Lien page Facebook'],
      ['setting_instagram_url', 'CHANNELS', 'instagram_url', '', 'STRING', 'Lien profil Instagram'],
      ['setting_tiktok_url', 'CHANNELS', 'tiktok_url', '', 'STRING', 'Lien profil TikTok'],
      ['setting_whatsapp_url', 'CHANNELS', 'whatsapp_url', '', 'STRING', 'Lien/numéro WhatsApp (https://wa.me/…)'],
      ['setting_site_theme', 'DESIGN', 'site_theme', JSON.stringify({
        preset: 'noir', primary: '#111318', primaryDark: '#050505', primaryLight: '#3f3f46',
        accent: '#fe7003', ink: '#1d2130', gradient: 'linear-gradient(135deg,#111318 0%,#050505 100%)',
        font: 'jakarta', radius: 'soft',
      }), 'JSON', 'Thème visuel de la plateforme (préréglages et couleurs)'],
      ['setting_interface_config', 'INTERFACE', 'interface_config', JSON.stringify({
        logoUrl: '/media/logo-ayrovi.png',
        sections: [
          { id: 'hero', visible: true, order: 10, title: 'Toute la mode du monde, livrée chez vous.', subtitle: '', image: '', backgroundColor: '#111318', textColor: '#ffffff', paddingY: 0, contained: false },
          { id: 'cms', visible: true, order: 20, title: '', subtitle: '', image: '', backgroundColor: '#ffffff', textColor: '#1d2130', paddingY: 0, contained: false },
          { id: 'brands', visible: true, order: 30, title: '', subtitle: '', image: '', backgroundColor: '#f8f9fe', textColor: '#1d2130', paddingY: 0, contained: false },
          { id: 'about', visible: true, order: 40, title: '', subtitle: '', image: '', backgroundColor: '#ffffff', textColor: '#1d2130', paddingY: 0, contained: false },
          { id: 'footer', visible: true, order: 50, title: '', subtitle: '', image: '', backgroundColor: '#ffffff', textColor: '#1d2130', paddingY: 0, contained: false },
        ],
        typography: { preset: 'ayrovi-modern', body: "'Inter', 'Noto Sans Arabic', 'Helvetica Neue', Helvetica, Arial, sans-serif", display: "'Inter', 'Noto Sans Arabic', 'Helvetica Neue', Helvetica, Arial, sans-serif", baseSize: 16, align: 'start', headingColor: '#1d2130', textColor: '#6b7280', lineHeight: 1.5, letterSpacing: -0.011, headingScale: 1 },
        colors: { pageBackground: '#ffffff', surfaceBackground: '#ffffff', surfaceAlt: '#f8f9fe', borderColor: '#e2e8f0', primary: '#111318', primaryDark: '#050505', primaryLight: '#3f3f46', accent: '#fe7003', headerBackground: '#ffffff', headerText: '#1d2130', announcementBackground: '#111318', announcementText: '#ffffff', heroBackground: '#111318', heroText: '#ffffff', footerBackground: '#ffffff', footerText: '#1d2130', success: '#15803d', warning: '#b77900', danger: '#dc2626' },
        buttons: { background: '#111318', color: '#ffffff', secondaryBackground: '#ffffff', secondaryColor: '#050505', borderColor: '#111318', borderWidth: 1, radius: 12, height: 44, shape: 'soft' },
        icons: { library: 'ayrovi', color: '#5b6472', activeColor: '#fe7003', size: 28, style: 'outline' },
        navigation: { background: '#ffffff', color: '#111318', activeBackground: '#ffffff', showLabels: true, height: 80, lensLabel: 'Lens', aiLabel: 'SONIM', visionLabel: 'Vision' },
        slider: { autoplay: true, duration: 5200, transition: 1200, showArrows: true, showDots: true },
        layout: { sectionGap: 0, maxWidth: 1280, pagePadding: 16, cardRadius: 16, cardBorderWidth: 1, shadow: 'soft' },
      }), 'JSON', 'واجهتي — configuration visuelle de l’interface publique'],
      ['setting_footer_about', 'DESIGN', 'footer_about', 'La plateforme unifiée pour vos achats internationaux en Dinars Tunisiens. Commandez facilement depuis SHEIN, Amazon, TEMU et AliExpress en toute transparence.', 'STRING', 'Texte de présentation du pied de page'],
    ];
    for (const row of settings) insertSetting.run(...row, now);

    if ((this.db.prepare('SELECT COUNT(*) AS count FROM hero_slides').get() as any).count === 0) {
      const insert = this.db.prepare(`INSERT INTO hero_slides
        (id,image,video,title,subtitle,cta,target_url,display_order,active,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      [
        ['hero_homme','/media/hero-homme.jpg','', 'Toute la mode du monde, livrée chez vous.','','','',1,1],
        ['hero_femme','/media/hero-femme.jpg','', 'Toute la mode du monde, livrée chez vous.','','','',2,1],
        ['hero_enfants','/media/hero-enfants.jpg','', 'Toute la mode du monde, livrée chez vous.','','','',3,1],
      ].forEach((row) => insert.run(...row, now, now));
    }

    if ((this.db.prepare('SELECT COUNT(*) AS count FROM brands').get() as any).count === 0) {
      const insert = this.db.prepare(`INSERT INTO brands
        (id,name,logo,image,category,url,description,display_order,active,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      const brands = [
        ['brand_jordan','Jordan','jordan.jpg','SPORT_LIFESTYLE'],
        ['brand_adidas','adidas','adidas.jpg','SPORT_LIFESTYLE'],
        ['brand_nike','Nike','nike.jpg','SPORT_LIFESTYLE'],
        ['brand_shein','SHEIN','shein.jpg','FASHION'],
        ['brand_ysl','Saint Laurent','ysl.jpg','FASHION'],
        ['brand_prada','Prada','prada.jpg','FASHION'],
        ['brand_hermes','Hermès','hermes.jpg','FASHION'],
        ['brand_chanel','Chanel','chanel.jpg','FASHION'],
        ['brand_dior','Dior','dior.jpg','FASHION'],
        ['brand_zara','Zara','zara.jpg','FASHION'],
      ];
      brands.forEach(([id,name,file,category], index) => insert.run(
        id, name, `/media/brands/${file}`, '', category, '', '', index + 1, 1, now, now,
      ));
    }

    if ((this.db.prepare('SELECT COUNT(*) AS count FROM arrivals').get() as any).count === 0) {
      const insert = this.db.prepare(`INSERT INTO arrivals
        (id,name,type,departure_at,expected_arrival_at,ends_at,description,main_image,secondary_images,badge,status,published_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      insert.run('arrival_08','ARRIVAGE #08','STANDARD','2026-08-13T08:00:00.000Z','2026-08-20T17:00:00.000Z',null,
        'Sélection internationale mode et lifestyle, livrée en Tunisie.','/media/hero-homme.jpg','[]','Standard','ACTIVE',now,now,now);
      insert.run('arrival_express_04','ARRIVAGE EXPRESS #04','EXPRESS','2026-08-13T08:00:00.000Z','2026-08-17T11:00:00.000Z',null,
        'Arrivage prioritaire pour les commandes éligibles Express.','/media/hero-femme.jpg','[]','Express','ACTIVE',now,now,now);
    }

    if ((this.db.prepare('SELECT COUNT(*) AS count FROM products').get() as any).count === 0) {
      const rules = this.getPricingRules();
      const breakdown = calculatePrice(rules, 21.99, 'EUR')!;
      this.db.prepare(`INSERT INTO products
        (id,name,description,image,additional_images,brand_id,brand_name,category,source_url,source_platform,
         original_price,currency,converted_price,customs_fee,shipping_fee,service_fee,final_price,express_available,stock_status,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          'product_demo_01','Ensemble tendance AYROVI','Produit de démonstration relié à l’arrivage actif.',
          '/media/hero-femme.jpg','[]','brand_shein','SHEIN','Mode','https://www.shein.com/','SHEIN',21.99,'EUR',
          breakdown.convertedPriceTND,breakdown.customsFeeTND,breakdown.shippingFeeTND,breakdown.serviceFeeTND,breakdown.totalTND,
          1,'AVAILABLE','ACTIVE',now,now,
        );
      this.db.prepare('INSERT OR IGNORE INTO product_arrivals (product_id,arrival_id) VALUES (?,?)').run('product_demo_01','arrival_08');
      this.db.prepare('INSERT OR IGNORE INTO product_arrivals (product_id,arrival_id) VALUES (?,?)').run('product_demo_01','arrival_express_04');
    }

    if ((this.db.prepare('SELECT COUNT(*) AS count FROM promotions').get() as any).count === 0) {
      this.db.prepare(`INSERT INTO promotions
        (id,name,description,image,discount_type,value,starts_at,ends_at,promo_code,usage_limit,usage_count,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          'promo_arrival_08','Promo Arrivage #08','Profitez de 20% sur la sélection de l’arrivage #08.',
          '/media/hero-enfants.jpg','PERCENTAGE',20,'2026-08-12T00:00:00.000Z','2026-08-21T23:59:59.000Z','ARRIVAGE20',500,0,'ACTIVE',now,now,
        );
      this.db.prepare('INSERT OR IGNORE INTO promotion_arrivals (promotion_id,arrival_id) VALUES (?,?)').run('promo_arrival_08','arrival_08');
      this.db.prepare('INSERT OR IGNORE INTO promotion_products (promotion_id,product_id) VALUES (?,?)').run('promo_arrival_08','product_demo_01');
    }

    if ((this.db.prepare('SELECT COUNT(*) AS count FROM stories').get() as any).count === 0) {
      this.db.prepare(`INSERT INTO stories
        (id,media_type,media_url,title,description,cta,target_url,product_id,arrival_id,promotion_id,publish_at,expires_at,priority,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          'story_arrival_08','IMAGE','/media/hero-femme.jpg','Arrivage #08 ouvert','Découvrez la sélection et préparez votre commande.','Découvrir','#arrivages',
          'product_demo_01','arrival_08','promo_arrival_08','2026-08-12T00:00:00.000Z','2026-08-21T23:59:59.000Z',100,'PUBLISHED',now,now,
        );
    }

    if ((this.db.prepare('SELECT COUNT(*) AS count FROM news_items').get() as any).count === 0) {
      this.db.prepare(`INSERT INTO news_items
        (id,title,summary,content,image,category,arrival_id,product_id,author,published_at,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          'news_arrival_08','Le nouvel arrivage AYROVI est ouvert','Les commandes pour l’arrivage #08 sont maintenant disponibles.',
          'Préparez vos liens et captures avec Lens. AYROVI centralise le calcul, l’achat et la livraison en Tunisie.',
          '/media/hero-homme.jpg','NEW_ARRIVAL','arrival_08','product_demo_01','Équipe AYROVI','2026-08-12T00:00:00.000Z','PUBLISHED',now,now,
        );
    }

    if ((this.db.prepare('SELECT COUNT(*) AS count FROM ai_knowledge').get() as any).count === 0) {
      const insert = this.db.prepare(`INSERT INTO ai_knowledge
        (id,category,question,answer,keywords,priority,active,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`);
      insert.run('ai_delivery','FAQ','Quels sont les délais de livraison ?',
        'AYROVI livre dans les 24 gouvernorats. Le délai indicatif configuré est de 5 à 8 jours ouvrés.',
        JSON.stringify(['livraison','délai','gouvernorat']),100,1,now,now);
      insert.run('ai_payment','FAQ','Quels moyens de paiement sont disponibles ?',
        'Les moyens gérés par AYROVI sont le paiement à la livraison, D17 et Flouci.',
        JSON.stringify(['paiement','d17','flouci','livraison']),90,1,now,now);
      insert.run('ai_order','PREDEFINED_RESPONSE','Comment commander ?',
        'Ouvrez Lens, collez le lien du produit ou ajoutez une capture, puis confirmez le panier et vos coordonnées.',
        JSON.stringify(['commande','commander','lens','capture']),80,1,now,now);
    }
    this.rebrandNoirOrangePalette();
  }

  public all<T = any>(sql: string, ...params: any[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  public get<T = any>(sql: string, ...params: any[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  public run(sql: string, ...params: any[]): Database.RunResult {
    return this.db.prepare(sql).run(...params);
  }

  /**
   * Multi-statement DDL helper. `run()` prepares a single statement, so a schema
   * block written as `CREATE TABLE …; CREATE TABLE …;` would silently execute only
   * its first statement. Additive foundations (ERP Core) use this instead.
   * Every statement is expected to be idempotent (IF NOT EXISTS / ALTER on a
   * missing column); a statement that fails is skipped, never thrown.
   */
  public runSchema(sql: string): number {
    const statements = sql
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0 && !statement.startsWith('--'));
    let applied = 0;
    for (const statement of statements) {
      try {
        this.db.exec(`${statement};`);
        applied += 1;
      } catch {
        // already applied (e.g. ALTER TABLE ADD COLUMN on an existing column) — idempotent by design
      }
    }
    return applied;
  }

  public transaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }

  public close() {
    this.db.close();
  }

  public getCustomsCategories() {
    return this.all<any>('SELECT * FROM customs_categories ORDER BY display_order,id').map((row) => {
      let keywords: string[] = [];
      try { keywords = JSON.parse(row.keywords); } catch { keywords = []; }
      return {
        id: String(row.id),
        label: String(row.label || row.id),
        keywords: Array.isArray(keywords) ? keywords.map((item) => String(item)) : [],
        customsRate: Number(row.customs_rate) || 0,
        tvaRate: Number(row.tva_rate) || 0.19,
        defaultWeightKg: Number(row.default_weight_kg) || 0.5,
        status: row.status === 'RESTRICTED' ? 'RESTRICTED' as const : row.status === 'WARNING' ? 'WARNING' as const : 'ALLOWED' as const,
      };
    });
  }

  public getPricingRules(): PricingRules {
    const row = this.get<any>('SELECT * FROM pricing_config WHERE id = ?', 'default');
    if (!row) throw new Error('PRICING_CONFIG_MISSING');
    return {
      id: row.id,
      version: Number(row.version),
      rateEUR: Number(row.rate_eur),
      rateUSD: Number(row.rate_usd),
      rateGBP: Number(row.rate_gbp),
      rateJPY: Number(row.rate_jpy),
      exchangeBufferPercent: Number(row.exchange_buffer_percent ?? 3),
      freightPerKgTND: Number(row.freight_per_kg_tnd ?? 13),
      localDeliveryTND: Number(row.local_delivery_tnd ?? 8),
      commissionPercent: Number(row.commission_percent ?? 10),
      minimumCommissionTND: Number(row.minimum_commission_tnd ?? 0),
      rpdPercent: Number(row.rpd_percent ?? 3),
      rpdMinimumTND: Number(row.rpd_minimum_tnd ?? 10),
      defaultTvaRate: Number(row.default_tva_rate ?? 0.19),
      expressFeeTND: Number(row.express_fee_tnd),
      categories: this.getCustomsCategories(),
      customsFeePercent: Number(row.customs_fee_percent),
      shippingFeeTND: Number(row.shipping_fee_tnd),
      serviceFeePercent: Number(row.service_fee_percent),
      minimumServiceFeeTND: Number(row.minimum_service_fee_tnd),
      updatedAt: row.updated_at,
    };
  }

  public updateCustomsCategories(raw: unknown) {
    if (!Array.isArray(raw) || !raw.length || raw.length > 20) throw new Error('CATEGORIES_INVALID');
    const existing = this.getCustomsCategories();
    const allowed = new Set(existing.map((item) => item.id));
    const now = new Date().toISOString();
    const update = this.db.prepare(`UPDATE customs_categories
      SET label=?,keywords=?,customs_rate=?,tva_rate=?,default_weight_kg=?,status=?,updated_at=? WHERE id=?`);
    for (const item of raw) {
        const id = String(item?.id || '');
        if (!allowed.has(id)) throw new Error('CATEGORY_UNKNOWN');
        const label = String(item?.label || '').trim().slice(0, 80);
        if (label.length < 2) throw new Error('CATEGORY_LABEL_INVALID');
        const keywords = Array.isArray(item?.keywords)
          ? item.keywords.map((word: unknown) => String(word || '').trim().slice(0, 80)).filter((word: string) => word.length >= 2).slice(0, 40)
          : [];
        if (!keywords.length) throw new Error('CATEGORY_KEYWORDS_INVALID');
        let customsRate = Number(item?.customsRate);
        if (Number.isFinite(customsRate) && customsRate > 1 && customsRate <= 100) customsRate /= 100;
        let tvaRate = Number(item?.tvaRate);
        if (Number.isFinite(tvaRate) && tvaRate > 1 && tvaRate <= 100) tvaRate /= 100;
        const weight = Number(item?.defaultWeightKg);
        const status = String(item?.status || '');
        if (!Number.isFinite(customsRate) || customsRate < 0 || customsRate > 1) throw new Error('CATEGORY_DUTY_INVALID');
        if (!Number.isFinite(tvaRate) || tvaRate < 0 || tvaRate > 1) throw new Error('CATEGORY_TVA_INVALID');
        if (!Number.isFinite(weight) || weight <= 0 || weight > 80) throw new Error('CATEGORY_WEIGHT_INVALID');
        if (!['ALLOWED', 'WARNING', 'RESTRICTED'].includes(status)) throw new Error('CATEGORY_STATUS_INVALID');
        update.run(label, JSON.stringify(keywords), customsRate, tvaRate, weight, status, now, id);
    }
    return this.getCustomsCategories();
  }

  public setDepositPercent(value: number) {
    const percent = Math.min(100, Math.max(1, Math.round(Number(value))));
    if (!Number.isFinite(Number(value)) || Number(value) < 1 || Number(value) > 100) throw new Error('DEPOSIT_PERCENT_INVALID');
    this.run(`UPDATE settings SET setting_value=?,updated_at=? WHERE setting_key='deposit_percent'`, String(percent), new Date().toISOString());
    return percent;
  }

  private mapRow(row: any): CartItem {
    return {
      id: row.id,
      sessionId: row.session_id,
      store: row.store,
      externalId: row.external_id,
      sourceUrl: row.source_url,
      title: row.title,
      imageUrl: row.image_url,
      sourcePrice: Number(row.source_price),
      sourceCurrency: row.source_currency,
      priceTND: Number(row.price_tnd),
      variant: row.variant,
      requestedSize: String(row.requested_size || ''),
      requestedColor: String(row.requested_color || ''),
      customerNote: String(row.customer_note || ''),
      referenceUrl: String(row.reference_url || ''),
      priceVerificationStatus: row.price_verification_status === 'PENDING_MANUAL' ? 'PENDING_MANUAL' : 'VERIFIED',
      quantity: Number(row.quantity),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private cartOwner(accountId?: string | null) {
    return accountId
      ? { clause: 'account_id = ?', value: accountId }
      : { clause: 'session_id = ? AND account_id IS NULL', value: '' };
  }

  public addItem(sessionId: string, item: AddToCartRequest, accountId?: string | null): CartItem {
    const now = new Date().toISOString();
    const owner = this.cartOwner(accountId);
    owner.value = accountId || sessionId;
    if (item.externalId) {
      const existing = this.get<any>(`
        SELECT * FROM cart_items WHERE ${owner.clause} AND store = ? AND external_id = ? AND source_url = ?
          AND IFNULL(variant, '') = IFNULL(?, '') AND requested_size = ? AND requested_color = ? AND customer_note = ?
      `, owner.value, item.store, item.externalId, item.url, item.variant || '', item.requestedSize || '', item.requestedColor || '', item.customerNote || '');
      if (existing) {
        const newQty = Number(existing.quantity) + (item.quantity || 1);
        if (newQty > 99) throw new RangeError('CART_QUANTITY_LIMIT');
        this.run(`UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ? AND ${owner.clause}`,
          newQty, now, existing.id, owner.value);
        return this.getItemById(existing.id, sessionId, accountId)!;
      }
    }

    const id = `ayr_${randomUUID().substring(0, 8)}`;
    this.run(`INSERT INTO cart_items (
      id, session_id, account_id, store, external_id, source_url, title, image_url,
      source_price, source_currency, price_tnd, variant, requested_size, requested_color, customer_note,
      reference_url, price_verification_status, quantity, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, sessionId, accountId || null, item.store, item.externalId || null, item.url, item.title, item.imageUrl,
    item.sourcePrice, item.sourceCurrency, item.priceTND, item.variant || null, item.requestedSize || '', item.requestedColor || '',
    item.customerNote || '', item.referenceUrl || '', item.priceVerificationStatus || 'VERIFIED', item.quantity || 1, now, now);
    return this.getItemById(id, sessionId, accountId)!;
  }

  public getItems(sessionId: string, accountId?: string | null): CartItem[] {
    const owner = this.cartOwner(accountId);
    const value = accountId || sessionId;
    return this.all<any>(`SELECT * FROM cart_items WHERE ${owner.clause} ORDER BY created_at DESC`, value).map((row) => this.mapRow(row));
  }

  public getItemById(id: string, sessionId: string, accountId?: string | null): CartItem | null {
    const owner = this.cartOwner(accountId);
    const row = this.get<any>(`SELECT * FROM cart_items WHERE id = ? AND ${owner.clause}`, id, accountId || sessionId);
    return row ? this.mapRow(row) : null;
  }

  public removeItem(id: string, sessionId: string, accountId?: string | null): boolean {
    const owner = this.cartOwner(accountId);
    return this.run(`DELETE FROM cart_items WHERE id = ? AND ${owner.clause}`, id, accountId || sessionId).changes > 0;
  }

  public updateQuantity(id: string, quantity: number, sessionId: string, accountId?: string | null): CartItem | null {
    if (quantity <= 0) {
      this.removeItem(id, sessionId, accountId);
      return null;
    }
    const owner = this.cartOwner(accountId);
    this.run(`UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ? AND ${owner.clause}`,
      quantity, new Date().toISOString(), id, accountId || sessionId);
    return this.getItemById(id, sessionId, accountId);
  }

  public clearCart(sessionId: string, accountId?: string | null): number {
    const owner = this.cartOwner(accountId);
    return this.run(`DELETE FROM cart_items WHERE ${owner.clause}`, accountId || sessionId).changes;
  }

  /** Merge the current browser's guest basket into the authenticated cross-device basket. */
  public attachCartToAccount(sessionId: string, accountId: string): number {
    return this.transaction(() => {
      const guestItems = this.all<any>('SELECT * FROM cart_items WHERE session_id=? AND account_id IS NULL ORDER BY created_at', sessionId);
      let attached = 0;
      for (const item of guestItems) {
        const existing = item.external_id
          ? this.get<any>(`SELECT * FROM cart_items WHERE account_id=? AND store=? AND external_id=? AND source_url=?
              AND IFNULL(variant,'')=IFNULL(?,'') AND requested_size=? AND requested_color=? AND customer_note=?`,
            accountId, item.store, item.external_id, item.source_url, item.variant || '', item.requested_size || '', item.requested_color || '', item.customer_note || '')
          : this.get<any>(`SELECT * FROM cart_items WHERE account_id=? AND store=? AND source_url=? AND title=?
              AND IFNULL(variant,'')=IFNULL(?,'') AND requested_size=? AND requested_color=? AND customer_note=?`,
            accountId, item.store, item.source_url, item.title, item.variant || '', item.requested_size || '', item.requested_color || '', item.customer_note || '');
        if (existing) {
          const quantity = Math.min(99, Number(existing.quantity) + Number(item.quantity));
          this.run('UPDATE cart_items SET quantity=?,updated_at=? WHERE id=?', quantity, new Date().toISOString(), existing.id);
          this.run('DELETE FROM cart_items WHERE id=? AND account_id IS NULL', item.id);
        } else {
          this.run('UPDATE cart_items SET account_id=?,updated_at=? WHERE id=? AND account_id IS NULL', accountId, new Date().toISOString(), item.id);
        }
        attached += 1;
      }
      return attached;
    });
  }

  public createOrderFromCart(sessionId: string, input: CheckoutInput, accountId: string) {
    const items = this.getItems(sessionId, accountId);
    if (items.length === 0) throw new Error('EMPTY_CART');
    const rules = this.getPricingRules();
    const now = new Date().toISOString();
    const orderId = `order_${randomUUID()}`;
    const orderNumber = `AYR-${randomInt(100000, 1000000)}`;
    const normalizedPhone = input.phone.replace(/\s+/g, ' ').trim();

    return this.transaction(() => {
      const account = this.get<any>('SELECT id,status FROM customer_accounts WHERE id=?', accountId);
      if (!account || account.status !== 'ACTIVE') {
        throw new Error('ACCOUNT_UNAVAILABLE');
      }
      // Le téléphone de livraison saisi au checkout fait foi (la vérification SMS est optionnelle).

      const accountPhoneDigits = normalizeCustomerPhone(normalizedPhone);
      // Le champ indexé couvre les données migrées. Les variantes exactes gardent
      // la compatibilité avec une intégration qui insérerait encore un contact sans normalized_phone.
      let customer = this.get<any>(`SELECT * FROM customers
        WHERE normalized_phone=? OR phone IN (?,?,?,?)
        ORDER BY CASE WHEN normalized_phone=? THEN 0 ELSE 1 END,updated_at DESC LIMIT 1`,
      accountPhoneDigits, accountPhoneDigits, `+216${accountPhoneDigits}`, `216${accountPhoneDigits}`, `00216${accountPhoneDigits}`, accountPhoneDigits);
      if (!customer) {
        const customerId = `customer_${randomUUID()}`;
        this.run(`INSERT INTO customers (id,name,phone,normalized_phone,governorate,address,registered_at,status,updated_at)
          VALUES (?,?,?,?,?,?,?,'ACTIVE',?)`, customerId, input.name, normalizedPhone, accountPhoneDigits, input.governorate, input.address, now, now);
        customer = this.get<any>('SELECT * FROM customers WHERE id = ?', customerId)!;
      } else {
        this.run('UPDATE customers SET name=?,normalized_phone=?,governorate=?,address=?,updated_at=? WHERE id=?',
          input.name, accountPhoneDigits, input.governorate, input.address, now, customer.id);
      }

      const breakdowns = items.map((item) => {
        const price = calculatePrice(rules, item.sourcePrice, item.sourceCurrency, {
          quantity: item.quantity, includeLocalDelivery: false, title: item.title,
        });
        if (!price || price.restricted) throw new Error('INVALID_CART_PRICE');
        return { item, price };
      });
      const localDelivery = orderLocalDelivery(rules);
      const totals = breakdowns.reduce((sum, current) => ({
        subtotal: sum.subtotal + current.price.convertedPriceTND,
        customs: sum.customs + current.price.customsFeeTND,
        shipping: sum.shipping + current.price.freightTND,
        service: sum.service + current.price.serviceFeeTND,
        express: sum.express + current.price.expressFeeTND,
        discount: sum.discount + current.price.discountTND,
        total: sum.total + current.price.totalTND,
      }), { subtotal: 0, customs: 0, shipping: 0, service: 0, express: 0, discount: 0, total: 0 });
      totals.shipping = Math.round((totals.shipping + localDelivery) * 1000) / 1000;
      totals.total = Math.round((totals.total + localDelivery) * 1000) / 1000;
      const stores = [...new Set(items.map((item) => item.store.toUpperCase()))];
      const supportedSources = new Set(['SHEIN','AMAZON','TEMU','ALIEXPRESS']);
      const source = stores.length > 1 ? 'MIXED' : (supportedSources.has(stores[0]) ? stores[0] : 'OTHER');
      const snapshot = JSON.stringify({ ...rules, capturedAt: now });

      const depositPercent = this.getDepositPercent();
      const depositBase = Math.round((totals.total * depositPercent) / 100 * 1000) / 1000;
      // The order is created before deposit payment. A card discount is applied only
      // when CARD was explicitly selected (legacy/API clients); the current checkout
      // uses PENDING_SELECTION and lets the customer choose from the order detail.
      const isCard = String(input.paymentMethod).toUpperCase() === 'CARD';
      const cardDiscountPercent = isCard ? this.getCardDiscountPercent() : 0;
      const depositDiscount = Math.round(depositBase * cardDiscountPercent / 100 * 1000) / 1000;
      const depositAmount = Math.round((depositBase - depositDiscount) * 1000) / 1000;
      const balanceAfterDeposit = Math.round((totals.total - depositAmount) * 1000) / 1000;

      this.run(`INSERT INTO orders (
        id,order_number,customer_id,account_id,source,arrival_id,status,payment_status,payment_method,
        deposit_percent,deposit_amount_tnd,deposit_discount_tnd,deposit_status,
        subtotal_tnd,customs_tnd,shipping_tnd,service_tnd,express_tnd,discount_tnd,total_tnd,
        pricing_snapshot,governorate,address,phone,contact_email,delivery_latitude,delivery_longitude,terms_accepted_at,locale,notes,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,'AWAITING_DEPOSIT','PENDING',?,?,?,?,'PENDING',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      orderId, orderNumber, customer.id, accountId, source, null, input.paymentMethod,
        depositPercent, depositAmount, depositDiscount,
      totals.subtotal, totals.customs, totals.shipping, totals.service, totals.express, totals.discount, totals.total,
      snapshot, input.governorate, input.address, normalizedPhone, input.email, input.latitude, input.longitude,
      input.termsAcceptedAt, input.locale, '', now, now);

      for (const { item, price } of breakdowns) {
        this.run(`INSERT INTO order_items (
          id,order_id,product_id,arrival_id,product_name,source_platform,source_url,image_url,variant,
          requested_size,requested_color,customer_note,reference_url,price_verification_status,quantity,
          original_price,currency,exchange_rate,converted_price_tnd,customs_tnd,shipping_tnd,service_tnd,express_tnd,
          discount_tnd,total_tnd,pricing_snapshot,created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        `order_item_${randomUUID()}`, orderId, null, null, item.title, item.store.toUpperCase(), item.sourceUrl,
        item.imageUrl, item.variant, item.requestedSize, item.requestedColor, item.customerNote, item.referenceUrl,
        item.priceVerificationStatus, item.quantity, item.sourcePrice, item.sourceCurrency, price.exchangeRate,
        price.convertedPriceTND, price.customsFeeTND, price.shippingFeeTND, price.serviceFeeTND, price.expressFeeTND,
        price.discountTND, price.totalTND, JSON.stringify(price), now);
      }

      this.run(`INSERT INTO order_status_history (id,order_id,from_status,to_status,note,changed_by,created_at)
        VALUES (?,?,NULL,'AWAITING_DEPOSIT',?,NULL,?)`, `history_${randomUUID()}`, orderId,
        `Commande créée — en attente du paiement de l'acompte (${depositPercent}%).`, now);
      this.run(`INSERT INTO payments (id,payment_number,order_id,method,status,amount_tnd,currency,reference,provider,created_at,updated_at)
        VALUES (?,?,?,?,'PENDING',?,'TND',NULL,'',?,?)`, `payment_${randomUUID()}`, this.generatePaymentNumber(), orderId, input.paymentMethod, depositAmount, now, now);
      this.run(`INSERT INTO deliveries (id,order_id,governorate,address,phone,latitude,longitude,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'PENDING',?,?)`, `delivery_${randomUUID()}`, orderId, input.governorate, input.address, normalizedPhone, input.latitude, input.longitude, now, now);
      const methodNotice = input.paymentMethod === 'PENDING_SELECTION' ? 'choisissez votre mode de paiement' : `mode ${String(input.paymentMethod)}`;
      this.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
        VALUES (?,?,'ORDER','Acompte à régler',?, ?, ?)`, `notification_${randomUUID()}`, accountId,
        `Commande ${orderNumber} enregistrée : réglez l'acompte de ${depositAmount.toFixed(3)} DT (${methodNotice}) pour la confirmer.${depositDiscount > 0 ? ` Remise carte −${depositDiscount.toFixed(3)} DT appliquée.` : ''}`, `/compte/commandes/${orderId}`, now);
      this.notifyAdmins('ORDER', 'Nouvelle commande',
        `${orderNumber} — ${totals.total.toFixed(3)} DT, acompte ${depositAmount.toFixed(3)} DT en attente.`,
        `/admin?section=orders&order=${orderId}`);
      this.clearCart(sessionId, accountId);

      return {
        orderId,
        orderNumber,
        totalTND: Math.round(totals.total * 100) / 100,
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        customer: {
          name: input.name, email: input.email, phone: normalizedPhone, city: input.governorate, address: input.address,
          paymentMethod: input.paymentMethod.toLowerCase(), latitude: input.latitude, longitude: input.longitude,
          termsAccepted: true, locale: input.locale,
        },
        breakdown: {
          subtotalTnd: Math.round(totals.subtotal * 1000) / 1000,
          customsTnd: Math.round(totals.customs * 1000) / 1000,
          shippingTnd: Math.round(totals.shipping * 1000) / 1000,
          serviceTnd: Math.round(totals.service * 1000) / 1000,
          expressTnd: Math.round(totals.express * 1000) / 1000,
          discountTnd: Math.round(totals.discount * 1000) / 1000,
          totalTnd: Math.round(totals.total * 1000) / 1000,
        },
        deposit: {
          percent: depositPercent,
          amountTnd: depositAmount,
          baseAmountTnd: depositBase,
          discountTnd: depositDiscount,
          cardDiscountPercent,
          balanceTnd: balanceAfterDeposit,
          method: String(input.paymentMethod).toUpperCase(),
          status: 'PENDING' as DepositStatus,
        },
      };
    });
  }

  /** نسبة العربون من الإعدادات (افتراضي 20%) */
  public getDepositPercent(): number {
    const raw = Number(this.get<any>("SELECT setting_value FROM settings WHERE setting_key='deposit_percent'")?.setting_value ?? 20);
    if (!Number.isFinite(raw)) return 20;
    return Math.min(100, Math.max(1, raw));
  }

  /** نسبة خصم عربون البطاقة (افتراضي 5%) */
  public getCardDiscountPercent(): number {
    const raw = Number(this.get<any>("SELECT setting_value FROM settings WHERE setting_key='card_discount_percent'")?.setting_value ?? 5);
    if (!Number.isFinite(raw)) return 5;
    return Math.min(50, Math.max(0, raw));
  }

  // ===== إشعارات الإدارة =====
  public notifyAdmins(type: string, title: string, message: string, actionUrl = '') {
    this.run(`INSERT INTO admin_notifications (id,type,title,message,action_url,created_at) VALUES (?,?,?,?,?,?)`,
      `adminnotif_${randomUUID()}`, type, String(title).slice(0, 160), String(message).slice(0, 500), String(actionUrl).slice(0, 300), new Date().toISOString());
  }

  public listAdminNotifications(limit = 30) {
    return this.all<any>(`SELECT * FROM admin_notifications ORDER BY created_at DESC LIMIT ?`, Math.min(100, Math.max(1, limit)));
  }

  public unreadAdminNotificationsCount(): number {
    return Number(this.get<any>(`SELECT COUNT(*) count FROM admin_notifications WHERE read_at IS NULL`)?.count ?? 0);
  }

  public markAdminNotificationRead(id: string) {
    this.run(`UPDATE admin_notifications SET read_at=COALESCE(read_at, ?) WHERE id=?`, new Date().toISOString(), id);
  }

  public markAllAdminNotificationsRead() {
    this.run(`UPDATE admin_notifications SET read_at=COALESCE(read_at, ?)`, new Date().toISOString());
  }

  // ===== المصاريف والتقارير المالية =====
  public listExpenses(from?: string, to?: string) {
    const clauses: string[] = []; const params: any[] = [];
    if (from) { clauses.push('expense_date >= ?'); params.push(from); }
    if (to) { clauses.push('expense_date <= ?'); params.push(to); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.all<any>(`SELECT * FROM expenses ${where} ORDER BY expense_date DESC, created_at DESC`, ...params);
  }

  public createExpense(input: { label: string; category: string; amountTnd: number; expenseDate: string; notes: string; createdBy?: string }) {
    const id = `expense_${randomUUID()}`;
    const now = new Date().toISOString();
    this.run(`INSERT INTO expenses (id,label,category,amount_tnd,expense_date,notes,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, id, input.label, input.category, input.amountTnd, input.expenseDate, input.notes, input.createdBy ?? null, now, now);
    return this.get<any>('SELECT * FROM expenses WHERE id=?', id);
  }

  public deleteExpense(id: string) {
    this.run('DELETE FROM expenses WHERE id=?', id);
  }

  /** تقرير مالي: مداخيل (أرصد العربون المؤكدة + الطلبات المدفوعة بالكامل) − مصاريف = ربح */
  public getFinancialReport(from: string, to: string) {
    const incomeRow = this.get<any>(`SELECT COALESCE(SUM(amount_tnd),0) total, COUNT(*) count FROM payments
      WHERE status='PAID' AND confirmed_at IS NOT NULL AND confirmed_at >= ? AND confirmed_at <= ?`, `${from}T00:00:00`, `${to}T23:59:59.999Z`);
    const ordersRow = this.get<any>(`SELECT COUNT(*) count, COALESCE(SUM(total_tnd),0) total FROM orders
      WHERE status NOT IN ('CANCELLED','CREATED','AWAITING_DEPOSIT','AWAITING_PAYMENT_VERIFICATION') AND created_at >= ? AND created_at <= ?`, `${from}T00:00:00`, `${to}T23:59:59.999Z`);
    const depositsPending = this.get<any>(`SELECT COUNT(*) count, COALESCE(SUM(deposit_amount_tnd),0) total FROM orders
      WHERE status IN ('AWAITING_DEPOSIT','AWAITING_PAYMENT_VERIFICATION') AND payment_status IN ('PENDING','PENDING_VERIFICATION','FAILED','REJECTED')`);
    const expensesRow = this.get<any>(`SELECT COALESCE(SUM(amount_tnd),0) total, COUNT(*) count FROM expenses
      WHERE expense_date >= ? AND expense_date <= ?`, from, to);
    const expensesByCategory = this.all<any>(`SELECT category, COALESCE(SUM(amount_tnd),0) total FROM expenses
      WHERE expense_date >= ? AND expense_date <= ? GROUP BY category ORDER BY total DESC`, from, to);
    // آخر 6 أشهر للرسم البياني
    const monthly: Array<{ month: string; income: number; expenses: number }> = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - offset);
      const monthStart = d.toISOString().slice(0, 10);
      const endDate = new Date(d); endDate.setUTCMonth(endDate.getUTCMonth() + 1);
      const monthEnd = endDate.toISOString().slice(0, 10);
      const inc = this.get<any>(`SELECT COALESCE(SUM(amount_tnd),0) t FROM payments WHERE status='PAID' AND confirmed_at >= ? AND confirmed_at < ?`, monthStart, monthEnd)?.t ?? 0;
      const exp = this.get<any>(`SELECT COALESCE(SUM(amount_tnd),0) t FROM expenses WHERE expense_date >= ? AND expense_date < ?`, monthStart, monthEnd)?.t ?? 0;
      monthly.push({ month: monthStart.slice(0, 7), income: Math.round(Number(inc) * 1000) / 1000, expenses: Math.round(Number(exp) * 1000) / 1000 });
    }
    const income = Math.round(Number(incomeRow?.total ?? 0) * 1000) / 1000;
    const expenses = Math.round(Number(expensesRow?.total ?? 0) * 1000) / 1000;
    return {
      period: { from, to },
      income, incomeCount: Number(incomeRow?.count ?? 0),
      confirmedOrders: { count: Number(ordersRow?.count ?? 0), total: Math.round(Number(ordersRow?.total ?? 0) * 1000) / 1000 },
      pendingDeposits: { count: Number(depositsPending?.count ?? 0), total: Math.round(Number(depositsPending?.total ?? 0) * 1000) / 1000 },
      expenses, expensesCount: Number(expensesRow?.count ?? 0),
      profit: Math.round((income - expenses) * 1000) / 1000,
      expensesByCategory, monthly,
    };
  }

  private generatePaymentNumber(): string {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const number = `PAY-${year}-${randomInt(100000, 1000000)}`;
      if (!this.get<any>('SELECT id FROM payments WHERE payment_number=?', number)) return number;
    }
    return `PAY-${year}-${Date.now()}`;
  }

  public generateTransactionNumber(): string {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const number = `TXN-${year}-${randomInt(100000, 1000000)}`;
      if (!this.get<any>('SELECT id FROM payment_transactions WHERE transaction_number=?', number)) return number;
    }
    return `TXN-${year}-${Date.now()}`;
  }

  private generateInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const count = this.get<any>(`SELECT COUNT(*) AS count FROM invoices WHERE invoice_number LIKE 'INV-${year}-%'`)?.count || 0;
    for (let seq = Number(count) + 1; seq < Number(count) + 1000; seq += 1) {
      const number = `INV-${year}-${String(seq).padStart(6, '0')}`;
      if (!this.get<any>('SELECT id FROM invoices WHERE invoice_number=?', number)) return number;
    }
    return `INV-${year}-${Date.now()}`;
  }

  /** Select a deposit method after the order exists; amounts remain backend-authoritative. */
  public selectDepositMethod(orderId: string, method: 'CARD' | 'BANK_TRANSFER' | 'POSTE', accountId?: string) {
    return this.transaction(() => {
      const order = accountId
        ? this.get<any>('SELECT * FROM orders WHERE id=? AND account_id=?', orderId, accountId)
        : this.get<any>('SELECT * FROM orders WHERE id=?', orderId);
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (order.status !== 'AWAITING_DEPOSIT' || order.payment_status === 'PAID') throw new Error('PAYMENT_METHOD_NOT_SELECTABLE');
      const payment = this.get<any>('SELECT * FROM payments WHERE order_id=?', orderId);
      if (!payment) throw new Error('PAYMENT_NOT_FOUND');
      const baseAmount = Math.round(Number(order.total_tnd) * Number(order.deposit_percent) / 100 * 1000) / 1000;
      const discountPercent = method === 'CARD' ? this.getCardDiscountPercent() : 0;
      const discount = Math.round(baseAmount * discountPercent / 100 * 1000) / 1000;
      const amount = Math.round((baseAmount - discount) * 1000) / 1000;
      const now = new Date().toISOString();
      this.run(`UPDATE orders SET payment_method=?,payment_status='PENDING',deposit_status='PENDING',deposit_amount_tnd=?,
        deposit_discount_tnd=?,deposit_review_note='',updated_at=? WHERE id=?`, method, amount, discount, now, orderId);
      this.run(`UPDATE payments SET method=?,status='PENDING',amount_tnd=?,provider=?,reference=NULL,gateway_payment_ref=NULL,
        confirmed_by=NULL,confirmed_at=NULL,updated_at=? WHERE id=?`, method, amount, method === 'CARD' ? 'KONNECT' : 'MANUAL_TRANSFER', now, payment.id);
      return {
        order: this.get<any>('SELECT * FROM orders WHERE id=?', orderId),
        payment: this.get<any>('SELECT * FROM payments WHERE id=?', payment.id),
        quote: { percent: Number(order.deposit_percent), baseAmountTnd: baseAmount, discountPercent, discountTnd: discount,
          amountTnd: amount, balanceTnd: Math.max(0, Math.round((Number(order.total_tnd) - amount) * 1000) / 1000) },
      };
    });
  }

  public createCardTransaction(orderId: string, accountId: string) {
    return this.transaction(() => {
      const order = this.get<any>('SELECT * FROM orders WHERE id=? AND account_id=?', orderId, accountId);
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (order.status !== 'AWAITING_DEPOSIT' || order.payment_status === 'PAID') throw new Error('PAYMENT_METHOD_NOT_SELECTABLE');
      const payment = this.get<any>('SELECT * FROM payments WHERE order_id=?', orderId);
      if (!payment) throw new Error('PAYMENT_NOT_FOUND');

      // Reuse the live checkout instead of creating multiple chargeable links for one deposit.
      const pending = this.get<any>(`SELECT * FROM payment_transactions
        WHERE order_id=? AND provider='KONNECT' AND status='PENDING' ORDER BY created_at DESC LIMIT 1`, orderId);
      if (pending) {
        const ageMs = Date.now() - new Date(String(pending.created_at)).getTime();
        if (pending.checkout_url && ageMs < 25 * 60_000) {
          return { order, payment, transaction: pending, reused: true };
        }
        if (!pending.checkout_url && Number.isFinite(ageMs) && ageMs < 2 * 60_000) throw new Error('CARD_TRANSACTION_PENDING');
        this.run(`UPDATE payment_transactions SET status='FAILED',failure_reason='Lien de paiement expiré ou incomplet.',updated_at=? WHERE id=?`,
          new Date().toISOString(), pending.id);
      }

      const selected = this.selectDepositMethod(orderId, 'CARD', accountId);
      const now = new Date().toISOString();
      const id = `transaction_${randomUUID()}`;
      const transactionNumber = this.generateTransactionNumber();
      this.run(`INSERT INTO payment_transactions
        (id,transaction_number,payment_id,order_id,account_id,provider,amount_tnd,currency,status,created_at,updated_at)
        VALUES (?,?,?,?,?,'KONNECT',?,'TND','PENDING',?,?)`, id, transactionNumber, selected.payment.id, orderId, accountId,
      selected.quote.amountTnd, now, now);
      return { ...selected, transaction: this.get<any>('SELECT * FROM payment_transactions WHERE id=?', id), reused: false };
    });
  }

  public bindCardGatewayReference(transactionId: string, providerReference: string, checkoutUrl: string) {
    const transaction = this.get<any>("SELECT * FROM payment_transactions WHERE id=? AND provider='KONNECT'", transactionId);
    if (!transaction) throw new Error('TRANSACTION_NOT_FOUND');
    if (!/^https:\/\//i.test(checkoutUrl)) throw new Error('CARD_CHECKOUT_URL_INVALID');
    const now = new Date().toISOString();
    this.transaction(() => {
      this.run('UPDATE payment_transactions SET provider_reference=?,checkout_url=?,updated_at=? WHERE id=?', providerReference, checkoutUrl, now, transaction.id);
      this.run("UPDATE payments SET provider='KONNECT',gateway_payment_ref=?,updated_at=? WHERE id=?", providerReference, now, transaction.payment_id);
    });
    return this.get<any>('SELECT * FROM payment_transactions WHERE id=?', transaction.id);
  }

  public markCardTransactionFailed(transactionId: string, reason: string, providerPayload: unknown = {}) {
    const transaction = this.get<any>('SELECT * FROM payment_transactions WHERE id=?', transactionId);
    if (!transaction || transaction.status === 'PAID') return transaction;
    const now = new Date().toISOString();
    this.transaction(() => {
      this.run(`UPDATE payment_transactions SET status='FAILED',failure_reason=?,provider_payload=?,updated_at=? WHERE id=?`,
        String(reason || 'Gateway payment failed').slice(0, 500), JSON.stringify(providerPayload ?? {}).slice(0, 10_000), now, transaction.id);
      this.run(`UPDATE payments SET status='FAILED',updated_at=? WHERE id=?`, now, transaction.payment_id);
      this.run(`UPDATE orders SET payment_status='FAILED',status='AWAITING_DEPOSIT',deposit_status='PENDING',updated_at=? WHERE id=?`, now, transaction.order_id);
    });
    return this.get<any>('SELECT * FROM payment_transactions WHERE id=?', transaction.id);
  }

  /** Card success is written only after a server-to-server provider verification. */
  public confirmCardTransaction(transactionId: string, providerPayload: unknown) {
    return this.transaction(() => {
      const transaction = this.get<any>(`SELECT t.*,p.method payment_method,o.order_number,o.status order_status
        FROM payment_transactions t JOIN payments p ON p.id=t.payment_id JOIN orders o ON o.id=t.order_id WHERE t.id=?`, transactionId);
      if (!transaction) throw new Error('TRANSACTION_NOT_FOUND');
      if (transaction.status === 'PAID') return this.get<any>('SELECT * FROM orders WHERE id=?', transaction.order_id);
      if (transaction.payment_method !== 'CARD' || !transaction.provider_reference) throw new Error('CARD_TRANSACTION_INVALID');
      const now = new Date().toISOString();
      this.run(`UPDATE payment_transactions SET status='PAID',failure_reason='',provider_payload=?,confirmed_at=?,updated_at=? WHERE id=?`,
        JSON.stringify(providerPayload ?? {}).slice(0, 10_000), now, now, transaction.id);
      this.run(`UPDATE payments SET status='PAID',reference=?,confirmed_by='KONNECT',confirmed_at=?,updated_at=? WHERE id=?`,
        transaction.provider_reference, now, now, transaction.payment_id);
      this.run(`UPDATE orders SET status='CONFIRMED',payment_status='PAID',deposit_status='PAID',deposit_paid_at=?,
        deposit_reviewed_by='KONNECT',deposit_review_note='',updated_at=? WHERE id=?`, now, now, transaction.order_id);
      this.run(`INSERT INTO order_status_history (id,order_id,from_status,to_status,note,changed_by,created_at)
        VALUES (?,?,?,'CONFIRMED',?,'KONNECT',?)`, `history_${randomUUID()}`, transaction.order_id, transaction.order_status,
        `Acompte carte ${Number(transaction.amount_tnd).toFixed(3)} DT vérifié par la passerelle. Transaction ${transaction.transaction_number}.`, now);
      if (transaction.account_id) this.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
        VALUES (?,?,'PAYMENT','Paiement carte confirmé',?,?,?)`, `notification_${randomUUID()}`, transaction.account_id,
      `L’acompte de la commande ${transaction.order_number} est payé. Transaction ${transaction.transaction_number}.`, `/compte/commandes/${transaction.order_id}`, now);
      return this.get<any>('SELECT * FROM orders WHERE id=?', transaction.order_id);
    });
  }

  /** Customer uploads a bank/postal proof; upload never means payment confirmation. */
  public attachDepositProof(orderId: string, proof: {
    path: string; accountId: string; originalName: string; mimeType: string; sizeBytes: number; transferReference: string;
  }) {
    return this.transaction(() => {
      const order = this.get<any>('SELECT * FROM orders WHERE id=? AND account_id=?', orderId, proof.accountId);
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (order.status !== 'AWAITING_DEPOSIT' || !['BANK_TRANSFER', 'POSTE'].includes(String(order.payment_method))
        || !['PENDING', 'FAILED', 'REJECTED'].includes(String(order.payment_status))) throw new Error('DEPOSIT_NOT_SUBMITTABLE');
      const payment = this.get<any>('SELECT * FROM payments WHERE order_id=?', orderId);
      if (!payment) throw new Error('PAYMENT_NOT_FOUND');
      const now = new Date().toISOString();
      const proofId = `proof_${randomUUID()}`;
      this.run(`INSERT INTO payment_proofs
        (id,payment_id,order_id,account_id,file_path,original_name,mime_type,size_bytes,transfer_reference,status,submitted_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,'PENDING_VERIFICATION',?,?,?)`, proofId, payment.id, orderId, proof.accountId, proof.path,
      String(proof.originalName).slice(0, 250), proof.mimeType, proof.sizeBytes, String(proof.transferReference).slice(0, 120), now, now, now);
      this.run(`UPDATE orders SET status='AWAITING_PAYMENT_VERIFICATION',payment_status='PENDING_VERIFICATION',deposit_proof_path=?,
        deposit_status='SUBMITTED',deposit_submitted_at=?,deposit_review_note='',updated_at=? WHERE id=?`, proof.path, now, now, orderId);
      this.run(`UPDATE payments SET status='PENDING_VERIFICATION',reference=?,updated_at=? WHERE id=?`, proof.transferReference, now, payment.id);
      this.run(`INSERT INTO order_status_history (id,order_id,from_status,to_status,note,changed_by,created_at)
        VALUES (?,?,?,'AWAITING_PAYMENT_VERIFICATION',?,NULL,?)`, `history_${randomUUID()}`, orderId, order.status,
        `Justificatif ${proofId} reçu — le paiement reste en attente de vérification.`, now);
      this.notifyAdmins('DEPOSIT_REVIEW', 'Virement à vérifier',
        `${order.order_number} — justificatif reçu pour ${Number(order.deposit_amount_tnd).toFixed(3)} DT.`,
        `/admin?section=orders&order=${orderId}`);
      return { order: this.get<any>('SELECT * FROM orders WHERE id=?', orderId), proof: this.get<any>('SELECT * FROM payment_proofs WHERE id=?', proofId) };
    });
  }

  /** Admin approval applies only to the latest pending manual-transfer proof. */
  public confirmOrderDeposit(orderId: string, adminId: string, note = '') {
    return this.transaction(() => {
      const order = this.get<any>('SELECT * FROM orders WHERE id=?', orderId);
      if (!order) throw new Error('ORDER_NOT_FOUND');
      const payment = this.get<any>('SELECT * FROM payments WHERE order_id=?', orderId);
      const proof = this.get<any>(`SELECT * FROM payment_proofs WHERE order_id=? AND status='PENDING_VERIFICATION' ORDER BY submitted_at DESC LIMIT 1`, orderId);
      if (!payment || !proof || order.status !== 'AWAITING_PAYMENT_VERIFICATION' || !['BANK_TRANSFER', 'POSTE'].includes(String(payment.method))) {
        throw new Error('DEPOSIT_NOT_REVIEWABLE');
      }
      const now = new Date().toISOString();
      const transactionId = `transaction_${randomUUID()}`;
      const transactionNumber = this.generateTransactionNumber();
      this.run(`UPDATE payment_proofs SET status='APPROVED',reviewed_at=?,reviewed_by=?,rejection_reason='',updated_at=? WHERE id=?`, now, adminId, now, proof.id);
      this.run(`INSERT INTO payment_transactions
        (id,transaction_number,payment_id,order_id,account_id,provider,provider_reference,amount_tnd,currency,status,provider_payload,confirmed_at,created_at,updated_at)
        VALUES (?,?,?,?,?,'MANUAL_TRANSFER',?,?,'TND','PAID','{}',?,?,?)`, transactionId, transactionNumber, payment.id, orderId,
      order.account_id, proof.transfer_reference, Number(payment.amount_tnd), now, now, now);
      this.run(`UPDATE orders SET status='CONFIRMED',payment_status='PAID',deposit_status='PAID',deposit_paid_at=?,deposit_reviewed_by=?,
        deposit_review_note=?,updated_at=? WHERE id=?`, now, adminId, note.slice(0, 500), now, orderId);
      this.run(`UPDATE payments SET status='PAID',reference=?,confirmed_by=?,confirmed_at=?,updated_at=? WHERE id=?`,
        proof.transfer_reference, adminId, now, now, payment.id);
      this.run(`INSERT INTO order_status_history (id,order_id,from_status,to_status,note,changed_by,created_at)
        VALUES (?,?,'AWAITING_PAYMENT_VERIFICATION','CONFIRMED',?,?,?)`, `history_${randomUUID()}`, orderId,
        `Acompte ${Number(order.deposit_amount_tnd).toFixed(3)} DT confirmé. Transaction ${transactionNumber}.${note ? ` ${note.slice(0, 200)}` : ''}`, adminId, now);
      if (order.account_id) this.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
        VALUES (?,?,'PAYMENT','Acompte confirmé',?,?,?)`, `notification_${randomUUID()}`, order.account_id,
      `Le justificatif de ${order.order_number} est validé. Transaction ${transactionNumber}; la commande est confirmée.`, `/compte/commandes/${orderId}`, now);
      return this.get<any>('SELECT * FROM orders WHERE id=?', orderId);
    });
  }

  public rejectOrderDeposit(orderId: string, adminId: string, note: string) {
    return this.transaction(() => {
      const order = this.get<any>('SELECT * FROM orders WHERE id=?', orderId);
      if (!order) throw new Error('ORDER_NOT_FOUND');
      const payment = this.get<any>('SELECT * FROM payments WHERE order_id=?', orderId);
      const proof = this.get<any>(`SELECT * FROM payment_proofs WHERE order_id=? AND status='PENDING_VERIFICATION' ORDER BY submitted_at DESC LIMIT 1`, orderId);
      if (!payment || !proof || order.status !== 'AWAITING_PAYMENT_VERIFICATION') throw new Error('DEPOSIT_NOT_REVIEWABLE');
      const now = new Date().toISOString();
      const safeNote = String(note || '').trim().slice(0, 500);
      if (!safeNote) throw new Error('REJECTION_REASON_REQUIRED');
      this.run(`UPDATE payment_proofs SET status='REJECTED',reviewed_at=?,reviewed_by=?,rejection_reason=?,updated_at=? WHERE id=?`,
        now, adminId, safeNote, now, proof.id);
      this.run(`UPDATE orders SET status='AWAITING_DEPOSIT',payment_status='REJECTED',deposit_status='REJECTED',
        deposit_reviewed_by=?,deposit_review_note=?,updated_at=? WHERE id=?`, adminId, safeNote, now, orderId);
      this.run(`UPDATE payments SET status='REJECTED',updated_at=? WHERE id=?`, now, payment.id);
      this.run(`INSERT INTO order_status_history (id,order_id,from_status,to_status,note,changed_by,created_at)
        VALUES (? ,?,'AWAITING_PAYMENT_VERIFICATION','AWAITING_DEPOSIT',?,?,?)`, `history_${randomUUID()}`, orderId,
        `Justificatif refusé : ${safeNote.slice(0, 200)}`, adminId, now);
      if (order.account_id) this.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
        VALUES (?,?,'PAYMENT','Justificatif refusé',?,?,?)`, `notification_${randomUUID()}`, order.account_id,
      `Le justificatif de ${order.order_number} a été refusé : ${safeNote.slice(0, 160)} Vous pouvez en envoyer un nouveau.`, `/compte/commandes/${orderId}`, now);
      return this.get<any>('SELECT * FROM orders WHERE id=?', orderId);
    });
  }

  /** Invoice issuance is explicit and independent from payment confirmation. */
  public issueOrderInvoice(orderId: string, adminId: string) {
    return this.transaction(() => {
      const order = this.get<any>('SELECT * FROM orders WHERE id=?', orderId);
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (!['CONFIRMED','PREPARING','SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED'].includes(String(order.status)) || order.payment_status !== 'PAID') {
        throw new Error('INVOICE_NOT_ISSUABLE');
      }
      const existing = this.get<any>('SELECT * FROM invoices WHERE order_id=?', orderId);
      if (existing) return existing;
      const now = new Date().toISOString();
      const number = this.generateInvoiceNumber();
      const id = `invoice_${randomUUID()}`;
      this.run(`INSERT INTO invoices (id,invoice_number,order_id,account_id,status,file_path,issued_at,created_at,updated_at)
        VALUES (?,?,?,?,'ISSUED','',?,?,?)`, id, number, orderId, order.account_id, now, now, now);
      // Legacy columns remain read-compatible, but invoices are authoritative.
      this.run('UPDATE orders SET invoice_number=?,invoice_path=\'\',updated_at=? WHERE id=?', number, now, orderId);
      if (order.account_id) this.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
        VALUES (?,?,'INVOICE','Facture disponible',?,?,?)`, `notification_${randomUUID()}`, order.account_id,
      `La facture ${number} de la commande ${order.order_number} a été émise.`, `/compte/factures`, now);
      return this.get<any>('SELECT * FROM invoices WHERE id=?', id);
    });
  }

}
