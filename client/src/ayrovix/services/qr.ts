import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';

/**
 * AYROVIX · scan local QR + codes-barres.
 * BarcodeDetector natif est tenté en premier; ZXing couvre tous les navigateurs
 * et les formats QR, EAN, UPC, Code 39/128 et ITF sans envoyer de frame au serveur.
 */

export type CodeScanResult =
  | { kind: 'url'; value: string }
  | { kind: 'barcode'; value: string }
  | { kind: 'text'; value: string };

export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return null;
  return match[0].replace(/[).,;]+$/, '');
}

const NATIVE_FORMATS = ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];
const ZXING_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.AZTEC,
  BarcodeFormat.PDF_417,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
];

interface DetectorLike { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string; format?: string }>>; }

async function createNativeDetector(): Promise<DetectorLike | null> {
  const Detector = (window as any).BarcodeDetector;
  if (!Detector) return null;
  try {
    const supported: string[] = typeof Detector.getSupportedFormats === 'function'
      ? await Detector.getSupportedFormats()
      : NATIVE_FORMATS;
    const formats = NATIVE_FORMATS.filter((format) => supported.includes(format));
    if (!formats.length) return null;
    return new Detector({ formats }) as DetectorLike;
  } catch {
    return null;
  }
}

function classifyCode(raw: string): CodeScanResult {
  const value = raw.trim();
  const url = extractUrl(value);
  if (url) return { kind: 'url', value: url };
  const digits = value.replace(/[\s-]/g, '');
  if (/^\d{6,14}$/.test(digits)) return { kind: 'barcode', value: digits };
  return { kind: 'text', value: value.slice(0, 140) };
}

export interface CodeScanSession { stop: () => void; }

export function startCodeScan(
  video: HTMLVideoElement,
  onCode: (result: CodeScanResult) => void,
): CodeScanSession {
  let stopped = false;
  let timer = 0;
  let lastValue = '';
  let lastReadAt = 0;
  let nativeDetector: DetectorLike | null | undefined;
  const canvas = document.createElement('canvas');
  const zxing = new MultiFormatReader();
  const hints = new Map<DecodeHintType, any>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);
  zxing.setHints(hints);

  const decodeWithZxing = (frame: ImageData): string | null => {
    try {
      const source = new RGBLuminanceSource(frame.data, frame.width, frame.height);
      const bitmap = new BinaryBitmap(new HybridBinarizer(source));
      return zxing.decodeWithState(bitmap).getText() || null;
    } catch {
      return null;
    } finally {
      zxing.reset();
      zxing.setHints(hints);
    }
  };

  const tick = async () => {
    if (stopped) return;
    if (nativeDetector === undefined) nativeDetector = await createNativeDetector();
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      const scale = Math.min(1, 640 / video.videoWidth);
      const targetWidth = Math.max(1, Math.round(video.videoWidth * scale));
      const targetHeight = Math.max(1, Math.round(video.videoHeight * scale));
      if (canvas.width !== targetWidth) canvas.width = targetWidth;
      if (canvas.height !== targetHeight) canvas.height = targetHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        let raw: string | null = null;
        if (nativeDetector) {
          try { raw = (await nativeDetector.detect(canvas))[0]?.rawValue || null; } catch { /* frame suivante */ }
        }
        if (!raw) raw = decodeWithZxing(ctx.getImageData(0, 0, canvas.width, canvas.height));
        const now = Date.now();
        if (raw && (raw !== lastValue || now - lastReadAt > 2500)) {
          lastValue = raw;
          lastReadAt = now;
          onCode(classifyCode(raw));
        }
      }
    }
    timer = window.setTimeout(() => { void tick(); }, nativeDetector ? 300 : 450);
  };

  void tick();
  return {
    stop: () => {
      stopped = true;
      window.clearTimeout(timer);
      zxing.reset();
    },
  };
}
