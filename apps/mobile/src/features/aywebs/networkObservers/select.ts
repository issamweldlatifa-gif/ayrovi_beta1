import { AMAZON_NETWORK_OBSERVER_SCRIPT } from './amazon';
import { AYWEBS_NETWORK_OBSERVER_SCRIPT } from '../networkObserverScript';

/** The allowlist mirrors the Amazon domains in shared/aywebsStores.ts.
 * This selector runs in the app, not inside the injected script. */
export const AMAZON_DOMAINS = [
  'amazon.fr', 'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.it', 'amazon.es',
  'amazon.co.jp', 'amazon.ca', 'amazon.com.au', 'amazon.nl', 'amazon.se', 'amazon.pl',
  'amazon.com.tr', 'amazon.ae', 'amazon.sa', 'amazon.in', 'amazon.sg', 'amazon.com.mx',
  'amazon.com.br', 'amazon.eg', 'amazon.be',
];

export type ObserverChoice = { kind: 'amazon' | 'legacy'; script: string } | { kind: 'none'; script: undefined };

/** Select exactly one script for a *known document URL*. Do not use this at
 * document start until the host can guarantee the URL is final after redirects. */
export function selectNetworkObserver(rawUrl: string): ObserverChoice {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'none', script: undefined };
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const amazon = AMAZON_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
    return amazon
      ? { kind: 'amazon', script: AMAZON_NETWORK_OBSERVER_SCRIPT }
      : { kind: 'legacy', script: AYWEBS_NETWORK_OBSERVER_SCRIPT };
  } catch {
    return { kind: 'none', script: undefined };
  }
}
