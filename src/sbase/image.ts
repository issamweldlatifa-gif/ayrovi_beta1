/**
 * S Base — البحث بالصورة (Google Lens عبر SerpApi).
 *
 * ── علاش هنا وموش في SandBase ────────────────────────────────────────────────
 * SandBase ما تنشرش endpoint لـ«صورة → منتجات»: الـ7 مصادر اللي عندنا كلهم
 * بحث بكلمة (و1688 عندها بحث بالصورة لكن للجملة الصينية فقط). القدرة الوحيدة
 * الحقيقية اللي عندنا للبحث بالصورة هي **Google Lens** عبر SerpApi.
 *
 * ── علاش نعاودو نستعملو خدمة Z Lens ──────────────────────────────────────────
 * الأمر متاع المالك: «ما نعاودوش نبنيو APIs موجودة». الخدمة الموجودة
 * (`serpApiVisualSearch` في `zayrovix/services/visualSearch.ts`) تتستعمل هنا
 * **كما هي، بلا أي تعديل**: نفس التحقّق من الصورة، نفس البلدان، نفس الكاش.
 * ما نلمسوش لا مسارات Z Lens، لا الكاميرا متاعها، لا quotas متاعها.
 *
 * ── الصدق ───────────────────────────────────────────────────────────────────
 * كل نتيجة تجي من Lens وتحمل **متجرها** (`source`)؛ ما نضيفوش سعراً ولا عملة
 * ما عطاهاش المصدر، وما نحوّلوش لـTND.
 */
import { serpApiVisualReady, serpApiVisualSearch } from '../zayrovix/services/visualSearch';
import type { SbaseProduct } from './extract';

export const SBASE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export class SbaseImageError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'SbaseImageError';
    this.code = code;
    this.status = status;
  }
}

export function sbaseImageReady(): boolean {
  return serpApiVisualReady();
}

/** يحوّل مرشّح Lens إلى منتج S Base، مع تسجيل الحقول الناقصة. */
export function candidateToProduct(candidate: {
  id?: string; title?: string; sourceUrl?: string; image?: string; source?: string;
  price?: number | null; currency?: string | null;
}): SbaseProduct | null {
  const title = String(candidate.title ?? '').trim();
  const url = String(candidate.sourceUrl ?? '').trim();
  if (!title || !/^https?:\/\//i.test(url)) return null;
  const amount = typeof candidate.price === 'number' && Number.isFinite(candidate.price) ? candidate.price : null;
  const currency = candidate.currency ? String(candidate.currency).toUpperCase() : null;
  const image = String(candidate.image ?? '').trim() || null;
  const store = String(candidate.source ?? '').trim() || null;
  const missing: string[] = [];
  if (!image) missing.push('image');
  if (amount === null) missing.push('price');
  if (!currency) missing.push('currency');
  if (!store) missing.push('store');
  return {
    id: candidate.id ? String(candidate.id) : null,
    title,
    url,
    image,
    priceText: null,
    amount,
    currency,
    store,
    rating: null,
    reviews: null,
    shipping: null,
    condition: null,
    missing,
  };
}

export interface SbaseImageResult {
  items: SbaseProduct[];
  durationMs: number;
}

/** صورة (buffer) → منتجات، مع قياس الزمن الحقيقي. */
export async function searchSbaseByImage(image: Buffer): Promise<SbaseImageResult> {
  if (!sbaseImageReady()) {
    throw new SbaseImageError('SBASE_IMAGE_NOT_CONFIGURED', 'البحث بالصورة غير مفعّل: مفتاح SerpApi ناقص على الخادم.', 503);
  }
  if (!Buffer.isBuffer(image) || image.length === 0) {
    throw new SbaseImageError('SBASE_IMAGE_EMPTY', 'الصورة فارغة.', 400);
  }
  if (image.length > SBASE_IMAGE_MAX_BYTES) {
    throw new SbaseImageError('SBASE_IMAGE_TOO_LARGE', 'الصورة كبيرة برشة (8 ميغا كحدّ أقصى).', 413);
  }
  const started = Date.now();
  const candidates = await serpApiVisualSearch(image, 24);
  const items = candidates
    .map((candidate) => candidateToProduct(candidate))
    .filter((item): item is SbaseProduct => Boolean(item));
  // بلا نتائج = حالة عادية (`empty` في المسار)، موش خطأ.
  return { items, durationMs: Date.now() - started };
}
