import jsQR from 'jsqr';

/**
 * AYROVIX · décodage QR temps réel.
 * Priorité à l'API native BarcodeDetector (Chrome/Android & Safari récents),
 * repli universel jsQR (iOS anciens). Aucune frame ne quitte l'appareil.
 */

export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return null;
  return match[0].replace(/[).,;]+$/, '');
}

export interface QrScanSession {
  stop: () => void;
}

interface DetectorLike { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>; }

function createNativeDetector(): DetectorLike | null {
  const Detector = (window as any).BarcodeDetector;
  if (!Detector) return null;
  try {
    return new Detector({ formats: ['qr_code'] }) as DetectorLike;
  } catch {
    return null;
  }
}

export function startQrScan(
  video: HTMLVideoElement,
  onResult: (url: string) => void,
  onInvalid: (text: string) => void,
): QrScanSession {
  let stopped = false;
  let stream: MediaStream | null = null;
  let raf = 0;
  const canvas = document.createElement('canvas');
  const native = createNativeDetector();

  const tick = async () => {
    if (stopped) return;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        let text: string | null = null;
        if (native) {
          try {
            const codes = await native.detect(canvas);
            text = codes[0]?.rawValue || null;
          } catch { /* frame ignorée */ }
        } else {
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
          text = code?.data || null;
        }
        if (text) {
          const url = extractUrl(text);
          if (url) { stop(); onResult(url); return; }
          onInvalid(text.slice(0, 120));
          // anti-spam : petite pause avant le prochain essai
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
    }
    raf = window.setTimeout(() => { void tick(); }, 220) as unknown as number;
  };

  const stop = () => {
    stopped = true;
    window.clearTimeout(raf);
    stream?.getTracks().forEach((track) => track.stop());
  };

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then((media) => {
      if (stopped) { media.getTracks().forEach((track) => track.stop()); return; }
      stream = media;
      video.srcObject = media;
      return video.play();
    })
    .then(() => { void tick(); })
    .catch(() => {
      // Permission refusée ou caméra indisponible : le composant affiche le fallback.
      stop();
      onInvalid('__CAMERA_UNAVAILABLE__');
    });

  return { stop };
}
