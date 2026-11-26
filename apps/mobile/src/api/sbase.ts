/**
 * S Base — عميل الـAPI (SandBase عبر خادمنا).
 *
 * التطبيق ما يعرفش المفتاح ولا `api.sandbase.ai`: كل شيء يمرّ من `/api/sbase/*`.
 *
 * عقد البحث: **شريط واحد، مجموعات منفصلة**. كل متجر يرجّع مجموعتو بزمنها
 * وخطئها وكاشها؛ الفلتر في الشاشة يخفي/يظهر المجموعات، وما فماش دمج نتائج.
 */
import { apiGetData, apiSendData, type RequestOptions } from './client';
import { apiUploadFileData } from './nativeUpload';

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
  /** مقترح في البحث الافتراضي (المتاجر الموجّهة للحريف). */
  defaultEnabled: boolean;
  configured: boolean;
}

export interface SbaseImageChannel {
  id: string;
  label: string;
  vendor: string;
  supports: SbaseSupports;
  storeFromResults: boolean;
  configured: boolean;
}

export interface SbaseSourcesPayload {
  provider: string;
  configured: boolean;
  sources: SbaseSource[];
  image: SbaseImageChannel;
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

export interface SbaseGroup {
  source: { id: string; label: string; vendor: string; supports: SbaseSupports };
  status: 'ok' | 'empty' | 'error';
  items: SbaseItem[];
  count: number;
  durationMs: number;
  cached: boolean;
  async: boolean;
  error: { code: string; message: string } | null;
  costUsd: number | null;
}

export interface SbaseSearchPayload {
  query: string;
  /** أبطأ متجر، موش مجموع الأزمنة. */
  totalMs: number;
  groups: SbaseGroup[];
  count: number;
  missingFields: string[];
  fetchedAt: string;
}

export interface SbaseImagePayload {
  mode: 'image';
  channel: SbaseImageChannel;
  status: 'ok' | 'empty';
  items: SbaseItem[];
  count: number;
  stores: string[];
  missingFields: string[];
  durationMs: number;
  totalMs: number;
  fetchedAt: string;
}

export function fetchSbaseSources(options?: RequestOptions): Promise<SbaseSourcesPayload> {
  return apiGetData<SbaseSourcesPayload>('/api/sbase/sources', options);
}

export async function searchSbase(
  input: { q: string; sources: string[] },
  options?: RequestOptions,
): Promise<SbaseSearchPayload> {
  return apiSendData<SbaseSearchPayload>('POST', '/api/sbase/search', {
    ...options,
    body: { q: input.q, sources: input.sources },
    // N متجر بالتوازي، أبطأهم قد يصل 28 ثانية (polling SandBase).
    timeoutMs: options?.timeoutMs ?? 35_000,
  });
}

/** صورة من المعرض → نتائج بصرية (Google Lens)، عبر خادمنا. */
export function searchSbaseImage(
  file: { uri: string; name: string; type: string },
  options?: RequestOptions,
): Promise<SbaseImagePayload> {
  return apiUploadFileData<SbaseImagePayload>('/api/sbase/image', 'image', file, {
    timeoutMs: options?.timeoutMs ?? 45_000,
    signal: options?.signal,
  });
}
