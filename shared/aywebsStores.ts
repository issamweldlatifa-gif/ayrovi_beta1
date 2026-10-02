export type AyWebsStoreStatus = 'active' | 'beta' | 'planned';
export type AyWebsBrowserMode = 'embedded' | 'external';
export type AyWebsAdapterId = 'amazon' | 'shein' | 'temu' | 'aliexpress' | 'generic';

export interface AyWebsStoreDefinition {
  id: AyWebsAdapterId;
  name: string;
  domains: readonly string[];
  enabled: boolean;
  captureSupported: boolean;
  adapter: AyWebsAdapterId;
  status: AyWebsStoreStatus;
  browserMode: AyWebsBrowserMode;
  homeUrl: string;
  searchUrlTemplate: string;
  phase: 1 | 2;
}

/**
 * Single AYROVI store registry shared by the API and customer client.
 * Store names, domains and search routes must never be duplicated in UI components.
 */
export const AYWEBS_STORES: readonly AyWebsStoreDefinition[] = [
  {
    id: 'amazon',
    name: 'Amazon',
    domains: [
      'amazon.com', 'amazon.fr', 'amazon.co.uk', 'amazon.de', 'amazon.it', 'amazon.es',
      'amazon.co.jp', 'amazon.ca', 'amazon.com.au', 'amazon.nl', 'amazon.se', 'amazon.pl',
      'amazon.com.tr', 'amazon.ae', 'amazon.sa', 'amazon.in', 'amazon.sg', 'amazon.com.mx',
      'amazon.com.br', 'amazon.eg', 'amazon.be',
    ],
    enabled: true,
    captureSupported: true,
    adapter: 'amazon',
    status: 'active',
    browserMode: 'external',
    homeUrl: 'https://www.amazon.com/',
    searchUrlTemplate: 'https://www.amazon.com/s?k={query}',
    phase: 1,
  },
  {
    id: 'shein',
    name: 'SHEIN',
    domains: ['shein.com', 'shein.co.uk'],
    enabled: true,
    captureSupported: true,
    adapter: 'shein',
    status: 'beta',
    browserMode: 'external',
    homeUrl: 'https://www.shein.com/',
    searchUrlTemplate: 'https://www.shein.com/pdsearch/{query}/',
    phase: 2,
  },
  {
    id: 'temu',
    name: 'TEMU',
    domains: ['temu.com'],
    enabled: true,
    captureSupported: true,
    adapter: 'temu',
    status: 'beta',
    browserMode: 'external',
    homeUrl: 'https://www.temu.com/',
    searchUrlTemplate: 'https://www.temu.com/search_result.html?search_key={query}',
    phase: 2,
  },
  {
    id: 'aliexpress',
    name: 'AliExpress',
    domains: ['aliexpress.com'],
    enabled: true,
    captureSupported: true,
    adapter: 'aliexpress',
    status: 'beta',
    browserMode: 'external',
    homeUrl: 'https://www.aliexpress.com/',
    searchUrlTemplate: 'https://www.aliexpress.com/wholesale?SearchText={query}',
    phase: 2,
  },
] as const;

export function ayWebsHostnameMatches(hostname: string, domains: readonly string[]): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.+$/, '');
  return domains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

export function findAyWebsStore(id: unknown): AyWebsStoreDefinition | null {
  const normalized = String(id || '').trim().toLowerCase();
  return AYWEBS_STORES.find((store) => store.id === normalized) || null;
}

export function detectAyWebsStore(rawUrl: unknown): AyWebsStoreDefinition | null {
  if (typeof rawUrl !== 'string') return null;
  try {
    const url = new URL(rawUrl.trim());
    return AYWEBS_STORES.find((store) => ayWebsHostnameMatches(url.hostname, store.domains)) || null;
  } catch {
    return null;
  }
}

export function ayWebsSearchUrl(store: AyWebsStoreDefinition, query: string): string {
  return store.searchUrlTemplate.replace('{query}', encodeURIComponent(query.trim()));
}
