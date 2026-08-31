/**
 * AI Extraction Schema — Arrival CRM ingestion.
 *
 * This is the ONLY JSON Schema sent to Anthropic for arrival extraction.
 * It is intentionally a *fixed*, union-free schema:
 *
 *  - No `anyOf` / `oneOf`.
 *  - No `type: ["x", "null"]` (no nullable unions).
 *  - Every field is present in `required` so the model always emits it.
 *
 * "Missing / unknown / unreadable" is expressed with a stable sentinel value,
 * NOT with a union type:
 *  - text fields  -> "" (empty string)
 *  - numbers      -> 0
 *  - arrays       -> [] (empty array)
 *
 * The distinction between "absent in source" and "present but empty" is
 * recovered afterwards in the normalization layer (productExtractionNormalizer)
 * which converts sentinels back to `null` on the application model and records
 * the field in `unresolvedFields` / review reasons. The AI never needs a union
 * to express uncertainty, so Anthropic never sees one.
 *
 * Flow:  AI output (this schema) -> Normalization -> Application Model
 * The database/application model is NEVER sent to the provider.
 */

const REQUIRED_TEXT = { type: 'string' } as const;

/**
 * Order / shipment envelope. Every value is a plain string; the normalizer
 * parses quantity-like / date-like / enum-like values and nulls unknowns.
 * customerEmail + customerPhone together act as the "customer identifiers".
 */
const ORDER_META_SCHEMA = {
  type: 'object',
  properties: {
    customerName: REQUIRED_TEXT,
    customerEmail: REQUIRED_TEXT,
    customerPhone: REQUIRED_TEXT,
    supplier: REQUIRED_TEXT,
    store: REQUIRED_TEXT,
    orderId: REQUIRED_TEXT,
    trackingNumber: REQUIRED_TEXT,
    orderDate: REQUIRED_TEXT,
    shipmentStatus: REQUIRED_TEXT,
    currency: REQUIRED_TEXT,
  },
  required: [
    'customerName', 'customerEmail', 'customerPhone',
    'supplier', 'store', 'orderId', 'trackingNumber',
    'orderDate', 'shipmentStatus', 'currency',
  ],
  additionalProperties: false,
} as const;

const PRODUCT_SCHEMA = {
  type: 'object',
  properties: {
    productName: REQUIRED_TEXT,
    sku: REQUIRED_TEXT,
    reference: REQUIRED_TEXT,
    variant: REQUIRED_TEXT,
    color: REQUIRED_TEXT,
    size: REQUIRED_TEXT,
    quantity: { type: 'integer' },
    unitPrice: { type: 'number' },
    currency: REQUIRED_TEXT,
    productUrl: REQUIRED_TEXT,
    productImageRef: REQUIRED_TEXT,
    // Normalized [x,y,width,height] in 0..1. Empty array => no reliable region.
    productImageRegion: { type: 'array', items: { type: 'number' } },
    confidence: { type: 'number' },
    // Names of the canonical product fields whose value is directly visible
    // in the source (anti-guessing evidence). Empty array => no evidence.
    evidenceFieldNames: { type: 'array', items: { type: 'string' } },
    // Free-form, store-specific facts that do not map to a canonical field.
    sourceSpecific: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: REQUIRED_TEXT,
          value: REQUIRED_TEXT,
          evidence: REQUIRED_TEXT,
        },
        required: ['key', 'value', 'evidence'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'productName', 'sku', 'reference', 'variant', 'color', 'size',
    'quantity', 'unitPrice', 'currency', 'productUrl',
    'productImageRef', 'productImageRegion', 'confidence',
    'evidenceFieldNames', 'sourceSpecific',
  ],
  additionalProperties: false,
} as const;

const UNRESOLVED_ENTRY_SCHEMA = {
  type: 'object',
  properties: {
    sourceReference: REQUIRED_TEXT,
    field: REQUIRED_TEXT,
    reason: REQUIRED_TEXT,
    visibleText: REQUIRED_TEXT,
  },
  required: ['sourceReference', 'field', 'reason', 'visibleText'],
  additionalProperties: false,
} as const;

/**
 * Canonical, provider-facing extraction schema. Zero union-typed parameters.
 */
export const ARRIVAL_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    orderMeta: ORDER_META_SCHEMA,
    products: { type: 'array', items: PRODUCT_SCHEMA },
    unresolvedEntries: { type: 'array', items: UNRESOLVED_ENTRY_SCHEMA },
    expectedProductCount: { type: 'integer' },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['orderMeta', 'products', 'unresolvedEntries', 'expectedProductCount', 'warnings'],
  additionalProperties: false,
};

/** Product-level canonical fields the model is allowed to mark as evidenced. */
export const PRODUCT_EVIDENCE_FIELDS = [
  'productName', 'sku', 'reference', 'variant', 'color', 'size',
  'quantity', 'unitPrice', 'currency', 'productUrl',
] as const;
