import type {
  FieldEvidence,
  NormalizedOrderMeta,
  NormalizedProductCandidate,
  NormalizedUnitExtraction,
  ProductExtractionStatus,
  RawExtractedProduct,
} from './types';

// Re-export the provider-facing schema so existing imports keep working.
export { ARRIVAL_EXTRACTION_SCHEMA, PRODUCT_EVIDENCE_FIELDS } from './arrivalExtractionSchema';

/**
 * Canonical text fields that (a) appear on the product record and (b) must be
 * evidence-backed. Numeric fields (quantity/unitPrice) are handled separately.
 */
const TEXT_PRODUCT_FIELDS = ['productName', 'sku', 'reference', 'variant', 'color', 'size'] as const;
type TextProductField = typeof TEXT_PRODUCT_FIELDS[number];
/** Fields the anti-guessing guard nulls when the model did not cite evidence. */
const EVIDENCE_FIELDS = [
  'productName', 'sku', 'reference', 'variant', 'color', 'size', 'quantity',
  'unitPrice', 'currency', 'productUrl',
] as const;
type EvidenceField = typeof EVIDENCE_FIELDS[number];

const NULL_MARKERS = new Set([
  '', 'null', 'none', 'unknown', 'n/a', 'na', 'not available', 'unreadable',
  'needs_review', 'needs review', 'inconnu', 'illisible', 'غير معروف',
]);

/**
 * Normalize an AI-provided string. The provider schema only allows plain
 * `string`; the model expresses "unknown" with an empty string or a textual
 * marker (e.g. "unknown"). Both are collapsed to `null` here so the
 * application model keeps the null/value distinction without needing a union.
 */
function cleanNullable(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const marker = cleaned.toLowerCase();
  const compoundUnknown = /^(?:unknown|needs[_ ]review|inconnu|illisible|غير معروف)(?:\s*[/-]\s*(?:unknown|needs[_ ]review|inconnu|illisible|غير معروف))*$/i.test(marker);
  return NULL_MARKERS.has(marker) || compoundUnknown ? null : cleaned || null;
}

