import type { AyWebsCaptureReaderDefinition } from './contract';

/**
 * Primark reader v1 deliberately trusts structured product evidence only.
 * Region and currency are taken from the page, never inferred from the global host.
 */
export const primarkCaptureReader: AyWebsCaptureReaderDefinition = {
  storeId: 'primark',
  version: 1,
  priceMode: 'structured_only',
  note: 'JSON-LD, meta and microdata only until region-specific Primark fixtures are measured.',
};
