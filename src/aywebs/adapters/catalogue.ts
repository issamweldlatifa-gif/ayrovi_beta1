import type { AyWebsAdapterId, AyWebsStoreDefinition } from '../../../shared/aywebsStores';
import { findAyWebsStore } from '../../../shared/aywebsStores';
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
 *   • il ne DEVINE aucune fiche produit à partir de l'URL : `isProductPage`
 *     répond toujours `false`. Un `/dp/…` ou un `/ip/…` ne prouve rien pour un
 *     marchand dont on n'a pas écrit l'adaptateur ;
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

  /** Aucune connaissance d'URL : la fiche est prouvée par la capture du client. */
  isProductPage(): boolean {
    return false;
  }

  /**
   * `storeId` = l'identifiant de la BOUTIQUE (ex. `walmart`), jamais celui de
   * l'adaptateur : l'écran, le panier et les preuves parlent de la boutique.
   */
  classifyPage(url: string | URL): AyWebsPageClassification {
    const classification = super.classifyPage(url);
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
