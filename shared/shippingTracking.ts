/** Browser tracking destinations only. No carrier request, labels or webhook are enabled. */
export const TRACKING_CARRIERS = ['DHL Express', 'UPS'] as const;
export function trackingCarrier(value: string) {
  const key = value.trim().toLowerCase();
  if (key === 'dhl' || key === 'dhl express') return 'DHL Express';
  if (key === 'ups') return 'UPS';
  return null;
}
export function carrierTrackingUrl(carrier: string, trackingNumber: string): string | null {
  const name = trackingCarrier(carrier);
  const reference = trackingNumber.trim();
  if (!name || !/^[A-Za-z0-9-]{4,64}$/.test(reference)) return null;
  const url = new URL(name === 'UPS' ? 'https://www.ups.com/track' : 'https://www.dhl.com/global-en/home/tracking.html');
  url.searchParams.set(name === 'UPS' ? 'tracknum' : 'tracking-id', reference);
  return url.toString();
}
