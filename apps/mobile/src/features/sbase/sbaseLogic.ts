/**
 * S Base — منطق نقي (بلا React، بلا شبكة) ⇒ قابل للاختبار مباشرة.
 *
 * ثلاث قواعد:
 *  • ما نعرضوش قدرة ما يدعمهاش المصدر (الشيب يُبنى من `supports` الحقيقية)؛
 *  • ما نحسبوش سعراً: نعرض نصّ المصدر كما هو، وإذا غاب نقول «غير متوفّر»؛
 *  • الزمن يُعرض كي وصل من الخادم (ms) بلا تجميل.
 */
import type { SbaseItem, SbaseSupports } from '@/api/sbase';

export type CapabilityKey = keyof SbaseSupports;

/** ترتيب العرض الثابت — يبقى نفس الترتيب مهما تبدّل المصدر. */
export const CAPABILITY_ORDER: CapabilityKey[] = ['keyword', 'image', 'url', 'details', 'price', 'variants', 'barcode'];

export const CAPABILITY_LABEL_KEYS: Record<CapabilityKey, string> = {
  keyword: 'sbase.cap.keyword',
  image: 'sbase.cap.image',
  url: 'sbase.cap.url',
  details: 'sbase.cap.details',
  price: 'sbase.cap.price',
  variants: 'sbase.cap.variants',
  barcode: 'sbase.cap.barcode',
};

/** القدرات المدعومة **فقط** — لا شيء يُضاف من عندنا. */
export function supportedCapabilities(supports: SbaseSupports | null | undefined): CapabilityKey[] {
  if (!supports) return [];
  return CAPABILITY_ORDER.filter((key) => supports[key] === true);
}

/** الحقول اللي المصدر ما عطاهاش — تُعرض كتنبيه صادق. */
export const MISSING_LABEL_KEYS: Record<string, string> = {
  image: 'sbase.missing.image',
  price: 'sbase.missing.price',
  currency: 'sbase.missing.currency',
  link: 'sbase.missing.link',
  rating: 'sbase.missing.rating',
  store: 'sbase.missing.store',
};

export function missingLabelKey(field: string): string | null {
  return MISSING_LABEL_KEYS[field] ?? null;
}

/**
 * أكواد الفشل → نصّ **بلغة الواجهة**.
 *
 * علاش (26/11/2026): الخادم يبعث رسالة بلغة واحدة (عربية)، والواجهة الفرنسية
 * كانت تعرضها كما هي ⇒ «La recherche a échoué» وتحتها جملة عربية. صورة واحدة
 * ما تتقراش كانت تخرج بنفس النصّ حتى وقت ما العطب يكون عند Google Lens.
 * توّا النصّ يتعوّض بالكود، والكود هو اللي يختار اللغة.
 */
export const FAILURE_MESSAGE_KEYS: Record<string, string> = {
  // ── قناة الصورة ─────────────────────────────────────────────────────
  SBASE_IMAGE_EMPTY: 'sbase.err.imageEmpty',
  SBASE_IMAGE_INVALID: 'sbase.err.imageInvalid',
  SBASE_IMAGE_TOO_LARGE: 'sbase.err.imageTooLarge',
  SBASE_IMAGE_TIMEOUT: 'sbase.err.imageTimeout',
  SBASE_IMAGE_RATE_LIMITED: 'sbase.err.imageRateLimited',
  SBASE_IMAGE_PROVIDER_AUTH: 'sbase.err.imageProviderAuth',
  SBASE_IMAGE_PROVIDER_REFUSED: 'sbase.err.imageProviderRefused',
  SBASE_IMAGE_PROVIDER_DOWN: 'sbase.err.imageProviderDown',
  SBASE_IMAGE_REQUEST_INVALID: 'sbase.err.imageRequestInvalid',
  SBASE_IMAGE_BALANCE: 'sbase.err.imageBalance',
  SBASE_IMAGE_PROVIDER_UNKNOWN: 'sbase.err.imageUnknown',
  SBASE_IMAGE_UNKNOWN: 'sbase.err.imageUnknown',
  SBASE_IMAGE_NOT_CONFIGURED: 'sbase.err.imageNotConfigured',
  // ── قناة الكلمة (المزوّد الوحيد: Apify — نفس الجُمَل الصادقة) ────────
  APIFY_NOT_CONFIGURED: 'sbase.err.notConfigured',
  APIFY_UNAUTHORIZED: 'sbase.err.unauthorized',
  APIFY_BALANCE: 'sbase.err.balance',
  APIFY_RATE_LIMIT: 'sbase.err.rateLimit',
  APIFY_TIMEOUT: 'sbase.err.timeout',
  APIFY_FAILED: 'sbase.err.failed',
  APIFY_EMPTY: 'sbase.err.empty',
  APIFY_NETWORK: 'sbase.err.network',
  APIFY_MALFORMED: 'sbase.err.malformed',
};

export function failureMessageKey(code: string | null | undefined): string | null {
  const key = String(code ?? '').trim().toUpperCase();
  if (!key) return null;
  return FAILURE_MESSAGE_KEYS[key] ?? null;
}

/** هل العطب عند مزوّد الصورة (موش في صورة المستخدم)؟ يتبدّل النصّ وتبقى الكلمة متاحة. */
export function isImageProviderFailure(code: string | null | undefined): boolean {
  const key = String(code ?? '').trim().toUpperCase();
  return /^SBASE_IMAGE_(RATE_LIMITED|PROVIDER_AUTH|PROVIDER_REFUSED|PROVIDER_DOWN|TIMEOUT|UNKNOWN|NOT_CONFIGURED)$/.test(key);
}

/** «812 ms» / «1,4 s» — بلا تقريب مخادع للثواني الصغيرة. */
export function formatDuration(ms: number | null | undefined, locale: string = 'fr'): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  const rendered = seconds < 10 ? seconds.toFixed(1) : String(Math.round(seconds));
  return `${rendered.replace('.', locale === 'ar' ? ',' : ',')} s`;
}

/** سعر المصدر كما هو؛ وإذا ما فماش، تسمية صادقة (بلا صفر مزيف). */
export function formatItemPrice(item: Pick<SbaseItem, 'amount' | 'currency' | 'priceText'>, fallback = '—'): string {
  if (item.priceText && item.priceText.trim()) return item.priceText.trim();
  if (typeof item.amount === 'number' && Number.isFinite(item.amount)) {
    const formatted = item.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return item.currency ? `${formatted} ${item.currency}` : formatted;
  }
  return fallback;
}

/** كلفة النداء كما ينشرها المزوّد (USD) — للمعلومة، موش للفاتورة. */
export function formatCallCost(costUsd: number | null | undefined): string | null {
  if (typeof costUsd !== 'number' || !Number.isFinite(costUsd) || costUsd < 0) return null;
  if (costUsd === 0) return '0 $';
  const decimals = costUsd < 0.01 ? 4 : 3;
  return `${costUsd.toFixed(decimals).replace('.', ',')} $`;
}

/** «1 234,500 TND» — millimes compris, séparateurs français, jamais arrondi au dinar. */
export function formatTND(amount: number | null | undefined): string | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND`;
}
