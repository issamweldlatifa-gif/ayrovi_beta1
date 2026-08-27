import type { AyrovixCandidate, AyrovixDetectedPrice } from '../types';

/**
 * AYROVIX LENS — LIVE multi-product vision (types + helpers légers).
 *
 * Live est une modalité d'ENTRÉE uniquement : le matching, le ranking et le pricing
 * restent ceux du backend existant (analyzeImage → candidates → Core Engine).
 * Aucun calcul de prix n'est fait côté client.
 *
 * NOTE: la détection multi-objets à bounding-boxes nécessite un vrai runtime on-device
 * (ONNX/MediaPipe/WebGPU). En son absence, on ne FABRIQUE pas de boxes : on verrouille
 * une identification par frame échantillonnée (confirmation temporelle) et on accumule
 * les objets verrouillés dans une collection. Un détecteur réel pourra remplir `box`.
 */

export interface LiveDetectedObject {
  id: string;               // trackingId stable tant que l'objet reste verrouillé
  label: string;
  confidence: number;       // % du meilleur match
  image: string;            // aperçu recadré (dataURL) — seul élément envoyé/affiché
  candidates: AyrovixCandidate[];
  detectedPrice?: AyrovixDetectedPrice | null;
  status: 'tracking' | 'locked';
  box?: { x: number; y: number; w: number; h: number } | null; // rempli par un futur détecteur
  code?: { kind: 'qr' | 'barcode'; value: string } | null;
}

/** Signature perceptuelle légère (aHash 8x8) pour éviter de retraiter une scène inchangée. */
export function frameSignature(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  // moyenne luminance
  let sum = 0;
  const lums: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lums.push(l);
    sum += l;
  }
  const avg = sum / (lums.length || 1);
  let bits = '';
  for (let i = 0; i < lums.length; i += 1) bits += lums[i] > avg ? '1' : '0';
  return bits;
}

/** Distance de Hamming normalisée (0..1) entre deux signatures de même longueur. */
export function signatureDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 1;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  return diff / a.length;
}

export const liveObjectId = (desc: string): string => {
  let hash = 0;
  for (let i = 0; i < desc.length; i++) { hash = (hash << 5) - hash + desc.charCodeAt(i); hash |= 0; }
  return `live_${Math.abs(hash).toString(36)}`;
};
