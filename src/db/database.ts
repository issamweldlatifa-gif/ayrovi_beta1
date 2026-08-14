import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { randomInt, randomUUID } from 'node:crypto';
import { CartItem, AddToCartRequest } from '../types';
import { calculatePrice, PricingRules } from '../services/pricing';

export type PaymentMethodCode = 'COD' | 'D17' | 'FLOUCI' | 'CARD' | 'BANK_TRANSFER' | 'POSTE';
export type DepositStatus = 'NONE' | 'PENDING' | 'SUBMITTED' | 'PAID' | 'REJECTED';

export interface CheckoutInput {
  name: string;
  phone: string;
  governorate: string;
  address: string;
  paymentMethod: PaymentMethodCode;
}

// مخططات الجداول المشتركة بين الإنشاء الأولي والترقيات (أعدها في مكان واحد فقط)
const ORDERS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'OTHER' CHECK(source IN ('SHEIN','AMAZON','TEMU','ALIEXPRESS','OTHER','MIXED')),
  arrival_id TEXT REFERENCES arrivals(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK(status IN ('NEW','CONFIRMED','PAYMENT_PENDING','PAID','PURCHASING','PURCHASED','IN_TRANSIT','ARRIVED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED')),
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(payment_status IN ('PENDING','PAID','FAILED','REFUNDED','CANCELLED')),
  payment_method TEXT NOT NULL DEFAULT 'CARD' CHECK(payment_method IN ('COD','D17','FLOUCI','CARD','BANK_TRANSFER','POSTE')),
  deposit_percent REAL NOT NULL DEFAULT 20,
  deposit_amount_tnd REAL NOT NULL DEFAULT 0,
  deposit_discount_tnd REAL NOT NULL DEFAULT 0,
  deposit_status TEXT NOT NULL DEFAULT 'NONE' CHECK(deposit_status IN ('NONE','PENDING','SUBMITTED','PAID','REJECTED')),
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
  category TEXT NOT NULL CHECK(category IN ('GENERAL','COMMERCE','DELIVERY','PAYMENT','CHANNELS','DESIGN')),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'STRING' CHECK(value_type IN ('STRING','NUMBER','BOOLEAN','JSON')),
  label TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);`;

const PAYMENTS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK(method IN ('COD','D17','FLOUCI','CARD','BANK_TRANSFER','POSTE')),
  status TEXT NOT NULL CHECK(status IN ('PENDING','PAID','FAILED','REFUNDED','CANCELLED')),
  amount_tnd REAL NOT NULL,
  reference TEXT,
  confirmed_by TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

const STORIES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  media_type TEXT NOT NULL DEFAULT 'IMAGE' CHECK(media_type IN ('IMAGE','VIDEO')),
  media_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'NEW' CHECK(category IN ('NEW','ARRIVAGE','STYLE','INFO','PROMO')),
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
  status TEXT NOT NULL CHECK(status IN ('DRAFT','SCHEDULED','PUBLISHED','EXPIRED','ARCHIVED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;
const STORIES_INDEXES_SQL = `CREATE INDEX IF NOT EXISTS idx_stories_status_order ON stories(status, priority DESC, publish_at);`;

export function slugifyTitle(value: string): string {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 80);
}

export class QatafoDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const resolvedPath = dbPath || path.join(dataDir, 'qatafo.sqlite');
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.initSchema();
    this.seedCoreData();
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
        updated_at TEXT NOT NULL,
        updated_by TEXT
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

      ${STORIES_TABLE_SQL}
      ${STORIES_INDEXES_SQL}

      CREATE TABLE IF NOT EXISTS news_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT NOT NULL DEFAULT '',
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

      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        governorate TEXT NOT NULL,
        address TEXT NOT NULL,
        phone TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PREPARING','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','FAILED','RETURNED')),
        expected_at TEXT,
        delivered_at TEXT,
        notes TEXT NOT NULL DEFAULT '',
        carrier TEXT NOT NULL DEFAULT '',
        tracking_number TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status, expected_at);

      CREATE TABLE IF NOT EXISTS customer_auth_identities (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK(provider IN ('PHONE','GOOGLE')),
        provider_subject TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(provider, provider_subject)
      );
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

      CREATE TABLE IF NOT EXISTS customer_notifications (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'GENERAL' CHECK(type IN ('GENERAL','ORDER','ACCOUNT','PROMOTION')),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        action_url TEXT NOT NULL DEFAULT '',
        read_at TEXT,
        created_at TEXT NOT NULL
      );
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

    // Existing installations need additive migrations because CREATE TABLE IF NOT EXISTS
    // does not add new ownership columns to cart/order tables.
    this.ensureColumn('cart_items', 'account_id', 'TEXT REFERENCES customer_accounts(id) ON DELETE CASCADE');
    this.ensureColumn('cart_items', 'requested_size', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('cart_items', 'requested_color', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('cart_items', 'customer_note', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('cart_items', 'reference_url', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('cart_items', 'price_verification_status', "TEXT NOT NULL DEFAULT 'VERIFIED'");
    this.ensureColumn('order_items', 'requested_size', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('order_items', 'requested_color', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('order_items', 'customer_note', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('order_items', 'reference_url', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('order_items', 'price_verification_status', "TEXT NOT NULL DEFAULT 'VERIFIED'");
    this.ensureColumn('orders', 'account_id', 'TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL');
    this.ensureColumn('customer_oauth_states', 'account_id', 'TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL');
    this.rebuildTableIfLegacy('orders', 'deposit_discount_tnd', ORDERS_TABLE_SQL, ORDERS_INDEXES_SQL);
    this.rebuildTableIfLegacy('payments', "'POSTE'", PAYMENTS_TABLE_SQL, []);
    // AYROVI Content System : slug éditorial pour les articles + statut ARCHIVED pour les stories.
    this.ensureColumn('news_items', 'slug', "TEXT NOT NULL DEFAULT ''");
    this.rebuildTableIfLegacy('stories', "'ARCHIVED'", STORIES_TABLE_SQL, [STORIES_INDEXES_SQL]);
    this.ensureColumn('stories', 'category', "TEXT NOT NULL DEFAULT 'NEW'");
    const slugless = this.db.prepare(`SELECT id,title FROM news_items WHERE slug IS NULL OR slug=''`).all() as Array<{ id: string; title: string }>;
    for (const row of slugless) {
      this.db.prepare(`UPDATE news_items SET slug=? WHERE id=?`).run(`${slugifyTitle(row.title)}-${row.id.replace(/[^a-z0-9]+/gi, '').slice(-6).toLowerCase()}`, row.id);
    }
    // ترقية جدول الإعدادات لفئات CHANNELS/DESIGN (القواعد القديمة كانت ترفضها بصمت)
    this.db.exec(SETTINGS_TABLE_SQL);
    this.rebuildTableIfLegacy('settings', "'CHANNELS'", SETTINGS_TABLE_SQL, []);
    // فهرس عمود العربون — بعد الترقية (القواعد القديمة تحصل عليه داخل إعادة البناء)
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_orders_deposit ON orders(deposit_status, created_at DESC)');
    this.db.exec(`UPDATE settings SET setting_value='["CARD","FLOUCI","BANK_TRANSFER","POSTE"]',updated_at=datetime('now')
      WHERE setting_key='payment_methods' AND setting_value NOT LIKE '%CARD%'`);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cart_account ON cart_items(account_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_orders_account ON orders(account_id, created_at DESC);
    `);
  }

  /**
   * SQLite لا يمكنها تعديل قيود CHECK بـ ALTER — لذلك عند وجود جدول قديم لا يدعم
   * طرق دفع العربون الجديدة (CARD/BANK_TRANSFER/POSTE) نعيد بناءه مع نسخ البيانات.
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
    console.info(`[DB] تمت ترقية جدول ${table} لدعم نظام العربون (20%).`);
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((item) => item.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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
        preset: 'violet', primary: '#673de6', primaryDark: '#5025d1', primaryLight: '#7e57ff',
        accent: '#fbbf24', ink: '#1d2130', gradient: 'linear-gradient(135deg,#24104f 0%,#673de6 100%)',
        font: 'jakarta', radius: 'soft',
      }), 'JSON', 'Thème visuel de la plateforme (préréglages et couleurs)'],
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

    {
      // AYROVI Content System — seed idempotent (INSERT OR IGNORE) : les entrées
      // existantes sont conservées, les manquantes sont créées avec des dates relatives.
      const day = 86_400_000;
      const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();
      const storyInsert = this.db.prepare(`INSERT OR IGNORE INTO stories
        (id,media_type,media_url,category,title,description,cta,target_url,product_id,arrival_id,promotion_id,publish_at,expires_at,priority,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      storyInsert.run('story_arrival_08','IMAGE','/media/hero-femme.jpg','ARRIVAGE','Arrivage #08 ouvert','Découvrez la sélection et préparez votre commande.','Découvrir','#arrivages','product_demo_01','arrival_08','promo_arrival_08',iso(-2),iso(7),100,'PUBLISHED',now,now);
      storyInsert.run('story_new_selection','IMAGE','/media/hero-homme.jpg','NEW','Nouvelle sélection','Une sélection internationale mode et lifestyle.','Voir la sélection','#arrivages','product_demo_01','arrival_08',null,iso(-1),iso(9),80,'PUBLISHED',now,now);
      storyInsert.run('story_style_week','IMAGE','/media/hero-enfants.jpg','STYLE','Les tendances du moment','Les essentiels de la semaine repérés pour vous.','Découvrir','',null,null,null,iso(-1),iso(9),60,'PUBLISHED',now,now);
      storyInsert.run('story_prepare_order','IMAGE','/media/hero-femme.jpg','INFO','Préparez votre commande','Lens, lien direct, calcul en dinars : tout est prêt.','Commander','',null,null,null,iso(0),iso(10),40,'PUBLISHED',now,now);

      const newsInsert = this.db.prepare(`INSERT OR IGNORE INTO news_items
        (id,title,slug,summary,content,image,category,arrival_id,product_id,author,published_at,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      newsInsert.run('news_arrival_08','Le nouvel arrivage AYROVI est ouvert','le-nouvel-arrivage-ayrovi-est-ouvert',
        'Les commandes pour l’arrivage #08 sont maintenant disponibles.',
        'Préparez vos liens et captures avec Lens. AYROVI centralise le calcul, l’achat et la livraison en Tunisie.\n\nLa sélection #08 combine mode, lifestyle et accessoires sourcés auprès de boutiques internationales vérifiées. Chaque commande suit le parcours standard : validation, achat international, transit puis livraison dans votre gouvernorat.\n\nUtilisez Lens pour estimer un prix en dinars avant de commander, et suivez chaque étape depuis votre espace client.',
        '/media/hero-homme.jpg','NEW_ARRIVAL','arrival_08','product_demo_01','Équipe AYROVI',iso(-2),'PUBLISHED',now,now);
      newsInsert.run('news_features','Découvrez les nouvelles fonctionnalités AYROVI','decouvrez-les-nouvelles-fonctionnalites-ayrovi',
        'Lens multimodal, assistant intelligent et suivi enrichi : la plateforme évolue.',
        'L’assistant AYROVI répond désormais en temps réel, calcule les prix totaux en dinars et suit vos commandes.\n\nLens identifie un produit depuis une photo, un lien, un QR code ou un code-barres, puis propose des correspondances vérifiables avant la commande.\n\nCes outils restent supervisés par l’équipe : chaque prix visible est confirmé manuellement avant achat.',
        '/media/hero-femme.jpg','AYROVI',null,null,'Équipe AYROVI',iso(-1),'PUBLISHED',now,now);
      newsInsert.run('news_orders_info','Informations importantes concernant les commandes','informations-importantes-concernant-les-commandes',
        'Acompte, vérifications et délais : ce qu’il faut savoir avant de commander.',
        'Un acompte de 20% confirme votre commande ; le paiement par carte bénéficie d’une remise et d’une confirmation immédiate.\n\nLes délais indicatifs couvrent l’achat international, le dédouanement et la livraison dans les 24 gouvernorats.\n\nEn cas de question, l’assistant ou l’équipe AYROVI reste disponible depuis le site.',
        '/media/hero-enfants.jpg','INFORMATION',null,null,'Équipe AYROVI',iso(0),'PUBLISHED',now,now);
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

  public transaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }

  public close() {
    this.db.close();
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
      customsFeePercent: Number(row.customs_fee_percent),
      shippingFeeTND: Number(row.shipping_fee_tnd),
      serviceFeePercent: Number(row.service_fee_percent),
      minimumServiceFeeTND: Number(row.minimum_service_fee_tnd),
      expressFeeTND: Number(row.express_fee_tnd),
      updatedAt: row.updated_at,
    };
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

      const accountPhoneDigits = normalizedPhone.replace(/\D/g, '').replace(/^216(?=\d{8}$)/, '');
      let customer = this.all<any>('SELECT * FROM customers ORDER BY updated_at DESC').find((candidate) => {
        const candidateDigits = String(candidate.phone || '').replace(/\D/g, '').replace(/^00216(?=\d{8}$)/, '').replace(/^216(?=\d{8}$)/, '');
        return candidateDigits === accountPhoneDigits;
      });
      if (!customer) {
        const customerId = `customer_${randomUUID()}`;
        this.run(`INSERT INTO customers (id,name,phone,governorate,address,registered_at,status,updated_at)
          VALUES (?,?,?,?,?,?,'ACTIVE',?)`, customerId, input.name, normalizedPhone, input.governorate, input.address, now, now);
        customer = this.get<any>('SELECT * FROM customers WHERE id = ?', customerId)!;
      } else {
        this.run('UPDATE customers SET name=?, governorate=?, address=?, updated_at=? WHERE id=?',
          input.name, input.governorate, input.address, now, customer.id);
      }

      const breakdowns = items.map((item) => {
        const price = calculatePrice(rules, item.sourcePrice, item.sourceCurrency, { quantity: item.quantity });
        if (!price) throw new Error('INVALID_CART_PRICE');
        return { item, price };
      });
      const totals = breakdowns.reduce((sum, current) => ({
        subtotal: sum.subtotal + current.price.convertedPriceTND,
        customs: sum.customs + current.price.customsFeeTND,
        shipping: sum.shipping + current.price.shippingFeeTND,
        service: sum.service + current.price.serviceFeeTND,
        express: sum.express + current.price.expressFeeTND,
        discount: sum.discount + current.price.discountTND,
        total: sum.total + current.price.totalTND,
      }), { subtotal: 0, customs: 0, shipping: 0, service: 0, express: 0, discount: 0, total: 0 });
      const stores = [...new Set(items.map((item) => item.store.toUpperCase()))];
      const supportedSources = new Set(['SHEIN','AMAZON','TEMU','ALIEXPRESS']);
      const source = stores.length > 1 ? 'MIXED' : (supportedSources.has(stores[0]) ? stores[0] : 'OTHER');
      const snapshot = JSON.stringify({ ...rules, capturedAt: now });

      const depositPercent = this.getDepositPercent();
      const depositBase = Math.round((totals.total * depositPercent) / 100 * 1000) / 1000;
      // الدفع بالبطاقة: خصم 5% (قابل للضبط) على العربون — الفاتورة تُنشأ مباشرة بعد تأكيد الدفع
      const isCard = String(input.paymentMethod).toUpperCase() === 'CARD';
      const cardDiscountPercent = isCard ? this.getCardDiscountPercent() : 0;
      const depositDiscount = Math.round(depositBase * cardDiscountPercent / 100 * 1000) / 1000;
      const depositAmount = Math.round((depositBase - depositDiscount) * 1000) / 1000;
      const balanceAfterDeposit = Math.round((totals.total - depositAmount) * 1000) / 1000;

      this.run(`INSERT INTO orders (
        id,order_number,customer_id,account_id,source,arrival_id,status,payment_status,payment_method,
        deposit_percent,deposit_amount_tnd,deposit_discount_tnd,deposit_status,
        subtotal_tnd,customs_tnd,shipping_tnd,service_tnd,express_tnd,discount_tnd,total_tnd,
        pricing_snapshot,governorate,address,phone,notes,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,'PAYMENT_PENDING','PENDING',?,?,?,?,'PENDING',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      orderId, orderNumber, customer.id, accountId, source, null, input.paymentMethod,
        depositPercent, depositAmount, depositDiscount,
      totals.subtotal, totals.customs, totals.shipping, totals.service, totals.express, totals.discount, totals.total,
      snapshot, input.governorate, input.address, normalizedPhone, '', now, now);

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
        VALUES (?,?,NULL,'PAYMENT_PENDING',?,NULL,?)`, `history_${randomUUID()}`, orderId,
        `Commande créée — en attente du paiement de l'acompte (${depositPercent}%).`, now);
      this.run(`INSERT INTO payments (id,order_id,method,status,amount_tnd,reference,created_at,updated_at)
        VALUES (?,?,?,'PENDING',?,NULL,?,?)`, `payment_${randomUUID()}`, orderId, input.paymentMethod, depositAmount, now, now);
      this.run(`INSERT INTO deliveries (id,order_id,governorate,address,phone,status,created_at,updated_at)
        VALUES (?,?,?,?,?,'PENDING',?,?)`, `delivery_${randomUUID()}`, orderId, input.governorate, input.address, normalizedPhone, now, now);
      this.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
        VALUES (?,?,'ORDER','Acompte à régler',?, ?, ?)`, `notification_${randomUUID()}`, accountId,
        `Commande ${orderNumber} enregistrée : réglez l'acompte de ${depositAmount.toFixed(3)} DT (${String(input.paymentMethod)}) pour la confirmer.${depositDiscount > 0 ? ` Remise carte −${depositDiscount.toFixed(3)} DT appliquée.` : ''}`, `/compte/commandes/${orderId}`, now);
      // إشعار الإدارة بطلب جديد بانتظار العربون
      this.notifyAdmins('ORDER', 'Nouvelle commande',
        `${orderNumber} — ${totals.total.toFixed(3)} DT, acompte ${depositAmount.toFixed(3)} DT (${String(input.paymentMethod)}).`,
        `/admin?tab=orders&order=${orderId}`);
      this.clearCart(sessionId, accountId);

      return {
        orderId,
        orderNumber,
        totalTND: Math.round(totals.total * 100) / 100,
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        customer: { name: input.name, phone: normalizedPhone, city: input.governorate, address: input.address, paymentMethod: input.paymentMethod.toLowerCase() },
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
      WHERE status NOT IN ('CANCELLED','PAYMENT_PENDING') AND created_at >= ? AND created_at <= ?`, `${from}T00:00:00`, `${to}T23:59:59.999Z`);
    const depositsPending = this.get<any>(`SELECT COUNT(*) count, COALESCE(SUM(deposit_amount_tnd),0) total FROM orders
      WHERE status='PAYMENT_PENDING' AND deposit_status IN ('PENDING','SUBMITTED')`);
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

  private generateTrackingCode(): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = `AYR-TN-${randomInt(10_000_000, 100_000_000)}`;
      const exists = this.get<any>('SELECT id FROM orders WHERE tracking_code=?', code);
      if (!exists) return code;
    }
    return `AYR-TN-${Date.now()}`;
  }

  private generateInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const count = this.get<any>(`SELECT COUNT(*) AS count FROM orders WHERE invoice_number LIKE 'INV-${year}-%'`)?.count || 0;
    for (let seq = Number(count) + 1; seq < count + 1000; seq += 1) {
      const number = `INV-${year}-${String(seq).padStart(6, '0')}`;
      const exists = this.get<any>('SELECT id FROM orders WHERE invoice_number=?', number);
      if (!exists) return number;
    }
    return `INV-${year}-${Date.now()}`;
  }

  /** العميل يرفع وصل دفع العربون (صورة/PDF) → تصبح بانتظار مراجعة الإدارة */
  public attachDepositProof(orderId: string, proofPath: string) {
    return this.transaction(() => {
      const order = this.get<any>('SELECT * FROM orders WHERE id=?', orderId);
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (order.status !== 'PAYMENT_PENDING' || !['PENDING', 'SUBMITTED', 'REJECTED'].includes(String(order.deposit_status))) {
        throw new Error('DEPOSIT_NOT_SUBMITTABLE');
      }
      const now = new Date().toISOString();
      this.run(`UPDATE orders SET deposit_proof_path=?, deposit_status='SUBMITTED', deposit_submitted_at=?, updated_at=? WHERE id=?`,
        proofPath, now, now, orderId);
      this.run(`INSERT INTO order_status_history (id,order_id,from_status,to_status,note,changed_by,created_at)
        VALUES (?,?,?,'PAYMENT_PENDING',?,NULL,?)`, `history_${randomUUID()}`, orderId, order.status,
        'Preuve d’acompte téléversée par le client — en attente de vérification.', now);
      // إشعار فوري للإدارة: وصل جديد بانتظار المراجعة
      this.notifyAdmins('DEPOSIT_REVIEW', 'Acompte à vérifier',
        `La commande ${order.order_number} (${Number(order.deposit_amount_tnd).toFixed(3)} DT) a reçu une preuve de paiement — vérifiez-la.`,
        `/admin?tab=orders&order=${orderId}`);
      return this.get<any>('SELECT * FROM orders WHERE id=?', orderId);
    });
  }

  /** الإدارة تقبل العربون → تأكيد الطلب + كود تتبع + رقم فاتورة */
  public confirmOrderDeposit(orderId: string, adminId: string, note = '') {
    return this.transaction(() => {
      const order = this.get<any>('SELECT * FROM orders WHERE id=?', orderId);
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (order.status !== 'PAYMENT_PENDING' || !['PENDING', 'SUBMITTED'].includes(String(order.deposit_status))) {
        throw new Error('DEPOSIT_NOT_REVIEWABLE');
      }
      const now = new Date().toISOString();
      const trackingCode = this.generateTrackingCode();
      const invoiceNumber = this.generateInvoiceNumber();
      this.run(`UPDATE orders SET status='CONFIRMED', deposit_status='PAID', deposit_paid_at=?, deposit_reviewed_by=?,
        deposit_review_note=?, tracking_code=?, invoice_number=?, updated_at=? WHERE id=?`,
        now, adminId, note.slice(0, 500), trackingCode, invoiceNumber, now, orderId);
      this.run(`UPDATE payments SET status='PAID', confirmed_by=?, confirmed_at=?, updated_at=? WHERE order_id=?`, adminId, now, now, orderId);
      this.run(`INSERT INTO order_status_history (id,order_id,from_status,to_status,note,changed_by,created_at)
        VALUES (?,?,'PAYMENT_PENDING','CONFIRMED',?,?,?)`, `history_${randomUUID()}`, orderId,
        `Acompte ${Number(order.deposit_amount_tnd).toFixed(3)} DT confirmé.${note ? ` ${note.slice(0, 200)}` : ''}`, adminId, now);
      if (order.account_id) {
        this.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
          VALUES (?,?,'ORDER','Commande confirmée',?,?,?)`, `notification_${randomUUID()}`, order.account_id,
          `Votre acompte est confirmé — la commande ${order.order_number} passe en préparation. Suivi : ${trackingCode}.`, `/compte/commandes/${orderId}`, now);
      }
      return this.get<any>('SELECT * FROM orders WHERE id=?', orderId);
    });
  }

  /** الإدارة ترفض الوصل → العميل يعيد الرفع */
  public rejectOrderDeposit(orderId: string, adminId: string, note: string) {
    return this.transaction(() => {
      const order = this.get<any>('SELECT * FROM orders WHERE id=?', orderId);
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (order.status !== 'PAYMENT_PENDING' || !['PENDING', 'SUBMITTED'].includes(String(order.deposit_status))) {
        throw new Error('DEPOSIT_NOT_REVIEWABLE');
      }
      const now = new Date().toISOString();
      const safeNote = String(note || 'Preuve illisible ou invalide.').slice(0, 500);
      this.run(`UPDATE orders SET deposit_status='REJECTED', deposit_reviewed_by=?, deposit_review_note=?, updated_at=? WHERE id=?`,
        adminId, safeNote, now, orderId);
      this.run(`INSERT INTO order_status_history (id,order_id,from_status,to_status,note,changed_by,created_at)
        VALUES (?,?,?,'PAYMENT_PENDING',?,?,?)`, `history_${randomUUID()}`, orderId, order.status,
        `Acompte refusé : ${safeNote.slice(0, 200)}`, adminId, now);
      if (order.account_id) {
        this.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
          VALUES (?,?,'ORDER','Acompte à revérifier',?,?,?)`, `notification_${randomUUID()}`, order.account_id,
          `La preuve d'acompte de ${order.order_number} a été refusée : ${safeNote.slice(0, 160)} Merci d'en téléverser une nouvelle.`, `/compte/commandes/${orderId}`, now);
      }
      return this.get<any>('SELECT * FROM orders WHERE id=?', orderId);
    });
  }

}
