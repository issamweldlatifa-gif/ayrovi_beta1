import type { AyWebsCaptureReaderDefinition } from './contract';

/** Zalando gets an independently versioned reader; server variant offers remain authoritative. */
export const zalandoCaptureReader: AyWebsCaptureReaderDefinition = {
  storeId: 'zalando',
  version: 2,
  priceMode: 'structured_only',
  note: 'ProductGroup variant offers only; generic page DOM prices are excluded.',
};
