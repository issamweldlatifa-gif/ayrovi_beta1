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

/** كلفة النداء كما تنشرها SandBase (USD) — للمعلومة، موش للفاتورة. */
export function formatCallCost(costUsd: number | null | undefined): string | null {
  if (typeof costUsd !== 'number' || !Number.isFinite(costUsd) || costUsd < 0) return null;
  if (costUsd === 0) return '0 $';
  const decimals = costUsd < 0.01 ? 4 : 3;
  return `${costUsd.toFixed(decimals).replace('.', ',')} $`;
}

