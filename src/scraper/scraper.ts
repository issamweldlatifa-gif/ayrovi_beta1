import { createHash } from 'node:crypto';
import { ScrapedProduct, StoreType, ProductVariants } from '../types';
import { fetchSafeRemote, readLimitedText, resolveSafeHttpUrl } from '../services/safeUrl';
import { parseProductPageHtml, type ParsedProductPage } from './productPageParser';
import { fetchRenderedProductPage, RenderedPageError } from './renderedPageFetcher';
import { detectMerchantStore } from './merchantDomains';
import { raceProbes, type ProbeAttempt } from './probeRace';

/** Entier d'environnement borné : une valeur absurde ne doit pas geler une lecture. */
function positiveIntEnv(key: string, fallback: number, min: number, max: number): number {
  const configured = Number(process.env[key]);
  if (!Number.isFinite(configured)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(configured)));
}

/**
 * Options de lecture d'une fiche. `pageHtml` : HTML de la fiche TEL QUE RENDU
 * chez le client (WebView / navigateur), utilisé en priorité comme source de
 * lecture. `pageUrl` : l'URL réellement ouverte chez le client, si elle diffère
 * de l'URL demandée (redirections marchand).
 */
export interface ScrapeOptions {
  pageHtml?: string | null;
  pageUrl?: string | null;
}

