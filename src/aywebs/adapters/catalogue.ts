import type { AyWebsAdapterId, AyWebsStoreDefinition } from '../../../shared/aywebsStores';
import { ayWebsProductUrlPattern, findAyWebsStore } from '../../../shared/aywebsStores';
import type { ScrapeOptions } from '../../scraper/scraper';
import { BaseStoreAdapter } from './base';
import {
  AyWebsCaptureError,
  type AyWebsPageClassification,
  type AyWebsSourceProduct,
} from './contract';

/**
 * AYWEBs — ADAPTATEUR « CATALOGUE » (23/10/2026).
 *
 * Une seule classe pour toutes les boutiques du catalogue admises à la lecture :
 * leur identité (nom, domaine, logo, catégories) vit dans le Store Registry, pas
 * dans une classe par marchand. C'est la condition pour ouvrir 380 boutiques
 * sans écrire 380 adaptateurs.
 *
 * ── CE QU'IL NE FAIT PAS (et c'est le cœur de sa garantie) ────────────────
 *   • il ne DEVINE aucune fiche produit : il ne reconnaît que le motif d'URL
 *     DÉCLARÉ par la boutique dans le registre (`productUrlPattern`). Une
 *     boutique sans motif répond `false` — et un `/ip/…` ne prouve rien pour
 *     un marchand dont on n'a pas écrit le motif ;
 *   • il ne lit PAS la page côté serveur : `resolveProduct` refuse explicitement.
 *     Ces boutiques se lisent dans le navigateur du CLIENT (capture structurée :
 *     JSON-LD du marchand, prix corroboré, titre publié), qui est ensuite jugée
 *     par `validateAyWebsCapturedPage` puis `assertAyWebsProductPage`.
 *
 * Conséquence assumée : si le client n'apporte pas de capture exploitable, la
 * réponse est un refus nommé (« lisez la fiche dans le navigateur »), jamais une
 * lecture serveur qui taperait un mur anti-robot et se ferait passer pour une
 * panne de la boutique.
 */
export class CatalogueStoreAdapter extends BaseStoreAdapter {
  readonly id: AyWebsAdapterId = 'catalogue';

  constructor(scraper: ConstructorParameters<typeof BaseStoreAdapter>[0], private readonly definition?: AyWebsStoreDefinition) {
    super(scraper);
  }

  /** La définition transmise par le registre fait autorité (une classe = N boutiques). */
  get store(): AyWebsStoreDefinition | null {
    return this.definition ?? findAyWebsStore(this.id);
  }

  /**
   * Reconnaissance par MOTIF DÉCLARÉ — jamais deviné ici.
   *
   * Le motif vit dans le Store Registry (donnée, pas code) : ouvrir une boutique
   * ne demande plus d'écrire une classe, seulement de déclarer son motif. Le
   * motif ne fixe AUCUN prix : il autorise la lecture, la capture la prouve.
   */
  isProductPage(url: URL): boolean {
    const pattern = ayWebsProductUrlPattern(this.store);
    return Boolean(pattern && pattern.test(url.pathname));
  }

  /**
   * `storeId` = l'identifiant de la BOUTIQUE (ex. `walmart`), jamais celui de
   * l'adaptateur : l'écran, le panier et les preuves parlent de la boutique.
   */
  classifyPage(url: string | URL): AyWebsPageClassification {
    let classification = super.classifyPage(url);
    /* Un slug de fiche peut contenir « baskets », « cart » ou « order » sans
       être un tunnel de commande (cas courant : baskets-homme chez Zalando).
       Les gardes LOGIN/CAPTCHA restent prioritaires ; pour le seul faux indice
       CHECKOUT, le motif de fiche déclaré par le registre tranche. */
    if (classification.pageType === 'CHECKOUT') {
      try {
        const parsed = typeof url === 'string' ? new URL(url) : url;
        if (this.canHandle(parsed) && this.isProductPage(parsed)) {
          classification = {
            pageType: 'PRODUCT',
            storeId: (this.store?.id ?? null) as AyWebsPageClassification['storeId'],
            isProductPage: true,
            reason: 'motif_fiche_produit_marchand',
            customerActionRequired: 'NONE',
          };
        }
      } catch { /* L'adaptateur de base a déjà classé l'URL invalide. */ }
    }
    const storeId = classification.storeId ? this.store?.id ?? null : null;
    return { ...classification, storeId: storeId as AyWebsPageClassification['storeId'] };
  }

  /**
   * Pas de lecture serveur pour ces boutiques : la capture cliente est le seul
   * chemin de lecture, et il est déjà ouvert côté application.
   */
  resolveProduct(_url: string, _options: ScrapeOptions = {}): Promise<AyWebsSourceProduct> {
    return Promise.reject(new AyWebsCaptureError(
      'PRODUCT_PAGE_REQUIRED',
      'Cette boutique se lit dans le navigateur de l’application : ouvrez la fiche, puis appuyez sur « Ajouter au panier ».',
    ));
  }
}
