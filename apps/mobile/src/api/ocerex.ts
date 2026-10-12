/**
 * OCEREX — عميل الأداة (نفس نقاط الموقع: `client/src/features/ocerex/services/ocerexApi.ts`).
 *
 *  • الصورة تُرسل كما هي، والخادم يقرأ السعر المرجعي ويحوّله (الجهاز لا يحسب سعراً).
 *  • الرد الذي لا يطابق الشكل ⇒ خطأ `PROCESSING_ERROR`، لا نتيجة مختلقة.
 *  • الرابط يُقبل فقط إذا كان http(s).
 *  • OCEREX تُعرض داخل Lens (زر في شاشة Lens)، وليست تبويباً.
 */
import { apiSend } from './client';
import { ApiError } from './errors';

export const OCEREX_BASE = '/api/ocerex';

export const OCEREX_CODES = [
  'OK', 'NO_PRICE_FOUND', 'LOW_CONFIDENCE', 'NO_REFERENCE_PRICE', 'UNSUPPORTED_SCREEN',
  'INVALID_IMAGE', 'INVALID_URL', 'PROCESSING_ERROR', 'CURRENCY_UNCONFIRMED', 'RESTRICTED',
  'EXTRACTION_EXPIRED', 'SESSION_REQUIRED',
] as const;
export type OcerexCode = (typeof OCEREX_CODES)[number];

export interface OcerexExtraction {
  extractionId: string;
  type: string;
  referencePrice: number | null;
  referenceTnd: number | null;
  currency: string | null;
  confidence: number;
  confidenceLevel: string;
  priceContext: string | null;
  productTitle: string | null;
  platform: string | null;
  sourceUrl: string | null;
  code: OcerexCode;
  ayroviPrice: number | null;
  supportedCurrencies: string[];
  resolved: { title: string; platform: string; url: string; imageUrl: string } | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const isCode = (value: unknown): value is OcerexCode => typeof value === 'string' && (OCEREX_CODES as readonly string[]).includes(value);

export function parseExtraction(value: unknown): OcerexExtraction {
  if (!isRecord(value)) throw new ApiError('malformed', 'Réponse OCEREX illisible.');
  const extractionId = str(value.extractionId);
  if (!extractionId) throw new ApiError('malformed', 'Réponse OCEREX sans identifiant.');
  const resolvedRaw = isRecord(value.resolved) ? value.resolved : null;
  return {
    extractionId,
    type: str(value.type) ?? 'UNKNOWN',
    referencePrice: num(value.referencePrice),
    referenceTnd: num(value.referenceTnd),
    currency: str(value.currency),
    confidence: num(value.confidence) ?? 0,
    confidenceLevel: str(value.confidenceLevel) ?? 'LOW',
    priceContext: str(value.priceContext),
    productTitle: str(value.productTitle),
    platform: str(value.platform),
    sourceUrl: str(value.sourceUrl),
    code: isCode(value.code) ? value.code : 'PROCESSING_ERROR',
    ayroviPrice: num(value.ayroviPrice),
    supportedCurrencies: Array.isArray(value.supportedCurrencies)
      ? value.supportedCurrencies.filter((item): item is string => typeof item === 'string')
      : [],
    resolved: resolvedRaw && str(resolvedRaw.url)
      ? {
        title: str(resolvedRaw.title) ?? '',
        platform: str(resolvedRaw.platform) ?? '',
        url: str(resolvedRaw.url) ?? '',
        imageUrl: str(resolvedRaw.imageUrl) ?? '',
      }
      : null,
  };
}

/** كود الخطأ من الخادم إن كان معروفاً، وإلا `PROCESSING_ERROR`. */
export function ocerexErrorCode(error: unknown): OcerexCode {
  if (error instanceof ApiError && isCode(error.code)) return error.code;
  return 'PROCESSING_ERROR';
}

export async function analyzeOcerexImage(file: { uri: string; name: string; type: string }, capture: boolean): Promise<OcerexExtraction> {
  const form = new FormData();
  form.append('image', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  form.append('capture', capture ? '1' : '0');
  const { data } = await apiSend<unknown>('POST', `${OCEREX_BASE}/analyze`, { form });
  return parseExtraction(data);
}

export async function calculateOcerexPrice(extractionId: string, currency?: string): Promise<OcerexExtraction> {
  const { data } = await apiSend<unknown>('POST', `${OCEREX_BASE}/calculate`, {
    body: currency ? { extractionId, currency } : { extractionId },
  });
  return parseExtraction(data);
}

export async function resolveOcerexLink(extractionId: string, url: string): Promise<OcerexExtraction> {
  const { data } = await apiSend<unknown>('POST', `${OCEREX_BASE}/resolve`, { body: { extractionId, url } });
  return parseExtraction(data);
}

export async function commitOcerexOrder(extractionId: string): Promise<OcerexExtraction> {
  const { data } = await apiSend<unknown>('POST', `${OCEREX_BASE}/commit`, { body: { extractionId } });
  return parseExtraction(data);
}
