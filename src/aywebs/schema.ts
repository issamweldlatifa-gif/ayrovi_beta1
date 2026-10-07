import type { QatafoDatabase } from '../db/database';
import { seedAyWebsPermissions } from './permissions';
import { AYWEBS_EXTERNAL_STORE, AYWEBS_STORES, type AyWebsStoreDefinition } from '../../shared/aywebsStores';
import {
  AYWEBS_AVAILABILITY_STATES,
  AYWEBS_CART_ITEM_STATUSES,
  AYWEBS_CART_STATUSES,
  AYWEBS_DOMAIN_EVENTS,
  AYWEBS_EXCEPTION_STATES,
  AYWEBS_FEE_KINDS,
  AYWEBS_INTEGRATION_TYPES,
  AYWEBS_MASTER_FLOW,
  AYWEBS_ORDER_STATUSES,
  AYWEBS_PACKAGE_STATES,
  AYWEBS_PAGE_TYPES,
  AYWEBS_PURCHASE_MODES,
  AYWEBS_PURCHASE_REQUEST_REASONS,
  AYWEBS_PURCHASE_REQUEST_STATUSES,
  AYWEBS_PURCHASE_STATUSES,
  AYWEBS_STORE_CAPABILITIES,
  AYWEBS_STORE_REQUEST_STATUSES,
  AYWEBS_WAREHOUSE_STATES,
} from '../../shared/aywebsTypes';

/**
 * AYWEBs — fondation de données (§42).
 *
 * Discipline identique aux modules ERP existants (P1/P2.x) :
 *  • ADDITIF uniquement : `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`
 *    et `ALTER TABLE … ADD COLUMN` sur colonne manquante. Aucune table AYROVI
 *    existante n'est renommée, modifiée dans sa structure ou supprimée ;
 *  • DDL multi-instructions via `db.runSchema()` ;
 *  • idempotent : base fraîche, base existante et re-boot donnent la même forme ;
 *  • identités client existantes réutilisées : `account_id` pointe
 *    `customer_accounts(id)`, rien ne crée un second système d'authentification ;
 *  • les tables des phases 6-8 (purchase attempts, warehouse, packages,
 *    shipping) sont créées ici pour que le domaine soit cohérent d'un seul
 *    tenant — leurs SERVICES restent non implémentés et le disent (§48).
 *
 * Identités (§53) : chaque objet porte son identité AYROVI (`AYWITEM-…`,
 * `AYW-…`) ET l'identité source (`source_product_id`, `source_url`). Les deux
 * ne sont jamais fusionnées.
 */

const list = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(',');

export const AYWEBS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ayweb_stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  logo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  integration_type TEXT NOT NULL DEFAULT 'URL_REQUEST' CHECK(integration_type IN (${list(AYWEBS_INTEGRATION_TYPES)})),
  home_url TEXT NOT NULL DEFAULT '',
  search_url_template TEXT NOT NULL DEFAULT '',
  browser_mode TEXT NOT NULL DEFAULT 'external',
  popular INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_stores_status ON ayweb_stores(status, sort_order);

CREATE TABLE IF NOT EXISTS ayweb_store_capabilities (
  store_id TEXT NOT NULL REFERENCES ayweb_stores(id) ON DELETE CASCADE,
  capability TEXT NOT NULL CHECK(capability IN (${list(AYWEBS_STORE_CAPABILITIES)})),
  granted INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, capability)
);

