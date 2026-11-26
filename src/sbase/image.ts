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
  /** كود المزوّد (SERPAPI_…) عندما يكون السبب خارجنا — للتشخيص، بلا أي سرّ. */
  providerCode: string | null;
  constructor(code: string, message: string, status = 502, providerCode: string | null = null) {
    super(message);
    this.name = 'SbaseImageError';
    this.code = code;
    this.status = status;
    this.providerCode = providerCode;
  }
}

/**
 * الأسواق اللي نسألها في Lens من S Base.
 *
 * كل سوق = **بحث SerpApi مدفوع**. خدمة Z Lens تسأل 9 أسواق لأنها خدمة بحث
 * قائمة بذاتها؛ S Base ما عندهاش نفس الميزانية: صورة واحدة بيد المستخدم ما
 * يجوزش تكلّف 9 نداءات. لهذا الافتراضي سوق واحد (فرنسا، اللي تشحن لتونس)؛
 * `SBASE_IMAGE_MARKETS=fr,uk` تزيدهم إذا حبّ المالك.
 */
export function sbaseImageMarkets(): string[] {
  const configured = String(process.env.SBASE_IMAGE_MARKETS || '').trim();
  const markets = configured
    ? configured.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter((value) => /^[a-z]{2}$/.test(value))
    : ['fr'];
  return [...new Set(markets)].slice(0, 3);
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
  /** الأسواق المسؤولة عن النتائج + عدد نداءات Lens المدفوعة (الصدق على الصرف). */
  markets: string[];
  lensSearches: number;
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
  const markets = sbaseImageMarkets();
  // كل سوق = نداء مدفوع؛ نمرّروها صراحة بدل ما نورثو الافتراضي متاع Z Lens (9).
  const candidates = await serpApiVisualSearch(image, 24, { countries: markets });
  const items = candidates
    .map((candidate) => candidateToProduct(candidate))
    .filter((item): item is SbaseProduct => Boolean(item));
  // بلا نتائج = حالة عادية (`empty` في المسار)، موش خطأ.
  return { items, durationMs: Date.now() - started, markets, lensSearches: markets.length };
}

/**
 * خطأ المزوّد → خطأ S Base **بمعناه الحقيقي**.
 *
 * السبب اللي خلّى هذي الدالة موجودة (26/11/2026): كل ما يفشل Lens (quota،
 * 429، timeout، مزوّد طايح) كان المسار يردّ `SBASE_IMAGE_INVALID` + 400،
 * أي **يلوم صورة المستخدم** على عطب في خدمة خارجية. هذا كذب على المستعمل،
 * ويخلّي التشخيص مستحيل: نفس الرسالة لكل الأعطال.
 *
 * توّا: كود مختلف لكل حالة، وحالة HTTP صحيحة، وكود المزوّد محفوظ في الردّ
 * (`providerCode`) باش يتشخّص من التطبيق بلا سيرفر ولا لوغ.
 */
const PROVIDER_FAILURES: Array<{ match: RegExp; code: string; status: number; message: string }> = [
  {
    match: /TIMEOUT$|UPLOAD_DEADLINE/,
    code: 'SBASE_IMAGE_TIMEOUT', status: 504,
    message: 'تحليل الصورة تعدّى الوقت المسموح. جرّب مرة أخرى بصورة أصغر.',
  },
  {
    match: /LENS_HTTP_429/,
    code: 'SBASE_IMAGE_RATE_LIMITED', status: 429,
    message: 'خدمة تحليل الصور رفضت النداء: حدّ الاستعمال (quota) تكمّل. البحث بالكلمة يخدم عادي.',
  },
  {
    match: /HTTP_401|HTTP_403/,
    code: 'SBASE_IMAGE_PROVIDER_AUTH', status: 503,
    message: 'مفتاح خدمة تحليل الصور مرفوض على الخادم. البحث بالكلمة يخدم عادي.',
  },
  {
    // Lens يردّ خطأ عام للـquota المنتهي وللمفتاح الضعيف — ما نخمّنوش أكثر من هذا.
    match: /LENS_API_ERROR/,
    code: 'SBASE_IMAGE_PROVIDER_REFUSED', status: 502,
    message: 'خدمة تحليل الصور (Google Lens) رفضت الطلب: حدّ الاستعمال أو المفتاح. البحث بالكلمة يخدم عادي.',
  },
  {
    match: /INVALID_JSON|UNAVAILABLE|HTTP_5\d\d|UPLOAD_NO_IMAGE_ID/,
    code: 'SBASE_IMAGE_PROVIDER_DOWN', status: 502,
    message: 'خدمة تحليل الصور غير متاحة في هذه اللحظة. جرّب بعد دقيقة.',
  },
  {
    match: /TOO_LARGE/,
    code: 'SBASE_IMAGE_TOO_LARGE', status: 413,
    message: 'الصورة كبيرة برشة (8 ميغا كحدّ أقصى).',
  },
];

export function sbaseImageFailureFrom(error: unknown): SbaseImageError {
  if (error instanceof SbaseImageError) return error;
  const candidate = (error ?? {}) as { code?: unknown; message?: unknown };
  const providerCode = String(candidate.code ?? '').trim() || null;
  const providerMessage = String(candidate.message ?? '').trim();
  // صورة ما تتقراش = غلطة العميل الحقيقية (الوحيدة اللي تستحق 400).
  if (providerCode === 'INVALID_IMAGE') {
    return new SbaseImageError(
      'SBASE_IMAGE_INVALID',
      providerMessage || 'الصورة ما تتقراش. جرّب صورة JPEG أو PNG أخرى.',
      400,
      providerCode,
    );
  }
  for (const failure of PROVIDER_FAILURES) {
    if (providerCode && failure.match.test(providerCode)) {
      return new SbaseImageError(failure.code, failure.message, failure.status, providerCode);
    }
  }
  if (/image|format|pixel|unsupported|corrupt/i.test(providerMessage)) {
    return new SbaseImageError('SBASE_IMAGE_INVALID', 'الصورة ما تتقراش. جرّب صورة JPEG أو PNG أخرى.', 400, providerCode);
  }
  return new SbaseImageError(
    'SBASE_IMAGE_UNKNOWN',
    'تعذّر تحليل الصورة لسبب غير معروف. البحث بالكلمة يخدم عادي.',
    502,
    providerCode,
  );
}
