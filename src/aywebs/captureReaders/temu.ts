import type { AyWebsCaptureReaderDefinition } from './contract';

export const temuCaptureReader: AyWebsCaptureReaderDefinition = {
  storeId: 'temu',
  version: 1,
  priceMode: 'named_containers',
  integration: 'shared_core',
  note: 'Product-bound named price containers with market-price filtering and unanimity.',
};
