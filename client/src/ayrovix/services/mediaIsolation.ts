/*
 * ISOLATION D'ARRIÈRE-PLAN — côté vitrine (24/09/2026).
 * Les images marchand DISTANTES passent d'abord par le pipeline serveur
 * (/api/public/media/isolated) qui retire le fond studio uniforme ; l'URL
 * brute reste toujours en repli (cycle onError du cadre) — jamais d'image cassée.
 * Les chemins locaux (uploads, fixtures) ne sont jamais proxyfiés.
 */
import { validProductUrl } from './resultPolicy';

/** Only source media for THIS product. Never request an image from a local,
 * credential-bearing or script URL supplied by an external listing.
 */
export function safeMediaSrc(url: string | null | undefined): boolean {
  if (!url || url.length > 4096) return false;
  if (url.startsWith('/')) return !url.startsWith('//') && !url.includes('..') && !url.includes('\\');
  if (url.startsWith('blob:')) return true; // locally generated Lens preview
  return validProductUrl(url);
}

export function isolatedMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!validProductUrl(url)) return null;
  return `/api/public/media/isolated?url=${encodeURIComponent(url)}`;
}

/** REDIMENSIONNEMENT par NOTRE serveur (WebP) — plus léger et sans hotlink fragile. */
export function proxiedMediaUrl(url: string | null | undefined, width = 760): string | null {
  if (!url) return null;
  if (!validProductUrl(url)) return null;
  return `/api/public/media/img?u=${encodeURIComponent(url)}&w=${width}`;
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
    if (!safeMediaSrc(url)) continue;
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
