import type { AyWebsCaptureReaderDefinition } from './contract';

export const temuCaptureReader: AyWebsCaptureReaderDefinition = {
  storeId: 'temu',
  version: 2,
  priceMode: 'named_containers',
  integration: 'shared_core',
  bundle: 'temu',
  note: 'Product-bound currency and price evidence, including explicit Tunisian dinar labels.',
};
