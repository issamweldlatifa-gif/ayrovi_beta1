import type { SmartLinkScraper } from '../../scraper/scraper';
import type { AyWebsAdapterId, AyWebsStoreDefinition } from '../../../shared/aywebsStores';
import { AYWEBS_STORES, detectAyWebsStore, findAyWebsStore } from '../../../shared/aywebsStores';
import { AyWebsCaptureError, type AyWebsAdapterDescriptor, type AyWebsStoreAdapter } from './contract';
import { BaseStoreAdapter, GenericStoreAdapter } from './base';
import { AmazonAdapter } from './amazon';
import { SheinAdapter } from './shein';
import { TemuAdapter } from './temu';
import { AliExpressAdapter } from './aliexpress';

/**
 * AYWEBs — registre des adaptateurs (§8).
 *
 * Le SEUL endroit où un adaptateur est instancié. Ajouter une boutique :
 *   1. une ligne dans `shared/aywebsStores.ts` ;
 *   2. un adaptateur qui étend `BaseStoreAdapter` ;
 *   3. une entrée dans `ADAPTER_FACTORIES` + `ADAPTER_DESCRIPTORS`.
 * Rien d'autre dans AYWEBs n'est à réécrire — c'est la condition pour que le
 * module reste modulaire au lieu d'accumuler des `if (store === …)`.
 */

type AdapterFactory = (scraper: SmartLinkScraper) => AyWebsStoreAdapter;

const ADAPTER_FACTORIES: Record<AyWebsAdapterId, AdapterFactory> = {
  amazon: (scraper) => new AmazonAdapter(scraper),
  shein: (scraper) => new SheinAdapter(scraper),
  temu: (scraper) => new TemuAdapter(scraper),
  aliexpress: (scraper) => new AliExpressAdapter(scraper),
  generic: (scraper) => new GenericStoreAdapter(scraper),
};

/**
 * Ce que chaque adaptateur sait réellement faire. Ces descripteurs alimentent
 * l'Admin (Store Adapters) et l'écran de santé : on n'affiche jamais une
 * capacité que le code ne fournit pas.
 */
export const AYWEBS_ADAPTER_DESCRIPTORS: readonly AyWebsAdapterDescriptor[] = [
  {
    id: 'amazon', label: 'Amazon', integrationType: 'SUPPORTED', purchaseMode: 'MANUAL_REVIEW',
    reads: ['product_page_url', 'title', 'price', 'currency', 'images', 'variants', 'availability'],
    implemented: true,
    pendingIntegration: 'Achat marchand automatisé non connecté : les commandes partent en revue humaine.',
  },
  {
    id: 'shein', label: 'SHEIN', integrationType: 'PARTIALLY_SUPPORTED', purchaseMode: 'MANUAL_REVIEW',
    reads: ['product_page_url', 'title', 'price', 'currency', 'images', 'variants'],
    implemented: true,
    pendingIntegration: 'Bot-wall fréquent : rendered provider requis en production, achat en revue humaine.',
  },
  {
    id: 'temu', label: 'TEMU', integrationType: 'PARTIALLY_SUPPORTED', purchaseMode: 'MANUAL_REVIEW',
    reads: ['product_page_url', 'title', 'price', 'currency', 'images', 'variants'],
    implemented: true,
    pendingIntegration: 'Bot-wall fréquent : rendered provider requis en production, achat en revue humaine.',
  },
  {
    id: 'aliexpress', label: 'AliExpress', integrationType: 'PARTIALLY_SUPPORTED', purchaseMode: 'MANUAL_REVIEW',
    reads: ['product_page_url', 'title', 'price', 'currency', 'images', 'variants'],
    implemented: true,
    pendingIntegration: 'Variantes parfois incomplètes : achat en revue humaine.',
  },
  {
    id: 'generic', label: 'Boutique générique', integrationType: 'URL_REQUEST', purchaseMode: 'URL_REQUEST',
    reads: ['title', 'price', 'currency', 'images'],
    implemented: true,
    pendingIntegration: 'Aucune reconnaissance de fiche produit : la commande passe par « Order with URL ».',
  },
] as const;

/** Instancie l'adaptateur d'une boutique du registre. */
export function createAyWebsAdapter(store: AyWebsStoreDefinition, scraper: SmartLinkScraper): AyWebsStoreAdapter {
  const factory = ADAPTER_FACTORIES[store.adapter];
  if (!factory) {
    throw new AyWebsCaptureError('ADAPTER_UNAVAILABLE', 'La capture de cette boutique n’est pas encore disponible.');
  }
  return factory(scraper);
}

/** Adaptateur par identifiant (indépendant du registre) — utilisé par l'analyse de page. */
export function createAyWebsAdapterById(id: AyWebsAdapterId | string, scraper: SmartLinkScraper): AyWebsStoreAdapter {
  const factory = ADAPTER_FACTORIES[String(id) as AyWebsAdapterId];
  if (!factory) {
    throw new AyWebsCaptureError('ADAPTER_UNAVAILABLE', 'Aucun adaptateur AyWebs pour cet identifiant.');
  }
  return factory(scraper);
}

/** Résout l'adaptateur d'une URL : registre d'abord, générique sinon. */
export function resolveAyWebsAdapter(rawUrl: string, scraper: SmartLinkScraper): {
  adapter: AyWebsStoreAdapter;
  store: AyWebsStoreDefinition | null;
  registered: boolean;
} {
  const store = detectAyWebsStore(rawUrl);
  if (store) return { adapter: createAyWebsAdapter(store, scraper), store, registered: true };
  return { adapter: createAyWebsAdapterById('generic', scraper), store: null, registered: false };
}

/** Tous les adaptateurs déclarés — pour l'écran de santé et l'Admin. */
export function listAyWebsAdapterDescriptors(): Array<{ descriptor: AyWebsAdapterDescriptor; store: AyWebsStoreDefinition | null }> {
  return AYWEBS_ADAPTER_DESCRIPTORS.map((descriptor) => ({ descriptor, store: findAyWebsStore(descriptor.id) }));
}

export function ayWebsAdapterDescriptor(id: AyWebsAdapterId | string): AyWebsAdapterDescriptor | null {
  return AYWEBS_ADAPTER_DESCRIPTORS.find((descriptor) => descriptor.id === String(id)) || null;
}

export { BaseStoreAdapter, GenericStoreAdapter };
