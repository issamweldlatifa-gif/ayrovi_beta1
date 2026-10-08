/**
 * كتالوج المتجر — منتوجات، وصولات، ماركات (Q1، 08/10/2026).
 *
 * لماذا هذا الملف موجود أصلاً (دروس خطة أولى فاشلة): الخطة الأولى بُنيت على
 * «كل مسار API = شاشة»، فغطّت السباكة وتركت المنتوج. الخادم كان يعرض
 * `/api/public/products` من الأول — التطبيق ببساطة ما قراهوش.
 *
 * القاعدة هنا: **الحقول تُقرأ بتحفّظ**. حقل ناقص أو مغلوط ⇒ قيمة محايدة
 * (`''` / `0` / قائمة فارغة)، ولا استثناء يطيّح الشاشة كلها. والسعر المعروض
 * هو **سعر الخادم** (`finalPrice`) وحده: التطبيق ما يحسبش ديناراً واحداً.
 */
import { apiGet } from './client';
import type { RequestOptions } from './client';

/** سطر منتوج كما يقدّمه الخادم (`GET /api/public/products`). */
export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  image: string;
  additionalImages: string[];
  brandId: string;
  brandName: string;
  category: string;
  sourceUrl: string;
  sourcePlatform: string;
  originalPrice: number;
  currency: string;
  convertedPrice: number;
  customsFee: number;
  shippingFee: number;
  serviceFee: number;
  /** السعر النهائي بالدينار — **الخادم** هو من يحسبو. */
  finalPrice: number;
  expressAvailable: boolean;
  stockStatus: string;
  arrivalIds: string[];
}

/** وصولة (arrivage) كما يقدّمها `GET /api/public/arrivals`. */
export interface CatalogArrival {
  id: string;
  name: string;
  type: string;
  departureAt: string;
  expectedArrivalAt: string;
  endsAt: string | null;
  description: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

function parseProduct(payload: unknown): CatalogProduct | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    name: text(row.name),
    description: text(row.description),
    image: text(row.image),
    additionalImages: list(row.additionalImages),
    brandId: text(row.brandId),
    brandName: text(row.brandName),
    category: text(row.category),
    sourceUrl: text(row.sourceUrl),
    sourcePlatform: text(row.sourcePlatform),
    originalPrice: num(row.originalPrice),
    currency: text(row.currency) || 'TND',
    convertedPrice: num(row.convertedPrice),
    customsFee: num(row.customsFee),
    shippingFee: num(row.shippingFee),
    serviceFee: num(row.serviceFee),
    finalPrice: num(row.finalPrice),
    expressAvailable: row.expressAvailable === true,
    stockStatus: text(row.stockStatus),
    arrivalIds: list(row.arrivalIds),
  };
}

function parseArrival(payload: unknown): CatalogArrival | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    name: text(row.name),
    type: text(row.type),
    departureAt: text(row.departureAt),
    expectedArrivalAt: text(row.expectedArrivalAt),
    endsAt: typeof row.endsAt === 'string' ? row.endsAt : null,
    description: text(row.description),
  };
}

/** منتوجات المتجر. `arrivalId` يفلتر على وصولة بعينها. */
export async function fetchCatalogProducts(
  options: { limit?: number; arrivalId?: string } & RequestOptions = {},
): Promise<CatalogProduct[]> {
  const { limit, arrivalId, ...request } = options;
  const query = new URLSearchParams();
  if (limit) query.set('limit', String(limit));
  if (arrivalId) query.set('arrivalId', arrivalId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const { data } = await apiGet<unknown>(`/api/public/products${suffix}`, request);
  if (!Array.isArray(data)) return [];
  return data.map(parseProduct).filter((product): product is CatalogProduct => product !== null);
}

/** الوصولات (arrivage) — النشطة والمبرمجة. */
export async function fetchCatalogArrivals(options?: RequestOptions): Promise<CatalogArrival[]> {
  const { data } = await apiGet<unknown>('/api/public/arrivals', options);
  if (!Array.isArray(data)) return [];
  return data.map(parseArrival).filter((arrival): arrival is CatalogArrival => arrival !== null);
}

/** الماركات الشريكة. */
export async function fetchCatalogBrands(options?: RequestOptions): Promise<string[]> {
  const { data } = await apiGet<unknown>('/api/public/brands', options);
  if (!Array.isArray(data)) return [];
  return data.map((entry) => text((entry as Record<string, unknown>)?.name)).filter(Boolean);
}
