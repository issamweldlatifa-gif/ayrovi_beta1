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
 * PLAN DE LECTURE DU DEVIS (26/10/2026) — parité avec le web, défaut Zalando.
 *
 * ── Le fait constaté sur les captures d'écran du client ────────────────────
 * La MÊME fiche Zalando (Nike Revolution 8, 64,95 EUR) affichait sur le WEB
 * « 64,95 EUR ≈ 411.69 DT » et, dans l'APPLICATION, « Prix en dinars calculé à
 * l'ajout. » + « Pas de devis serveur en dinars ». Le web n'a pourtant qu'UNE
 * manière de demander : `POST /product/resolve` avec l'URL — **sans capture, sans
 * variante, sans relecture forcée**. L'application, elle, demandait la capture
 * ET la variante choisie ; or quand une capture est jointe et qu'une variante
 * est demandée, le serveur exige une PREUVE DE PRIX PAR VALEUR
 * (`variant_price_not_published` ⇒ `PRICE_UNAVAILABLE`) alors que la page, elle,
 * publie bien son prix. C'est un chemin que le web n'emprunte jamais.
 *
 * ── La règle ──────────────────────────────────────────────────────────────
 * On essaie, dans l'ordre, et on s'arrête dès qu'un devis en dinars existe :
 *   1. capture + variante  — le plus précis (devis de la valeur choisie) ;
 *   2. capture seule       — le devis de la PAGE et les devis par valeur, sans
 *                            la porte « prix de la variante » ;
 *   3. la requête du WEB   — ni capture ni variante : la lecture que le web
 *                            reçoit pour la même fiche (servie du cache comme
 *                            lui). Aucune relecture forcée : `refresh` est
 *                            l'intention d'ADD, pas d'AFFICHAGE.
 * Aucun prix n'est calculé ici : on choisit seulement QUELLE lecture demander.
 */
export interface QuoteAttempt {
  /** Joindre la capture lue dans le navigateur du client. */
  capture: boolean;
  /** Demander le devis de la valeur choisie (exige une preuve par valeur). */
  withVariant: boolean;
  /** Relecture marchande forcée — réservée à l'intention « Add ». */
  refresh: boolean;
}

export function quoteReadPlan(input: {
  hasCapture: boolean;
  hasSelection: boolean;
}): QuoteAttempt[] {
  const attempts: QuoteAttempt[] = [];
  if (input.hasCapture) {
    if (input.hasSelection) attempts.push({ capture: true, withVariant: true, refresh: false });
    attempts.push({ capture: true, withVariant: false, refresh: false });
  }
  // La requête du web, telle quelle : c'est la référence quand l'application
  // n'affiche pas le prix que le web affiche.
  attempts.push({ capture: false, withVariant: false, refresh: false });
  return attempts;
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
    /* Aucun des deux n'a de devis de page : on garde les faits de la capture,
       mais on récupère du serveur les combinaisons (variant_details) et devis
       par valeur qu'il a pu lire. Sans cette fusion, l'essai final « comme le
       web » était bien fait mais ses cartes de variantes se perdaient ici. */
    return {
      ...fromCapture,
      availability: fromCapture.availability.state === 'UNKNOWN' && fromServer.availability.state !== 'UNKNOWN'
        ? fromServer.availability
        : fromCapture.availability,
      variantGroups: fromCapture.variantGroups.length ? fromCapture.variantGroups : fromServer.variantGroups,
      variantDetails: fromServer.variantDetails.length ? fromServer.variantDetails : fromCapture.variantDetails,
      variantQuotes: fromServer.variantQuotes.length ? fromServer.variantQuotes : fromCapture.variantQuotes,
    };
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
