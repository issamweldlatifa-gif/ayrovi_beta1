/** The catalogue is currently first-party only; no third-party ownership is inferred. */
export const OFFICIAL_PUBLISHER_ID = 'pub_zayrovi';
export const OFFICIAL_PUBLISHER_NAME = 'Zayrovi Team';
export const OFFICIAL_PUBLISHER_ROUTE = '/publisher/zayrovi-team' as const;

export function isRetiredBoutiquePath(path: string): boolean {
  const pathOnly = path.split(/[?#]/, 1)[0];
  return /^\/(?:ar\/|fr\/)?(?:catalog|boutique|shop)\/?$/i.test(pathOnly ?? '');
}

export function heroDestination(href: string, destinationType: string): string {
  if (['catalog', 'boutique', 'shop', 'collection'].includes(destinationType.trim().toLowerCase())) return '';
  if (href.startsWith('/') && !href.startsWith('//')) return isRetiredBoutiquePath(href) ? '' : href;
  try {
    const url = new URL(href);
    if (['zayrovi.com', 'www.zayrovi.com'].includes(url.hostname) && isRetiredBoutiquePath(url.pathname)) return '';
  } catch { return ''; }
  return href;
}
