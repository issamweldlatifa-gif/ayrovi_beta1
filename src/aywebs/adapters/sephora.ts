import type { AyWebsAdapterId } from '../../../shared/aywebsStores';
import { CaptureOnlyStoreAdapter } from './capture-only';

/** Sephora reader owns this store; page URLs are not claimed without capture proof. */
export class SephoraAdapter extends CaptureOnlyStoreAdapter {
  readonly id: AyWebsAdapterId = 'sephora';
}
