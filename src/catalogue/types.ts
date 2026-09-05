/**
 * AYROVI Catalogue (P2.1) — shared types, statuses and error codes.
 *
 * ONE canonical product entity: `products` (the table the storefront, the CRM cart,
 * the promotions engine and the AI search already read) stays the product identity.
 * This module extends it additively and owns what was missing — code, slug, variant
 * with a real SKU, category hierarchy, media, controlled attributes — so that Stock,
 * Purchasing, Sales, Shipping and CMS reference catalogue rows instead of inventing
 * their own product tables.
 *
 * `strict: false` in this repo means discriminated unions do not narrow reliably, so
 * every result here is a flat shape: `{ ok }` plus either `value` or `code/message`.
 */

/** The vocabulary already enforced by `products.status` in the base schema. */
export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Categories and brands are published or retired, never versioned (P2.1). */
export const CATALOGUE_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type CatalogueStatus = (typeof CATALOGUE_STATUSES)[number];

export const VARIANT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

export const MEDIA_TYPES = ['IMAGE', 'VIDEO', 'DOCUMENT'] as const;
export type CatalogueMediaType = (typeof MEDIA_TYPES)[number];

export const ATTRIBUTE_TARGETS = ['product', 'variant'] as const;
export type CatalogueAttributeTarget = (typeof ATTRIBUTE_TARGETS)[number];

export const ATTRIBUTE_DATA_TYPES = ['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT'] as const;
export type CatalogueAttributeDataType = (typeof ATTRIBUTE_DATA_TYPES)[number];

/** Permission surface — module `catalog`, actions of the ERP engine. */
export const CATALOGUE_MODULE_KEY = 'catalog';
export const CATALOGUE_ACTIONS = ['read', 'create', 'update', 'delete', 'approve'] as const;
export type CatalogueAction = (typeof CATALOGUE_ACTIONS)[number];

/** Resource types distinguishable in grants, audit and events. */
export const CATALOGUE_RESOURCES = ['product', 'variant', 'category', 'brand', 'product_media', 'product_attribute'] as const;
export type CatalogueResource = (typeof CATALOGUE_RESOURCES)[number];

/** Audit `module` values (upper-case, like every existing audit row). */
export const CATALOGUE_AUDIT_MODULES = {
  product: 'CATALOGUE_PRODUCTS',
  variant: 'CATALOGUE_VARIANTS',
  category: 'CATALOGUE_CATEGORIES',
  brand: 'CATALOGUE_BRANDS',
  product_media: 'CATALOGUE_MEDIA',
  product_attribute: 'CATALOGUE_ATTRIBUTES',
} as const;

/** Controlled API errors. Every one of them is a client-visible `code`. */
export const CATALOGUE_ERRORS = {
  VALIDATION: 'CATALOGUE_VALIDATION',
  NAME_REQUIRED: 'CATALOGUE_NAME_REQUIRED',
  STATUS_INVALID: 'CATALOGUE_STATUS_INVALID',
  SKU_REQUIRED: 'CATALOGUE_SKU_REQUIRED',
  SKU_TAKEN: 'CATALOGUE_SKU_TAKEN',
  SLUG_TAKEN: 'CATALOGUE_SLUG_TAKEN',
  SLUG_INVALID: 'CATALOGUE_SLUG_INVALID',
  CODE_TAKEN: 'CATALOGUE_CODE_TAKEN',
  NOT_FOUND: 'CATALOGUE_NOT_FOUND',
  BRAND_NOT_FOUND: 'CATALOGUE_BRAND_NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATALOGUE_CATEGORY_NOT_FOUND',
  PRODUCT_NOT_FOUND: 'CATALOGUE_PRODUCT_NOT_FOUND',
  PARENT_INVALID: 'CATALOGUE_PARENT_INVALID',
  PARENT_CYCLE: 'CATALOGUE_PARENT_CYCLE',
  DEPTH_EXCEEDED: 'CATALOGUE_DEPTH_EXCEEDED',
  VARIANT_MISMATCH: 'CATALOGUE_VARIANT_MISMATCH',
  MEDIA_URL_INVALID: 'CATALOGUE_MEDIA_URL_INVALID',
  MEDIA_PRIVATE_PATH: 'CATALOGUE_MEDIA_PRIVATE_PATH',
  ATTRIBUTE_UNKNOWN: 'CATALOGUE_ATTRIBUTE_UNKNOWN',
  ATTRIBUTE_TYPE_MISMATCH: 'CATALOGUE_ATTRIBUTE_TYPE_MISMATCH',
  ID_MALFORMED: 'CATALOGUE_ID_MALFORMED',
  PERMISSION_DENIED: 'CATALOGUE_PERMISSION_DENIED',
  CONFLICT: 'CATALOGUE_CONFLICT',
} as const;

export interface CatalogueFailure {
  ok: false;
  code: string;
  message: string;
  /** Per-field details, safe to expose (never contains secrets). */
  details?: Array<{ field: string; reason: string }>;
}

export interface CatalogueSuccess<T> {
  ok: true;
  value: T;
}

export type CatalogueResult<T> = CatalogueSuccess<T> | CatalogueFailure;

export interface CatalogueProductInput {
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  brand_id?: unknown;
  category_id?: unknown;
  status?: unknown;
  product_type?: unknown;
  image?: unknown;
  additional_images?: unknown;
  source_url?: unknown;
  source_platform?: unknown;
  original_price?: unknown;
  currency?: unknown;
  stock_status?: unknown;
  express_available?: unknown;
  attributes?: unknown;
}

export interface CatalogueProductRow {
  id: string;
  name: string;
  slug: string | null;
  product_code: string | null;
  description: string | null;
  image: string | null;
  brand_id: string | null;
  brand_name: string | null;
  category: string | null;
  category_id: string | null;
  status: string;
  source_platform: string;
  final_price: number | null;
  original_price: number | null;
  currency: string | null;
  stock_status: string | null;
  express_available: number | null;
  product_type: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CatalogueVariantInput {
  sku?: unknown;
  barcode?: unknown;
  size?: unknown;
  color?: unknown;
  status?: unknown;
  position?: unknown;
  attributes?: unknown;
}

export interface CatalogueCategoryInput {
  name?: unknown;
  slug?: unknown;
  parent_id?: unknown;
  status?: unknown;
  sort_order?: unknown;
  description?: unknown;
}

export interface CatalogueBrandInput {
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  logo?: unknown;
  image?: unknown;
  category?: unknown;
  url?: unknown;
  display_order?: unknown;
  status?: unknown;
}

export interface CatalogueMediaInput {
  variant_id?: unknown;
  media_type?: unknown;
  url?: unknown;
  sort_order?: unknown;
  alt_text?: unknown;
  is_primary?: unknown;
}

export interface CatalogueAttributeInput {
  attribute_key?: unknown;
  label?: unknown;
  data_type?: unknown;
  target?: unknown;
  sort_order?: unknown;
  options?: unknown;
  status?: unknown;
}

/** Max category depth actually walked. Data, not architecture: nothing is hard-coded. */
export const MAX_CATEGORY_DEPTH = 12;

/** Shape of a row returned to the back office for one category, tree-aware. */
export interface CatalogueCategoryNode {
  id: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
  status: string;
  sort_order: number;
  depth: number;
  product_count: number;
  children?: CatalogueCategoryNode[];
}
