import type { AyWebsAdapterId } from '../../../shared/aywebsStores';
import type { ScrapeOptions } from '../../scraper/scraper';
import type { ScrapedProduct } from '../../types';
import { BaseStoreAdapter } from './base';

/**
 * SHEIN — fiche produit `-p-<id>…html`, `/<id>.html` ou `goods_id`.
 *
 * Les liens réellement partagés par SHEIN portent des segments supplémentaires
 * avant l'extension (`…-p-382460229-cat-2030.html`, parfois `-sc-…`) : un motif
 * trop strict renvoyait UNKNOWN sur une vraie fiche produit, ce qui faisait perdre
 * la détection au client. On garde l'ancre `-p-<chiffres>` (pas de faux positif sur
 * une page de catégorie) et on accepte la suite du segment jusqu'à `.html`.
 */
export class SheinAdapter extends BaseStoreAdapter {
  readonly id: AyWebsAdapterId = 'shein';

  isProductPage(url: URL): boolean {
    return /-p-\d+[^/]*\.html(?:[/?]|$)/i.test(url.pathname)
      || /\/\d+\.html(?:[/?]|$)/i.test(url.pathname)
      || /^\d+$/.test(url.searchParams.get('goods_id') || '');
  }

  protected isSearchPage(url: URL): boolean {
    return /^\/(?:pdsearch|recommend)\b/i.test(url.pathname) || Boolean(url.searchParams.get('key'));
  }

  async capture(url: string, options: ScrapeOptions = {}): Promise<ScrapedProduct> {
    return this.captureMerchantProduct(url, options, (page) => {
      const id = page.searchParams.get('goods_id')?.match(/^\d+$/)?.[0]
        || page.pathname.match(/-p-(\d+)[^/]*\.html/i)?.[1]
        || page.pathname.match(/\/(\d+)\.html$/i)?.[1]
        || '';
      return id ? `SH-${id}` : '';
    });
  }
}
