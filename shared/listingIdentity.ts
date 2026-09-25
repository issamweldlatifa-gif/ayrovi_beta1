/** Identity key for the same listing reached through marketing links. Source URLs
 * themselves are never rewritten for display or quotes. Variant IDs, selected
 * options, search parameters and merchant paths remain distinct identities.
 */
const TRACKING_PARAMS = new Set(['ref', 'ref_', 'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'igshid', 'yclid', 'msclkid']);

export function listingIdentityUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return raw.trim();
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch { return raw.trim(); }
}
