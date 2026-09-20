import { isSelectableVariant } from '../../../../shared/variantPolicy';
import type { AyrovixProduct, AyrovixVariantOption } from '../types';

export interface ProductOffer {
  price: number | null;
  currency: string | null;
  priceTnd: number | null;
  priceToken: string | null;
  fromVariant: boolean;
}
export interface ProductSelection {
  kind: 'general' | 'manual' | 'ambiguous' | 'matched';
  option: AyrovixVariantOption | null;
  offer: ProductOffer;
  generalEstimate: boolean;
}
const key = (value: string | null | undefined) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const positive = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/** Resolve all matches. Neither input order nor an incomplete selection may pick
 * the first of several quotes. A manual request continues to use the general
 * offer, clearly labelled as such, without an invented variant identifier.
 */
export function resolveProductSelection(product: AyrovixProduct, size: string, color: string): ProductSelection {
  const wantedSize = key(size), wantedColor = key(color);
  const requested = Boolean(wantedSize || wantedColor);
  const matches = requested ? (product.variantOptions || []).filter(option => isSelectableVariant(option)
    && (!wantedSize || key(option.size) === wantedSize)
    && (!wantedColor || key(option.color) === wantedColor)) : [];
  const kind = !requested ? 'general' : matches.length === 0 ? 'manual' : matches.length > 1 ? 'ambiguous' : 'matched';
  const option = kind === 'matched' ? matches[0] : null;
  // Only a completely unpriced variant may use the general offer as a whole.
  // A partial variant quote must not borrow currency, total or token from it.
  const fromVariant = Boolean(option && (option.price != null || option.currency != null || option.priceTnd != null || option.priceToken?.trim()));
  const source = fromVariant ? option! : product;
  const offer: ProductOffer = {
    price: positive(source.price),
    currency: typeof source.currency === 'string' && /^[A-Z]{3}$/.test(source.currency) ? source.currency : null,
    priceTnd: positive(source.priceTnd),
    priceToken: typeof source.priceToken === 'string' && source.priceToken.trim() ? source.priceToken : null,
    fromVariant,
  };
  return { kind, option, offer, generalEstimate: requested && !fromVariant };
}

/** Token is opaque to the client. Presence/coherence are checked here; HMAC,
 * expiry and signed fields remain the server's responsibility. */
export function completeProductOffer(offer: ProductOffer): offer is ProductOffer & { price: number; currency: string; priceToken: string } {
  return offer.price !== null && offer.currency !== null && offer.priceToken !== null;
}

export const productSelectionLabels = {
  ambiguous: ['Plusieurs variantes correspondent. Précisez votre choix, ou envoyez une demande manuelle au prix général estimé.', 'توجد عدة خيارات مطابقة. حدّد اختيارك أكثر، أو أرسل طلبًا يدويًا بالسعر العام التقديري.'],
  general: ['Estimation générale : le prix de la variante demandée reste à confirmer.', 'تقدير عام: سعر المقاس أو اللون المطلوب ما زال يحتاج إلى تأكيد.'],
  incomplete: ['Le devis de cette variante est incomplet. Actualisez le produit avant de commander.', 'عرض سعر هذا الخيار غير مكتمل. حدّث المنتج قبل الطلب.'],
  unavailable: ['Le devis de cette sélection est incomplet ou indisponible. Relancez la recherche du produit.', 'عرض سعر هذا الاختيار غير مكتمل أو غير متاح. أعد البحث عن المنتج.'],
} as const;