CREATE TABLE IF NOT EXISTS ayweb_store_domains (
  store_id TEXT NOT NULL REFERENCES ayweb_stores(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  PRIMARY KEY (store_id, domain)
);

CREATE TABLE IF NOT EXISTS ayweb_store_requests (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL DEFAULT '',
  store_url TEXT NOT NULL,
  store_name TEXT NOT NULL DEFAULT '',
  intent TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN (${list(AYWEBS_STORE_REQUEST_STATUSES)})),
  decision_note TEXT NOT NULL DEFAULT '',
  decided_by TEXT,
  decided_at TEXT,
  promoted_store_id TEXT REFERENCES ayweb_stores(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_store_requests_status ON ayweb_store_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS ayweb_products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_domain TEXT NOT NULL DEFAULT '',
  source_product_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT '',
  price_verified INTEGER NOT NULL DEFAULT 0,
  currency_verified INTEGER NOT NULL DEFAULT 0,
  variant_groups TEXT NOT NULL DEFAULT '[]',
  variants TEXT NOT NULL DEFAULT '[]',
  -- 03/10/2026 — état publié par la source : 'new' | 'used' | 'refurbished' | '' (inconnu).
  condition TEXT NOT NULL DEFAULT '',
  -- Phase 2.5 (07/10/2026) — champs étendus publiés par la source, sinon vides.
  gtin TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  seller TEXT NOT NULL DEFAULT '',
  rating REAL NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  availability TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(availability IN (${list(AYWEBS_AVAILABILITY_STATES)})),
  availability_reason TEXT NOT NULL DEFAULT '',
  availability_checked_at TEXT,
  purchase_mode TEXT NOT NULL DEFAULT 'NOT_IMPLEMENTED' CHECK(purchase_mode IN (${list(AYWEBS_PURCHASE_MODES)})),
  integration_type TEXT NOT NULL DEFAULT 'URL_REQUEST' CHECK(integration_type IN (${list(AYWEBS_INTEGRATION_TYPES)})),
  page_type TEXT NOT NULL DEFAULT 'PRODUCT' CHECK(page_type IN (${list(AYWEBS_PAGE_TYPES)})),
  pricing_tnd REAL NOT NULL DEFAULT 0,
  pricing_version INTEGER NOT NULL DEFAULT 0,
  pricing_breakdown TEXT NOT NULL DEFAULT '{}',
  evidence_hash TEXT NOT NULL DEFAULT '',
  capture_id TEXT NOT NULL DEFAULT '',
  resolved_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ayweb_products_source_unique ON ayweb_products(store_id, source_product_id, source_url);
CREATE INDEX IF NOT EXISTS idx_ayweb_products_capture ON ayweb_products(capture_id);
CREATE INDEX IF NOT EXISTS idx_ayweb_products_resolved ON ayweb_products(resolved_at DESC);

CREATE TABLE IF NOT EXISTS ayweb_product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES ayweb_products(id) ON DELETE CASCADE,
  source_variant_id TEXT NOT NULL DEFAULT '',
  attributes TEXT NOT NULL DEFAULT '{}',
  label TEXT NOT NULL DEFAULT '',
  price REAL,
  currency TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(availability IN (${list(AYWEBS_AVAILABILITY_STATES)})),
  availability_reason TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_variants_product ON ayweb_product_variants(product_id, sort_order);

CREATE TABLE IF NOT EXISTS ayweb_carts (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES customer_accounts(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN (${list(AYWEBS_CART_STATUSES)})),
  currency TEXT NOT NULL DEFAULT 'TND',
  items_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_carts_account ON ayweb_carts(account_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayweb_carts_session ON ayweb_carts(session_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ayweb_cart_items (
  id TEXT PRIMARY KEY,
  /* Identité AYROVI de la ligne (AYWITEM-000123). L'identité source reste
     source_url / source_product_id : les deux ne sont jamais fusionnées (§53). */
  item_number TEXT NOT NULL DEFAULT '',
  cart_id TEXT NOT NULL REFERENCES ayweb_carts(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES ayweb_products(id) ON DELETE SET NULL,
  store_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_product_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]',
  unit_price REAL NOT NULL,
  currency TEXT NOT NULL,
  variant_snapshot TEXT NOT NULL DEFAULT 'null',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 99),
  availability TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(availability IN (${list(AYWEBS_AVAILABILITY_STATES)})),
  price_snapshot TEXT NOT NULL DEFAULT '{}',
  pricing_tnd REAL NOT NULL DEFAULT 0,
  pricing_version INTEGER NOT NULL DEFAULT 0,
  evidence_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN (${list(AYWEBS_CART_ITEM_STATUSES)})),
  status_reason TEXT NOT NULL DEFAULT '',
  customer_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_cart_items_cart ON ayweb_cart_items(cart_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ayweb_cart_items_status ON ayweb_cart_items(status);

/* Stable identity for the AYWEBs → AYROVI cart bridge. The customer note remains
 * presentation/audit text only; editing it must not detach checkout safety. */
CREATE TABLE IF NOT EXISTS ayweb_cart_ayrovi_links (
  aywebs_item_id TEXT PRIMARY KEY NOT NULL,
  ayrovi_cart_item_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL DEFAULT '',
  account_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_cart_ayrovi_link_session
  ON ayweb_cart_ayrovi_links(session_id, account_id);

/* Stable Add-to-Cart retries: one durable result per caller key, independent of
 * line-level duplicate merging. Stored snapshots replay the first outcome. */
CREATE TABLE IF NOT EXISTS ayweb_cart_add_requests (
  id TEXT PRIMARY KEY,
  scope_key TEXT NOT NULL,
  session_id TEXT NOT NULL,
  account_id TEXT,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ayweb_cart_add_request_key
  ON ayweb_cart_add_requests(scope_key,idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ayweb_cart_add_request_session
  ON ayweb_cart_add_requests(session_id,created_at DESC);

CREATE TABLE IF NOT EXISTS ayweb_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  cart_id TEXT REFERENCES ayweb_carts(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN (${list(AYWEBS_ORDER_STATUSES)})),
  master_stage TEXT NOT NULL DEFAULT 'CHECKOUT' CHECK(master_stage IN (${list(AYWEBS_MASTER_FLOW)})),
  exception_state TEXT CHECK(exception_state IN (${list(AYWEBS_EXCEPTION_STATES)})),
  exception_reason TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'TND',
  product_subtotal_tnd REAL NOT NULL DEFAULT 0,
  service_fee_tnd REAL NOT NULL DEFAULT 0,
  import_fee_tnd REAL NOT NULL DEFAULT 0,
  shipping_estimate_tnd REAL NOT NULL DEFAULT 0,
  other_fee_tnd REAL NOT NULL DEFAULT 0,
  payable_tnd REAL NOT NULL DEFAULT 0,
  fees_snapshot TEXT NOT NULL DEFAULT '[]',
  pricing_version INTEGER NOT NULL DEFAULT 0,
  payment_reference TEXT NOT NULL DEFAULT '',
  payment_status TEXT NOT NULL DEFAULT 'PENDING',
  paid_at TEXT,
  submitted_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_orders_account ON ayweb_orders(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayweb_orders_status ON ayweb_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS ayweb_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES ayweb_orders(id) ON DELETE CASCADE,
  cart_item_id TEXT REFERENCES ayweb_cart_items(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES ayweb_products(id) ON DELETE SET NULL,
  store_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_product_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]',
  unit_price REAL NOT NULL,
  currency TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  variant_snapshot TEXT NOT NULL DEFAULT 'null',
  price_snapshot TEXT NOT NULL DEFAULT '{}',
  evidence_hash TEXT NOT NULL DEFAULT '',
  line_total_tnd REAL NOT NULL DEFAULT 0,
  purchase_status TEXT NOT NULL DEFAULT 'PURCHASE_PENDING' CHECK(purchase_status IN (${list(AYWEBS_PURCHASE_STATUSES)})),
  purchase_reason TEXT NOT NULL DEFAULT '',
  warehouse_state TEXT NOT NULL DEFAULT 'WAITING_SUPPLIER' CHECK(warehouse_state IN (${list(AYWEBS_WAREHOUSE_STATES)})),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_order_items_order ON ayweb_order_items(order_id, created_at);

CREATE TABLE IF NOT EXISTS ayweb_payments (
  id TEXT PRIMARY KEY,
  payment_number TEXT NOT NULL DEFAULT '',
  order_id TEXT NOT NULL REFERENCES ayweb_orders(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
  /* Moyen issu de la configuration commerciale AYROVI existante : AYWEBs ne
     crée ni moyen de paiement ni passerelle parallèle (§20). */
  method TEXT NOT NULL DEFAULT 'PENDING_SELECTION' CHECK(method IN ('PENDING_SELECTION','COD','D17','FLOUCI','CARD','BANK_TRANSFER','POSTE')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PENDING_VERIFICATION','PAID','FAILED','REJECTED','REFUNDED','CANCELLED')),
  amount_tnd REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TND',
  provider TEXT NOT NULL DEFAULT '',
  provider_reference TEXT NOT NULL DEFAULT '',
  pay_url TEXT NOT NULL DEFAULT '',
  transfer_reference TEXT NOT NULL DEFAULT '',
  proof_path TEXT NOT NULL DEFAULT '',
  proof_original_name TEXT NOT NULL DEFAULT '',
  failure_reason TEXT NOT NULL DEFAULT '',
  verified_payload TEXT NOT NULL DEFAULT '',
  initiated_at TEXT,
  confirmed_at TEXT,
  confirmed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_payments_order ON ayweb_payments(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayweb_payments_status ON ayweb_payments(status, created_at DESC);

CREATE TABLE IF NOT EXISTS ayweb_order_links (
  id TEXT PRIMARY KEY,
  ayweb_order_id TEXT NOT NULL REFERENCES ayweb_orders(id) ON DELETE CASCADE,
  /* Pont vers l'OMS AYROVI existant : la commande AYWEBs peut être transférée
     dans le checkout AYROVI, sans jamais créer un second système de commande. */
  link_type TEXT NOT NULL DEFAULT 'AYROVI_ORDER' CHECK(link_type IN ('AYROVI_ORDER','AYROVI_CART_ITEM','PURCHASE_REQUEST','WORKER_PACKAGE')),
  external_id TEXT NOT NULL,
  external_number TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_order_links_order ON ayweb_order_links(ayweb_order_id, link_type);

CREATE TABLE IF NOT EXISTS ayweb_purchase_requests (
  id TEXT PRIMARY KEY,
  request_number TEXT NOT NULL UNIQUE,
  account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL DEFAULT '',
  store_id TEXT NOT NULL DEFAULT '',
  product_url TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 99),
  product_name TEXT NOT NULL DEFAULT '',
  variant_attributes TEXT NOT NULL DEFAULT '{}',
  requirements TEXT NOT NULL DEFAULT '',
  customer_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN (${list(AYWEBS_PURCHASE_REQUEST_STATUSES)})),
  reason TEXT CHECK(reason IN (${list(AYWEBS_PURCHASE_REQUEST_REASONS)})),
  decision_note TEXT NOT NULL DEFAULT '',
  decided_by TEXT,
  decided_at TEXT,
  order_id TEXT REFERENCES ayweb_orders(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_purchase_requests_status ON ayweb_purchase_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayweb_purchase_requests_account ON ayweb_purchase_requests(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ayweb_purchase_attempts (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES ayweb_order_items(id) ON DELETE CASCADE,
  adapter TEXT NOT NULL DEFAULT '',
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PURCHASE_PENDING' CHECK(status IN (${list(AYWEBS_PURCHASE_STATUSES)})),
  reason TEXT NOT NULL DEFAULT '',
  source_price REAL,
  source_currency TEXT NOT NULL DEFAULT '',
  evidence_hash TEXT NOT NULL DEFAULT '',
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_attempts_item ON ayweb_purchase_attempts(order_item_id, attempt_number);

CREATE TABLE IF NOT EXISTS ayweb_evidence (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES ayweb_products(id) ON DELETE CASCADE,
  cart_item_id TEXT REFERENCES ayweb_cart_items(id) ON DELETE SET NULL,
  order_item_id TEXT REFERENCES ayweb_order_items(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  source_domain TEXT NOT NULL DEFAULT '',
  source_product_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT '',
  selected_variant TEXT NOT NULL DEFAULT 'null',
  availability TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(availability IN (${list(AYWEBS_AVAILABILITY_STATES)})),
  evidence_hash TEXT NOT NULL,
  adapter TEXT NOT NULL DEFAULT '',
  retrieved_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_evidence_product ON ayweb_evidence(product_id, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayweb_evidence_hash ON ayweb_evidence(evidence_hash);

CREATE TABLE IF NOT EXISTS ayweb_domain_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL CHECK(event_name IN (${list(AYWEBS_DOMAIN_EVENTS)})),
  resource_type TEXT NOT NULL DEFAULT '',
  resource_id TEXT NOT NULL DEFAULT '',
  account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
  order_id TEXT REFERENCES ayweb_orders(id) ON DELETE SET NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_events_name ON ayweb_domain_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayweb_events_resource ON ayweb_domain_events(resource_type, resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ayweb_audit_logs (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL DEFAULT 'customer' CHECK(actor_type IN ('customer','admin','system','adapter')),
  actor_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT '',
  resource_id TEXT NOT NULL DEFAULT '',
  before_state TEXT NOT NULL DEFAULT '',
  after_state TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '{}',
  request_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_audit_resource ON ayweb_audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayweb_audit_created ON ayweb_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS ayweb_sessions (
  session_id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES customer_accounts(id) ON DELETE CASCADE,
  current_store_id TEXT NOT NULL DEFAULT '',
  current_url TEXT NOT NULL DEFAULT '',
  current_product_id TEXT NOT NULL DEFAULT '',
  selected_variant TEXT NOT NULL DEFAULT 'null',
  cart_id TEXT REFERENCES ayweb_carts(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_sessions_account ON ayweb_sessions(account_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ayweb_recent_stores (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT '',
  account_id TEXT REFERENCES customer_accounts(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL,
  visited_url TEXT NOT NULL DEFAULT '',
  visit_count INTEGER NOT NULL DEFAULT 1,
  last_visited_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ayweb_recent_unique ON ayweb_recent_stores(session_id, account_id, store_id);

CREATE TABLE IF NOT EXISTS ayweb_checkout_fees (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES ayweb_orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN (${list(AYWEBS_FEE_KINDS)})),
  label TEXT NOT NULL DEFAULT '',
  amount_tnd REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TND',
  source TEXT NOT NULL DEFAULT 'ayrovi',
  computed_at TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_ayweb_fees_order ON ayweb_checkout_fees(order_id, kind);

CREATE TABLE IF NOT EXISTS ayweb_warehouse_items (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES ayweb_order_items(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'WAITING_SUPPLIER' CHECK(state IN (${list(AYWEBS_WAREHOUSE_STATES)})),
  package_id TEXT NOT NULL DEFAULT '',
  supplier_tracking TEXT NOT NULL DEFAULT '',
  weight_g INTEGER NOT NULL DEFAULT 0,
  dimensions TEXT NOT NULL DEFAULT '{}',
  received_at TEXT,
  inspected_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_warehouse_state ON ayweb_warehouse_items(state, updated_at DESC);

CREATE TABLE IF NOT EXISTS ayweb_packages (
  id TEXT PRIMARY KEY,
  package_number TEXT NOT NULL UNIQUE,
  account_id TEXT REFERENCES customer_accounts(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'OPEN' CHECK(state IN (${list(AYWEBS_PACKAGE_STATES)})),
  weight_g INTEGER NOT NULL DEFAULT 0,
  dimensions TEXT NOT NULL DEFAULT '{}',
  shipping_method TEXT NOT NULL DEFAULT '',
  tracking_number TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_packages_account ON ayweb_packages(account_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ayweb_consolidations (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES ayweb_packages(id) ON DELETE CASCADE,
  warehouse_item_id TEXT NOT NULL REFERENCES ayweb_warehouse_items(id) ON DELETE CASCADE,
  consolidated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ayweb_consolidation_unique ON ayweb_consolidations(package_id, warehouse_item_id);

CREATE TABLE IF NOT EXISTS ayweb_shipping (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES ayweb_packages(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT '',
  quote_tnd REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TND',
  eta_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'QUOTE',
  payment_status TEXT NOT NULL DEFAULT 'PENDING',
  tracking_number TEXT NOT NULL DEFAULT '',
  quoted_at TEXT,
  paid_at TEXT,
  dispatched_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ayweb_shipping_package ON ayweb_shipping(package_id, created_at DESC);
`;

/** Numérotation AYWEBs via le moteur `erp_sequences` existant — jamais un compteur maison. */
export const AYWEBS_SEQUENCES = [
  { key: 'ayweb_order_number', prefix: 'AYW', padding: 6, yearScoped: 0, description: 'Référence client d’une commande AyWebs (AYW-000123)' },
  { key: 'ayweb_cart_item_number', prefix: 'AYWITEM', padding: 6, yearScoped: 0, description: 'Identité AYROVI d’une ligne de panier AyWebs' },
  { key: 'ayweb_purchase_request_number', prefix: 'AYWREQ', padding: 6, yearScoped: 0, description: 'Demande d’achat avec URL (boutique non intégrée)' },
  { key: 'ayweb_package_number', prefix: 'AYWPKG', padding: 6, yearScoped: 0, description: 'Colis consolidé en entrepôt AYROVI' },
  { key: 'ayweb_payment_number', prefix: 'AYWPAY', padding: 6, yearScoped: 0, description: 'Transaction de paiement d’une commande AyWebs' },
] as const;

const initialized = new WeakSet<object>();

/**
 * Idempotent. Appelé au démarrage du serveur et par chaque service AYWEBs, de
 * sorte qu'un test ou un job isolé trouve le même schéma.
 */
/**
 * Miroir du Store Registry (§7) dans `ayweb_stores`.
 *
 * La source de vérité reste le registre partagé en code : rien ici n'invente une
 * boutique. Le miroir existe pour l'intégrité référentielle — une demande de
 * boutique promue (`ayweb_store_requests.promoted_store_id`) doit pointer vers
 * une ligne réelle — et pour que l'Admin puisse interroger les boutiques en SQL.
 * L'opération est idempotente : relancer ne duplique ni ne réinitialise rien.
 */
export function syncAyWebsStoreRegistry(db: QatafoDatabase): { stores: number; capabilities: number; domains: number } {
  const now = new Date().toISOString();
  let capabilities = 0;
  let domains = 0;
  /* La boutique EXTERNE est miroitée elle aussi : un produit capturé hors
     registre porte `store_id='generic'` et `findAyWebsStore` le résout. Le
     miroir SQL doit contenir les mêmes identifiants que le code, sinon la ligne
     référence une boutique absente. Elle n'apporte aucun domaine (par
     construction) et n'entre PAS dans le compte des boutiques du registre. */
  const mirrored: readonly AyWebsStoreDefinition[] = [...AYWEBS_STORES, AYWEBS_EXTERNAL_STORE];
  for (const [index, store] of Array.from(mirrored.entries()) as Array<[number, AyWebsStoreDefinition]>) {
    db.run(
      `INSERT INTO ayweb_stores (id,name,display_name,domain,country,currency,logo,status,integration_type,home_url,search_url_template,browser_mode,popular,sort_order,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, display_name=excluded.display_name, domain=excluded.domain,
         country=excluded.country, currency=excluded.currency, logo=excluded.logo,
         status=excluded.status, integration_type=excluded.integration_type,
         home_url=excluded.home_url, search_url_template=excluded.search_url_template,
         browser_mode=excluded.browser_mode, popular=excluded.popular,
         sort_order=excluded.sort_order, updated_at=excluded.updated_at`,
      store.id, store.name, store.displayName, store.domains[0] || '', store.country, store.currency,
      store.logo, store.enabled ? store.status : 'disabled', store.integrationType, store.homeUrl,
      store.searchUrlTemplate, store.browserMode, store.popular ? 1 : 0, (index + 1) * 10, now, now,
    );
    for (const capability of store.capabilities) {
      db.run(
        `INSERT INTO ayweb_store_capabilities (store_id,capability,granted,updated_at) VALUES (?,?,1,?)
         ON CONFLICT(store_id,capability) DO UPDATE SET granted=1, updated_at=excluded.updated_at`,
        store.id, capability, now,
      );
      capabilities += 1;
    }
    for (const domain of store.domains) {
      db.run(`INSERT OR IGNORE INTO ayweb_store_domains (store_id,domain) VALUES (?,?)`, store.id, domain);
      domains += 1;
    }
  }
  return { stores: AYWEBS_STORES.length, capabilities, domains };
}

export function ensureAyWebsSchema(db: QatafoDatabase): void {
  if (initialized.has(db)) {
    const bridgeLinksTable = db.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='ayweb_cart_ayrovi_links'`,
    );
    if (bridgeLinksTable) return;
  }
  db.runSchema(AYWEBS_SCHEMA_SQL);
  // This durable mapping is a checkout safety boundary. `runSchema` is best-effort
  // for legacy migrations, so explicitly backfill it even if an earlier bootstrap
  // marked this DB initialized before the table was introduced.
  db.run(`CREATE TABLE IF NOT EXISTS ayweb_cart_ayrovi_links (
    aywebs_item_id TEXT PRIMARY KEY NOT NULL,
    ayrovi_cart_item_id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL DEFAULT '',
    account_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ayweb_cart_ayrovi_link_session
    ON ayweb_cart_ayrovi_links(session_id, account_id)`);
  try {
    // Additif uniquement (§42) : colonne d'adresse de livraison du client,
    // collectée au checkout (§21) — jamais déduite, jamais inventée.
    const columns = db.all<{ name: string }>("PRAGMA table_info(ayweb_orders)").map((row) => row.name);
    if (!columns.includes('shipping_address')) {
      db.run("ALTER TABLE ayweb_orders ADD COLUMN shipping_address TEXT NOT NULL DEFAULT '{}'");
    }
    // 03/10/2026 — état produit (neuf/occasion) publié par la source.
    const productColumns = db.all<{ name: string }>("PRAGMA table_info(ayweb_products)").map((row) => row.name);
    if (!productColumns.includes('condition')) {
      db.run("ALTER TABLE ayweb_products ADD COLUMN condition TEXT NOT NULL DEFAULT ''");
    }
    if (!productColumns.includes('price_verified')) {
      db.run('ALTER TABLE ayweb_products ADD COLUMN price_verified INTEGER NOT NULL DEFAULT 0');
    }
    if (!productColumns.includes('currency_verified')) {
      db.run('ALTER TABLE ayweb_products ADD COLUMN currency_verified INTEGER NOT NULL DEFAULT 0');
    }
    // Phase 2.5 — champs étendus (code-barres, référence, vendeur, note, avis).
    // Additif et idempotent : une base déjà en service garde ses lignes, les
    // nouvelles colonnes valent '' ou 0 (⇒ « non publié », jamais un faux fait).
    for (const [column, definition] of [
      ['gtin', "TEXT NOT NULL DEFAULT ''"],
      ['sku', "TEXT NOT NULL DEFAULT ''"],
      ['seller', "TEXT NOT NULL DEFAULT ''"],
      ['rating', 'REAL NOT NULL DEFAULT 0'],
      ['review_count', 'INTEGER NOT NULL DEFAULT 0'],
    ] as Array<[string, string]>) {
      if (!productColumns.includes(column)) {
        db.run(`ALTER TABLE ayweb_products ADD COLUMN ${column} ${definition}`);
      }
    }
  } catch (error) {
    console.error('[AyWebs] shipping_address migration failed:', error instanceof Error ? error.message : error);
  }
  try {
    syncAyWebsStoreRegistry(db);
  } catch (error) {
    console.error('[AyWebs] store registry mirror failed:', error instanceof Error ? error.message : error);
  }
  try {
    // Les séquences vivent dans le moteur ERP existant : on n'ajoute que nos clés.
    const now = new Date().toISOString();
    for (const sequence of AYWEBS_SEQUENCES) {
      db.run(
        `INSERT OR IGNORE INTO erp_sequences (sequence_key,prefix,year_scoped,next_value,padding,description,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        sequence.key, sequence.prefix, sequence.yearScoped, 1, sequence.padding, sequence.description, now, now,
      );
    }
  } catch (error) {
    console.error('[AyWebs] sequence bootstrap failed:', error instanceof Error ? error.message : error);
  }
  try {
    // Permissions comme données sur le moteur ERP (§31) — jamais un second RBAC.
    seedAyWebsPermissions(db);
  } catch (error) {
    console.warn('[AyWebs] permission seed skipped:', error instanceof Error ? error.message : error);
  }
  initialized.add(db);
}

export function ayWebsSchemaReady(db: QatafoDatabase): boolean {
  ensureAyWebsSchema(db);
  const rows = db.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ayweb_%'`,
  );
  return rows.length >= 15;
}
