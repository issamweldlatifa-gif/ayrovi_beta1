/**
 * منطق الطلب من نتيجة Lens — دوال نقية (نفس قواعد الموقع `LensLauncher.handleOrder`
 * و`productSelection.ts`).
 *
 *  • العرض يُقبل للطلب فقط إذا كان فيه سعر وعملة ورمز موقّع (`completeOffer`).
 *  • اختيار المقاس/اللون: مطابقة واحدة فقط تُعتمد. التعدد أو عدم التطابق لا يختار أولاً.
 *  • الحالة VERIFIED تُرسل فقط مع رمز موقّع؛ وإلا PENDING_MANUAL.
 *  • الخادم يبقى الحكم النهائي (حارس المتغيرات وتطابق الرمز)، والتطبيق لا يتجاوزه.
 */
import type { LensCandidate, LensVariantOption } from '@/api/lens';

export type StoreKey = 'shein' | 'amazon' | 'temu' | 'aliexpress' | 'generic';

/** نفس تصنيف الموقع: المتجر يُستخرج من الرابط. */
export function toStoreKey(sourceUrl: string): StoreKey {
  const host = sourceUrl.toLowerCase();
  if (host.includes('shein')) return 'shein';
  if (host.includes('amazon')) return 'amazon';
  if (host.includes('temu')) return 'temu';
  if (host.includes('aliexpress')) return 'aliexpress';
  return 'generic';
}

const key = (value: string | null | undefined): string => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const positive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

export interface ProductOffer {
  price: number | null;
  currency: string | null;
  priceTnd: number | null;
  priceToken: string | null;
  /** العرض مأخوذ من متغيّر محدّد (لا من المنتج عامة). */
  fromVariant: boolean;
}

export type SelectionKind = 'general' | 'manual' | 'ambiguous' | 'matched';

export interface Selection {
  kind: SelectionKind;
  option: LensVariantOption | null;
  offer: ProductOffer;
}

/** اختيار المقاس/اللون — نفس منطق `resolveProductSelection`. */
export function resolveSelection(candidate: LensCandidate, size: string, color: string): Selection {
  const wantedSize = key(size);
  const wantedColor = key(color);
  const requested = Boolean(wantedSize || wantedColor);
  const matches = requested
    ? candidate.variantOptions.filter((option) => option.available
      && (!wantedSize || key(option.size) === wantedSize)
      && (!wantedColor || key(option.color) === wantedColor))
    : [];
  const kind: SelectionKind = !requested
    ? 'general'
    : matches.length === 0 ? 'manual' : matches.length > 1 ? 'ambiguous' : 'matched';
  const option = kind === 'matched' ? matches[0] : null;
  // Un variant incomplet ne prend ni devise ni total ni jeton d'un autre.
  const fromVariant = Boolean(option && (option.price != null || option.currency != null || option.priceTnd != null || option.priceToken));
  const source = fromVariant && option ? option : candidate;
  return {
    kind,
    option,
    offer: {
      price: positive(source.price),
      currency: typeof source.currency === 'string' && /^[A-Z]{3}$/.test(source.currency) ? source.currency : null,
      priceTnd: positive(source.priceTnd),
      priceToken: source.priceToken && source.priceToken.trim() ? source.priceToken : null,
      fromVariant,
    },
  };
}

/** العرض مكتمل للطلب: سعر وعملة ورمز موقّع. */
export function completeOffer(offer: ProductOffer): offer is ProductOffer & { price: number; currency: string; priceToken: string } {
  return offer.price !== null && offer.currency !== null && offer.priceToken !== null;
}

/** سبب منع الطلب قبل الإرسال (يُعرض للمستخدم)، أو null إن كان الطلب ممكناً. */
export type OrderBlock = 'ambiguous' | 'manual' | 'incomplete' | null;

export function orderBlock(selection: Selection): OrderBlock {
  if (selection.kind === 'ambiguous') return 'ambiguous';
  if (selection.kind === 'manual') return 'manual';
  if (!completeOffer(selection.offer)) return 'incomplete';
  return null;
}

export interface CartPayloadInput {
  candidate: LensCandidate;
  selection: Selection;
  size: string;
  color: string;
  quantity: number;
  customerNote: string;
}

/** حمولة `POST /api/cart/items` — نفس الحقول التي يرسلها الموقع. */
export interface ExternalCartPayload {
  store: StoreKey;
  externalId: string | null;
  url: string;
  referenceUrl: string;
  title: string;
  imageUrl: string;
  sourcePrice: number;
  sourceCurrency: string;
  priceTND: number;
  variant: string | null;
  requestedSize: string | null;
  requestedColor: string | null;
  customerNote: string | null;
  priceVerificationStatus: 'VERIFIED' | 'PENDING_MANUAL';
  priceToken: string;
  quantity: number;
}

/** يبني الحمولة فقط إن كان الطلب مكتملاً؛ وإلا null (لا حمولة بسعر مختلق). */
export function buildCartPayload(input: CartPayloadInput): ExternalCartPayload | null {
  const { candidate, selection } = input;
  if (orderBlock(selection) !== null) return null;
  const offer = selection.offer;
  if (!completeOffer(offer)) return null;
  const size = input.size.trim();
  const color = input.color.trim();
  const quantity = Math.min(Math.max(1, Math.trunc(input.quantity)), 99);
  const variant = [size && `Taille: ${size}`, color && `Couleur: ${color}`].filter(Boolean).join(' · ');
  // VERIFIED يُرسل فقط مع رمز موقّع (مضمون هنا)، ولا يُرفع أبداً بلا سبب من المصدر.
  const status: 'VERIFIED' | 'PENDING_MANUAL' = candidate.priceVerificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING_MANUAL';
  return {
    store: toStoreKey(candidate.sourceUrl || candidate.source),
    externalId: selection.option?.id || null,
    url: candidate.sourceUrl,
    referenceUrl: candidate.sourceUrl,
    title: candidate.title,
    imageUrl: candidate.image,
    sourcePrice: offer.price,
    sourceCurrency: offer.currency,
    priceTND: offer.priceTnd ?? 0,
    variant: selection.option?.label || variant || null,
    requestedSize: size || null,
    requestedColor: color || null,
    customerNote: input.customerNote.trim() || null,
    priceVerificationStatus: status,
    priceToken: offer.priceToken,
    quantity,
  };
}
