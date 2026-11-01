import type { AyWebsCaptureReaderDefinition } from './contract';

/**
 * Sephora reader v1 deliberately trusts structured product evidence only.
 * DOM selectors stay disabled until they are verified against real page captures.
 */
export const sephoraCaptureReader: AyWebsCaptureReaderDefinition = {
  storeId: 'sephora',
  version: 1,
  priceMode: 'structured_only',
  note: 'JSON-LD, meta and microdata only until Sephora DOM fixtures are measured.',
};
