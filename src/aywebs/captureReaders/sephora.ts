import type { AyWebsCaptureReaderDefinition } from './contract';

/**
 * Sephora reader deliberately trusts structured product evidence only.
 * DOM selectors stay disabled until they are verified against real page captures.
 */
export const sephoraCaptureReader: AyWebsCaptureReaderDefinition = {
  storeId: 'sephora',
  version: 2,
  priceMode: 'structured_only',
  integration: 'dedicated',
  note: 'JSON-LD, meta and microdata only until Sephora DOM fixtures are measured.',
};
