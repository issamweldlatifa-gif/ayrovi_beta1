/*
 * ISOLATION D'ARRIÈRE-PLAN — côté vitrine (24/09/2026).
 * Les images marchand DISTANTES passent d'abord par le pipeline serveur
 * (/api/public/media/isolated) qui retire le fond studio uniforme ; l'URL
 * brute reste toujours en repli (cycle onError du cadre) — jamais d'image cassée.
 * Les chemins locaux (uploads, fixtures) ne sont jamais proxyfiés.
 */
export function isolatedMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return `/api/public/media/isolated?url=${encodeURIComponent(url)}`;
}


/**
 * COMPOSITION AYROVI (phase 2, 25/09/2026) : l'image marchand revient DÉJÀ posée
 * sur notre mockup (9/13, #F0F2F2), produit détouré, échelle uniforme, centrage
 * sur le barycentre. Le serveur ne renvoie cette version QUE si le contrat
 * d'acceptation est tenu ; sinon il redirige vers l'original — la chaîne de repli
 * du cadre (onError) reste donc intacte.
 */
export const COMPOSED_PREFIX = '/api/public/media/card';

export function composedMediaUrl(url: string | null | undefined, width = 900): string | null {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return `${COMPOSED_PREFIX}?u=${encodeURIComponent(url)}&w=${width}`;
}

/** Vrai si l'URL affichée est une composition AYROVI (cadrage déjà fait côté serveur). */
export function isComposedUrl(url: string | null | undefined): boolean {
  return Boolean(url && url.startsWith(COMPOSED_PREFIX));
}

/** REDIMENSIONNEMENT par NOTRE serveur (WebP) — plus léger et sans hotlink fragile. */
export function proxiedMediaUrl(url: string | null | undefined, width = 760): string | null {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return `/api/public/media/img?u=${encodeURIComponent(url)}&w=${width}`;
}

/**
 * [card(u0), iso(u0), u0, card(u1), …] — CHAQUE image tente d'abord sa version isolée,
 * puis retombe sur son original si le PNG isolé échoue (cycle onError du cadre).
 * Avant (bug 24/09/2026) : seule urls[0] était isolée, le reste de la galerie
 * restait brut — les angles 2..N gardaient leur fond marchand.
 */
export function withIsolation(urls: string[]): string[] {
  const output: string[] = [];
  for (const url of urls) {
    const composed = composedMediaUrl(url);
    if (composed) output.push(composed);
    const isolated = isolatedMediaUrl(url);
    if (isolated) output.push(isolated);
    const proxied = proxiedMediaUrl(url);
    if (proxied) output.push(proxied);
    output.push(url);
  }
  return output;
}

/** URL à afficher pour UNE image : version isolée sauf si elle a déjà échoué (repli brut). */
export function isolatedSrc(url: string, failures: Record<string, boolean> = {}): string {
  const isolated = isolatedMediaUrl(url);
  return !isolated || failures[url] ? url : isolated;
}

/**
 * CHAÎNE D'AFFICHAGE D'UNE IMAGE PRODUIT (25/09/2026) — du meilleur rendu au plus sûr.
 *
 * Pourquoi : la petite carte passait déjà par la COMPOSITION (phase 2 : produit
 * détouré, posé sur notre mockup), pendant que la grande fiche s'arrêtait à
 * l'ISOLATION seule (phase 1). Même produit, deux rendus — le client l'a vu
 * immédiatement. Une seule chaîne sert désormais les deux surfaces :
 *
 *   1. composition AYROVI   → produit détouré sur notre fond studio ;
 *   2. isolation seule      → si la composition n'est pas servie ;
 *   3. image marchand brute → dernier recours, jamais d'image cassée.
 *
 * Le pas courant est porté par l'appelant (un compteur par URL, avancé sur
 * `onError`) : aucune image ne disparaît, elle recule d'un cran dans la chaîne.
 */
export function productMediaChain(url: string, width = 900): string[] {
  const chain = [composedMediaUrl(url, width), isolatedMediaUrl(url), url]
    .filter((candidate): candidate is string => Boolean(candidate));
  return Array.from(new Set(chain));
}

export function productMediaSrc(url: string, steps: Record<string, number> = {}, width = 900): string {
  const chain = productMediaChain(url, width);
  const step = Math.min(Math.max(steps[url] ?? 0, 0), chain.length - 1);
  return chain[step];
}

/** Reste-t-il un repli après le pas courant ? (sinon, c'est l'image brute) */
export function hasMediaFallback(url: string, steps: Record<string, number> = {}, width = 900): boolean {
  return (steps[url] ?? 0) < productMediaChain(url, width).length - 1;
}
