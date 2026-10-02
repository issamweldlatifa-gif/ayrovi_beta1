import type { AyWebsAdapterId } from '../../../shared/aywebsStores';
import { BaseStoreAdapter } from './base';

/** AliExpress — `/item/<id>.html`, `/i/<id>.html` ou `productId`. Motifs V1 conservés. */
export class AliExpressAdapter extends BaseStoreAdapter {
  readonly id: AyWebsAdapterId = 'aliexpress';

  isProductPage(url: URL): boolean {
    return /\/(?:item|i)\/\d{6,}\.html(?:[/?]|$)/i.test(url.pathname)
      || /^\d{6,}$/.test(url.searchParams.get('productId') || '');
  }

  protected isSearchPage(url: URL): boolean {
    return /^\/(?:wholesale|w)\b/i.test(url.pathname) || Boolean(url.searchParams.get('SearchText'));
  }
}
