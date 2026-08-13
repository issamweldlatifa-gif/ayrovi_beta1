import jsQR from 'jsqr';

/**
 * AYROVIX · scan de codes en direct (QR + codes-barres EAN/UPC/Code128).
 * Priorité au natif BarcodeDetector (Chrome/Android, Safari 17.4+) —
 * repli jsQR pour les QR uniquement. Aucune frame ne quitte l'appareil.
 */

export type CodeScanResult =
  | { kind: 'url'; value: string }      // QR contenant un lien → analyze-url
  | { kind: 'barcode'; value: string }  // EAN/UPC/Code128 → recherche par code
  | { kind: 'text'; value: string };    // QR sans lien → message clair

export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return null;
  return match[0].replace(/[).,;]+$/, '');
}

const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

interface DetectorLike { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string; format?: string }>>; }

async function createNativeDetector(): Promise<DetectorLike | null> {
  const Detector = (window as any).BarcodeDetector;
  if (!Detector) return null;
  try {
    const supported: string[] = typeof Detector.getSupportedFormats === 'function'
      ? await Detector.getSupportedFormats()
      : ['qr_code', ...BARCODE_FORMATS];
    const formats = ['qr_code', ...BARCODE_FORMATS].filter((format) => supported.includes(format));
    if (!formats.length) return null;
    return new Detector({ formats }) as DetectorLike;
  } catch {
    return null;
  }
}

export interface CodeScanSession { stop: () => void; }

/**
 * Boucle de scan sur un <video> DÉJÀ alimenté par la caméra (le flux appartient
 * au composant parent — une seule caméra ouverte pour toute l'expérience Lens).
 */
export function startCodeScan(
  video: HTMLVideoElement,
  onCode: (result: CodeScanResult) => void,
): CodeScanSession {
  let stopped = false;
  let timer = 0;
  let lastValue = '';
  let lastReadAt = 0;
  let nativeDetector: DetectorLike | null | undefined; // undefined = pas encore testé
  const canvas = document.createElement('canvas');

  const classify = (raw: string): CodeScanResult => {
    const url = extractUrl(raw);
    if (url) return { kind: 'url', value: url };
    const digits = raw.replace(/\D/g, '');
    if (/^\d{6,14}$/.test(digits)) return { kind: 'barcode', value: digits };
    return { kind: 'text', value: raw.slice(0, 140) };
  };

  const tick = async () => {
    if (stopped) return;
    if (nativeDetector === undefined) nativeDetector = await createNativeDetector();
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      // Barcode/QR detection does not need a 1080p frame. Downscaling avoids a
      // multi-megabyte getImageData allocation on every scan tick.
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
          try { raw = (await nativeDetector.detect(canvas))[0]?.rawValue || null; } catch { /* frame ignorée */ }
        } else {
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          raw = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })?.data || null;
        }
        const now = Date.now();
        if (raw && (raw !== lastValue || now - lastReadAt > 2500)) {
          lastValue = raw;
          lastReadAt = now;
          onCode(classify(raw));
        }
      }
    }
    timer = window.setTimeout(() => { void tick(); }, nativeDetector ? 300 : 450);
  };

  void tick();
  return { stop: () => { stopped = true; window.clearTimeout(timer); } };
}
