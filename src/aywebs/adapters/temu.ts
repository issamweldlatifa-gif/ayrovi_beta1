import type { AyWebsAdapterId } from '../../../shared/aywebsStores';
import { BaseStoreAdapter } from './base';

/** TEMU — `goods_id` long, `goods-*-<id>.html` ou `g-<id>.html`. Motifs V1 conservés. */
export class TemuAdapter extends BaseStoreAdapter {
  readonly id: AyWebsAdapterId = 'temu';

  isProductPage(url: URL): boolean {
    const goodsId = url.searchParams.get('goods_id') || url.searchParams.get('goodsId') || '';
    return /^\d{6,}$/.test(goodsId)
      || /\/(?:goods-[^/]+-\d+|g-\d+)\.html(?:[/?]|$)/i.test(url.pathname)
      || (/\/goods\.html$/i.test(url.pathname) && /^\d{6,}$/.test(goodsId));
  }

  protected isSearchPage(url: URL): boolean {
    return /search_result\.html$/i.test(url.pathname) || Boolean(url.searchParams.get('search_key'));
  }
}
