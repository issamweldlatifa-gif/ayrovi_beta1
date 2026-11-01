import type { AyWebsAdapterId } from '../../../shared/aywebsStores';
import { AyWebsCaptureError, type AyWebsPageClassification, type AyWebsSourceProduct } from './contract';
import { BaseStoreAdapter } from './base';

/**
 * AYWEBs — ADAPTATEUR ZALANDO (porté le 25/10/2026).
 *
 * ── POURQUOI UN ADAPTATEUR, ET PAS LA LECTURE GÉNÉRIQUE ─────────────────────
 * Zalando était présent au registre comme « boutique de la vague 1 » : reconnu
 * par un motif d'URL, lu par la chaîne générique. Résultat constaté : la fiche
 * ouvre bien la page, mais la capture ne publie **aucun prix**, parce que le
 * prix Zalando n'est ni dans `productLd.offers` (le groupe n'en porte pas), ni
 * dans une meta fiable : il vit sur les VARIANTES (`hasVariant[].offers`).
 * Le lecteur de page descend maintenant dans ces offres (`collectProductOffers`
 * dans `productPageParser`) ; cet adaptateur apporte ce que le motif d'URL ne
 * peut pas donner :
 *
 *   • la reconnaissance EXACTE d'une fiche (`<slug>-<sku>.html`), donc un refus
 *     net d'une page de catalogue au lieu d'une lecture qui échoue en silence ;
 *   • une identité source stable (`ZALANDO-<sku>`) : deux liens de la même
 *     fiche (paramètres de suivi, couleur de campagne) désignent le même article ;
 *   • le refus explicite quand l'URL n'est pas une fiche, au lieu d'un prix 0.
 *
 * ── CE QU'IL NE FAIT PAS ───────────────────────────────────────────────────
 *   • il n'achète rien : Zalando reste en revue humaine (§48) ;
 *   • il ne devine pas de prix : sans offre publiée, la fiche le DIT (`price: 0`)
 *     et le serveur refuse la capture — jamais un montant inventé ;
 *   • il ne reconnaît que les domaines du registre en EUR (fr, de, it, es, nl,
 *     be, at). Un `zalando.ch` (CHF) ou `zalando.se` (SEK) n'est pas réclamé :
 *     publier un prix en euros pour une fiche en francs serait un mensonge.
 */

/** SKU marchand de la fiche : la partie après le dernier tiret, avant `.html`. */
const ZALANDO_SKU = /-([a-z0-9]{5,}-[a-z0-9]{2,})\.html$/i;

export function zalandoSkuFromUrl(url: string | URL): string | null {
  let parsed: URL;
  try {
    parsed = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return null;
  }
  const match = parsed.pathname.match(ZALANDO_SKU);
  return match ? match[1].toUpperCase() : null;
}

export class ZalandoAdapter extends BaseStoreAdapter {
  readonly id: AyWebsAdapterId = 'zalando';

  /**
   * Fiche Zalando : `<slug>-<sku>.html`, où le SKU est composé d'un code
   * produit puis d'une couleur (`ni121d0a2-q11`). Un `/catalog/` ou une page
   * de marque ne correspond pas — et n'est donc pas « une fiche qu'on n'a pas
   * su lire ».
   */
  isProductPage(url: URL): boolean {
    return ZALANDO_SKU.test(url.pathname);
  }

  protected isSearchPage(url: URL): boolean {
    return /^\/catalog\/?$/i.test(url.pathname) || Boolean(url.searchParams.get('q'));
  }

  classifyPage(url: string | URL): AyWebsPageClassification {
    const base = super.classifyPage(url);
    // Une fiche reconnue par le motif est une FICHE : le slug peut contenir
    // « login » ou « cart » (nom de produit) sans que ce soit une page d'accès.
    if (base.pageType === 'LOGIN' || base.pageType === 'CHECKOUT' || base.pageType === 'CAPTCHA') {
      try {
        const parsed = typeof url === 'string' ? new URL(url) : url;
        if (this.canHandle(parsed) && this.isProductPage(parsed)) {
          return { pageType: 'PRODUCT', storeId: this.id, isProductPage: true, reason: 'motif_fiche_zalando', customerActionRequired: 'NONE' };
        }
      } catch { /* URL illisible : on garde la classification de base */ }
    }
    return base;
  }

  /** Identité source : `ZALANDO-<sku>` — stable d'un lien à l'autre. */
  sourceProductId(url: string | URL): string | null {
    const sku = zalandoSkuFromUrl(url);
    return sku ? `ZALANDO-${sku}` : null;
  }

  async resolveProduct(url: string, options = {}): Promise<AyWebsSourceProduct> {
    if (!this.isProductPage(new URL(url))) {
      throw new AyWebsCaptureError('PRODUCT_PAGE_REQUIRED', 'Lien Zalando : la fiche produit est requise (…-<sku>.html).');
    }
    const product = await super.resolveProduct(url, options);
    // L'identité publiée par la page gagne ; le SKU de l'URL prend le relais
    // quand la fiche ne publie pas de référence exploitable.
    if (!product.sourceProductId) {
      const sku = this.sourceProductId(url);
      if (sku) product.sourceProductId = sku;
    }
    return product;
  }
}
