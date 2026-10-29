import type { AyWebsAdapterId } from '../../../shared/aywebsStores';
import type { ScrapeOptions } from '../../scraper/scraper';
import { BaseStoreAdapter } from './base';
import type { AyWebsPageClassification, AyWebsSourceProduct } from './contract';

/**
 * Motif de fiche produit Amazon : `/dp/`, `/gp/product/`, `/gp/aw/d/`, `/product/`,
 * le lien court mobile `/d/<slug>/<ASIN>` ou `/d/<ASIN>`, et l'ancien
 * `/exec/obidos/ASIN/`, suivi d'un ASIN de 10 caractères.
 */
const ASIN_PATH = /\/(?:dp|gp\/(?:product|aw\/d)|product|exec\/obidos\/ASIN|d(?:\/[^/]+)?)\/([A-Z0-9]{10})(?:[/?]|$)/i;

/**
 * ASIN d'une URL Amazon, ou `null`. Lu sur le CHEMIN seul : le slug (titre du
 * produit) et les paramètres de suivi (`ref_`, `pd_rd_*`) ne comptent pas.
 */
export function amazonAsinFromUrl(url: string | URL): string | null {
  let parsed: URL;
  try {
    parsed = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return null;
  }
  const match = parsed.pathname.match(ASIN_PATH);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Forme canonique d'une fiche : `https://<même hôte>/dp/<ASIN>`.
 * Le slug, la query de suivi et les `&amp;` d'un collage HTML disparaissent ;
 * l'hôte reste celui de la boutique (amazon.com ≠ amazon.fr). `null` si l'URL
 * n'est pas une fiche produit.
 */
export function amazonCanonicalProductUrl(url: string | URL): string | null {
  const asin = amazonAsinFromUrl(url);
  if (!asin) return null;
  const parsed = typeof url === 'string' ? new URL(url) : url;
  const canonicalHost = parsed.hostname.toLowerCase().replace(/^(?:m\d*|mobile|wap|touch|smile)\./, 'www.');
  return `https://${canonicalHost}/dp/${asin}`;
}

/**
 * Amazon — reconnaissance de fiche produit et de recherche.
 *
 * Deux règles propres à Amazon :
 *  • une fiche se reconnaît à son ASIN, pas à son slug : le titre
 *    (« Auth », « Cart », « Keyboard »…) ne doit pas déclencher un indice
 *    LOGIN/CHECKOUT sur une fiche saine (cf. `AYWEBS_URL_PAGE_HINTS`) ;
 *  • la capture part de la forme canonique `/dp/<ASIN>` : une même fiche n'a
 *    qu'une seule clé de cache, quel que soit le lien collé.
 */
export class AmazonAdapter extends BaseStoreAdapter {
  readonly id: AyWebsAdapterId = 'amazon';

  isProductPage(url: URL): boolean {
    return ASIN_PATH.test(url.pathname);
  }

  classifyPage(url: string | URL): AyWebsPageClassification {
    let parsed: URL;
    try {
      parsed = typeof url === 'string' ? new URL(url) : url;
    } catch {
      return super.classifyPage(url);
    }
    if (amazonAsinFromUrl(parsed) && this.canHandle(parsed)) {
      return {
        pageType: 'PRODUCT',
        storeId: this.id,
        isProductPage: true,
        reason: 'asin_fiche_produit',
        customerActionRequired: 'NONE',
      };
    }
    return super.classifyPage(parsed);
  }

  /** Clé de cache : la fiche `/dp/<ASIN>`, quel que soit le lien collé. */
  canonicalUrl(url: string): string | null {
    return amazonCanonicalProductUrl(url);
  }

  /* Pas de `async` ici : un wrapper ajoute un tour de microtâche et décale la
     relecture d'arrière-plan (cf. tests/aywebs-resolve-swr). On rend la promesse
     du parent telle quelle. */
  resolveProduct(url: string, options: ScrapeOptions = {}): Promise<AyWebsSourceProduct> {
    return super.resolveProduct(amazonCanonicalProductUrl(url) ?? url, options);
  }

  protected isSearchPage(url: URL): boolean {
    return /^\/s(?:\/|$)/i.test(url.pathname) || Boolean(url.searchParams.get('k'));
  }
}
