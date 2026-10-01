/**
 * LECTEUR DE PAGE PAR DÉFAUT — la chaîne de confiance du projet, sans la dupliquer.
 *
 * `SmartLinkScraper.scrapeParsedPage` assainit l'URL (anti-SSRF), tente une
 * lecture directe (7 s) puis, pour les marchands autorisés, le rendu chez le
 * fournisseur. Les appelants qui ont déjà une instance (routes) l'injectent ;
 * ceux qui n'en ont pas (pipeline interne, assistant) utilisent celle-ci — le
 * scraper n'a aucun état, une instance partagée suffit.
 */
import { SmartLinkScraper } from '../../scraper/scraper';
import type { ParsedProductPage } from '../../scraper/productPageParser';

let shared: SmartLinkScraper | null = null;

export async function defaultPageFetcher(url: string): Promise<ParsedProductPage | null> {
  shared = shared ?? new SmartLinkScraper();
  return (await shared.scrapeParsedPage(url)).data;
}
