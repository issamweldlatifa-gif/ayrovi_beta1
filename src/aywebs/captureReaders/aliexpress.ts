import type { AyWebsCaptureReaderDefinition } from './contract';

export const aliexpressCaptureReader: AyWebsCaptureReaderDefinition = {
  storeId: 'aliexpress',
  version: 3,
  priceMode: 'named_containers',
  integration: 'shared_core',
  bundle: 'aliexpress',
  note: 'AliExpress reader: Comet/PDP current-price containers, embedded state (runParams/_dida_config_/__AER_DATA__), multi-dimension SKU matrix (Color/Size/Plug/Ships From/Bundle) with price and stock joined only by exact SKU identity.',
};
