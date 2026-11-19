import { carrierTrackingUrl, trackingCarrier } from '../../shared/shippingTracking';
import { parsePublicHttpUrl } from '../services/safeUrl';

export function normalizeTracking(carrier: string, number: string, manualUrl: string) {
  const knownCarrier = trackingCarrier(carrier);
  if (knownCarrier && number && !carrierTrackingUrl(knownCarrier, number)) throw new Error('Numéro de suivi invalide pour ce transporteur.');
  if (knownCarrier) return { carrier: knownCarrier, url: carrierTrackingUrl(knownCarrier, number) || '' };
  if (!manualUrl) return { carrier, url: '' };
  try {
    const url = parsePublicHttpUrl(manualUrl);
    if (url.protocol === 'https:') return { carrier, url: url.toString() };
  } catch { /* no network lookup; this is a browser link only */ }
  throw new Error('Le lien de suivi doit utiliser une adresse HTTPS publique, sans identifiants.');
}
