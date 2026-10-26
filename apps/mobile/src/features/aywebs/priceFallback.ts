/**
 * AYWEBs — repli sur la lecture SERVEUR quand la capture ne donne pas de devis
 * (26/10/2026).
 *
 * ── Le fait mesuré ────────────────────────────────────────────────────────
 * La MÊME fiche Zalando donnait, dans l'application, un prix en dinars pour une
 * couleur et « Prix en dinars calculé à l'ajout. » puis « Pas de devis serveur
 * en dinars » pour une autre — alors que la fiche ouverte depuis le WEB
 * affichait un devis pour toutes les couleurs. La différence n'est pas la
 * vitesse : c'est la SOURCE. Le web (voir `AyWebsVariantSheet.tsx`) demande au
 * serveur de relire la page ; l'application, en mode `local`, ne transmet que
 * la capture faite dans le navigateur du client. Quand cette capture ne porte
 * pas de prix vérifiable (devise absente, page sans prix global, valeurs qui se
 * contredisent), le devis est nul — et l'ajout est refusé.
 *
 * ── La règle ajoutée ici ──────────────────────────────────────────────────
 * « Pas de devis depuis la capture » ⇒ on demande UNE fois au serveur de relire
 * la page, exactement comme le web. Ce n'est pas une permission nouvelle : le
 * serveur relisait déjà la fiche lui-même dans ce cas, mais seulement APRÈS le
 * refus, côté panier. On le fait AVANT, pour que l'écran affiche le prix.
 *
 * Ce module est PUR : il ne décide que « faut-il relire ? », et comment
 * combiner la réponse. Aucun prix n'est calculé ici.
 */
import type { AyWebsResolvedProduct } from '@/api/aywebs';

/** Le devis en dinars est-il absent de cette résolution ? */
export function lacksServerQuote(product: Pick<AyWebsResolvedProduct, 'ayroviPricing'> | null | undefined): boolean {
  const total = product?.ayroviPricing?.totalTnd;
  return !(typeof total === 'number' && Number.isFinite(total) && total > 0);
}

export interface ServerReadDecision {
  /** Faut-il demander au serveur de relire la page ? */
  read: boolean;
  /** Raison courte (diagnostic), vide quand aucune relecture n'est utile. */
  reason: '' | 'NO_QUOTE' | 'PRICE_UNVERIFIED' | 'CURRENCY_UNVERIFIED' | 'NO_PRICE';
}

/**
 * Faut-il relire la page côté serveur ?
 *
 * On ne relit que si la capture n'a produit AUCUN devis : c'est le seul cas où
 * la relecture peut apporter quelque chose. Si le devis existe, la capture a
 * suffi et on n'ajoute pas une lecture marchande (règle du 19/10/2026).
 */
export function serverReadDecision(input: {
  /** Résolution obtenue depuis la capture (peut être nulle si l'appel a échoué). */
  product: Pick<AyWebsResolvedProduct, 'ayroviPricing' | 'price' | 'currency' | 'priceVerified' | 'currencyVerified'> | null | undefined;
  /** Une relecture a-t-elle déjà eu lieu pour cette ouverture de feuille ? */
  attempted?: boolean;
  /** Session absente : le serveur refuserait l'appel. */
  sessionId?: string | null;
}): ServerReadDecision {
  if (!input.sessionId) return { read: false, reason: '' };
  if (input.attempted) return { read: false, reason: '' };
  const product = input.product;
  if (!product) return { read: true, reason: 'NO_QUOTE' };
  if (!lacksServerQuote(product)) return { read: false, reason: '' };
  if (!(typeof product.price === 'number' && product.price > 0)) return { read: true, reason: 'NO_PRICE' };
  if (product.currencyVerified !== true) return { read: true, reason: 'CURRENCY_UNVERIFIED' };
  if (product.priceVerified !== true) return { read: true, reason: 'PRICE_UNVERIFIED' };
  return { read: true, reason: 'NO_QUOTE' };
}

/**
 * Combine la résolution « capture » et la résolution « serveur ».
 *
 * Le prix, la devise, la disponibilité et le devis viennent du serveur Quand il
 * les publie (c'est lui qui relit la page) ; les valeurs nommées par la capture
 * (tailles / couleurs) et ce que le serveur ne renvoie pas sont conservés. Un
 * champ que le serveur ne prouve pas ne remplace JAMAIS un champ prouvé.
 */
export function preferServerQuote(
  fromCapture: AyWebsResolvedProduct,
  fromServer: AyWebsResolvedProduct | null,
): AyWebsResolvedProduct {
  if (!fromServer) return fromCapture;
  if (lacksServerQuote(fromServer) && lacksServerQuote(fromCapture)) {
    /* Aucun des deux n'a de devis : on garde la capture, mais une disponibilité
       prouvée par le serveur reste préférable à « inconnue ». */
    return fromCapture.availability.state === 'UNKNOWN' && fromServer.availability.state !== 'UNKNOWN'
      ? { ...fromCapture, availability: fromServer.availability, variantQuotes: fromServer.variantQuotes.length ? fromServer.variantQuotes : fromCapture.variantQuotes }
      : fromCapture;
  }
  if (lacksServerQuote(fromServer)) return fromCapture;
  const groups = fromCapture.variantGroups.length ? fromCapture.variantGroups : fromServer.variantGroups;
  return {
    ...fromCapture,
    productId: fromServer.productId || fromCapture.productId,
    title: fromCapture.title || fromServer.title,
    images: fromCapture.images.length ? fromCapture.images : fromServer.images,
    price: fromServer.price ?? fromCapture.price,
    currency: fromServer.currency || fromCapture.currency,
    priceVerified: fromServer.priceVerified === true || fromCapture.priceVerified === true,
    currencyVerified: fromServer.currencyVerified === true || fromCapture.currencyVerified === true,
    availability: fromServer.availability.state !== 'UNKNOWN' ? fromServer.availability : fromCapture.availability,
    ayroviPricing: fromServer.ayroviPricing ?? fromCapture.ayroviPricing,
    variantGroups: groups,
    variantDetails: fromServer.variantDetails.length ? fromServer.variantDetails : fromCapture.variantDetails,
    variantQuotes: fromServer.variantQuotes.length ? fromServer.variantQuotes : fromCapture.variantQuotes,
  };
}
