import { findAyWebsStore } from '../../../shared/aywebsStores';
import { amazonCaptureReader } from '../captureReaders/amazon';
import { zalandoCaptureReader } from '../captureReaders/zalando';
import { AMAZON_OFFER_SOURCE } from './amazonOfferSource';
import { ZALANDO_OFFER_SOURCE } from './zalando';
import { buildProductOfferCapture } from './productOfferCapture';

/** Same product-offer engine, with the source and domains for each merchant. */
export const AYWEBS_DEDICATED_CAPTURE_SCRIPTS: Readonly<Record<string, string>> = {
  amazon: buildProductOfferCapture(amazonCaptureReader, findAyWebsStore('amazon')!.domains, AMAZON_OFFER_SOURCE, { strictOfferIdentity: true }),
  zalando: buildProductOfferCapture(zalandoCaptureReader, findAyWebsStore('zalando')!.domains, ZALANDO_OFFER_SOURCE),
};
