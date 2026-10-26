import type { AyWebsCaptureReaderDefinition } from './contract';
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
};

export function ayWebsCaptureReader(storeId: unknown): AyWebsCaptureReaderDefinition | null {
  const id = String(storeId ?? '').trim().toLowerCase();
  return AYWEBS_CAPTURE_READERS[id] ?? null;
}

export type { AyWebsCapturePriceMode, AyWebsCaptureReaderDefinition } from './contract';
