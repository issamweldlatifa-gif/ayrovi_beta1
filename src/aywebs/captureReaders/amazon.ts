import type { AyWebsCaptureReaderDefinition } from './contract';

/** Amazon's independently versioned, standalone mobile reader. */
export const amazonCaptureReader: AyWebsCaptureReaderDefinition = {
  storeId: 'amazon',
  version: 4,
  priceMode: 'amazon_buy_box',
  note: 'Amazon buy-box only; sponsored and recommendation prices are excluded.',
};
