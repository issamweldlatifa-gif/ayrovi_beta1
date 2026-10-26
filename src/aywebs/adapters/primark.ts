import type { AyWebsAdapterId } from '../../../shared/aywebsStores';
import { CaptureOnlyStoreAdapter } from './capture-only';

/** Primark reader owns this store; market/currency must come from page evidence. */
export class PrimarkAdapter extends CaptureOnlyStoreAdapter {
  readonly id: AyWebsAdapterId = 'primark';
}
