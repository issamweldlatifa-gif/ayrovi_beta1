import { JSDOM } from 'jsdom';
import { ScrapedProduct, StoreType, ProductVariants } from '../types';
import { fetchSafeRemote, readLimitedText, resolveSafeHttpUrl } from '../services/safeUrl';

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

    const variants: ProductVariants = (liveData && liveData.variants && Object.keys(liveData.variants).length > 0)
      ? liveData.variants
      : urlInfo.variants;

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
      availability: 'in_stock',
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

        const colors: string[] = [];
        ['beige', 'black', 'cream', 'white', 'pink', 'blue', 'green', 'grey', 'khaki', 'red', 'purple', 'brown', 'noir', 'blanc', 'rose', 'bleu'].forEach(c => {
          if (formatted.toLowerCase().includes(c)) {
            colors.push(c.charAt(0).toUpperCase() + c.slice(1));
          }
        });

        return {
          title,
          brand,
          price: 0,
          externalId: `SH-${goodsId}`,
          variants: {
            sizes: ['S', 'M', 'L', 'XL'],
            colors: colors.length > 0 ? colors : []
          }
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
    const response = await fetchSafeRemote(url, {
      signal: AbortSignal.timeout(7_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
    });
    if (!response.ok) throw new Error(`REMOTE_HTTP_${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('REMOTE_NOT_HTML');
    }
    const html = await readLimitedText(response, 2_000_000);
    const dom = new JSDOM(html, { url });
    try {
      const document = dom.window.document;
      const meta = (selector: string) => document.querySelector(selector)?.getAttribute('content')?.trim() || '';
      const text = (selector: string) => document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const parsePrice = (raw: unknown): number => {
        const normalized = String(raw || '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
        if (!normalized) return 0;
        const decimal = normalized.includes(',') && !normalized.includes('.') ? normalized.replace(',', '.') : normalized.replace(/,/g, '');
        const value = Number.parseFloat(decimal);
        return Number.isFinite(value) && value > 0 && value < 1_000_000 ? value : 0;
      };

      let title = meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]')
        || text('#productTitle, h1.product-title-word-break, h1, [class*="product-intro__name"], [class*="goods-name"]')
        || document.title;
      title = title.replace(/\s*\|\s*(SHEIN|Amazon|TEMU|AliExpress).*$/i, '').replace(/\s*:\s*Amazon\.[a-z.]+/i, '').trim();

      const jsonLd: any[] = [];
      for (const node of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 20)) {
        try {
          const parsed = JSON.parse(node.textContent || 'null');
          if (Array.isArray(parsed)) jsonLd.push(...parsed);
          else if (parsed?.['@graph'] && Array.isArray(parsed['@graph'])) jsonLd.push(...parsed['@graph']);
          else if (parsed) jsonLd.push(parsed);
        } catch { /* malformed merchant JSON-LD */ }
      }
      const productLd = jsonLd.find((item) => {
        const type = item?.['@type'];
        return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
      });
      const offers = Array.isArray(productLd?.offers) ? productLd.offers[0] : productLd?.offers;

      const selectorPrice = storeType === 'amazon'
        ? text('.apexPriceToPay .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen, #priceblock_dealprice, #newBuyBoxPrice')
        : storeType === 'shein'
          ? text('.original, .del-price, [style*="line-through"], [class*="price"]')
          : text('[itemprop="price"], [class*="price"]');
      const price = parsePrice(
        meta('meta[property="product:price:amount"]') || meta('meta[itemprop="price"]')
        || offers?.price || offers?.lowPrice || selectorPrice,
      );
      const currency = String(
        meta('meta[property="product:price:currency"]') || offers?.priceCurrency || '',
      ).trim().toUpperCase();

      const imageCandidates = [
        meta('meta[property="og:image"]'),
        meta('meta[name="twitter:image"]'),
        String(productLd?.image?.url || productLd?.image?.[0] || productLd?.image || ''),
        document.querySelector('#landingImage, #main-image, img[data-old-hires], img[class*="main-img"]')?.getAttribute('data-old-hires') || '',
        document.querySelector('#landingImage, #main-image, img[class*="main-img"]')?.getAttribute('src') || '',
      ];
      const images = [...new Set(imageCandidates.map((value) => {
        try { return value ? new URL(value, url).toString() : ''; } catch { return ''; }
      }).filter((value) => /^https?:\/\//i.test(value)))].slice(0, 6);

      return {
        title: title || String(productLd?.name || ''),
        price,
        currency,
        images,
        externalId: String(productLd?.sku || productLd?.productID || ''),
        variants: { sizes: [], colors: [] },
      };
    } finally {
      dom.window.close();
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

  private detectCurrencyFromUrl(url: string): string {
    if (url.includes('.co.jp') || url.includes('japan')) return 'JPY';
    if (url.includes('.co.uk')) return 'GBP';
    if (url.includes('/fr/') || url.includes('.fr') || url.includes('shein.com/fr')) return 'EUR';
    if (url.includes('.de') || url.includes('.es') || url.includes('.it')) return 'EUR';
    if (url.includes('.com')) return 'USD';
    return 'EUR';
  }
}
