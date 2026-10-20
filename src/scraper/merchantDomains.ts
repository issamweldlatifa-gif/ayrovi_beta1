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
  { store: 'zalando', roots: ['zalando.fr', 'zalando.de'] },
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

