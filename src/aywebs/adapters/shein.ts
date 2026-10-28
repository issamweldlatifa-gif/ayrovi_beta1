import type { AyWebsAdapterId } from '../../../shared/aywebsStores';
import type { ScrapeOptions } from '../../scraper/scraper';
import type { AyWebsPageClassification, AyWebsSourceProduct } from './contract';
import { AyWebsCaptureError } from './contract';
import { BaseStoreAdapter } from './base';

/**
 * SHEIN — identité, reconnaissance et clé de cache (26/10/2026).
 *
 * ── Les formes d'URL réellement partagées par SHEIN ────────────────────────
 *   • `https://www.shein.com/<slug>-p-382460229.html`
 *   • `https://fr.shein.com/<slug>-p-382460229-cat-2030.html`  (locale en chemin)
 *   • `https://us.shein.com/--p-475378861.html`                (slug vide)
 *   • `https://m.shein.com/us/<slug>-p-16477982-cat-2977.html?lang=en`
 *   • `https://www.shein.co.uk/<slug>-p-209758798.html`
 *   • paramètre `goods_id` (liens d'application)
 * Dans TOUTES ces formes, l'identité est le nombre qui suit `-p-` (ou `/p/`).
 *
 * ── Deux défauts corrigés ici ───────────────────────────────────────────────
 *  1. **La fiche était classée LOGIN/CHECKOUT selon son SLUG.** Le classement
 *     de base regarde des indices d'URL (`login`, `auth`, `cart`…) avant le
 *     motif de fiche. Chez SHEIN ces mots sont des NOMS DE PRODUIT : une fiche
 *     `…/Cartoon-Print-Tee-p-12345678.html` tombait dans `cart` ⇒ CHECKOUT, et
 *     « Add to Cart » était désactivé sur une vraie fiche produit. Le motif
 *     `-p-<id>.html` tranche désormais AVANT les indices de chemin (le slug
 *     n'est pas une preuve de type de page ; l'identifiant produit, si).
 *  2. **Deux liens de la même fiche payaient deux lectures.** Le slug, la
 *     locale et les paramètres de suivi (`src_identifier`, `mallCode`…)
 *     changeaient la clé de cache. `canonicalUrl` la ramène à `-p-<id>.html`.
 *
 * Ce que l'adaptateur ne fait PAS : lire la page. L'extraction reste la chaîne
 * unique (`SmartLinkScraper`) ; l'adaptateur possède la reconnaissance et
 * l'identité, c'est tout.
 */
export class SheinAdapter extends BaseStoreAdapter {
  readonly id: AyWebsAdapterId = 'shein';

  /** `...-p-<id>.html`, `...-p-<id>-cat-2030.html`, `--p-<id>.html`, `/p/<id>`. */
  isProductPage(url: URL): boolean {
    return sheinGoodsId(url) !== null;
  }

  protected isSearchPage(url: URL): boolean {
    return /^\/(?:pdsearch|recommend)\b/i.test(url.pathname)
      || /-c-\d+\.html$/i.test(url.pathname) // rayon : `<slug>-c-<catId>.html`
      || Boolean(url.searchParams.get('key'));
  }

  /**
   * Le motif de fiche produit passe AVANT les indices de chemin : un slug
   * `Cartoon…` / `Authentic…` n'est pas une page de panier ni de connexion.
   */
  classifyPage(url: string | URL): AyWebsPageClassification {
    let parsed: URL;
    try {
      parsed = typeof url === 'string' ? new URL(url) : url;
    } catch {
      return super.classifyPage(url);
    }
    if (sheinGoodsId(parsed) !== null && this.canHandle(parsed)) {
      return {
        pageType: 'PRODUCT',
        storeId: this.id,
        isProductPage: true,
        reason: 'goods_id_fiche_produit',
        customerActionRequired: 'NONE',
      };
    }
    return super.classifyPage(parsed);
  }

  /** Clé de cache : la fiche `-p-<id>.html`, sans slug ni paramètres de suivi. */
  canonicalUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const goodsId = sheinGoodsId(parsed);
      if (!goodsId) return null;
      return `https://${sheinCanonicalHost(parsed.hostname)}/-p-${goodsId}.html`;
    } catch {
      return null;
    }
  }

  /** Identité source : `SHEIN-<goods_id>` — stable d'un lien à l'autre. */
  sourceProductId(url: string | URL): string | null {
    try {
      const parsed = typeof url === 'string' ? new URL(url) : url;
      const goodsId = sheinGoodsId(parsed);
      return goodsId ? `SHEIN-${goodsId}` : null;
    } catch {
      return null;
    }
  }

  async resolveProduct(url: string, options: ScrapeOptions = {}): Promise<AyWebsSourceProduct> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new AyWebsCaptureError('PRODUCT_PAGE_REQUIRED', 'Lien SHEIN illisible.');
    }
    if (!this.isProductPage(parsed)) {
      throw new AyWebsCaptureError('PRODUCT_PAGE_REQUIRED', 'Lien SHEIN : la fiche produit est requise (…-p-<id>.html).');
    }
    const product = await super.resolveProduct(this.canonicalUrl(url) ?? url, options);
    // L'identité publiée par la page gagne ; le goods_id de l'URL prend le relais.
    if (!product.sourceProductId) product.sourceProductId = this.sourceProductId(parsed);
    return product;
  }
}

/** Identifiant produit SHEIN, ou `null` si l'URL n'en porte pas. */
export function sheinGoodsId(url: URL): string | null {
  const fromQuery = String(
    url.searchParams.get('goods_id')
    || url.searchParams.get('goodsId')
    || url.searchParams.get('productId')
    || '',
  ).trim();
  if (/^\d{5,16}$/.test(fromQuery)) return fromQuery;
  const fromPath = url.pathname.match(/(?:^|[-/])p-(\d{5,16})(?=[-./]|$)/i)
    || url.pathname.match(/\/p\/(\d{5,16})(?=[-./]|$)/i)
    || url.pathname.match(/\/product-item-v\d+-(\d{5,16})(?=[-./]|$)/i);
  return fromPath ? fromPath[1] : null;
}

/**
 * URL d'une autre couleur SHEIN (`goods_id`) sur le MÊME hôte que `sourceUrl`
 * (ex. `fr.shein.com`, `m.shein.com`, `www.shein.co.uk`) afin que la relecture
 * WebView conserve l'hôte, la langue et la devise de la session cliente.
 */
export function sheinVariantPageUrl(sourceUrl: string, goodsId: string): string | null {
  const cleanId = String(goodsId || '').trim().replace(/^SHEIN-/i, '');
  if (!/^\d{5,16}$/.test(cleanId)) return null;
  try {
    const parsed = new URL(sourceUrl);
    if (sheinGoodsId(parsed) === cleanId) return null;
    return `${parsed.protocol}//${parsed.host}/-p-${cleanId}.html`;
  } catch {
    return null;
  }
}

const SHEIN_REGIONAL_TLDS = [
  'shein.co.uk', 'shein.com.mx', 'shein.com.br',
  'shein.fr', 'shein.de', 'shein.es', 'shein.it', 'shein.ca',
] as const;

/** Hôte canonique : garde le TLD régional (`shein.co.uk`, `shein.fr`…), et unifie `*.shein.com` sur `www.shein.com`. */
function sheinCanonicalHost(hostname: string): string {
  const normalized = hostname.trim().toLowerCase().replace(/\.+$/, '');
  for (const regional of SHEIN_REGIONAL_TLDS) {
    if (normalized === regional || normalized.endsWith(`.${regional}`)) {
      return `www.${regional}`;
    }
  }
  return 'www.shein.com';
}
