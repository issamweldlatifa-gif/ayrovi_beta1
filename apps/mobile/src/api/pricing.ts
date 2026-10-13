/**
 * Devis public d'une ligne produit.
 *
 * Le téléphone n'applique jamais lui-même droits, TVA, commission ou remise :
 * il transmet le prix marchand et affiche la réponse de `quoteCartLine()`.
 */
import { apiSendData, type RequestOptions } from './client';
import { ApiError } from './errors';

export interface CartLineQuotePromo {
  percent: number;
  label: string;
  discountTnd: number;
}

export interface CartLineQuote {
  lineTotalTnd: number;
  originalLineTotalTnd: number | null;
  promo: CartLineQuotePromo | null;
  pricingVersion: number | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function parseCartLineQuote(value: unknown): CartLineQuote {
  if (!isRecord(value)) throw new ApiError('malformed', 'Devis produit illisible.');
  const lineTotalTnd = finite(value.lineTotalTND);
  if (lineTotalTnd === null || lineTotalTnd <= 0) {
    throw new ApiError('malformed', 'Montant du devis produit absent.');
  }
  const rawPromo = isRecord(value.promo) ? value.promo : null;
  const promoPercent = rawPromo ? finite(rawPromo.percent) : null;
  const promoDiscount = rawPromo ? finite(rawPromo.discountTND) : null;
  return {
    lineTotalTnd,
    originalLineTotalTnd: finite(value.originalLineTotalTND),
    promo: rawPromo && promoPercent !== null && promoDiscount !== null
      ? {
          percent: promoPercent,
          label: typeof rawPromo.label === 'string' ? rawPromo.label : '',
          discountTnd: promoDiscount,
        }
      : null,
    pricingVersion: finite(value.pricingVersion),
  };
}

export async function quoteCartLine(
  input: { title: string; sourcePrice: number; sourceCurrency: string },
  options: RequestOptions = {},
): Promise<CartLineQuote> {
  const title = input.title.trim();
  const currency = input.sourceCurrency.trim().toUpperCase();
  if (!title || !Number.isFinite(input.sourcePrice) || input.sourcePrice <= 0 || !/^[A-Z]{3}$/.test(currency)) {
    throw new ApiError('malformed', 'Données du devis produit invalides.');
  }
  const data = await apiSendData<unknown>('POST', '/api/public/pricing/cart-line', {
    ...options,
    body: {
      title: title.slice(0, 500),
      sourcePrice: input.sourcePrice,
      sourceCurrency: currency,
      quantity: 1,
    },
  });
  return parseCartLineQuote(data);
}
