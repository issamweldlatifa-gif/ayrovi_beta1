import type { AyWebsAdapterId } from '../../../shared/aywebsStores';
import type { ScrapeOptions } from '../../scraper/scraper';
import type { AyWebsPageClassification, AyWebsSourceProduct } from './contract';
import { AyWebsCaptureError } from './contract';
import { BaseStoreAdapter } from './base';

/**
 * AliExpress v2 — identité, reconnaissance de fiche et clé de cache (28/10/2026).
 *
 * ── Formes d'URL réellement servies par AliExpress ──────────────────────────
 *   • `https://www.aliexpress.com/item/1005007777777777.html`
 *   • `https://fr.aliexpress.com/item/1005007777777777.html?spm=…&sku_id=12000039`
 *   • `https://m.aliexpress.com/item/1005007777777777.html`
 *   • `https://www.aliexpress.us/item/3256806900000000.html`
 *   • `https://www.aliexpress.com/i/1005007777777777.html`
 *   • `https://www.aliexpress.com/ssr/300000512/item/1005007777777777.html`
 *   • `https://www.aliexpress.com/store/product/<slug>/<storeId>_1005007777777777.html`
 *   • paramètres `productId`, `itemId` ou `item_id` (liens d'application / landing)
 */
export class AliExpressAdapter extends BaseStoreAdapter {
  readonly id: AyWebsAdapterId = 'aliexpress';

  isProductPage(url: URL): boolean {
    return aliexpressItemId(url) !== null;
  }

  protected isSearchPage(url: URL): boolean {
    return /^\/(?:wholesale|w|af|category)\b/i.test(url.pathname)
      || Boolean(url.searchParams.get('SearchText') || url.searchParams.get('searchText'));
  }

  /**
   * L'identifiant d'article (`/item/<id>.html`, `/i/<id>.html`, `productId`)
   * prime sur tout mot-clé parasite dans les paramètres de suivi (`cart`,
   * `login`, `order`, `auth`).
   */
  classifyPage(url: string | URL): AyWebsPageClassification {
    let parsed: URL;
    try {
      parsed = typeof url === 'string' ? new URL(url) : url;
    } catch {
      return super.classifyPage(url);
    }
    if (aliexpressItemId(parsed) !== null && this.canHandle(parsed)) {
      return {
        pageType: 'PRODUCT',
        storeId: this.id,
        isProductPage: true,
        reason: 'item_id_fiche_produit',
        customerActionRequired: 'NONE',
      };
    }
    return super.classifyPage(parsed);
  }

  /** Clé de cache canonique : `/item/<id>.html` sans paramètres de suivi (`spm`, `pdp_npi`…). */
  canonicalUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const itemId = aliexpressItemId(parsed);
      if (!itemId) return null;
      return `https://${aliexpressCanonicalHost(parsed.hostname)}/item/${itemId}.html`;
    } catch {
      return null;
    }
  }

  /** Identité source stable : `AE-<itemId>`. */
  sourceProductId(url: string | URL): string | null {
    try {
      const parsed = typeof url === 'string' ? new URL(url) : url;
      const itemId = aliexpressItemId(parsed);
      return itemId ? `AE-${itemId}` : null;
    } catch {
      return null;
    }
  }

  async resolveProduct(url: string, options: ScrapeOptions = {}): Promise<AyWebsSourceProduct> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new AyWebsCaptureError('PRODUCT_PAGE_REQUIRED', 'Lien AliExpress illisible.');
    }
    if (!this.isProductPage(parsed)) {
      throw new AyWebsCaptureError('PRODUCT_PAGE_REQUIRED', 'Lien AliExpress : la fiche produit est requise (…/item/<id>.html).');
    }
    const product = await super.resolveProduct(this.canonicalUrl(url) ?? url, options);
    if (!product.sourceProductId) product.sourceProductId = this.sourceProductId(parsed);
    return product;
  }
}

/** Identifiant d'article AliExpress (`6..20` chiffres), ou `null` hors fiche. */
export function aliexpressItemId(url: URL): string | null {
  const fromPath = url.pathname.match(/\/(?:item|i)\/(\d{6,20})\.html(?:[/?]|$)/i)
    || url.pathname.match(/\/store\/product\/[^/]+\/(?:\d+_)?(\d{6,20})\.html(?:[/?]|$)/i);
  if (fromPath) return fromPath[1];
  const fromQuery = String(
    url.searchParams.get('productId')
    || url.searchParams.get('itemId')
    || url.searchParams.get('item_id')
    || '',
  ).trim();
  if (/^\d{6,20}$/.test(fromQuery)) return fromQuery;
  return null;
}

/**
 * URL d'un SKU spécifique AliExpress (`?sku_id=<skuId>`) sur le MÊME hôte que
 * `sourceUrl` (`fr.aliexpress.com`, `m.aliexpress.com`, `www.aliexpress.us`…)
 * afin que toute relecture WebView préserve hôte, langue et devise.
 */
export function aliexpressSkuUrl(sourceUrl: string, skuId: string): string | null {
  const cleanSku = String(skuId || '').trim().replace(/^ae:/i, '');
  if (!/^\d{5,24}$/.test(cleanSku)) return null;
  try {
    const parsed = new URL(sourceUrl);
    if (!/(^|\.)aliexpress\.(com|us|ru)$/i.test(parsed.hostname)) return null;
    const itemId = aliexpressItemId(parsed);
    if (!itemId) return null;
    const protocol = parsed.protocol === 'http:' ? 'http:' : 'https:';
    return `${protocol}//${parsed.host}/item/${itemId}.html?sku_id=${cleanSku}`;
  } catch {
    return null;
  }
}

function aliexpressCanonicalHost(hostname: string): string {
  const clean = String(hostname || '').trim().toLowerCase().replace(/\.+$/, '');
  if (clean === 'aliexpress.us' || clean.endsWith('.aliexpress.us')) return 'www.aliexpress.us';
  if (clean === 'aliexpress.ru' || clean.endsWith('.aliexpress.ru')) return 'aliexpress.ru';
  return 'www.aliexpress.com';
}
