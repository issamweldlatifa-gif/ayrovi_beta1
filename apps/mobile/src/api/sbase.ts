/**
 * S Base — عميل الـAPI (المزوّد عبر خادمنا).
 *
 * التطبيق ما يعرفش المفتاح ولا نقاط نهاية المزوّد (SandBase ولا Apify):
 * كل شيء يمرّ من `/api/sbase/*`، والخادم هو اللي يقرّر المزوّد (SBASE_PROVIDER).
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
  /** Facturation par résultat (Alibaba) : le libellé de coût le dit. */
  billedPerResult: boolean;
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

/**
 * تقدير السعر بالدينار — **يحسبو الخادم بمحرّك السعر الرسمي** (تحويل + شحن +
 * ديوانة + TVA + خدمة). الواجهة تعرضو كما وصل، ما تعاودش تحسب.
 */
export interface SbasePriceEstimate {
  currency: string;
  amount: number;
  rateTND: number;
  productTND: number;
  freightTND: number;
  dutyTND: number;
  tvaTND: number;
  serviceFeeTND: number;
  localDeliveryTND: number;
  totalTND: number;
  categoryLabel: string;
  categoryStatus: 'ALLOWED' | 'WARNING' | 'RESTRICTED';
  restricted: boolean;
  requiresWeightValidation: boolean;
  pricingVersion: number;
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
  /** Vendeur/entreprise dans la boutique (1688 : société du fournisseur). */
  seller?: string | null;
  /** Quantité minimale de commande (1688/Alibaba : commerce de gros). */
  moq?: string | null;
  rating: number | null;
  reviews: number | null;
  shipping: string | null;
  condition: string | null;
  missing: string[];
  /** Estimation TND calculée par le moteur de prix du serveur (null = non cotée). */
  priceEstimate?: SbasePriceEstimate | null;
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
  billedPerResult: boolean;
}

export interface SbaseVariantValue {
  label: string;
  /** null = la source ne l'a pas dit (on n'écrit ni « en stock » ni « épuisé »). */
  available: boolean | null;
  image: string | null;
}

export interface SbaseVariantGroup {
  name: string;
  values: SbaseVariantValue[];
}

export interface SbaseDetail {
  title: string | null;
  brand: string | null;
  priceText: string | null;
  amount: number | null;
  currency: string | null;
  oldPriceText: string | null;
  rating: number | null;
  reviews: number | null;
  availability: string | null;
  seller: string | null;
  url: string | null;
  images: string[];
  description: string | null;
  specs: { name: string; value: string }[];
  /** « Tailles et couleurs » : un groupe par dimension. */
  variants: SbaseVariantGroup[];
  /** وزن الحزمة كما أعلنه المصدر (kg) — يغذّي الشحن في محرّك السعر؛ غايب = غير معروف. */
  weightKg?: number | null;
  missing: string[];
  /** Estimation TND (moteur de prix) — inclut la livraison locale sur la fiche. */
  priceEstimate?: SbasePriceEstimate | null;
}

export interface SbaseDetailPayload {
  source: { id: string; label: string; vendor: string; supports: SbaseSupports };
  detail: SbaseDetail;
  durationMs: number;
  cached: boolean;
  costUsd: number | null;
  billedPerResult: boolean;
  fetchedAt: string;
}

export interface SbaseSearchPayload {
  query: string;
  /** أبطأ متجر، موش مجموع الأزمنة. */
  totalMs: number;
  groups: SbaseGroup[];
  count: number;
  missingFields: string[];
  /** المزوّد اللي جاوب فعلاً — يُعرض كما هو، بلا تزيين. */
  provider?: string;
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
  /** L'endpoint 1688 réellement appelé + son prix publié. */
  endpoint?: string;
  costUsd?: number;
  /** المزوّد اللي جاوب فعلاً (sandbase | apify). */
  provider?: string;
  /** Fin de vie du lien photo temporaire (10 min). */
  photoExpiresAt?: string;
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
    // N متجر بالتوازي، أبطأهم قد يصل 30 ثانية (run-based عند المزوّد).
    timeoutMs: options?.timeoutMs ?? 35_000,
  });
}

/** صورة من المعرض → نتائج 1688 المتشابهة، عبر خادمنا. */
export function searchSbaseImage(
  file: { uri: string; name: string; type: string },
  options?: RequestOptions,
): Promise<SbaseImagePayload> {
  return apiUploadFileData<SbaseImagePayload>('/api/sbase/image', 'image', file, {
    timeoutMs: options?.timeoutMs ?? 45_000,
    signal: options?.signal,
  });
}

/**
 * تفاصيل منتج واحد. المتاجر اللي ما تنشرش تفاصيل (AliExpress) تردّ
 * `DETAILS_UNSUPPORTED` — والشاشة تفتح الرابط الأصلي بدل ما تعرض صفحة فارغة.
 */
export async function fetchSbaseItem(
  input: { source: string; id?: string | null; title?: string | null; url?: string | null; market?: string | null },
  options?: RequestOptions,
): Promise<SbaseDetailPayload> {
  return apiSendData<SbaseDetailPayload>('POST', '/api/sbase/item', {
    ...options,
    body: {
      source: input.source,
      id: input.id ?? null,
      title: input.title ?? null,
      url: input.url ?? null,
      market: input.market ?? null,
    },
    // قراءة صفحة المنتج عند 1688 موثّقة 15-90 ثانية للمنتج — ننتظرها بصدق.
    timeoutMs: options?.timeoutMs ?? 110_000,
  });
}
