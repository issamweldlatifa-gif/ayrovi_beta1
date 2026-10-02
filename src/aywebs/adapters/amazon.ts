import type { AyWebsAdapterId } from '../../../shared/aywebsStores';
import { BaseStoreAdapter } from './base';

/**
 * Amazon — reconnaissance de fiche produit et de recherche.
 * Motifs V1 conservés à l'identique : `/dp/`, `/gp/product/`, `/gp/aw/d/`,
 * `/product/` suivis d'un ASIN de 10 caractères.
 */
export class AmazonAdapter extends BaseStoreAdapter {
  readonly id: AyWebsAdapterId = 'amazon';

  isProductPage(url: URL): boolean {
    return /\/(?:dp|gp\/(?:product|aw\/d)|product)\/[A-Z0-9]{10}(?:[/?]|$)/i.test(url.pathname);
  }

  protected isSearchPage(url: URL): boolean {
    return /^\/s(?:\/|$)/i.test(url.pathname) || Boolean(url.searchParams.get('k'));
  }
}
