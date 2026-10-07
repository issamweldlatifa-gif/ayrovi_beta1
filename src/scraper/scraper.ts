import { createHash } from 'node:crypto';
import { ScrapedProduct, StoreType, ProductVariants } from '../types';
import { fetchSafeRemote, readLimitedText, resolveSafeHttpUrl } from '../services/safeUrl';
import { parseProductPageHtml, type ParsedProductPage } from './productPageParser';
import { fetchRenderedProductPage, RenderedPageError } from './renderedPageFetcher';
import { detectMerchantStore } from './merchantDomains';
import { raceProbes, type ProbeAttempt } from './probeRace';
import { readerHeaders, readerJinaHeadstartMs, readerProbePlan } from './readerFingerprint';

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
  /*
   * ── PLUS AUCUN TAUX DE CHANGE ICI (Phase 0, suite — 07/10/2026) ────────────
   *
   * Ce fichier portait une table EN DUR (EUR 4.00, USD 4.00, JPY 0.0265…) et
   * convertissait lui-même : `RATES_TO_TND[currency] || 4.00`. Trois défauts,
   * tous démontrables :
   *   1. **Un taux inventé pour toute devise absente de la table** (le `|| 4.00`) :
   *      un article en SEK ou en CAD non listé était converti à 4 dinars pour 1,
   *      sans que rien ne le signale ;
   *   2. **Deux vérités pour un même produit** : le calculateur AYROVI applique
   *      le taux EFFECTIF de `pricing_config` (marché × buffer, versionné), la
   *      table disait autre chose — l'écart exact que l'audit du 23/09 avait
   *      déjà dû corriger ailleurs ;
   *   3. **Un prix TND publié sans moteur** : `serviceFee = max(10, 8 %)` et
   *      `shipping = 25.00` étaient des constantes, pas des règles métier.
   *
   * Désormais : le scraper publie le prix SOURCE et sa devise. Le prix AYROVI
   * (`convertedPriceTND`/`serviceFeeTND`/`estimatedShippingTND`/`totalPriceTND`)
   * est produit par `calculatePrice` sur les règles versionnées, à la couche qui
   * a la base (API / panier / AYWEBs). Les quatre champs restent à 0 ici :
   * 0 = « pas calculé », jamais un montant.
   */

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
    /* La devise est VÉRIFIÉE quand la page l'a publiée sous forme de code ISO.
       Avant, la condition portait aussi sur l'appartenance à la table locale de
       taux : une page publiant SEK était donc dite « devise non vérifiée » alors
       que la page l'avait bel et bien publiée — et un article en SEK passait
       ensuite par le taux de secours 4.00. Ce qui manque dans ce cas n'est pas
       la PREUVE de la devise, c'est un TAUX : c'est le moteur tarifaire qui
       répond (absent ⇒ aucun prix TND, jamais un prix inventé). */
    const detectedLiveCurrency = String(liveData?.currency || '').toUpperCase();
    if (liveData?.currencyVerified === true && /^[A-Z]{3}$/.test(detectedLiveCurrency)) {
      currency = detectedLiveCurrency;
      currencyVerified = true;
    }

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

    /* Le titre vient de la page, sinon du slug de l'URL — et on le DIT. */
    const titleFromPage = (liveData && liveData.title && !this.isBotBlocked(liveData.title))
      ? String(liveData.title).trim()
      : '';
    const title = titleFromPage || urlInfo.title;
    const titleSource: 'merchant' | 'url_slug' | 'none' = titleFromPage
      ? 'merchant'
      : (urlInfo.title ? 'url_slug' : 'none');

    return {
      id: 'scraped_' + Date.now(),
      store,
      storeName,
      url: cleanUrl,
      externalId,
      title: title.trim(),
      titleSource,
      // Phase 0 (06/10/2026) — plus AUCUNE description inventée. Une phrase
      // générique (« Article extrait depuis Amazon… ») faisait passer un champ
      // vide pour une donnée du marchand. Sans description publiée : vide, et
      // l'interface écrit « non communiquée ».
      description: (merchantResult.data?.description && merchantResult.data.description.length > 5)
        ? merchantResult.data.description
        : '',
      images,
      colorImages: liveData?.colorImages || {},
      mainImage: images.length > 0 ? images[0] : '',
      sourcePrice: Math.round(price * 100) / 100,
      sourceOriginalPrice: liveData?.originalPrice && liveData.originalPrice > price ? Math.round(liveData.originalPrice * 100) / 100 : undefined,
      sourceCurrency: currency,
      // 0 = non calculé ici. Le moteur tarifaire remplit ces quatre champs.
      convertedPriceTND: 0,
      serviceFeeTND: 0,
      estimatedShippingTND: 0,
      totalPriceTND: 0,
      variants,
      availability: liveData?.availability || 'unknown',
      // Recopié tel quel depuis les données structurées de la page ; absent sinon.
      condition: liveData?.condition,
      // Phase 0 — « pourquoi ce prix n'est pas publiable » remonte jusqu'au client
      // (ex. `DUPLICATED_TEXT` pour « $6.99$6.99 »). Jamais un montant, juste un motif.
      priceRejection: liveData?.priceRejection ?? null,
      // Phase 0 (06/10/2026) — plus de marque inventée. Ni le nom de la boutique
      // (« Amazon », « TEMU ») ni le slug de l'URL ne sont la marque du produit :
      // seule la donnée publiée par le marchand fait foi, sinon le champ est vide.
      brand: merchantResult.data?.brand || '',
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

  /**
   * Identité de repli : DÉTERMINISTE et qui dit la vérité.
   *
   * `UNRESOLVED-<sha1(url)[0..12]>` — deux appels sur la même URL donnent la
   * même clé (la déduplication fonctionne), et le préfixe interdit de confondre
   * ce numéro avec un identifiant marchand. Aucun aléatoire : un tirage rendrait
   * la fiche irrapprochable et le résultat non rejouable.
   */
  private unresolvedExternalId(rawUrl: string): string {
    return `UNRESOLVED-${createHash('sha1').update(rawUrl).digest('hex').slice(0, 12)}`;
  }

  private extractDeepUrlInfo(rawUrl: string, store: StoreType): { title: string; brand: string; price: number; externalId: string; variants: ProductVariants } {
    try {
      const url = new URL(rawUrl);
      const path = url.pathname;
      const parts = path.split('/').filter(Boolean);

      if (store === 'shein') {
        const match = path.match(/-p-(\d+)\.html/i) || path.match(/\/(\d+)\.html/i) || url.search.match(/[?&]goods_id=(\d+)/i);
        /* Aucun identifiant dans l'URL ⇒ AUCUN identifiant inventé. Avant :
           `'SH-' + Math.random()` produisait ensuite `SH-SH-482913` (double
           préfixe) et une identité différente à chaque appel — donc une nouvelle
           ligne au lieu de rapprocher la même fiche. */
        const goodsId = match ? match[1] : '';

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

        /* Le slug est une PISTE de titre (il est publié par le marchand dans
           l'URL), pas une marque : prendre son premier mot pour un `brand`
           fabriquait une marque (« Women » pour un titre SHEIN courant). */
        return {
          title: formatted,
          brand: '',
          price: 0,
          externalId: goodsId ? `SH-${goodsId}` : this.unresolvedExternalId(rawUrl),
          // Never infer variants from a URL slug. Only merchant-page values are shown.
          variants: { sizes: [], colors: [], details: [] },
        };
      }

      if (store === 'amazon') {
        const asinMatch = path.match(/(?:dp|gp\/(?:product|aw\/d)|product)\/([A-Z0-9]{10})/i);
        /* Avant : `'B0' + Math.random()` fabriquait un ASIN **crédible** — lu
           ensuite comme l'identité produit officielle d'Amazon. Un identifiant
           inventé qui a la forme d'un vrai est le pire des deux mondes. */
        const asin = asinMatch ? asinMatch[1] : '';

        let titleSlug = '';
        if (parts.length >= 2 && parts[0] !== 'dp') {
          titleSlug = decodeURIComponent(parts[0]).replace(/-/g, ' ');
        }

        /* Plus de « Produit Amazon » : sans slug exploitable, le titre est
           VIDE et `titleSource` vaut `none`. */
        const title = titleSlug.length > 3 ? titleSlug : '';

        return {
          title,
          brand: '',
          price: 0,
          externalId: asin || this.unresolvedExternalId(rawUrl),
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
          : '';

        /* `TEMU — <titre>` : le nom de la boutique n'est pas une partie du titre
           du produit (même correction que la marque en Phase 0). */
        return {
          title,
          brand: '',
          price: 0,
          externalId: id ? `TEMU-${id}` : this.unresolvedExternalId(rawUrl),
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
          : '';
        return {
          title,
          brand: '',
          price: 0,
          externalId: id ? `AE-${id}` : this.unresolvedExternalId(rawUrl),
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
      /* Plus de « Article Boutique Internationale » ni de marque « Boutique » :
         une chaîne de remplacement se lit comme une donnée du marchand. Sans
         lecture, le titre est vide et `titleSource` = none. */
      title: '',
      brand: '',
      price: 0,
      // Avant : 'ITEM-' + Math.floor(Math.random() * 899999 + 100000).
      // Deux défauts réels et démontrables :
      //  (1) l'identité changeait à CHAQUE appel, donc ré-analyser la MÊME url créait une
      //      nouvelle ligne au lieu de rapprocher la même (`if (item.externalId)` dans
      //      database.ts s'appuie sur cette clé pour la déduplication) ;
      //  (2) rien ne distinguait un identifiant marchand réel d'un numéro inventé.
      // Désormais l'identité est DÉTERMINISTE (sha1 de l'url, rejouable) et préfixée pour
      // dire la vérité : aucun identifiant marchand n'a été extrait.
      externalId: this.unresolvedExternalId(rawUrl),
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

    const directTimeoutMs = positiveIntEnv('AYROVIX_DIRECT_TIMEOUT_MS', 6_500, 250, 15_000);
    const jinaTimeoutMs = positiveIntEnv('AYROVIX_JINA_TIMEOUT_MS', 12_000, 250, 30_000);

    /*
     * EMPREINTE DE LECTEUR FIXÉE (Phase 1, 06/10/2026 — readerFingerprint.ts).
     *
     * Avant : l'agent mobile ET l'agent bureau partaient EN MÊME TEMPS, la
     * première sonde qui lisait un prix gagnait. Mesures 04–06/10/2026 sur la
     * même URL Amazon : le mobile a rendu une fiche lisible (693 Ko,
     * `a-price-whole`), le bureau trois coquilles de 3,8 Ko puis une vraie page
     * de 842 Ko contenant **aucune** ancre de prix. Deux requêtes marchandes par
     * lecture dont une perdue, et un comportement qui changeait sans qu'une
     * ligne ne bouge : ce n'était pas une stratégie, c'était un tirage au sort.
     *
     * Maintenant : l'empreinte fixée par store part SEULE ; l'autre n'est qu'un
     * repli DIFFÉRÉ (readerFallbackDelayMs, 2,5 s par défaut) qui ne coûte rien
     * quand la première lit. Réglable sans redéploiement :
     *   AYROVIX_READER_PROFILE_AMAZON=mobile|desktop  (ou AYROVIX_READER_PROFILE)
     *   AYROVIX_READER_FALLBACK_MS=2500
     */
    const attempts: ProbeAttempt<MerchantScrapeResult>[] = readerProbePlan(storeType).map((step) => ({
      id: step.id,
      timeoutMs: directTimeoutMs,
      delayMs: step.delayMs,
      run: (signal) => this.probeDirectHtml(url, storeType, readerHeaders(step.profile), signal),
    }));

    // Zalando/Alltricks coupent l'IP Render (timeout 0 octet / 403 Akamai).
    // r.jina.ai lit la page comme un navigateur et rend le HTML+JSON-LD.
    // Coupure : AYROVI_JINA_READER=false
    if (process.env.AYROVI_JINA_READER !== 'false') {
      attempts.push({
        id: 'jina',
        timeoutMs: jinaTimeoutMs,
        delayMs: readerJinaHeadstartMs(),
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
