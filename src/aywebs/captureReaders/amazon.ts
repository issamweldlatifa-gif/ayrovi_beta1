import type { AyWebsCaptureReaderDefinition } from './contract';

/** Amazon's existing measured buy-box reader, now registered as its own bundle. */
export const amazonCaptureReader: AyWebsCaptureReaderDefinition = {
  storeId: 'amazon',
  version: 1,
  priceMode: 'amazon_buy_box',
  note: 'Amazon buy-box only; sponsored and recommendation prices are excluded.',
};
