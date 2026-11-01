import { AMAZON_NETWORK_OBSERVER_SCRIPT } from './amazon';
import { AMAZON_DOMAINS } from './select';
import { AYWEBS_NETWORK_OBSERVER_SCRIPT } from '../networkObserverScript';

/** Experimental native transport, not JavaScript. Never pass this to an
 * unpatched WebView: only the patched Android host can consume this envelope. */
export const ANDROID_OBSERVER_ENVELOPE_PREFIX = 'AYWEBS_OBSERVER_V1:';
export function androidObserverEnvelope(): string {
  return ANDROID_OBSERVER_ENVELOPE_PREFIX + JSON.stringify({
    amazonDomains: AMAZON_DOMAINS,
    amazonScript: AMAZON_NETWORK_OBSERVER_SCRIPT,
    legacyScript: AYWEBS_NETWORK_OBSERVER_SCRIPT,
  });
}
