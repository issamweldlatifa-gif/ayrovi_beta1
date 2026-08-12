import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { randomInt, randomUUID } from 'node:crypto';
import { CartItem, AddToCartRequest } from '../types';
import { calculatePrice, PricingRules } from '../services/pricing';

export interface CheckoutInput {
  name: string;
  phone: string;
  governorate: string;
  address: string;
  paymentMethod: 'COD' | 'D17' | 'FLOUCI';
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
      CREATE TABLE IF NOT EXISTS cart_items (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        store TEXT NOT NULL,
        external_id TEXT,
        source_url TEXT NOT NULL,
        title TEXT NOT NULL,
        image_url TEXT,
        source_price REAL NOT NULL,
        source_currency TEXT NOT NULL,
        price_tnd REAL NOT NULL,
        variant TEXT,
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
        governorate TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        registered_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','BLOCKED')),
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customers_name_phone ON customers(name, phone);

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        source TEXT NOT NULL DEFAULT 'OTHER' CHECK(source IN ('SHEIN','AMAZON','TEMU','ALIEXPRESS','OTHER','MIXED')),
        arrival_id TEXT REFERENCES arrivals(id) ON DELETE SET NULL,
        status TEXT NOT NULL CHECK(status IN ('NEW','CONFIRMED','PAYMENT_PENDING','PAID','PURCHASING','PURCHASED','IN_TRANSIT','ARRIVED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED')),
        payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(payment_status IN ('PENDING','PAID','FAILED','REFUNDED','CANCELLED')),
        payment_method TEXT NOT NULL DEFAULT 'COD' CHECK(payment_method IN ('COD','D17','FLOUCI')),
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
      );
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status, created_at DESC);

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

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        method TEXT NOT NULL CHECK(method IN ('COD','D17','FLOUCI')),
        status TEXT NOT NULL CHECK(status IN ('PENDING','PAID','FAILED','REFUNDED','CANCELLED')),
        amount_tnd REAL NOT NULL,
        reference TEXT,
        confirmed_by TEXT,
        confirmed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
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

      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL CHECK(category IN ('GENERAL','COMMERCE','DELIVERY','PAYMENT')),
        setting_key TEXT NOT NULL UNIQUE,
        setting_value TEXT NOT NULL,
        value_type TEXT NOT NULL DEFAULT 'STRING' CHECK(value_type IN ('STRING','NUMBER','BOOLEAN','JSON')),
        label TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT
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
      ['setting_payment_methods', 'PAYMENT', 'payment_methods', JSON.stringify(['COD','D17','FLOUCI']), 'JSON', 'Méthodes de paiement'],
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
      quantity: Number(row.quantity),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public addItem(sessionId: string, item: AddToCartRequest): CartItem {
    const now = new Date().toISOString();
    if (item.externalId) {
      const existing = this.get<any>(`
        SELECT * FROM cart_items WHERE session_id = ? AND store = ? AND external_id = ?
          AND IFNULL(variant, '') = IFNULL(?, '')
      `, sessionId, item.store, item.externalId, item.variant || '');
      if (existing) {
        const newQty = existing.quantity + (item.quantity || 1);
        if (newQty > 99) throw new RangeError('CART_QUANTITY_LIMIT');
        this.run('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ? AND session_id = ?', newQty, now, existing.id, sessionId);
        return this.getItemById(existing.id, sessionId)!;
      }
    }

    const id = `ayr_${randomUUID().substring(0, 8)}`;
    this.run(`INSERT INTO cart_items (
      id, session_id, store, external_id, source_url, title, image_url,
      source_price, source_currency, price_tnd, variant, quantity, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, sessionId, item.store, item.externalId || null, item.url, item.title, item.imageUrl,
    item.sourcePrice, item.sourceCurrency, item.priceTND, item.variant || null, item.quantity || 1, now, now);
    return this.getItemById(id, sessionId)!;
  }

  public getItems(sessionId: string): CartItem[] {
    return this.all<any>('SELECT * FROM cart_items WHERE session_id = ? ORDER BY created_at DESC', sessionId).map((row) => this.mapRow(row));
  }

  public getItemById(id: string, sessionId: string): CartItem | null {
    const row = this.get<any>('SELECT * FROM cart_items WHERE id = ? AND session_id = ?', id, sessionId);
    return row ? this.mapRow(row) : null;
  }

  public removeItem(id: string, sessionId: string): boolean {
    return this.run('DELETE FROM cart_items WHERE id = ? AND session_id = ?', id, sessionId).changes > 0;
  }

  public updateQuantity(id: string, quantity: number, sessionId: string): CartItem | null {
    if (quantity <= 0) {
      this.removeItem(id, sessionId);
      return null;
    }
    this.run('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ? AND session_id = ?',
      quantity, new Date().toISOString(), id, sessionId);
    return this.getItemById(id, sessionId);
  }

  public clearCart(sessionId: string): number {
    return this.run('DELETE FROM cart_items WHERE session_id = ?', sessionId).changes;
  }

  public createOrderFromCart(sessionId: string, input: CheckoutInput) {
    const items = this.getItems(sessionId);
    if (items.length === 0) throw new Error('EMPTY_CART');
    const rules = this.getPricingRules();
    const now = new Date().toISOString();
    const orderId = `order_${randomUUID()}`;
    const orderNumber = `AYR-${randomInt(100000, 1000000)}`;
    const normalizedPhone = input.phone.replace(/\s+/g, ' ').trim();

    return this.transaction(() => {
      let customer = this.get<any>('SELECT * FROM customers WHERE phone = ?', normalizedPhone);
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

      this.run(`INSERT INTO orders (
        id,order_number,customer_id,source,arrival_id,status,payment_status,payment_method,subtotal_tnd,customs_tnd,
        shipping_tnd,service_tnd,express_tnd,discount_tnd,total_tnd,pricing_snapshot,governorate,address,phone,notes,created_at,updated_at
      ) VALUES (?,?,?,?,?,'NEW','PENDING',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      orderId, orderNumber, customer.id, source, null, input.paymentMethod,
      totals.subtotal, totals.customs, totals.shipping, totals.service, totals.express, totals.discount, totals.total,
      snapshot, input.governorate, input.address, normalizedPhone, '', now, now);

      for (const { item, price } of breakdowns) {
        this.run(`INSERT INTO order_items (
          id,order_id,product_id,arrival_id,product_name,source_platform,source_url,image_url,variant,quantity,
          original_price,currency,exchange_rate,converted_price_tnd,customs_tnd,shipping_tnd,service_tnd,express_tnd,
          discount_tnd,total_tnd,pricing_snapshot,created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        `order_item_${randomUUID()}`, orderId, null, null, item.title, item.store.toUpperCase(), item.sourceUrl,
        item.imageUrl, item.variant, item.quantity, item.sourcePrice, item.sourceCurrency, price.exchangeRate,
        price.convertedPriceTND, price.customsFeeTND, price.shippingFeeTND, price.serviceFeeTND, price.expressFeeTND,
        price.discountTND, price.totalTND, JSON.stringify(price), now);
      }

      this.run(`INSERT INTO order_status_history (id,order_id,from_status,to_status,note,changed_by,created_at)
        VALUES (?,?,NULL,'NEW','Commande créée depuis le checkout public',NULL,?)`, `history_${randomUUID()}`, orderId, now);
      this.run(`INSERT INTO payments (id,order_id,method,status,amount_tnd,reference,created_at,updated_at)
        VALUES (?,?,?,'PENDING',?,NULL,?,?)`, `payment_${randomUUID()}`, orderId, input.paymentMethod, totals.total, now, now);
      this.run(`INSERT INTO deliveries (id,order_id,governorate,address,phone,status,created_at,updated_at)
        VALUES (?,?,?,?,?,'PENDING',?,?)`, `delivery_${randomUUID()}`, orderId, input.governorate, input.address, normalizedPhone, now, now);
      this.clearCart(sessionId);

      return {
        orderId,
        orderNumber,
        totalTND: Math.round(totals.total * 100) / 100,
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        customer: { name: input.name, phone: normalizedPhone, city: input.governorate, address: input.address, paymentMethod: input.paymentMethod.toLowerCase() },
      };
    });
  }
}