function cleanEvidence(value: unknown): string | null {
  return cleanNullable(value, 500);
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function confidence(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(Math.min(1, Math.max(0, parsed)) * 1000) / 1000 : 0;
}

/** Price sentinel: schema uses `number`; 0 (or non-finite) means "not known". */
function price(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function imageRegion(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const numbers = value.map(Number);
  if (numbers.some((item) => !Number.isFinite(item))) return null;
  const [rawX, rawY, rawWidth, rawHeight] = numbers;
  const x = Math.min(1, Math.max(0, rawX));
  const y = Math.min(1, Math.max(0, rawY));
  const width = Math.min(1 - x, Math.max(0, rawWidth));
  const height = Math.min(1 - y, Math.max(0, rawHeight));
  return width >= 0.02 && height >= 0.02 ? [x, y, width, height] : null;
}

function normalizeOrderMeta(raw: unknown): NormalizedOrderMeta {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    customerName: cleanNullable(value.customerName, 160),
    customerEmail: cleanNullable(value.customerEmail, 200),
    customerPhone: cleanNullable(value.customerPhone, 40),
    supplier: cleanNullable(value.supplier, 160),
    store: cleanNullable(value.store, 160),
    orderId: cleanNullable(value.orderId, 160),
    trackingNumber: cleanNullable(value.trackingNumber, 160),
    orderDate: cleanNullable(value.orderDate, 60),
    shipmentStatus: cleanNullable(value.shipmentStatus, 80),
    currency: cleanNullable(value.currency, 8) ? cleanText(value.currency, 8).toUpperCase() : null,
  };
}

/**
 * Derive the per-field evidence record from the model's `evidenceFieldNames`
 * array. The union-free schema cannot attach evidence per field as nullable
 * strings, so the model lists the fields it actually saw; we expand that into
 * the existing FieldEvidence shape (value = the canonical value, used by the
 * anti-guessing guard and surfaced for review).
 */
function evidenceOf(raw: unknown, values: Partial<Record<EvidenceField, unknown>>): FieldEvidence {
  const list = Array.isArray(raw) ? raw.map((item) => String(item)) : [];
  const evidenced = new Set(list.map((item) => item.trim()).filter(Boolean));
  const record: FieldEvidence = {
    productName: null,
    sku: null,
    reference: null,
    variant: null,
    color: null,
    size: null,
    quantity: null,
  };
  // The FieldEvidence record covers the editable canonical fields; other
  // evidenced facts (unitPrice/currency/productUrl) are validated in the loop
  // over EVIDENCE_FIELDS but do not need a per-field evidence string.
  for (const field of ['productName', 'sku', 'reference', 'variant', 'color', 'size', 'quantity'] as const) {
    if (evidenced.has(field) && values[field] != null) {
      record[field] = cleanEvidence(String(values[field]));
    }
  }
  return record;
}

function statusFor(
  product: Pick<NormalizedProductCandidate, 'productName' | 'sku' | 'reference' | 'quantity' | 'extractionConfidence'>,
  reasons: string[],
): ProductExtractionStatus {
  if (!product.productName && !product.sku && !product.reference) reasons.push('MISSING_PRODUCT_IDENTITY');
  if (!product.quantity || product.quantity < 1) reasons.push('MISSING_OR_INVALID_QUANTITY');
  if (product.extractionConfidence < 0.7) reasons.push('LOW_CONFIDENCE');
  return reasons.length ? 'NEEDS_REVIEW' : 'EXTRACTED';
}

function foldForEvidence(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeProduct(
  rawValue: unknown,
  validAssetIds: ReadonlySet<string>,
  sourceText: string,
  orderCurrency: string | null,
): NormalizedProductCandidate {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue as Record<string, unknown> : {};

  const values: Record<EvidenceField, string | number | null> = {
    productName: cleanNullable(raw.productName, 300),
    sku: cleanNullable(raw.sku, 160),
    reference: cleanNullable(raw.reference, 160),
    variant: cleanNullable(raw.variant, 300),
    color: cleanNullable(raw.color, 160),
    size: cleanNullable(raw.size, 80),
    quantity: (() => {
      const value = Number(raw.quantity);
      return Number.isInteger(value) && value > 0 && value <= 10_000 ? value : null;
    })(),
    unitPrice: price(raw.unitPrice),
    currency: cleanNullable(raw.currency, 8) ? cleanText(raw.currency, 8).toUpperCase() : orderCurrency,
    productUrl: (() => {
      const url = cleanNullable(raw.productUrl, 500);
      return url && /^https?:\/\//i.test(url) ? url : null;
    })(),
  };

  const fieldEvidence = evidenceOf(raw.evidenceFieldNames, values);
  const reasons: string[] = [];

  // Server-side anti-guessing guard: a canonical value without source evidence
  // is treated as unknown. Prompts alone are insufficient. For the editable
  // fields we consult the FieldEvidence record; unitPrice/currency/productUrl
  // are accepted when the model lists them in evidenceFieldNames.
  const evidencedNames = new Set(
    (Array.isArray(raw.evidenceFieldNames) ? raw.evidenceFieldNames : []).map((item) => String(item).trim()),
  );
  for (const field of TEXT_PRODUCT_FIELDS) {
    if (values[field] != null && !fieldEvidence[field]) {
      (values as Record<string, unknown>)[field] = null;
      reasons.push(`MISSING_EVIDENCE_${field.toUpperCase()}`);
    }
  }
  if (values.quantity != null && !fieldEvidence.quantity) {
    values.quantity = null;
    reasons.push('MISSING_EVIDENCE_QUANTITY');
  }
  for (const extra of ['unitPrice', 'productUrl'] as const) {
    if (values[extra] != null && !evidencedNames.has(extra)) {
      values[extra] = null;
    }
  }
  // Currency is a controlled enumeration, not a guessed fact: when the model
  // emits a product-level currency it must be evidence-backed, but the
  // order-level currency inherited from orderMeta is authoritative and kept.
  if (values.currency != null && !evidencedNames.has('currency') && values.currency !== orderCurrency) {
    values.currency = null;
  }
  const foldedSource = foldForEvidence(sourceText);
  if (foldedSource) {
    for (const field of TEXT_PRODUCT_FIELDS) {
      const value = values[field] as string | null;
      const foldedValue = foldForEvidence(value);
      if (value != null && foldedValue && !foldedSource.includes(foldedValue)) {
        (values as Record<string, unknown>)[field] = null;
        reasons.push(`VALUE_NOT_FOUND_IN_SOURCE_${field.toUpperCase()}`);
      }
    }
  }

  const candidate: NormalizedProductCandidate = {
    productName: values.productName as string | null,
    sku: values.sku as string | null,
    reference: values.reference as string | null,
    variant: values.variant as string | null,
    color: values.color as string | null,
    size: values.size as string | null,
    quantity: values.quantity as number | null,
    unitPrice: values.unitPrice as number | null,
    currency: values.currency as string | null,
    productUrl: values.productUrl as string | null,
    extractionConfidence: confidence(raw.confidence),
    extractionStatus: 'NEEDS_REVIEW',
    productImageRef: (() => {
      const ref = cleanNullable(raw.productImageRef, 160);
      return ref && validAssetIds.has(ref) ? ref : null;
    })(),
    productImageRegion: imageRegion(raw.productImageRegion),
    fieldEvidence,
    sourceSpecific: (Array.isArray(raw.sourceSpecific) ? raw.sourceSpecific : [])
      .flatMap((item: unknown) => {
        if (!item || typeof item !== 'object') return [];
        const entry = item as Record<string, unknown>;
        const key = cleanNullable(entry.key, 100);
        const value = cleanNullable(entry.value, 500);
        if (!key || !value) return [];
        return [{ key, value, evidence: cleanEvidence(entry.evidence) }];
      }).slice(0, 30),
    raw: {
      productName: raw.productName ?? null,
      sku: raw.sku ?? null,
      reference: raw.reference ?? null,
      variant: raw.variant ?? null,
      color: raw.color ?? null,
      size: raw.size ?? null,
      quantity: raw.quantity ?? null,
      unitPrice: raw.unitPrice ?? null,
      currency: raw.currency ?? null,
      productUrl: raw.productUrl ?? null,
      productImageRef: raw.productImageRef ?? null,
      productImageRegion: raw.productImageRegion ?? null,
      confidence: raw.confidence ?? null,
      evidenceFieldNames: raw.evidenceFieldNames ?? null,
      fieldEvidence: raw.fieldEvidence ?? null,
      sourceSpecific: raw.sourceSpecific ?? null,
    } as RawExtractedProduct,
    reviewReasons: reasons,
  };
  candidate.extractionStatus = statusFor(candidate, candidate.reviewReasons);
  return candidate;
}

function parseJson(rawText: string): Record<string, unknown> {
  const cleaned = String(rawText || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('EXTRACTION_RESPONSE_INVALID');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(first, last + 1));
  } catch {
    throw new Error('EXTRACTION_RESPONSE_INVALID');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('EXTRACTION_RESPONSE_INVALID');
  return parsed as Record<string, unknown>;
}

export class ProductExtractionNormalizer {
  parse(rawText: string, validAssetIds: ReadonlySet<string>, sourceText = ''): NormalizedUnitExtraction {
    const parsed = parseJson(rawText);
    const orderMeta = normalizeOrderMeta(parsed.orderMeta);
    const products = (Array.isArray(parsed.products) ? parsed.products : [])
      .slice(0, 500)
      .map((item) => normalizeProduct(item, validAssetIds, sourceText, orderMeta.currency));
    const unresolvedEntries = (Array.isArray(parsed.unresolvedEntries) ? parsed.unresolvedEntries : [])
      .flatMap((item: unknown) => {
        if (!item || typeof item !== 'object') return [];
        const entry = item as Record<string, unknown>;
        const reason = cleanNullable(entry.reason, 500);
        if (!reason) return [];
        return [{
          sourceReference: cleanNullable(entry.sourceReference, 300) || 'unresolved-entry',
          field: cleanNullable(entry.field, 80),
          reason,
          visibleText: cleanNullable(entry.visibleText, 1_000),
        }];
      }).slice(0, 500);
    const expected = Number(parsed.expectedProductCount);
    const expectedProductCount = Number.isInteger(expected) && expected >= 0 && expected <= 10_000 ? expected : null;
    const warningCodes = (Array.isArray(parsed.warnings) ? parsed.warnings : [])
      .map((item) => cleanNullable(item, 160))
      .filter((item): item is string => Boolean(item))
      .slice(0, 100);
    if (expectedProductCount != null && expectedProductCount > products.length + unresolvedEntries.length) {
      warningCodes.push('EXPECTED_COUNT_NOT_FULLY_ACCOUNTED_FOR');
      const missing = Math.min(500 - unresolvedEntries.length, expectedProductCount - products.length - unresolvedEntries.length);
      for (let index = 0; index < missing; index += 1) {
        unresolvedEntries.push({
          sourceReference: `unaccounted-${index + 1}`,
          field: null,
          reason: 'The source indicates an additional product but no evidence-backed record was returned.',
          visibleText: null,
        });
      }
    }
    return { orderMeta, products, unresolvedEntries, expectedProductCount, warningCodes: [...new Set(warningCodes)] };
  }
}
