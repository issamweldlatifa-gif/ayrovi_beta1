import type { AyWebsCaptureReaderDefinition } from './contract';

export const sheinCaptureReader: AyWebsCaptureReaderDefinition = {
  storeId: 'shein',
  version: 2,
  priceMode: 'named_containers',
  note: 'Dedicated SHEIN v2 reader: product-intro sale containers, embedded state (gbRawData/productIntroData/SSR), color swatches with goods_id/images, per-size price & stock.',
};
