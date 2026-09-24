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

/** [isolé(u0), u0, …rest] — la tentative isolée d'abord, la brute en repli. */
export function withIsolation(urls: string[]): string[] {
  if (!urls.length) return urls;
  const isolated = isolatedMediaUrl(urls[0]);
  if (!isolated || isolated === urls[0]) return urls;
  return [isolated, ...urls];
}
