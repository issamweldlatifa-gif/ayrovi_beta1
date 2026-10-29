import type { AyWebsAdapterId } from '../../../shared/aywebsStores';
import type { ScrapeOptions } from '../../scraper/scraper';
import type { AyWebsPageClassification, AyWebsSourceProduct } from './contract';
import { AyWebsCaptureError } from './contract';
import { BaseStoreAdapter } from './base';

/**
 * TEMU — identité, reconnaissance et clé de cache (26/10/2026).
 *
 * ── Les formes d'URL réellement publiées par TEMU ──────────────────────────
 *   • `https://www.temu.com/<slug>-g-601099512345678.html`
 *   • `https://www.temu.com/<slug>-g-<id>.html?...`        (paramètres de campagne)
 *   • `https://www.temu.com/uk/<slug>-g-601100384222130.html`  (marché en chemin)
 *   • `https://www.temu.com/-g-601099513224343.html`       (slug vide)
 *   • `https://www.temu.com/goods.html?goods_id=601099512345678`
 *   • `https://www.temu.com/uk/goods.html?goods_id=…`
 * Le `goods_id` (nombre long) est l'identité ; le slug et le marché n'en sont pas.
 *
 * ── Deux défauts corrigés ici ───────────────────────────────────────────────
 *  1. **Fiche produit classée CHECKOUT/LOGIN à cause de son slug** : chez TEMU
 *     comme chez SHEIN, `cart`/`login`/`auth` sont des mots de NOM DE PRODUIT
 *     (`…-cartoon-…`, `…-authentication-…`). Le motif `-g-<id>.html` tranche
 *     avant les indices de chemin — sinon « Add to Cart » restait désactivé sur
 *     une vraie fiche.
 *  2. **La même fiche sous deux liens = deux lectures** (marché en chemin,
 *     paramètres de campagne). `canonicalUrl` la ramène à `-g-<id>.html`.
 *
 * L'extraction, elle, ne se passe pas ici : la chaîne unique `SmartLinkScraper`
 * reste la seule à lire la page (§8).
 */
export class TemuAdapter extends BaseStoreAdapter {
  readonly id: AyWebsAdapterId = 'temu';

  /** `-g-<id>.html` (n'importe où dans le chemin) ou `goods_id` long. */
  isProductPage(url: URL): boolean {
    return temuGoodsId(url) !== null;
  }

  protected isSearchPage(url: URL): boolean {
    return /search_result\.html$/i.test(url.pathname)
      || /-s\.html$/i.test(url.pathname)                     // recherche `<slug>-s.html`
      || /-o3-\d+\.html$/i.test(url.pathname)                // rayon `<slug>-o3-<id>.html`
      || Boolean(url.searchParams.get('search_key'));
  }

  /** Le motif de fiche produit passe AVANT les indices de chemin (slug trompeur). */
  classifyPage(url: string | URL): AyWebsPageClassification {
    let parsed: URL;
    try {
      parsed = typeof url === 'string' ? new URL(url) : url;
    } catch {
      return super.classifyPage(url);
    }
    if (temuGoodsId(parsed) !== null && this.canHandle(parsed)) {
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

  /** Clé de cache : la fiche `-g-<id>.html`, sans marché ni paramètres de campagne. */
  canonicalUrl(url: string): string | null {
    try {
      const goodsId = temuGoodsId(new URL(url));
      return goodsId ? `https://www.temu.com/-g-${goodsId}.html` : null;
    } catch {
      return null;
    }
  }

  /** Identité source : `TEMU-<goods_id>`. */
  sourceProductId(url: string | URL): string | null {
    try {
      const parsed = typeof url === 'string' ? new URL(url) : url;
      const goodsId = temuGoodsId(parsed);
      return goodsId ? `TEMU-${goodsId}` : null;
    } catch {
      return null;
    }
  }

  async resolveProduct(url: string, options: ScrapeOptions = {}): Promise<AyWebsSourceProduct> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new AyWebsCaptureError('PRODUCT_PAGE_REQUIRED', 'Lien TEMU illisible.');
    }
    if (!this.isProductPage(parsed)) {
      throw new AyWebsCaptureError('PRODUCT_PAGE_REQUIRED', 'Lien TEMU : la fiche produit est requise (…-g-<id>.html ou goods_id).');
    }
    const product = await super.resolveProduct(this.canonicalUrl(url) ?? url, options);
    if (!product.sourceProductId) product.sourceProductId = this.sourceProductId(parsed);
    return product;
  }
}

/** Identifiant produit TEMU (`goods_id`), ou `null`. */
export function temuGoodsId(url: URL): string | null {
  const fromQuery = String(url.searchParams.get('goods_id') || url.searchParams.get('goodsId') || '').trim();
  if (/^\d{6,}$/.test(fromQuery)) return fromQuery;
  const fromPath = url.pathname.match(/(?:^|[-/])g-(\d{6,})(?=[-./]|$)/i);
  return fromPath ? fromPath[1] : null;
}
