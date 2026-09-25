import { validateProductForCart } from '../../../../shared/commerceProduct';
import type { AyrovixOrderPayload, AyrovixProduct, LegacyAyrovixOrderPayload } from '../types';
import type { AyrovixOrderSelection } from '../components/ProductResult';
import { validProductUrl } from './resultPolicy';
import { completeProductOffer, resolveProductSelection } from './productSelection';

function storeForUrl(url: string): LegacyAyrovixOrderPayload['store'] {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes('shein.')) return 'shein';
  if (host.includes('amazon.')) return 'amazon';
  if (host.includes('temu.')) return 'temu';
  if (host.includes('aliexpress.')) return 'aliexpress';
  return 'generic';
}

/** One order construction point for Lens AND assistant. Canonical orders pass
 * the full server quote without editable prices or variant labels. The older
 * signed manual screenshot quote retains its separate compatibility protocol.
 */
export function prepareProductOrder(product: AyrovixProduct, selection: AyrovixOrderSelection): AyrovixOrderPayload {
  if (product.canonical) {
    const canonical = product.canonical;
    const checked = validateProductForCart(canonical, selection.selectedOptions, selection.quantity);
    if (checked.ok === false) throw new Error(`Sélection invalide : ${checked.reason}`);
    if (!canonical.quoteToken || canonical.identity.sourceUrl !== selection.productUrl) throw new Error('Actualisez le devis du produit.');
    return { product: canonical, selectedVariants: { ...selection.selectedOptions },
      quantity: selection.quantity, customerNote: selection.note };
  }
  if (!validProductUrl(selection.productUrl) ||
    (product.sourceUrl && product.sourceUrl !== selection.productUrl)) throw new Error('Lien marchand invalide.');
  const { option, offer } = resolveProductSelection(product, selection.size, selection.color);
  if (!completeProductOffer(offer)) throw new Error('Devis de cette sélection indisponible. Actualisez le produit.');
  return {
    store: storeForUrl(selection.productUrl), externalId: option?.id || null,
    url: selection.productUrl, referenceUrl: product.sourceUrl || '',
    title: product.title, imageUrl: product.image || '',
    sourcePrice: offer.price, sourceCurrency: offer.currency,
    priceTND: offer.priceTnd ?? undefined, priceToken: offer.priceToken,
    variant: option?.label || [selection.size && `Taille: ${selection.size}`, selection.color && `Couleur: ${selection.color}`].filter(Boolean).join(' · ') || undefined,
    requestedSize: selection.size, requestedColor: selection.color, customerNote: selection.note,
    priceVerificationStatus: product.priceVerificationStatus || 'PENDING_MANUAL', quantity: selection.quantity,
  };
}
