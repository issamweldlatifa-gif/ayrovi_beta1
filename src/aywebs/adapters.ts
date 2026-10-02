import type { SmartLinkScraper } from '../scraper/scraper';
import type { ScrapedProduct } from '../types';
import type { AyWebsAdapterId, AyWebsStoreDefinition } from '../../shared/aywebsStores';

export type AyWebsCaptureErrorCode = 'PRODUCT_PAGE_REQUIRED' | 'ADAPTER_UNAVAILABLE' | 'STORE_MISMATCH';

export class AyWebsCaptureError extends Error {
  constructor(readonly code: AyWebsCaptureErrorCode, message: string) {
    super(message);
    this.name = 'AyWebsCaptureError';
  }
}

export interface AyWebsStoreAdapter {
  readonly id: AyWebsAdapterId;
  isProductPage(url: URL): boolean;
  capture(url: string): Promise<ScrapedProduct>;
}

/**
 * Every store adapter owns only URL recognition and source identity. The shared
 * extraction priority remains in SmartLinkScraper: structured data/embedded
 * state, DOM/meta, Jina, then an allowlisted rendered-page provider.
 */
abstract class SmartScraperStoreAdapter implements AyWebsStoreAdapter {
  abstract readonly id: AyWebsAdapterId;
  abstract isProductPage(url: URL): boolean;

  constructor(protected readonly scraper: SmartLinkScraper) {}

  async capture(url: string): Promise<ScrapedProduct> {
    const product = await this.scraper.scrapeProduct(url);
    if (product.store !== this.id) {
      throw new AyWebsCaptureError('STORE_MISMATCH', `Le lien ne correspond pas à une fiche ${this.id} prise en charge.`);
    }
    return product;
  }
}

export class AmazonAdapter extends SmartScraperStoreAdapter {
  readonly id = 'amazon' as const;

  isProductPage(url: URL): boolean {
    return /\/(?:dp|gp\/(?:product|aw\/d)|product)\/[A-Z0-9]{10}(?:[/?]|$)/i.test(url.pathname);
  }
}

export class SheinAdapter extends SmartScraperStoreAdapter {
  readonly id = 'shein' as const;

  isProductPage(url: URL): boolean {
    return /-p-\d+\.html(?:[/?]|$)/i.test(url.pathname)
      || /\/\d+\.html(?:[/?]|$)/i.test(url.pathname)
      || /^\d+$/.test(url.searchParams.get('goods_id') || '');
  }
}

export class TemuAdapter extends SmartScraperStoreAdapter {
  readonly id = 'temu' as const;

  isProductPage(url: URL): boolean {
    const goodsId = url.searchParams.get('goods_id') || url.searchParams.get('goodsId') || '';
    return /^\d{6,}$/.test(goodsId)
      || /\/(?:goods-[^/]+-\d+|g-\d+)\.html(?:[/?]|$)/i.test(url.pathname)
      || (/\/goods\.html$/i.test(url.pathname) && /^\d{6,}$/.test(goodsId));
  }
}

export class AliExpressAdapter extends SmartScraperStoreAdapter {
  readonly id = 'aliexpress' as const;

  isProductPage(url: URL): boolean {
    return /\/(?:item|i)\/\d{6,}\.html(?:[/?]|$)/i.test(url.pathname)
      || /^\d{6,}$/.test(url.searchParams.get('productId') || '');
  }
}

export function createAyWebsAdapter(
  store: AyWebsStoreDefinition,
  scraper: SmartLinkScraper,
): AyWebsStoreAdapter {
  switch (store.adapter) {
    case 'amazon': return new AmazonAdapter(scraper);
    case 'shein': return new SheinAdapter(scraper);
    case 'temu': return new TemuAdapter(scraper);
    case 'aliexpress': return new AliExpressAdapter(scraper);
    default:
      throw new AyWebsCaptureError('ADAPTER_UNAVAILABLE', 'La capture de cette boutique n’est pas encore disponible.');
  }
}
