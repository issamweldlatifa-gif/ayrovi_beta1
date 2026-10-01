import type { StoreType } from '../types';

const MERCHANT_DOMAINS: ReadonlyArray<{ store: StoreType; roots: readonly string[] }> = [
  {
    store: 'amazon',
    roots: [
      'amazon.com', 'amazon.fr', 'amazon.co.uk', 'amazon.de', 'amazon.it', 'amazon.es',
      'amazon.co.jp', 'amazon.ca', 'amazon.com.au', 'amazon.nl', 'amazon.se', 'amazon.pl',
      'amazon.com.tr', 'amazon.ae', 'amazon.sa', 'amazon.in', 'amazon.sg', 'amazon.com.mx',
      'amazon.com.br', 'amazon.eg', 'amazon.be',
    ],
  },
  { store: 'shein', roots: ['shein.com', 'shein.co.uk'] },
  { store: 'temu', roots: ['temu.com'] },
  { store: 'aliexpress', roots: ['aliexpress.com'] },
];

function hostnameOf(input: string): string | null {
  try {
    return new URL(input).hostname.toLowerCase().replace(/\.+$/, '');
  } catch {
    return null;
  }
}

export function detectMerchantStore(input: string): StoreType {
  const hostname = hostnameOf(input);
  if (!hostname) return 'generic';
  for (const merchant of MERCHANT_DOMAINS) {
    if (merchant.roots.some((root) => hostname === root || hostname.endsWith(`.${root}`))) {
      return merchant.store;
    }
  }
  return 'generic';
}

/**
 * Hôtes de rendu ajoutés par l'exploitant (01/10/2026) — séparés par des
 * virgules, ex. `AYROVI_TRUSTED_RENDER_HOSTS=sportsdirect.fr,zalando.fr`.
 * Sans cette liste, seuls les quatre marchands connus ci-dessus passent au
 * rendu payant : un lien Lens vers une autre boutique retombait alors sur le
 * fetch direct seul, et échouait devant un bot-wall.
 */
function extraRenderRoots(): string[] {
  return String(process.env.AYROVI_TRUSTED_RENDER_HOSTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase().replace(/^www\./, ''))
    .filter((value) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value));
}

/** Only send HTTPS pages on verified merchant domains to a third-party renderer. */
export function isTrustedRenderTarget(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    if (detectMerchantStore(url.toString()) !== 'generic') return true;
    const hostname = url.hostname.toLowerCase().replace(/\.+$/, '');
    return extraRenderRoots().some((root) => hostname === root || hostname.endsWith(`.${root}`));
  } catch {
    return false;
  }
}
