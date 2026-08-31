import type {
  FieldEvidence,
  NormalizedProductCandidate,
  NormalizedUnitExtraction,
  ProductExtractionStatus,
  RawExtractedProduct,
} from './types';

const PRODUCT_FIELDS = ['productName', 'sku', 'reference', 'variant', 'color', 'quantity'] as const;
type ProductField = typeof PRODUCT_FIELDS[number];

const NULL_MARKERS = new Set([
  '', 'null', 'none', 'unknown', 'n/a', 'na', 'not available', 'unreadable',
  'needs_review', 'needs review', 'inconnu', 'illisible', 'غير معروف',
]);

export const ARRIVAL_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productName: { type: ['string', 'null'] },
          sku: { type: ['string', 'null'] },
          reference: { type: ['string', 'null'] },
          variant: { type: ['string', 'null'] },
          color: { type: ['string', 'null'] },
          quantity: { type: ['integer', 'null'] },
          productImageRef: { type: ['string', 'null'] },
          productImageRegion: {
            type: ['array', 'null'],
            items: { type: 'number' },
          },
          confidence: { type: 'number' },
          fieldEvidence: {
            type: 'object',
            properties: Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, { type: ['string', 'null'] }])),
            required: [...PRODUCT_FIELDS],
            additionalProperties: false,
          },
          sourceSpecific: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                value: { type: 'string' },
                evidence: { type: ['string', 'null'] },
              },
              required: ['key', 'value', 'evidence'],
              additionalProperties: false,
            },
          },
        },
        required: [
          'productName', 'sku', 'reference', 'variant', 'color', 'quantity',
          'productImageRef', 'productImageRegion', 'confidence', 'fieldEvidence', 'sourceSpecific',
        ],
        additionalProperties: false,
      },
    },
    unresolvedEntries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceReference: { type: 'string' },
          reason: { type: 'string' },
          visibleText: { type: ['string', 'null'] },
        },
        required: ['sourceReference', 'reason', 'visibleText'],
        additionalProperties: false,
      },
    },
    expectedProductCount: { type: ['integer', 'null'] },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['products', 'unresolvedEntries', 'expectedProductCount', 'warnings'],
  additionalProperties: false,
};

function cleanNullable(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const marker = cleaned.toLowerCase();
  const compoundUnknown = /^(?:unknown|needs[_ ]review|inconnu|illisible|غير معروف)(?:\s*[\/-]\s*(?:unknown|needs[_ ]review|inconnu|illisible|غير معروف))*$/i.test(marker);
  return NULL_MARKERS.has(marker) || compoundUnknown ? null : cleaned || null;
}

function cleanEvidence(value: unknown): string | null {
  return cleanNullable(value, 500);
}

function confidence(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(Math.min(1, Math.max(0, parsed)) * 1000) / 1000 : 0;
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

function evidenceOf(raw: unknown): FieldEvidence {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    productName: cleanEvidence(value.productName),
    sku: cleanEvidence(value.sku),
    reference: cleanEvidence(value.reference),
    variant: cleanEvidence(value.variant),
    color: cleanEvidence(value.color),
    quantity: cleanEvidence(value.quantity),
  };
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

function normalizeProduct(rawValue: unknown, validAssetIds: ReadonlySet<string>, sourceText: string): NormalizedProductCandidate {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue as Record<string, unknown> : {};
  const fieldEvidence = evidenceOf(raw.fieldEvidence);
  const reasons: string[] = [];
  const values: Record<ProductField, string | number | null> = {
    productName: cleanNullable(raw.productName, 300),
    sku: cleanNullable(raw.sku, 160),
    reference: cleanNullable(raw.reference, 160),
    variant: cleanNullable(raw.variant, 300),
    color: cleanNullable(raw.color, 160),
    quantity: (() => {
      const value = Number(raw.quantity);
      return Number.isInteger(value) && value > 0 && value <= 10_000 ? value : null;
    })(),
  };

  // A non-null canonical value without source evidence is treated as unknown.
  // This is the server-side anti-guessing guard; prompts alone are insufficient.
  for (const field of PRODUCT_FIELDS) {
    if (values[field] != null && !fieldEvidence[field]) {
      values[field] = null;
      reasons.push(`MISSING_EVIDENCE_${field.toUpperCase()}`);
    }
  }
  const foldedSource = foldForEvidence(sourceText);
  if (foldedSource) {
    for (const field of PRODUCT_FIELDS) {
      const value = values[field];
      const foldedValue = foldForEvidence(value);
      if (value != null && foldedValue && !foldedSource.includes(foldedValue)) {
        values[field] = null;
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
    quantity: values.quantity as number | null,
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
      quantity: raw.quantity ?? null,
      productImageRef: raw.productImageRef ?? null,
      productImageRegion: raw.productImageRegion ?? null,
      confidence: raw.confidence ?? null,
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
    const products = (Array.isArray(parsed.products) ? parsed.products : [])
      .slice(0, 500)
      .map((item) => normalizeProduct(item, validAssetIds, sourceText));
    const unresolvedEntries = (Array.isArray(parsed.unresolvedEntries) ? parsed.unresolvedEntries : [])
      .flatMap((item: unknown) => {
        if (!item || typeof item !== 'object') return [];
        const entry = item as Record<string, unknown>;
        const reason = cleanNullable(entry.reason, 500);
        if (!reason) return [];
        return [{
          sourceReference: cleanNullable(entry.sourceReference, 300) || 'unresolved-entry',
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
          reason: 'The source indicates an additional product but no evidence-backed record was returned.',
          visibleText: null,
        });
      }
    }
    return { products, unresolvedEntries, expectedProductCount, warningCodes: [...new Set(warningCodes)] };
  }
}
