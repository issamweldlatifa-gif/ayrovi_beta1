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

/* ── Repli de la barre avec hystérésis (12/11/2026) ──────────────────────── */

/**
 * État suivi pendant le défilement. `anchor` = point de retournement : la
 * position la plus HAUTE vue tant que la barre est visible (on mesure la
 * descente depuis là), la plus BASSE vue tant qu'elle est masquée (on mesure
 * la remontée depuis là).
 */
export interface ChromeTravelState {
  hidden: boolean;
  anchor: number;
}

/** Course cumulée avant de changer d'état : un vrai geste, jamais un tremblement. */
export const CHROME_TRAVEL = 24;
/** Zone du haut de page où la barre reste toujours visible. */
export const CHROME_TOP_ZONE = 48;

/**
 * Pourquoi une course CUMULÉE plutôt que l'écart entre deux événements
 * (`chromeHiddenFor`) : avec `scrollEventThrottle = 16`, un défilement lent
 * avance de 2–6 points par événement — il n'atteignait jamais le seuil de 8 et
 * la barre ne bougeait pas, puis un geste rapide la faisait basculer d'un coup.
 * Un doigt qui hésite (haut/bas de quelques points) la faisait aussi clignoter.
 * Ici, seule la distance parcourue DEPUIS le dernier retournement compte.
 *
 * Bords : en haut (et pendant le rebond iOS au-dessus de 0), toujours visible ;
 * au rebond du BAS (offset au-delà de la fin), rien ne change — sinon le
 * retour élastique serait lu comme une remontée et la barre ressortirait.
 */
export function nextChromeTravel(
  state: ChromeTravelState,
  y: number,
  options: { maxY?: number; travel?: number; topZone?: number } = {},
): ChromeTravelState {
  const travel = options.travel ?? CHROME_TRAVEL;
  const topZone = options.topZone ?? CHROME_TOP_ZONE;
  if (!Number.isFinite(y)) return state;
  if (y <= topZone) return { hidden: false, anchor: Math.max(0, y) };
  const maxY = options.maxY;
  if (maxY !== undefined && Number.isFinite(maxY) && maxY > topZone && y >= maxY) {
    // Rebond du bas : on garde l'état, l'ancre suit sans déclencher.
    return state.hidden ? { hidden: true, anchor: Math.max(state.anchor, Math.min(y, maxY)) } : state;
  }
  if (state.hidden) {
    const anchor = Math.max(state.anchor, y);
    return anchor - y > travel ? { hidden: false, anchor: y } : { hidden: true, anchor };
  }
  const anchor = Math.min(state.anchor, y);
  return y - anchor > travel ? { hidden: true, anchor: y } : { hidden: false, anchor };
}
