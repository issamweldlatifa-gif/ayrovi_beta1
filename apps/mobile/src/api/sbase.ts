/**
 * S Base — عميل الـAPI (SandBase عبر خادمنا).
 *
 * التطبيق ما يعرفش المفتاح ولا `api.sandbase.ai`: كل شيء يمرّ من `/api/sbase/*`.
 * النتائج **كما جاوب الخادم** — ما فماش لا تقدير سعر، لا تحويل عملة، لا نتائج
 * تجريبية. الحقول الناقصة تجي معلَّمة في `missing` باش الشاشة تقول الحقيقة.
 */
import { apiGetData, apiSendData, type RequestOptions } from './client';

export interface SbaseSupports {
  keyword: boolean;
  url: boolean;
  image: boolean;
  details: boolean;
  price: boolean;
  variants: boolean;
  barcode: boolean;
}

export interface SbaseMarket {
  code: string;
  label: string;
}

export interface SbaseSource {
  id: string;
  label: string;
  vendor: string;
  supports: SbaseSupports;
  fields: string[];
  markets: SbaseMarket[];
  defaultMarket: string | null;
  costUsd: number | null;
  async: boolean;
  configured: boolean;
}

export interface SbaseSourcesPayload {
  provider: string;
  configured: boolean;
  sources: SbaseSource[];
}

export interface SbaseItem {
  id: string | null;
  title: string;
  url: string | null;
  image: string | null;
  priceText: string | null;
  amount: number | null;
  currency: string | null;
  store: string | null;
  rating: number | null;
  reviews: number | null;
  shipping: string | null;
  condition: string | null;
  missing: string[];
}

export interface SbaseSearchPayload {
  source: { id: string; label: string; vendor: string; supports: SbaseSupports };
  query: string;
  market: string | null;
  status: 'ok' | 'empty';
  items: SbaseItem[];
  count: number;
  missingFields: string[];
  /** زمن النداء الحقيقي عند SandBase (ms), polling inclus. */
  durationMs: number;
  cached: boolean;
  async: boolean;
  polls: number;
  runId: string | null;
  costUsd: number | null;
  fetchedAt: string;
}

export function fetchSbaseSources(options?: RequestOptions): Promise<SbaseSourcesPayload> {
  return apiGetData<SbaseSourcesPayload>('/api/sbase/sources', options);
}

export async function searchSbase(
  input: { source: string; q: string; market?: string | null },
  options?: RequestOptions,
): Promise<SbaseSearchPayload> {
  return apiSendData<SbaseSearchPayload>('POST', '/api/sbase/search', {
    ...options,
    body: { source: input.source, q: input.q, market: input.market ?? null },
    // SandBase قد تصل 28 ثانية؛ مهلة التطبيق لازم تكون أوسع.
    timeoutMs: options?.timeoutMs ?? 35_000,
  });
}
