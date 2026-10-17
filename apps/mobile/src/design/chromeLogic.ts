/**
 * Décision d'affichage du chrome — PURE, donc testable sans appareil.
 *
 * Fichier séparé de `chrome.tsx` pour une raison précise : `chrome.tsx`
 * importe `react-native` (LayoutAnimation, Platform), et les tests ne peuvent
 * pas transformer React Native. Garder la DÉCISION ici et le BRANCHEMENT là-bas
 * est ce qui permet de tester le comportement au lieu de tester du React.
 */

/**
 * Faut-il masquer la barre ?
 *
 * @param currentY  position de défilement
 * @param previousY position au relevé précédent
 * @param wasHidden état courant (inchangé sous le seuil)
 * @param threshold course minimale, en points, avant de changer d'état
 *
 * Trois règles, chacune pour une raison :
 *  • **en haut de page, toujours visible** — sinon la barre disparaît au
 *    premier pixel et l'écran paraît cassé ;
 *  • **un seuil, pas un pixel** — sans lui, le moindre tremblement du doigt
 *    fait clignoter la barre (le fameux Jacob) ;
 *  • **sous le seuil, rien ne change** — l'absence de décision EST la décision,
 *    et c'est ce qui rend le geste stable.
 */
export function chromeHiddenFor(
  currentY: number,
  previousY: number,
  wasHidden: boolean,
  threshold = 8,
): boolean {
  if (!Number.isFinite(currentY) || currentY <= 0) return false;
  const delta = currentY - (Number.isFinite(previousY) ? previousY : 0);
  if (delta > threshold) return true;
  if (delta < -threshold) return false;
  return wasHidden;
}

/** Course minimale avant réaction : assez pour un vrai geste, trop peu pour un tremblement. */
export const CHROME_THRESHOLD = 8;

/** L'en-tête reste transparent au sommet et devient lisible dès que la page défile. */
export function headerSolidFor(currentY: number, threshold = CHROME_THRESHOLD): boolean {
  const safeThreshold = Number.isFinite(threshold) ? Math.max(0, threshold) : CHROME_THRESHOLD;
  return Number.isFinite(currentY) && currentY > safeThreshold;
}
