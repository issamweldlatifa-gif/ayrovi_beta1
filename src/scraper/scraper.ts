import { ScrapedProduct, StoreType, ProductVariants } from '../types';
import { fetchSafeRemote, readLimitedText, resolveSafeHttpUrl } from '../services/safeUrl';
import { parseProductPageHtml } from './productPageParser';

export class SmartLinkScraper {
  public static readonly RATES_TO_TND: Record<string, number> = {
    EUR: 4.00,
    USD: 4.00,
    JPY: 0.0265, // 100 JPY = 2.65 TND
    GBP: 4.80,
    CAD: 2.95,
    CHF: 4.20,
    TND: 1.0
  };

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
    let currency = this.detectCurrencyFromUrl(cleanUrl);

    const urlInfo = this.extractDeepUrlInfo(cleanUrl, store);

    let liveData: any = null;
    try {
      liveData = await this.scrapeWithHttp(cleanUrl, store);
    } catch (err: any) {
      console.warn('[Live Scraper Note]', err.message);
    }
    const detectedLiveCurrency = String(liveData?.currency || '').toUpperCase();
    if (detectedLiveCurrency && Object.hasOwn(SmartLinkScraper.RATES_TO_TND, detectedLiveCurrency)) {
      currency = detectedLiveCurrency;
    }

    const title = (liveData && liveData.title && !this.isBotBlocked(liveData.title))
      ? liveData.title
      : urlInfo.title;

    const price = (liveData && liveData.price && liveData.price > 0)
      ? liveData.price
      : urlInfo.price;

    const externalId = (liveData && liveData.externalId) ? liveData.externalId : urlInfo.externalId;

    const images = (liveData && liveData.images && liveData.images.length > 0)
      ? liveData.images
      : [];

    const liveVariants: ProductVariants | null = liveData?.variants || null;
    const hasLiveVariants = Boolean(
      liveVariants?.sizes?.length || liveVariants?.colors?.length || liveVariants?.details?.length,
    );
    const variants: ProductVariants = hasLiveVariants ? liveVariants! : urlInfo.variants;

    const rate = SmartLinkScraper.RATES_TO_TND[currency] || 4.00;
    const convertedPriceTND = price > 0 ? Math.round(price * rate * 100) / 100 : 0;
    const serviceFeeTND = price > 0 ? Math.round((Math.max(10, convertedPriceTND * 0.08)) * 100) / 100 : 0;
    const estimatedShippingTND = price > 0 ? 25.00 : 0;
    const totalPriceTND = price > 0 ? Math.round((convertedPriceTND + serviceFeeTND + estimatedShippingTND) * 100) / 100 : 0;

