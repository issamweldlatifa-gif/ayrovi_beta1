import { ScrapedProduct, StoreType, ProductVariants } from '../types';
import { fetchSafeRemote, readLimitedText, resolveSafeHttpUrl } from '../services/safeUrl';
import { parseProductPageHtml, type ParsedProductPage } from './productPageParser';
import { fetchRenderedProductPage, RenderedPageError } from './renderedPageFetcher';

interface MerchantScrapeResult {
  data: ParsedProductPage | null;
  verified: boolean;
  provider: 'direct' | 'none' | 'scraperapi' | 'scrapingbee' | 'brightdata';
  method: ParsedProductPage['priceSource'] | 'none';
  failureCode: string | null;
}

export class SmartLinkScraper {
  public cleanPastedUrl(input: string): string {
    if (!input || typeof input !== 'string') return '';
    const match = input.match(/https?:\/\/[^\s]+/i);
    if (match) {
      let url = match[0].trim();
      url = url.replace(/['"<>),;]+$/, '');
      return url;
    }
    return input.trim();
  }

  public async scrapeProduct(rawUrl: string): Promise<ScrapedProduct> {
    const cleanedInput = this.cleanPastedUrl(rawUrl);
    if (!cleanedInput) {
      throw new Error('Veuillez fournir une URL de produit valide.');
    }
    const safeTarget = await resolveSafeHttpUrl(cleanedInput);
    const cleanUrl = safeTarget.url.toString();

    const store = this.detectStore(cleanUrl);
    const storeName = this.getStoreDisplayName(store, cleanUrl);
    const externalIdFromUrl = this.extractSourceId(cleanUrl, store);

    const merchantResult = await this.scrapeWithHttp(cleanUrl, store);
    const liveData = merchantResult.data;
    const currency = /^[A-Z]{3}$/.test(String(liveData?.currency || '').toUpperCase())
      ? String(liveData!.currency).toUpperCase() : '';
    const title = liveData?.title && !this.isBotBlocked(liveData.title) ? liveData.title : '';
    const price = liveData?.price && liveData.price > 0 ? liveData.price : 0;
    const externalId = liveData?.externalId || externalIdFromUrl;
    const images = liveData?.images || [];
    const variants: ProductVariants = liveData?.variants || { sizes: [], colors: [], details: [] };
    // This adapter extracts merchant facts. AYROVI amounts are produced only by
    // calculateUnitQuote (server) — never guessed from URL country or static FX.
    const convertedPriceTND = 0, serviceFeeTND = 0, estimatedShippingTND = 0, totalPriceTND = 0;

    return {
      id: `scraped_${externalId || cleanUrl}`,
      store,
      storeName,
      url: cleanUrl,
      externalId,
      title: title.trim(),
      description: liveData?.description || null,
      images,
      colorImages: liveData?.colorImages || {},
      mainImage: images.length > 0 ? images[0] : '',
      sourcePrice: price,
      sourceCurrency: currency,
      referencePrice: liveData?.referencePrice ?? null,
      rating: liveData?.rating ?? null,
      reviewsCount: liveData?.reviewsCount ?? null,
      convertedPriceTND,
      serviceFeeTND,
      estimatedShippingTND,
      totalPriceTND,
      variants,
      availability: liveData?.availability || 'unknown',
      brand: liveData?.brand || null,
      priceVerified: merchantResult.verified && price > 0 && Boolean(currency),
      verificationProvider: merchantResult.provider,
      verificationMethod: merchantResult.method,
      verificationFailureCode: merchantResult.failureCode,
      scrapedAt: new Date().toISOString()
    };
  }

  private isBotBlocked(title: string): boolean {
    const lower = title.toLowerCase();
    return (
      lower.includes('503') ||
      lower.includes('page introuvable') ||
      lower.includes('robot check') ||
      lower.includes('service unavailable') ||
      lower.includes('mainly design and produce') ||
      lower.includes('explore the latest clothing') ||
      lower.includes('shop online fashion') ||
      lower.includes('women\'s & men\'s clothing') ||
      lower === 'amazon.fr' ||
      lower === 'amazon.co.jp' ||
      lower === 'amazon.com' ||
      lower === 'shein' ||
      lower === 'temu'
    );
  }

  /** Source ID only if the URL actually carries one; never generate random IDs. */
  private extractSourceId(rawUrl: string, store: StoreType): string | null {
    try {
      const target = new URL(rawUrl);
      const path = target.pathname;
      if (store === 'amazon') return path.match(/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i)?.[1] ?? null;
      if (store === 'shein') return path.match(/-p-(\d+)\.html/i)?.[1] ?? target.searchParams.get('goods_id');
      if (store === 'temu') return path.match(/-([0-9]{6,})\.html/i)?.[1] ?? null;
      return null;
    } catch { return null; }
  }

  private async scrapeWithHttp(url: string, storeType: StoreType): Promise<MerchantScrapeResult> {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    };
    let directResult: ParsedProductPage | null = null;
    let directFailure = 'DIRECT_PRICE_NOT_FOUND';
    try {
      const response = await fetchSafeRemote(url, { signal: AbortSignal.timeout(7_000), headers });
      if (!response.ok) throw new Error(`DIRECT_HTTP_${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        throw new Error('DIRECT_NOT_HTML');
      }
      directResult = parseProductPageHtml(await readLimitedText(response, 2_000_000), url, storeType);
      if (directResult.price > 0) {
        return { data: directResult, verified: true, provider: 'direct', method: directResult.priceSource, failureCode: null };
      }
    } catch (error: any) {
      directFailure = String(error?.message || error?.code || 'DIRECT_UNAVAILABLE').slice(0, 80);
    }

    try {
      const rendered = await fetchRenderedProductPage(url);
      const parsed = parseProductPageHtml(rendered.html, url, storeType);
      if (parsed.price > 0) {
        return { data: parsed, verified: true, provider: rendered.provider, method: parsed.priceSource, failureCode: null };
      }
      return {
        data: parsed.title || parsed.images.length ? parsed : directResult,
        verified: false,
        provider: rendered.provider,
        method: 'none',
        failureCode: 'PRICE_NOT_FOUND_AFTER_RENDER',
      };
    } catch (error: any) {
      const code = error instanceof RenderedPageError ? error.code : 'RENDER_UPSTREAM_ERROR';
      const provider = error instanceof RenderedPageError && error.provider ? error.provider : 'none';
      return {
        data: directResult,
        verified: false,
        provider,
        method: 'none',
        failureCode: code === 'RENDER_PROVIDER_NOT_CONFIGURED' && directFailure !== 'DIRECT_PRICE_NOT_FOUND'
          ? directFailure
          : code,
      };
    }
  }

  private detectStore(url: string): StoreType {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      if (hostname.includes('amazon.')) return 'amazon';
      if (hostname.includes('shein.')) return 'shein';
      if (hostname.includes('temu.')) return 'temu';
      if (hostname.includes('aliexpress.')) return 'aliexpress';
    } catch {
      if (/amazon\./i.test(url)) return 'amazon';
      if (/shein\./i.test(url)) return 'shein';
      if (/temu\./i.test(url)) return 'temu';
    }
    return 'generic';
  }

  private getStoreDisplayName(store: StoreType, url: string): string {
    if (store === 'amazon') {
      if (url.includes('.co.jp')) return 'Amazon Japan';
      if (url.includes('.fr')) return 'Amazon France';
      if (url.includes('.com') && !url.includes('/fr/')) return 'Amazon USA';
      return 'Amazon';
    }
    if (store === 'shein') return 'SHEIN';
    if (store === 'temu') return 'TEMU';
    if (store === 'aliexpress') return 'AliExpress';
    return 'Boutique Internationale';
  }

}