export interface MerchantScrapeResult {
  data: ParsedProductPage | null;
  verified: boolean;
  /**
   * Origine de la lecture. `webview` (04/10/2026) = HTML de la fiche fourni par
   * le client, pris sur la page qu'il a RÉELLEMENT sous les yeux (WebView
   * Android / navigateur). Amazon sert aux IP de centre de données une page
   * sans prix ni variantes : la seule source fiable est alors la page rendue
   * côté client, re-parsée ici par le MÊME parseur, et non une donnée fabriquée
   * par le client. Le prix reste calculé côté serveur (§45).
   */
  provider: 'direct' | 'none' | 'jina' | 'scraperapi' | 'scrapingbee' | 'brightdata' | 'webview';
  method: ParsedProductPage['priceSource'] | 'none';
  failureCode: string | null;
}

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

  public async scrapeProduct(rawUrl: string, options: ScrapeOptions = {}): Promise<ScrapedProduct> {
    const cleanedInput = this.cleanPastedUrl(rawUrl);
    if (!cleanedInput) {
      throw new Error('Veuillez fournir une URL de produit valide.');
    }
    const safeTarget = await resolveSafeHttpUrl(cleanedInput);
    const cleanUrl = safeTarget.url.toString();

    const store = this.detectStore(cleanUrl);
    const storeName = this.getStoreDisplayName(store, cleanUrl);
    let currency = this.detectCurrencyFromUrl(cleanUrl);
    let currencyVerified = false;

    const urlInfo = this.extractDeepUrlInfo(cleanUrl, store);

    const merchantResult = await this.scrapeWithHttp(cleanUrl, store, options);
    const liveData = merchantResult.data;
    const detectedLiveCurrency = String(liveData?.currency || '').toUpperCase();
    if (liveData?.currencyVerified === true && detectedLiveCurrency
      && Object.hasOwn(SmartLinkScraper.RATES_TO_TND, detectedLiveCurrency)) {
      currency = detectedLiveCurrency;
      currencyVerified = true;
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
      description: (merchantResult.data?.description && merchantResult.data.description.length > 5)
        ? merchantResult.data.description
        : (merchantResult.verified
          ? `Article extrait depuis ${storeName}. Prix confirmé automatiquement par AYROVI.`
          : `Article extrait depuis ${storeName}. Prix lu automatiquement par AYROVI.`),
      images,
      colorImages: liveData?.colorImages || {},
      mainImage: images.length > 0 ? images[0] : '',
      sourcePrice: Math.round(price * 100) / 100,
      sourceOriginalPrice: liveData?.originalPrice && liveData.originalPrice > price ? Math.round(liveData.originalPrice * 100) / 100 : undefined,
      sourceCurrency: currency,
      convertedPriceTND,
      serviceFeeTND,
      estimatedShippingTND,
      totalPriceTND,
      variants,
      availability: liveData?.availability || 'unknown',
      // Recopié tel quel depuis les données structurées de la page ; absent sinon.
      condition: liveData?.condition,
      brand: merchantResult.data?.brand || urlInfo.brand || storeName.split(' ')[0],
      priceVerified: merchantResult.verified && price > 0,
      currencyVerified,
      verificationProvider: merchantResult.provider,
      verificationMethod: merchantResult.method,
      verificationFailureCode: merchantResult.failureCode,
      scrapedAt: new Date().toISOString()
    };
  }

  /**
   * LECTURE BRUTE D'UNE FICHE (01/10/2026) — exposée pour l'enrichissement des
   * résultats Lens. `scrapeProduct` fabrique un panier complet (conversion,
   * frais, livraison) ; une grille de résultats n'a besoin que de la fiche
   * elle-même : disponibilité, tailles, couleurs, images. On expose donc la
   * MÊME chaîne de confiance — URL assainie, direct 7 s, puis rendu chez le
   * fournisseur — sans la dupliquer ni la contourner.
   */
  public async scrapeParsedPage(rawUrl: string, options: ScrapeOptions = {}): Promise<MerchantScrapeResult> {
    const cleaned = this.cleanPastedUrl(rawUrl);
    const safeTarget = await resolveSafeHttpUrl(cleaned);
    const url = safeTarget.url.toString();
    return this.scrapeWithHttp(url, this.detectStore(url), options);
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
        const asinMatch = path.match(/(?:dp|gp\/(?:product|aw\/d)|product)\/([A-Z0-9]{10})/i);
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
        const match = path.match(/goods-([a-z0-9-]+)-([0-9]+)\.html/i) || path.match(/(?:g-|[-/])([0-9]{6,})\.html/i);
        const id = url.searchParams.get('goods_id') || url.searchParams.get('goodsId') || (match ? match[2] || match[1] : '');

        let slug = (parts[parts.length - 1] || '')
          .replace(/goods-/i, '')
          .replace(/-\d+\.html.*/i, '')
          .replace(/\.html.*/i, '')
          .replace(/-/g, ' ');

        const title = slug.length > 3 && slug.toLowerCase() !== 'goods'
          ? slug.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
          : 'Produit TEMU';

        return {
          title: `TEMU — ${title}`,
          brand: 'TEMU',
          price: 0,
          externalId: id ? `TEMU-${id}` : '',
          variants: {
            sizes: [],
            colors: []
          }
        };
      }

      if (store === 'aliexpress') {
        const match = path.match(/\/(?:item|i)\/(\d{6,})\.html/i);
        const id = url.searchParams.get('productId') || match?.[1] || '';
        const slugPart = parts.find((part) => !/^(?:item|i|\d+\.html)$/i.test(part) && !/^\d+$/.test(part));
        const title = slugPart
          ? decodeURIComponent(slugPart).replace(/\.html.*/i, '').replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
          : 'Produit AliExpress';
        return {
          title: `AliExpress — ${title}`,
          brand: 'AliExpress',
          price: 0,
          externalId: id ? `AE-${id}` : '',
          variants: { sizes: [], colors: [], details: [] },
        };
      }
    } catch (error: any) {
      // Avant : `catch {}`. L'échec d'extraction disparaissait totalement et l'appelant
      // recevait une fiche d'apparence valide — le pire des deux mondes : ni donnée, ni
      // trace. Le repli subsiste (l'appelant doit pouvoir continuer) mais il est
      // désormais TRACÉ, avec l'url et la boutique concernées.
      console.warn('[scraper] extraction depuis l’URL échouée', { url: rawUrl, store, message: error?.message });
    }

    return {
      title: 'Article Boutique Internationale',
      brand: 'Boutique',
      price: 0,
      // Avant : 'ITEM-' + Math.floor(Math.random() * 899999 + 100000).
      // Deux défauts réels et démontrables :
      //  (1) l'identité changeait à CHAQUE appel, donc ré-analyser la MÊME url créait une
      //      nouvelle ligne au lieu de rapprocher la même (`if (item.externalId)` dans
      //      database.ts s'appuie sur cette clé pour la déduplication) ;
      //  (2) rien ne distinguait un identifiant marchand réel d'un numéro inventé.
      // Désormais l'identité est DÉTERMINISTE (sha1 de l'url, rejouable) et préfixée pour
      // dire la vérité : aucun identifiant marchand n'a été extrait.
      externalId: `UNRESOLVED-${createHash('sha1').update(rawUrl).digest('hex').slice(0, 12)}`,
      variants: {
        sizes: [],
        colors: []
      }
    };
  }

  /**
   * Lecture d'une fiche : sondes PARALLÈLES (05/10/2026), plus de cascade.
   *
   * Mesure à l'origine du changement : la cascade séquentielle
   * (mobile 7 s → bureau 6 s → Jina 18 s → rendu payant 18 s) faisait attendre
   * le client jusqu'à ~49 s, et « plus de vingt secondes » avant l'affichage
   * d'un produit chiffré. Les sondes sont indépendantes : elles partent
   * maintenant ensemble, la première qui publie un prix gagne, les autres sont
   * annulées.
   *
   * Budgets (surchargeables) : mobile/bureau `AYROVIX_DIRECT_TIMEOUT_MS` (6,5 s),
   * lecteur Jina `AYROVIX_JINA_TIMEOUT_MS` (12 s), rendu payant
   * `AYROVIX_RENDER_TIMEOUT_MS` (18 s, filet de sécurité inchangé).
   *
   * Le lecteur Jina part différé de ~1,2 s : sur une fiche que la lecture
   * directe lit du premier coup, il n'est jamais appelé — aucun appel externe
   * supplémentaire n'est dépensé pour rien.
   */
  private async scrapeWithHttp(url: string, storeType: StoreType, options: ScrapeOptions = {}): Promise<MerchantScrapeResult> {
    // ── 0. Page fournie par le client (WebView) : lecture locale, zéro réseau ──
    // (le chemin AYWEBs reste « lien seul » ; cette entrée sert les parcours qui
    // joignent la page réellement rendue sous les yeux du client).
    const providedPage = typeof options.pageHtml === 'string' ? options.pageHtml.trim() : '';
    if (providedPage) {
      const parsed = parseProductPageHtml(providedPage, options.pageUrl || url, storeType);
      if (parsed.price > 0 || parsed.title || parsed.images.length) {
        return {
          data: parsed,
          verified: parsed.price > 0,
          provider: 'webview',
          method: parsed.priceSource,
          failureCode: parsed.price > 0 ? null : 'PRICE_NOT_FOUND_IN_PROVIDED_PAGE',
        };
      }
    }

    const mobileHeaders = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    };
    /*
     * SECONDE PASSE « navigateur de bureau » (04/10/2026).
     * Mesuré le 04/10/2026 : sur la MÊME URL Amazon, selon l'IP de sortie,
     * l'agent mobile reçoit la fiche complète et l'agent de bureau une coquille
     * de 3,7 Ko — et l'inverse ailleurs. Le marchand décide par empreinte, pas
     * par vérité : les deux agents sont donc essayés EN MÊME TEMPS, sans
     * réécrire l'URL. Seul l'agent change.
     */
    const desktopHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    };
    const directTimeoutMs = positiveIntEnv('AYROVIX_DIRECT_TIMEOUT_MS', 6_500, 250, 15_000);
    const jinaTimeoutMs = positiveIntEnv('AYROVIX_JINA_TIMEOUT_MS', 12_000, 250, 30_000);

    const attempts: ProbeAttempt<MerchantScrapeResult>[] = [
      { id: 'direct_mobile', timeoutMs: directTimeoutMs, run: (signal) => this.probeDirectHtml(url, storeType, mobileHeaders, signal) },
      { id: 'direct_desktop', timeoutMs: directTimeoutMs, run: (signal) => this.probeDirectHtml(url, storeType, desktopHeaders, signal) },
    ];

    // Zalando/Alltricks coupent l'IP Render (timeout 0 octet / 403 Akamai).
    // r.jina.ai lit la page comme un navigateur et rend le HTML+JSON-LD.
    // Coupure : AYROVI_JINA_READER=false
    if (process.env.AYROVI_JINA_READER !== 'false') {
      attempts.push({
        id: 'jina',
        timeoutMs: jinaTimeoutMs,
        delayMs: positiveIntEnv('AYROVIX_JINA_HEADSTART_MS', 1_200, 0, 10_000),
        run: (signal) => this.probeJinaReader(url, storeType, signal),
      });
    }

    // ── ÉTAPE A — course des sondes gratuites ─────────────────────────────────
    const raced = await raceProbes(attempts, {
      isWinner: (result) => Number(result.data?.price || 0) > 0,
      budgetMs: attempts.reduce((max, attempt) => Math.max(max, (attempt.delayMs || 0) + attempt.timeoutMs), 0),
    });
    if (raced.winner) return raced.winner.value;

    // Meilleur repli : ce qu'une sonde a su lire même sans prix (titre, images).
    const partial = raced.fallback?.value ?? null;
    const directFailure = raced.failures.find((failure) => failure.id.startsWith('direct_'))?.error
      || (attempts.some((attempt) => attempt.id === 'direct_mobile') ? 'DIRECT_PRICE_NOT_FOUND' : 'DIRECT_UNAVAILABLE');

    // ── ÉTAPE B — rendu payant, uniquement si l'étape A n'a pas donné de prix ──
    try {
      const rendered = await fetchRenderedProductPage(url);
      const parsed = parseProductPageHtml(rendered.html, url, storeType);
      if (parsed.price > 0) {
        return { data: parsed, verified: true, provider: rendered.provider, method: parsed.priceSource, failureCode: null };
      }
      return {
        data: parsed.title || parsed.images.length ? parsed : partial?.data ?? null,
        verified: false,
        provider: rendered.provider,
        method: 'none',
        failureCode: 'PRICE_NOT_FOUND_AFTER_RENDER',
      };
    } catch (error: any) {
      const code = error instanceof RenderedPageError ? error.code : 'RENDER_UPSTREAM_ERROR';
      const provider = error instanceof RenderedPageError && error.provider ? error.provider : 'none';
      return {
        data: partial?.data ?? null,
        verified: false,
        provider,
        method: 'none',
        failureCode: code === 'RENDER_PROVIDER_NOT_CONFIGURED' && directFailure !== 'DIRECT_PRICE_NOT_FOUND'
          ? directFailure
          : code,
      };
    }
  }

  /** Sonde directe : GET la page marchande avec un agent donné. Jamais de prix inventé. */
  private async probeDirectHtml(
    url: string,
    storeType: StoreType,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<MerchantScrapeResult | null> {
    const response = await fetchSafeRemote(url, { signal, headers });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`DIRECT_HTTP_${response.status}`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('DIRECT_NOT_HTML');
    }
    const parsed = parseProductPageHtml(await readLimitedText(response, 2_000_000), url, storeType);
    if (parsed.price > 0) {
      return { data: parsed, verified: true, provider: 'direct', method: parsed.priceSource, failureCode: null };
    }
    return parsed.title || parsed.images.length
      ? { data: parsed, verified: false, provider: 'direct', method: 'none', failureCode: 'DIRECT_PRICE_NOT_FOUND' }
      : null;
  }

  /** Lecteur Jina : lit la page comme un navigateur (HTML + JSON-LD rendus). */
  private async probeJinaReader(
    url: string,
    storeType: StoreType,
    signal: AbortSignal,
  ): Promise<MerchantScrapeResult | null> {
    const reader = `https://r.jina.ai/${url}`;
    const response = await fetchSafeRemote(reader, {
      signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain',
        'X-Return-Format': 'html',
        'User-Agent': 'Mozilla/5.0 (compatible; AYROVI-reader/1.0)',
      },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`JINA_HTTP_${response.status}`);
    }
    const html = await readLimitedText(response, 2_000_000);
    if (!html.trim() || !/<(?:html|body|script|meta)\b/i.test(html)) return null;
    const parsed = parseProductPageHtml(html, url, storeType);
    if (parsed.price > 0) {
      return { data: parsed, verified: true, provider: 'jina', method: parsed.priceSource, failureCode: null };
    }
    return parsed.title || parsed.images.length
      ? { data: parsed, verified: false, provider: 'jina', method: 'none', failureCode: 'JINA_PRICE_NOT_FOUND' }
      : null;
  }

  private detectStore(url: string): StoreType {
    return detectMerchantStore(url);
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
