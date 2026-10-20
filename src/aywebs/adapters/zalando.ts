import type { ScrapeOptions } from '../../scraper/scraper';
import type { ScrapedProduct } from '../../types';
import { BaseStoreAdapter } from './base';

/**
 * Zalando — fiche produit terminée par le SKU marchand (`<article>-<sku>.html`).
 *
 * Le domaine est restreint par le Store Registry (.fr et .de pour cette
 * première étape). Le prix, la devise, les variantes et le stock restent lus par
 * la chaîne commune du marchand; aucun achat automatique n'est simulé.
 */
export class ZalandoAdapter extends BaseStoreAdapter {
  readonly id = 'zalando' as const;

  isProductPage(url: URL): boolean {
    return /\/(?:p\/)?[a-z0-9][a-z0-9-]*-[a-z0-9]{5,}-[a-z0-9]{2,}\.html(?:$|\/)/i.test(url.pathname);
  }

  protected isSearchPage(url: URL): boolean {
    return /^\/catalog\/?$/i.test(url.pathname) || Boolean(url.searchParams.get('q'));
  }

  async capture(url: string, options: ScrapeOptions = {}): Promise<ScrapedProduct> {
    return this.captureMerchantProduct(url, options, (page) => {
      const match = page.pathname.match(/-([a-z0-9]{5,}-[a-z0-9]{2,})\.html$/i);
      return match ? `ZALANDO-${match[1].toUpperCase()}` : '';
    });
  }
}
