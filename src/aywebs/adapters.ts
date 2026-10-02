/**
 * Point d'entrée historique des adaptateurs AYWEBs.
 *
 * Le contrat, la base partagée, les adaptateurs marchand et le registre vivent
 * désormais dans `./adapters/` (§8 du Master Order). Ce module ré-exporte le
 * contrat V1 — `AyWebsStoreAdapter`, `AyWebsCaptureError`,
 * `createAyWebsAdapter` et les quatre adaptateurs — afin que les routes
 * existantes et les tests en place continuent d'importer depuis le même chemin.
 */
export {
  AyWebsCaptureError,
  AYWEBS_ADAPTER_CONTRACT_VERSION,
  AYWEBS_URL_PAGE_HINTS,
  type AyWebsAdapterDependencies,
  type AyWebsAvailabilityCheck,
  type AyWebsCaptureErrorCode,
  type AyWebsAdapterDescriptor,
  type AyWebsPageClassification,
  type AyWebsPurchasePreparation,
  type AyWebsSourceProduct,
  type AyWebsStoreAdapter,
  type AyWebsStoreDefinition,
} from './adapters/contract';

export { BaseStoreAdapter, GenericStoreAdapter } from './adapters/base';
export { AmazonAdapter } from './adapters/amazon';
export { SheinAdapter } from './adapters/shein';
export { TemuAdapter } from './adapters/temu';
export { AliExpressAdapter } from './adapters/aliexpress';
export {
  AYWEBS_ADAPTER_DESCRIPTORS,
  ayWebsAdapterDescriptor,
  createAyWebsAdapter,
  createAyWebsAdapterById,
  listAyWebsAdapterDescriptors,
  resolveAyWebsAdapter,
} from './adapters/registry';