    return {
      id: 'scraped_' + Date.now(),
      store,
      storeName,
      url: cleanUrl,
      externalId,
      title: title.trim(),
      description: `Article extrait depuis ${storeName}. Vérifié par AYROVI.`,
      images,
      mainImage: images.length > 0 ? images[0] : '',
      sourcePrice: Math.round(price * 100) / 100,
      sourceCurrency: currency,
      convertedPriceTND,
      serviceFeeTND,
      estimatedShippingTND,
      totalPriceTND,
      variants,
      availability: liveData?.availability || 'in_stock',
      brand: urlInfo.brand || storeName.split(' ')[0],
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

  private extractDeepUrlInfo(rawUrl: string, store: StoreType): { title: string; brand: string; price: number; externalId: string; variants: ProductVariants } {
    try {
      const url = new URL(rawUrl);
      const path = url.pathname;
      const parts = path.split('/').filter(Boolean);

      if (store === 'shein') {
        const match = path.match(/-p-(\d+)\.html/i) || path.match(/\/(\d+)\.html/i) || url.search.match(/[?&]goods_id=(\d+)/i);
        const goodsId = match ? match[1] : ('SH-' + Math.floor(Math.random() * 899999 + 100000));

        let slug = parts[parts.length - 1]
          .replace(/-p-\d+\.html.*/i, '')
          .replace(/\.html.*/i, '')
          .replace(/-/g, ' ');

        if ((slug === 'goods' || slug.length < 3) && parts.length >= 2) {
          slug = parts[parts.length - 2].replace(/-/g, ' ');
        }

        let formatted = slug
          .replace(/\bwomen\s+s\b/gi, "Women's")
          .replace(/\bmen\s+s\b/gi, "Men's")
          .replace(/\b2\s+piece\b/gi, "2-Piece")
          .replace(/\bshort\s+sleeve\b/gi, "Short-Sleeve");

        formatted = formatted.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        const words = formatted.split(' ');
        let brand = 'SHEIN';
        let title = formatted;
        if (words.length > 2) {
          brand = words[0];
          title = `${brand} — ${words.slice(1).join(' ')}`;
        }

        return {
          title,
          brand,
          price: 0,
          externalId: `SH-${goodsId}`,
          // Never infer variants from a URL slug. Only merchant-page values are shown.
          variants: { sizes: [], colors: [], details: [] },
        };
      }

      if (store === 'amazon') {
        const asinMatch = path.match(/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i);
        const asin = asinMatch ? asinMatch[1] : ('B0' + Math.floor(Math.random() * 89999999 + 10000000));

        let titleSlug = '';
        if (parts.length >= 2 && parts[0] !== 'dp') {
          titleSlug = decodeURIComponent(parts[0]).replace(/-/g, ' ');
        }

        const title = titleSlug.length > 3 ? titleSlug : 'Produit Amazon';

        return {
          title,
          brand: 'Amazon',
          price: 0,
          externalId: asin,
          variants: {
            sizes: [],
            colors: []
          }
        };
      }

      if (store === 'temu') {
        const match = path.match(/goods-([a-z0-9-]+)-([0-9]+)\.html/i) || path.match(/-([0-9]{6,})\.html/i);
        const id = match ? match[2] || match[1] : ('TM-' + Math.floor(Math.random() * 899999 + 100000));

        let slug = parts[parts.length - 1]
          .replace(/goods-/i, '')
          .replace(/-\d+\.html.*/i, '')
          .replace(/\.html.*/i, '')
          .replace(/-/g, ' ');

        const title = slug.length > 3
          ? slug.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
          : 'Offre TEMU';

        return {
          title: `TEMU — ${title}`,
          brand: 'TEMU',
          price: 0,
          externalId: `TEMU-${id}`,
          variants: {
            sizes: [],
            colors: []
          }
        };
      }
    } catch {}

    return {
      title: 'Article Boutique Internationale',
      brand: 'Boutique',
      price: 0,
      externalId: 'ITEM-' + Math.floor(Math.random() * 899999 + 100000),
      variants: {
        sizes: [],
        colors: []
      }
    };
  }

  private async scrapeWithHttp(url: string, storeType: StoreType): Promise<any> {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    };
    let directResult: any = null;
    let directError: Error | null = null;
    try {
      const response = await fetchSafeRemote(url, { signal: AbortSignal.timeout(7_000), headers });
      if (!response.ok) throw new Error(`REMOTE_HTTP_${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        throw new Error('REMOTE_NOT_HTML');
      }
      directResult = parseProductPageHtml(await readLimitedText(response, 2_000_000), url, storeType);
      if (directResult.price > 0) return directResult;
    } catch (error: any) {
      directError = error instanceof Error ? error : new Error('REMOTE_UNAVAILABLE');
    }

    // Optional fallback recommended by the technical brief for Akamai/Cloudflare
    // shops. The key remains server-side; without it the normal safe fetch stays active.
    const scraperApiKey = process.env.SCRAPERAPI_KEY?.trim();
    if (scraperApiKey) {
      const country = /^[a-z]{2}$/i.test(process.env.AYROVIX_SCRAPER_COUNTRY || '')
        ? String(process.env.AYROVIX_SCRAPER_COUNTRY).toLowerCase()
        : 'fr';
      const params = new URLSearchParams({
        api_key: scraperApiKey,
        url,
        render: 'true',
        country_code: country,
      });
      const response = await fetch(`https://api.scraperapi.com/?${params.toString()}`, {
        signal: AbortSignal.timeout(12_000),
        headers: { 'Accept': 'text/html,application/xhtml+xml' },
      });
      if (response.ok) {
        const proxied = parseProductPageHtml(await readLimitedText(response, 2_000_000), url, storeType);
        if (proxied.price > 0 || !directResult) return proxied;
      } else {
        await response.body?.cancel().catch(() => undefined);
      }
    }
    if (directResult) return directResult;
    throw directError || new Error('REMOTE_UNAVAILABLE');
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

  private detectCurrencyFromUrl(url: string): string {
    if (url.includes('.co.jp') || url.includes('japan')) return 'JPY';
    if (url.includes('.co.uk')) return 'GBP';
    if (url.includes('/fr/') || url.includes('.fr') || url.includes('shein.com/fr')) return 'EUR';
    if (url.includes('.de') || url.includes('.es') || url.includes('.it')) return 'EUR';
    if (url.includes('.com')) return 'USD';
    return 'EUR';
  }
}
