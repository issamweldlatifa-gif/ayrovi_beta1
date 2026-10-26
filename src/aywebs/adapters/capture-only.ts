import type { ScrapeOptions } from '../../scraper/scraper';
import { BaseStoreAdapter } from './base';
import { AyWebsCaptureError, type AyWebsSourceProduct } from './contract';

/**
 * Base for stores whose first reader is the customer's visible WebView.
 *
 * It deliberately does not invent URL patterns or silently use the generic
 * server scraper. Product identity must be established by a validated capture;
 * server-side resolution can be added per store once it has verified fixtures.
 */
export abstract class CaptureOnlyStoreAdapter extends BaseStoreAdapter {
  isProductPage(_url: URL): boolean {
    return false;
  }

  resolveProduct(_url: string, _options: ScrapeOptions = {}): Promise<AyWebsSourceProduct> {
    return Promise.reject(new AyWebsCaptureError(
      'PRODUCT_PAGE_REQUIRED',
      `La fiche ${this.store?.displayName || this.id} doit être lue dans le navigateur de l’application.`,
    ));
  }
}
