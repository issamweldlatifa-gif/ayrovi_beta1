import type { AiContentPart, AiResponsesProviderAdapter } from '../ai-core/contracts';

export type ArrivalStatus = 'DRAFT' | 'PROCESSING' | 'REVIEW' | 'CONFIRMED';
export type ArrivalSourceType = 'PDF' | 'EMAIL' | 'IMAGE' | 'INVOICE';
export type ExtractionJobState = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
export type ProductExtractionStatus = 'EXTRACTED' | 'NEEDS_REVIEW' | 'FAILED';

export interface StoreProfile {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sourceType: ArrivalSourceType;
  strategyKey: string;
  extractionHints: string[];
}

export interface ArrivalClientStoreRecord {
  id: string;
  arrivalClientId: string;
  storeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArrivalSourceRecord {
  id: string;
  arrivalClientId: string;
  arrivalClientStoreId: string;
  sourceType: ArrivalSourceType;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  sourceHash: string;
  storageKey: string;
  createdAt: string;
}

export interface SourceAsset {
  id: string;
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  label: string;
  wholeImageAllowed: boolean;
}

export interface ExtractionUnit {
  reference: string;
  ordinal: number;
  text: string;
  assets: SourceAsset[];
  preparationError?: string;
}

export interface ExtractionSourcePlan {
  totalUnits: number;
  warningCodes: string[];
  units(): AsyncGenerator<ExtractionUnit>;
}

export interface FieldEvidence {
  productName: string | null;
  sku: string | null;
  reference: string | null;
  variant: string | null;
  color: string | null;
  size: string | null;
  quantity: string | null;
}

/**
 * Order / shipment envelope extracted from the source unit. All fields are
 * normalized: `null` means "not present / not legible in this unit". This is
 * the operational header used by Customer Identity Resolution and aggregation;
 * it is separate from the per-product line items.
 */
export interface NormalizedOrderMeta {
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  supplier: string | null;
  store: string | null;
  orderId: string | null;
  trackingNumber: string | null;
  orderDate: string | null;
  shipmentStatus: string | null;
  currency: string | null;
}

export interface RawExtractedProduct {
  productName: unknown;
  sku: unknown;
  reference: unknown;
  variant: unknown;
  color: unknown;
  size: unknown;
  quantity: unknown;
  unitPrice: unknown;
  currency: unknown;
  productUrl: unknown;
  productImageRef: unknown;
  productImageRegion: unknown;
  confidence: unknown;
  evidenceFieldNames: unknown;
  fieldEvidence: unknown;
  sourceSpecific: unknown;
}

export interface NormalizedProductCandidate {
  productName: string | null;
  sku: string | null;
  reference: string | null;
  variant: string | null;
  color: string | null;
  size: string | null;
  quantity: number | null;
  unitPrice: number | null;
  currency: string | null;
  productUrl: string | null;
  extractionConfidence: number;
  extractionStatus: ProductExtractionStatus;
  productImageRef: string | null;
  productImageRegion: [number, number, number, number] | null;
  fieldEvidence: FieldEvidence;
  sourceSpecific: Array<{ key: string; value: string; evidence: string | null }>;
  raw: RawExtractedProduct;
  reviewReasons: string[];
}

export interface UnresolvedExtractionEntry {
  sourceReference: string;
  field: string | null;
  reason: string;
  visibleText: string | null;
}

export interface NormalizedUnitExtraction {
  orderMeta: NormalizedOrderMeta;
  products: NormalizedProductCandidate[];
  unresolvedEntries: UnresolvedExtractionEntry[];
  expectedProductCount: number | null;
  warningCodes: string[];
}

export interface ExtractionRequestContext {
  jobId: string;
  requestedByUserIdHash?: string;
  arrivalId: string;
  arrivalName: string;
  arrivalClientId: string;
  arrivalClientStoreId: string;
  customerId: string;
  customerName: string;
  store: StoreProfile;
  source: ArrivalSourceRecord;
  unit: ExtractionUnit;
}

export interface AIExtractionService {
  extractUnit(context: ExtractionRequestContext, signal?: AbortSignal): Promise<NormalizedUnitExtraction>;
}

export interface ArrivalIngestionDependencies {
  aiAdapter?: AiResponsesProviderAdapter;
  sourceRoot?: string;
  autoRunJobs?: boolean;
}

export interface ExtractionMessageParts {
  instructions: string;
  content: AiContentPart[];
}

export interface ArrivalActor {
  id: string | null;
  name: string;
  ipAddress: string | null;
}
