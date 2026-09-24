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
 * [iso(u0), u0, iso(u1), u1, …] — CHAQUE image tente d'abord sa version isolée,
 * puis retombe sur son original si le PNG isolé échoue (cycle onError du cadre).
 * Avant (bug 24/09/2026) : seule urls[0] était isolée, le reste de la galerie
 * restait brut — les angles 2..N gardaient leur fond marchand.
 */
export function withIsolation(urls: string[]): string[] {
  const output: string[] = [];
  for (const url of urls) {
    const isolated = isolatedMediaUrl(url);
    if (isolated) output.push(isolated);
    output.push(url);
  }
  return output;
}

/** URL à afficher pour UNE image : version isolée sauf si elle a déjà échoué (repli brut). */
export function isolatedSrc(url: string, failures: Record<string, boolean> = {}): string {
  const isolated = isolatedMediaUrl(url);
  return !isolated || failures[url] ? url : isolated;
}
