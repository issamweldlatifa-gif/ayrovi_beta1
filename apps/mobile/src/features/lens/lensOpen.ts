/**
 * Lens — décider où mène l'appui sur une carte (23/10/2026).
 *
 * La règle est une phrase, et elle tient dans une fonction pure pour être
 * testée sans écran :
 *
 *   • **vente externe** (page d'un marchand) → navigateur intégré AYWEBs, à
 *     l'adresse exacte de la fiche. Le client choisit sur le site, la capture
 *     prouve le prix et la variante, et c'est la même feuille qui ajoute ;
 *   • **vente interne** (catalogue ZAYROVI) → fiche ZAYROVI : c'est notre
 *     stock, notre page, notre prix.
 *
 * Une adresse que le navigateur refuserait (schéma inattendu, `http:`) ne
 * fabrique pas un navigateur cassé : on retombe sur la fiche, qui relit la
 * page côté serveur.
 */
import { productEntryTarget, type ProductEntryTarget } from '@/features/aywebs/storeEntry';

export interface LensOpenableCandidate {
  kind: 'catalog' | 'external';
  sourceUrl: string;
  source: string;
}

export type LensOpenDecision =
  | { screen: 'browser'; target: ProductEntryTarget }
  | { screen: 'product' };

export function lensOpenDecision(candidate: LensOpenableCandidate): LensOpenDecision {
  if (candidate.kind === 'catalog') return { screen: 'product' };
  const target = productEntryTarget(candidate.sourceUrl, candidate.source);
  if (!target) return { screen: 'product' };
  return { screen: 'browser', target };
}
