import { AYWEBS_STORES, findAyWebsStore } from '../../../shared/aywebsStores';
import { amazonCaptureReader } from '../captureReaders/amazon';
import { zalandoCaptureReader } from '../captureReaders/zalando';
import { AMAZON_OFFER_SOURCE } from './amazonOfferSource';
import { ZALANDO_OFFER_SOURCE } from './zalando';
import { buildProductOfferCapture } from './productOfferCapture';
import { AYWEBS_OFFER_EVIDENCE } from '../captureBundles.generated';
import { resolveAyWebsCaptureReader } from '../captureReaders/registry';
import type { AyWebsCaptureReaderDefinition } from '../captureReaders/contract';

const unchanged = new Set(['amazon', 'zalando', 'temu', 'aliexpress', 'shein']);
const migrated = AYWEBS_STORES.flatMap((store) => {
  const reader = !unchanged.has(store.id) && resolveAyWebsCaptureReader(store.id);
  return reader && reader.integration === 'dedicated' ? [{ store, reader }] : [];
});
const isMigrated = new Set(migrated.map(({ store }) => store.id));
export const usesMigratedOfferReader = (storeId: string): boolean => isMigrated.has(storeId);

export function buildMigratedOfferReader(reader: AyWebsCaptureReaderDefinition, domains: readonly string[]): string {
  return buildProductOfferCapture(reader, domains, AYWEBS_OFFER_EVIDENCE.kernel, { strictOfferIdentity: true });
}

/** Host routing for older clients. Embed the catalogue engine once, not once per merchant. */
export function buildMigratedOfferDispatch(): string {
  const first = migrated[0];
  // The bundle builder stubs generated evidence while reading the raw core.
  if (!first || !AYWEBS_OFFER_EVIDENCE.kernel) return '';
  const profiles = migrated.map(({ store, reader }) => ({ storeId: store.id, version: reader.version, priceMode: reader.priceMode, domains: store.domains }));
  const catalogueScript = buildProductOfferCapture(first.reader, [], AYWEBS_OFFER_EVIDENCE.kernel, { strictOfferIdentity: true, runtimeProfile: true }).replace(/;$/, '');
  return `
  function matchesOfferDomain(domains) {
    for (var k = 0; k < domains.length; k++) {
      var suffix = '.' + domains[k];
      if (host === domains[k] || host.slice(-suffix.length) === suffix) return true;
    }
    return false;
  }
  var offerProfiles = ${JSON.stringify(profiles)};
  for (var p = 0; p < offerProfiles.length; p++) {
    var hostOfferProfile = offerProfiles[p];
    if (matchesOfferDomain(hostOfferProfile.domains)) return (${catalogueScript});
  }`;
}

/** Same product-offer engine, with the source and domains for each merchant. */
export const AYWEBS_DEDICATED_CAPTURE_SCRIPTS: Readonly<Record<string, string>> = {
  amazon: buildProductOfferCapture(amazonCaptureReader, findAyWebsStore('amazon')!.domains, AMAZON_OFFER_SOURCE, { strictOfferIdentity: true }),
  zalando: buildProductOfferCapture(zalandoCaptureReader, findAyWebsStore('zalando')!.domains, ZALANDO_OFFER_SOURCE),
};
