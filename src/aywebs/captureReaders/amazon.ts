import type { AyWebsCaptureReaderDefinition } from './contract';

/** Amazon facts for the shared Zalando-style product-offer engine. */
export const amazonCaptureReader: AyWebsCaptureReaderDefinition = {
  storeId: 'amazon',
  version: 7,
  priceMode: 'named_containers',
  integration: 'dedicated',
  note: 'Shared product-offer capture with ASIN-scoped Amazon evidence.',
};
