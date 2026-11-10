/**
 * Signal unique « remonter la page en haut ».
 *
 * Pourquoi un module si petit : DEUX gestes doivent ramener la page courante
 * en haut — re-toucheronner l'onglet « Accueil » déjà actif, et toucher le
 * mot-symbole zayrovi. Aucun des deux ne connaît la `ScrollView` de l'écran
 * (elle vit dans `AppScreen`) ; l'écran, lui, se déclare ici au montage.
 *
 * Un seul écran s'annonce (l'accueil, qui reste monté sous les onglets) :
 * le dernier inscrit gagne, ce qui reste correct si une future page veut
 * le même geste — elle remplacerait l'accueil, jamais les deux à la fois.
 */

/** Le geste concret de l'écran : `scrollTo({ y: 0, animated: true })`. */
export type ScrollToTopHandler = () => void;

let handler: ScrollToTopHandler | null = null;

/** L'écran courant déclare COMMENT remonter ; le débranchement est automatique au démontage. */
export function registerScrollToTopHandler(next: ScrollToTopHandler | null): void {
  handler = next;
}

/** Demandé par la barre d'onglets ou l'en-tête ; sans écran déclaré, c'est un no-op sûr. */
export function requestScrollToTop(): void {
  handler?.();
}
