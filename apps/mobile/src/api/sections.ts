/**
 * أقسام الموقع — عروض، ستوريهات، أخبار.
 *
 * لماذا هذا الملف: écrans dédiés (`/promotions`, `/stories`, `/news`) lisent
 * les mêmes endpoints publics. Le contenu reste piloté par l'API, jamais
 * inventé côté client.
 *
 * قاعدة: **حقل ناقص ⇒ قيمة محايدة**، موش استثناء يطيّح الشاشة.
 */
import { apiGet } from './client';
import type { RequestOptions } from './client';

/** عرض تجري كما يقدّمه `GET /api/public/promotions`. */
export interface Promotion {
  id: string;
  name: string;
  description: string;
  image: string;
  /** `PERCENT` وإلا `FIXED` — التطبيق يعرض القيمة، الخادم يحسب الأثر. */
  discountType: string;
  value: number;
  startsAt: string;
  endsAt: string;
  promoCode: string;
  status: string;
  arrivalIds: string[];
  productIds: string[];
}

/** ستوري كما يقدّمه `GET /api/public/stories`. */
export interface StoryItem {
  id: string;
  mediaType: string;
  mediaUrl: string;
  title: string;
  description: string;
  cta: string;
  targetUrl: string;
  productId: string;
  arrivalId: string;
  promotionId: string;
  publishAt: string;
  expiresAt: string;
  priority: number;
  status: string;
}

/** خبر كما يقدّمه `GET /api/public/news`. */
export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  content: string;
  image: string;
  category: string;
  author: string;
  publishedAt: string;
  arrivalId: string;
  productId: string;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? fallback : String(value);
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => str(entry)).filter(Boolean) : [];
}

function row(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rows(payload: unknown): Record<string, unknown>[] {
  const body = row(payload);
  const list_ = body && Array.isArray(body.data) ? body.data : Array.isArray(payload) ? payload : [];
  return list_.flatMap((entry) => {
    const record = row(entry);
    return record ? [record] : [];
  });
}

export async function fetchPromotions(options: RequestOptions = {}): Promise<Promotion[]> {
  const payload = await apiGet('/api/public/promotions', options);
  return rows(payload).flatMap((entry) => {
    const id = str(entry.id);
    if (!id) return [];
    return [
      {
        id,
        name: str(entry.name),
        description: str(entry.description),
        image: str(entry.image),
        discountType: str(entry.discount_type, 'PERCENT'),
        value: num(entry.value),
        startsAt: str(entry.starts_at),
        endsAt: str(entry.ends_at),
        promoCode: str(entry.promo_code),
        status: str(entry.status),
        arrivalIds: list(entry.arrival_ids),
        productIds: list(entry.product_ids),
      },
    ];
  });
}

export async function fetchStories(options: RequestOptions = {}): Promise<StoryItem[]> {
  const payload = await apiGet('/api/public/stories', options);
  return rows(payload).flatMap((entry) => {
    const id = str(entry.id);
    if (!id) return [];
    return [
      {
        id,
        mediaType: str(entry.media_type, 'IMAGE'),
        mediaUrl: str(entry.media_url || entry.mediaUrl),
        title: str(entry.title),
        description: str(entry.description),
        cta: str(entry.cta),
        targetUrl: str(entry.target_url || entry.targetUrl),
        productId: str(entry.product_id || entry.productId),
        arrivalId: str(entry.arrival_id || entry.arrivalId),
        promotionId: str(entry.promotion_id || entry.promotionId),
        publishAt: str(entry.publish_at || entry.publishAt),
        expiresAt: str(entry.expires_at || entry.expiresAt),
        priority: num(entry.priority),
        status: str(entry.status),
      },
    ];
  });
}

export async function fetchNews(options: RequestOptions = {}): Promise<NewsItem[]> {
  const payload = await apiGet('/api/public/news', options);
  return rows(payload).flatMap((entry) => {
    const id = str(entry.id);
    if (!id) return [];
    return [
      {
        id,
        title: str(entry.title),
        summary: str(entry.summary),
        content: str(entry.content),
        image: str(entry.image),
        category: str(entry.category),
        author: str(entry.author),
        publishedAt: str(entry.published_at || entry.publishedAt),
        arrivalId: str(entry.arrival_id || entry.arrivalId),
        productId: str(entry.product_id || entry.productId),
      },
    ];
  });
}
