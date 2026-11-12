import { findAyWebsStore } from '../../../shared/aywebsStores';
import type { AyWebsCaptureReaderDefinition } from './contract';
import { aliexpressCaptureReader } from './aliexpress';
import { amazonCaptureReader } from './amazon';
import { primarkCaptureReader } from './primark';
import { sephoraCaptureReader } from './sephora';
import { sheinCaptureReader } from './shein';
import { temuCaptureReader } from './temu';
import { zalandoCaptureReader } from './zalando';

/** One independently versioned capture reader per store. */
export const AYWEBS_CAPTURE_READERS: Readonly<Record<string, AyWebsCaptureReaderDefinition>> = {
  amazon: amazonCaptureReader,
  zalando: zalandoCaptureReader,
  sephora: sephoraCaptureReader,
  primark: primarkCaptureReader,
  shein: sheinCaptureReader,
  temu: temuCaptureReader,
  aliexpress: aliexpressCaptureReader,
};

export function ayWebsCaptureReader(storeId: unknown): AyWebsCaptureReaderDefinition | null {
  const id = String(storeId ?? '').trim().toLowerCase();
  return AYWEBS_CAPTURE_READERS[id] ?? null;
}

/** Version du profil générique (boutique enregistrée sans lecteur mesuré). */
export const AYWEBS_GENERIC_CAPTURE_READER_VERSION = 1;

/**
 * Lecteur EFFECTIF d'une boutique — point d'entrée unique du service de script.
 * Lecteur dédié s'il existe ; sinon, pour toute boutique enregistrée, activée
 * et capturable, un profil `generic` (cœur partagé en mode `standard` : même
 * comportement qu'avant, mais identifié, versionné et limité à ses domaines).
 * `null` pour une boutique inconnue / désactivée : le bundle historique sert.
 */
export function resolveAyWebsCaptureReader(storeId: unknown): AyWebsCaptureReaderDefinition | null {
  const dedicated = ayWebsCaptureReader(storeId);
  if (dedicated) return dedicated;
  const store = findAyWebsStore(String(storeId ?? '').trim().toLowerCase());
  if (!store || !store.enabled || !store.captureSupported || !store.domains.length) return null;
  return {
    storeId: store.id,
    version: AYWEBS_GENERIC_CAPTURE_READER_VERSION,
    priceMode: 'standard',
    integration: 'generic',
    note: 'Registered store without measured fixtures: shared core, standard heuristics, store-scoped profile.',
  };
}

export { AYWEBS_CAPTURE_CONTRACT_VERSION } from './contract';
export type { AyWebsCaptureIntegration } from './contract';
export type { AyWebsCaptureBundleName, AyWebsCapturePriceMode, AyWebsCaptureReaderDefinition } from './contract';
