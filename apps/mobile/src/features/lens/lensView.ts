/**
 * منطق عرض Lens — بلا React، قابل للاختبار.
 *
 *  • السعر من الخادم وحده: نعرض `priceTnd` إن وُجد، وإلا `price` بعملته، وإلا «بلا تسعير».
 *    ما نحوّلوش العملة ولا نخمّنو رقماً.
 *  • التوفّر يُعرض بالمفتاح المغلق؛ «غير مؤكّد» لا تصير «متوفّر».
 *  • الفيشات المكررة (نفس رابط المصدر) تتشال.
 */
import type { LensAvailability, LensCandidate } from '@/api/lens';
import type { CartLineQuote } from '@/api/pricing';

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

export interface LensPricePresentation {
  current: LensPriceView;
  referenceTnd: number | null;
  discountPercent: number | null;
  promoLabel: string | null;
  verifiedAtSource: boolean;
}

const positive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/** Hiérarchie unique du prix pour la grille et la fiche. */
export function pricePresentation(candidate: LensCandidate, quote: CartLineQuote | null = null): LensPricePresentation {
  const quoteCurrent = positive(quote?.lineTotalTnd);
  const promoCurrent = positive(candidate.promo?.priceTnd);
  const regularCurrent = positive(candidate.priceTnd);
  const currentTnd = quoteCurrent ?? promoCurrent ?? regularCurrent;
  const current: LensPriceView = currentTnd != null
    ? { kind: 'tnd', amount: currentTnd }
    : priceView(candidate);

  const candidateReference = positive(candidate.promo?.originalPriceTnd)
    ?? positive(candidate.originalPriceTnd);
  const quotedReference = positive(quote?.originalLineTotalTnd);
  const reference = quotedReference ?? candidateReference;
  const referenceTnd = current.kind === 'tnd' && reference != null && reference > current.amount
    ? reference
    : null;
  const explicitPercent = positive(quote?.promo?.percent) ?? positive(candidate.promo?.percent);
  const derivedPercent = referenceTnd != null && current.kind === 'tnd'
    ? Math.round((1 - current.amount / referenceTnd) * 100)
    : null;

  return {
    current,
    referenceTnd,
    discountPercent: explicitPercent != null ? Math.round(explicitPercent) : derivedPercent,
    promoLabel: quote?.promo?.label?.trim() || candidate.promo?.label?.trim() || null,
    verifiedAtSource: candidate.priceOrigin === 'merchant' || candidate.priceVerificationStatus === 'VERIFIED',
  };
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
