/**
 * Lens — où mène l'appui sur une carte (règle du 28/10/2026).
 *
 * Le client a été clair : « بطاقات هذه مهما كان مدخل البحث مسارها AYWEBs، وأي
 * حاجة قديمة تمنع هذا تتحيّد كامل ». Une seule destination, donc, quel que
 * soit le chemin qui a produit la carte — lien collé, mots-clés, photo, QR :
 *
 *   **la page du marchand s'ouvre dans le navigateur AYWEBs**, à l'adresse
 *   exacte de la fiche. Là, le client choisit couleur/taille sur le site, la
 *   capture prouve le prix et la variante, et la même feuille ajoute au panier.
 *
 * Ce fichier ne connaît plus de « fiche interne » : l'ancien repli qui ouvrait
 * le produit dans Lens (`kind === 'catalog'`, ou une adresse refusée) est
 * supprimé. Il ne reste que deux issues :
 *
 *   • `browser` — la page s'ouvre dans AYWEBs ;
 *   • `blocked` — l'adresse n'est pas une page web (`javascript:`, vide) :
 *     la carte n'ouvre rien plutôt que d'ouvrir autre chose que AYWEBs.
 */
import { productEntryTarget, type ProductEntryTarget } from '@/features/aywebs/storeEntry';

export interface LensOpenableCandidate {
  sourceUrl: string;
  source: string;
}

export type LensOpenDecision =
  | { screen: 'browser'; target: ProductEntryTarget }
  | { screen: 'blocked' };

export function lensOpenDecision(candidate: LensOpenableCandidate): LensOpenDecision {
  const target = productEntryTarget(candidate.sourceUrl, candidate.source);
  return target ? { screen: 'browser', target } : { screen: 'blocked' };
}
