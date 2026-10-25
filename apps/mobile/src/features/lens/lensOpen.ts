/**
 * Lens — où mène l'appui sur une carte résultat.
 *
 * RÈGLE UNIQUE (quelle que soit l'entrée : texte, lien, image, photo ou QR) :
 * toute carte ouvre le navigateur intégré AYWEBS à l'adresse marchande exacte.
 * Le client choisit la couleur / la taille sur le site, la capture prouve le
 * prix et la variante, et c'est la même feuille qui ajoute au panier.
 *
 * Le `kind` de la carte ne décide PLUS de la destination : une fiche catalogue
 * qui porte un lien marchand HTTPS l'ouvre elle aussi dans AYWEBS. Une carte sans
 * adresse marchande ouvrable ne navigue nulle part (`blocked`) — jamais vers une
 * autre fiche interne : il est interdit qu'une carte emmène l'utilisateur ailleurs
 * que dans AYWEBS.
 */
import { productEntryTarget, type ProductEntryTarget } from '@/features/aywebs/storeEntry';

export interface LensOpenableCandidate {
  kind: 'catalog' | 'external';
  sourceUrl: string;
  source: string;
}

export type LensOpenBlockReason = 'NO_MERCHANT_URL';

export type LensOpenDecision =
  | { screen: 'browser'; target: ProductEntryTarget }
  | { screen: 'blocked'; reason: LensOpenBlockReason };

export function lensOpenDecision(candidate: LensOpenableCandidate): LensOpenDecision {
  const target = productEntryTarget(candidate.sourceUrl, candidate.source);
  if (!target) return { screen: 'blocked', reason: 'NO_MERCHANT_URL' };
  return { screen: 'browser', target };
}
