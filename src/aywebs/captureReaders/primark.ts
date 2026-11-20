import type { AyWebsCaptureReaderDefinition } from './contract';

/**
 * Primark reader deliberately trusts structured product evidence only.
 * Region and currency are taken from the page, never inferred from the global host.
 */
export const primarkCaptureReader: AyWebsCaptureReaderDefinition = {
  storeId: 'primark',
  version: 2,
  priceMode: 'structured_only',
  integration: 'dedicated',
  note: 'JSON-LD, meta and microdata only until region-specific Primark fixtures are measured.',
};
