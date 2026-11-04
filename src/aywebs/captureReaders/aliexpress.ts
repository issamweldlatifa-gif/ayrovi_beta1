import type { AyWebsCaptureReaderDefinition } from './contract';

export const aliexpressCaptureReader: AyWebsCaptureReaderDefinition = {
  storeId: 'aliexpress',
  version: 2,
  priceMode: 'named_containers',
  note: 'Dedicated AliExpress v2 reader: Comet/PDP current-price containers, embedded state (runParams/_dida_config_/__AER_DATA__), multi-dimension SKU matrix (Color/Size/Plug/Ships From/Bundle) with exact per-combination price & stock.',
};
