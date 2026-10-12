/**
 * منطق عرض Lens — بلا React، قابل للاختبار.
 *
 *  • السعر من الخادم وحده: نعرض `priceTnd` إن وُجد، وإلا `price` بعملته، وإلا «بلا تسعير».
 *    ما نحوّلوش العملة ولا نخمّنو رقماً.
 *  • التوفّر يُعرض بالمفتاح المغلق؛ «غير مؤكّد» لا تصير «متوفّر».
 *  • الفيشات المكررة (نفس رابط المصدر) تتشال.
 */
import type { LensAvailability, LensCandidate } from '@/api/lens';

export type LensPriceView =
  | { kind: 'tnd'; amount: number }
  | { kind: 'original'; amount: number; currency: string }
  | { kind: 'none' };

export function priceView(candidate: Pick<LensCandidate, 'priceTnd' | 'price' | 'currency'>): LensPriceView {
  if (candidate.priceTnd != null && Number.isFinite(candidate.priceTnd) && candidate.priceTnd > 0) {
    return { kind: 'tnd', amount: candidate.priceTnd };
  }
  if (candidate.price != null && Number.isFinite(candidate.price) && candidate.price > 0 && candidate.currency) {
    return { kind: 'original', amount: candidate.price, currency: candidate.currency };
  }
  return { kind: 'none' };
}

/** مفتاح الترجمة للتوفّر (قاموس مغلق). */
export function availabilityKey(availability: LensAvailability): 'product.avail.in_stock' | 'product.avail.limited' | 'product.avail.out_of_stock' | 'product.avail.unknown' {
  switch (availability) {
    case 'in_stock': return 'product.avail.in_stock';
    case 'limited': return 'product.avail.limited';
    case 'out_of_stock': return 'product.avail.out_of_stock';
    default: return 'product.avail.unknown';
  }
}

/** يحافظ على ترتيب الخادم، ويُسقط الفيشات المكررة حسب رابط المصدر. */
export function uniqueCandidates(candidates: readonly LensCandidate[]): LensCandidate[] {
  const seen = new Set<string>();
  const out: LensCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.sourceUrl)) continue;
    seen.add(candidate.sourceUrl);
    out.push(candidate);
  }
  return out;
}

/** الرابط يجب أن يكون http(s) قبل فتحه. */
export function isOpenableSourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
