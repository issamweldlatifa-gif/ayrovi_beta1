/** Don't send beta users to a guessed store listing. Accept only release-configured official store URLs. */
export function storeListing(raw: string | undefined, platform: string): string | null {
  try {
    const url = new URL(raw?.trim() ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    if (platform === 'android' && url.hostname === 'play.google.com' && url.pathname === '/store/apps/details'
      && /^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+$/.test(url.searchParams.get('id') ?? '')) {
      return `${url.origin}${url.pathname}?id=${url.searchParams.get('id')}`;
    }
    if (platform === 'ios' && url.hostname === 'apps.apple.com' && /^\/(?:[a-z]{2}\/)?app\/(?:[\w-]+\/)?id\d+$/.test(url.pathname)) return `${url.origin}${url.pathname}`;
  } catch { /* No configured listing. */ }
  return null;
}
